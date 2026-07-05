import { Router } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { findOrCreateUser } from '../models/index.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

// Short-lived access token; long-lived refresh token that mints new access
// tokens. Both carry `tv` (the user's token_version) so a logout can revoke them.
const ACCESS_TTL = '1h';
const REFRESH_TTL = '30d';

const signAccessToken = (user) =>
  jwt.sign(
    { userId: user.id, discordId: user.discord_id, tv: user.token_version ?? 0, type: 'access' },
    process.env.JWT_SECRET,
    { expiresIn: ACCESS_TTL }
  );

const signRefreshToken = (user) =>
  jwt.sign(
    { userId: user.id, tv: user.token_version ?? 0, type: 'refresh' },
    process.env.JWT_SECRET,
    { expiresIn: REFRESH_TTL }
  );

// In-memory store for short-lived auth codes (code -> {accessToken, refreshToken}, 30s TTL)
const AUTH_CODE_TTL_MS = 30_000;
const authCodes = new Map();
function storeAuthCode(tokens) {
  const code = crypto.randomBytes(32).toString('hex');
  authCodes.set(code, tokens);
  setTimeout(() => authCodes.delete(code), AUTH_CODE_TTL_MS);
  return code;
}

// Redirect to Discord OAuth
router.get('/discord', (req, res) => {
  // Generate OAuth state to prevent login CSRF
  const state = crypto.randomBytes(32).toString('hex');
  res.cookie('oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 10 * 60 * 1000 // 10 minutes
  });

  const redirectUri = `${process.env.BACKEND_URL}/auth/callback`;
  const params = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'identify',
    state
  });

  res.redirect(`https://discord.com/api/oauth2/authorize?${params}`);
});

// OAuth callback
router.get('/callback', async (req, res) => {
  const { code, state } = req.query;

  // Validate OAuth state
  const storedState = req.cookies?.oauth_state;
  res.clearCookie('oauth_state');

  if (!state || !storedState || state !== storedState) {
    return res.redirect(`${process.env.FRONTEND_URL}?error=invalid_state`);
  }

  if (!code) {
    return res.redirect(`${process.env.FRONTEND_URL}?error=no_code`);
  }

  try {
    // Exchange code for token
    const redirectUri = `${process.env.BACKEND_URL}/auth/callback`;
    const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID,
        client_secret: process.env.DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri
      })
    });

    const tokenData = await tokenResponse.json();

    if (!tokenData.access_token) {
      return res.redirect(`${process.env.FRONTEND_URL}?error=token_failed`);
    }

    // Get user info from Discord
    const userResponse = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` }
    });

    const discordUser = await userResponse.json();

    // Create or update user in database (store access token for profile refresh)
    const user = await findOrCreateUser(
      discordUser.id,
      discordUser.username,
      discordUser.avatar,
      tokenData.access_token
    );

    // Issue an access + refresh token pair, stored behind a short-lived auth code
    const authCode = storeAuthCode({
      accessToken: signAccessToken(user),
      refreshToken: signRefreshToken(user)
    });
    res.redirect(`${process.env.FRONTEND_URL}/auth/callback?code=${authCode}`);
  } catch (err) {
    console.error('OAuth error:', err);
    res.redirect(`${process.env.FRONTEND_URL}?error=auth_failed`);
  }
});

// Exchange auth code for JWT
router.post('/exchange', (req, res) => {
  const { code } = req.body;

  if (!code) {
    return res.status(400).json({ error: 'code is required' });
  }

  const tokens = authCodes.get(code);
  authCodes.delete(code);

  if (!tokens) {
    return res.status(400).json({ error: 'Invalid or expired code' });
  }

  res.json({ token: tokens.accessToken, refreshToken: tokens.refreshToken });
});

// Exchange a refresh token for a fresh access token (and a rotated refresh token)
router.post('/refresh', async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(400).json({ error: 'refreshToken is required' });
  }

  try {
    const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);
    if (decoded.type !== 'refresh') {
      return res.status(401).json({ error: 'Invalid token' });
    }

    const { getUserById } = await import('../models/index.js');
    const user = await getUserById(decoded.userId);

    if (!user || (user.token_version ?? 0) !== decoded.tv) {
      return res.status(401).json({ error: 'Token revoked' });
    }

    res.json({ token: signAccessToken(user), refreshToken: signRefreshToken(user) });
  } catch {
    res.status(401).json({ error: 'Invalid or expired refresh token' });
  }
});

// Log out everywhere: bump token_version so all outstanding tokens are revoked
router.post('/logout', authenticateToken, async (req, res) => {
  try {
    const { bumpTokenVersion } = await import('../models/index.js');
    await bumpTokenVersion(req.user.id);
  } catch (err) {
    console.error('Logout error:', err);
  }
  res.json({ ok: true });
});

// Get current user (refreshes Discord profile if stale)
router.get('/me', async (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.type === 'refresh') {
      return res.status(401).json({ error: 'Invalid token' });
    }
    const { getUserById } = await import('../models/index.js');
    let user = await getUserById(decoded.userId);

    if (!user || (user.token_version ?? 0) !== (decoded.tv ?? -1)) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    // Refresh Discord profile if last update was more than 1 hour ago
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    if (user.discord_access_token && new Date(user.updated_at) < oneHourAgo) {
      try {
        const discordRes = await fetch('https://discord.com/api/users/@me', {
          headers: { Authorization: `Bearer ${user.discord_access_token}` }
        });
        if (discordRes.ok) {
          const discordUser = await discordRes.json();
          if (discordUser.username !== user.username || discordUser.avatar !== user.avatar) {
            user = await findOrCreateUser(
              discordUser.id,
              discordUser.username,
              discordUser.avatar,
              user.discord_access_token
            );
          }
        }
      } catch {
        // Discord API unavailable — serve stale data
      }
    }

    res.json({
      id: user.id,
      discordId: user.discord_id,
      username: user.username,
      avatar: user.avatar
    });
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
});

export default router;
