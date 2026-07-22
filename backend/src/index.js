import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';

import authRoutes from './routes/auth.js';
import movieRoutes from './routes/movies.js';
import ratingRoutes from './routes/ratings.js';
import statsRoutes from './routes/stats.js';
import boardRoutes from './routes/board.js';
import marathonRoutes from './routes/marathons.js';
import adminRoutes from './routes/admin.js';
import wishlistRoutes from './routes/wishlists.js';
import tmdbRoutes from './routes/tmdb.js';
import personalMovieRoutes from './routes/personal-movies.js';
import collectionsRoutes from './routes/collections.js';
import listsRoutes from './routes/lists.js';
import achievementsRoutes from './routes/achievements.js';
import notificationsRoutes from './routes/notifications.js';
import socialRoutes from './routes/social.js';

// --- Startup validation ---
const requiredEnvVars = ['FRONTEND_URL', 'BACKEND_URL', 'JWT_SECRET', 'DATABASE_URL', 'DISCORD_CLIENT_ID', 'DISCORD_CLIENT_SECRET'];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`FATAL: ${envVar} environment variable is not set. Exiting.`);
    process.exit(1);
  }
}
if (process.env.JWT_SECRET.length < 32) {
  console.error('FATAL: JWT_SECRET must be at least 32 characters. Exiting.');
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 3001;

// Trust first proxy (Railway) for correct client IP in rate limiting
app.set('trust proxy', 1);

// Security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["https://fonts.gstatic.com"],
      imgSrc: ["'self'", "https://cdn.discordapp.com", "https://image.tmdb.org", "data:"],
      connectSrc: ["'self'", process.env.FRONTEND_URL],
      frameSrc: ["https://www.youtube.com", "https://youtube.com"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// CORS
app.use(cors({
  origin: process.env.FRONTEND_URL,
  credentials: true
}));

// Rate limiting
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' }
});
const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'Too many auth requests, please try again later.' }
});
const tmdbLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: 'Too many TMDB requests, please try again later.' }
});
const importLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { error: 'Too many import requests, please try again later.' }
});

app.use(globalLimiter);
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());

// Routes
app.use('/auth', authLimiter, authRoutes);
app.use('/api/movies', movieRoutes);
app.use('/api/ratings', ratingRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/board', boardRoutes);
app.use('/api/marathons', marathonRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/wishlists', wishlistRoutes);
app.use('/api/tmdb', tmdbLimiter, tmdbRoutes);
app.use('/api/personal-movies/import', importLimiter);
app.use('/api/personal-movies', personalMovieRoutes);
app.use('/api/collections', collectionsRoutes);
app.use('/api/lists', listsRoutes);
app.use('/api/achievements', achievementsRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/social', socialRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Global error handler — prevents stack trace leakage
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

// Catch unhandled errors
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err);
});

const server = app.listen(PORT, () => {
  console.log(`Backend server running on port ${PORT}`);
});

server.on('error', (err) => {
  console.error('Server error:', err);
});
