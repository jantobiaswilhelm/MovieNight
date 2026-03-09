import { Router } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { findOrCreateUser } from '../models/index.js';

const router = Router();

// In-memory store for short-lived auth codes (code -> JWT, 30s TTL)
const authCodes = new Map();
function storeAuthCode(jwt) {
  const code = crypto.randomBytes(32).toString('hex');
  authCodes.set(code, jwt);
  setTimeout(() => authCodes.delete(code), 30 * 1000);
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

    // Create or update user in database
    const user = await findOrCreateUser(
      discordUser.id,
      discordUser.username,
      discordUser.avatar
    );

    // Generate JWT
    const token = jwt.sign(
      { userId: user.id, discordId: user.discord_id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Store JWT behind a short-lived auth code and redirect with the code
    const authCode = storeAuthCode(token);
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

  const token = authCodes.get(code);
  authCodes.delete(code);

  if (!token) {
    return res.status(400).json({ error: 'Invalid or expired code' });
  }

  res.json({ token });
});

// Get current user
router.get('/me', async (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const { getUserById } = await import('../models/index.js');
    const user = await getUserById(decoded.userId);

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
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
