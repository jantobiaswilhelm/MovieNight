import jwt from 'jsonwebtoken';
import { getUserById } from '../models/index.js';

// A refresh token must never be accepted as an access token, and a token whose
// `tv` no longer matches the user's token_version has been revoked (logout).
const tokenMatchesUser = (decoded, user) =>
  decoded.type !== 'refresh' && (user.token_version ?? 0) === (decoded.tv ?? -1);

export const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await getUserById(decoded.userId);

    if (!user || !tokenMatchesUser(decoded, user)) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    req.user = user;
    next();
  } catch (err) {
    // 401 (not 403) so the client transparently attempts a refresh.
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

export const optionalAuth = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await getUserById(decoded.userId);
      if (user && tokenMatchesUser(decoded, user)) {
        req.user = user;
      }
    } catch {
      // Token invalid, continue without user
    }
  }
  next();
};
