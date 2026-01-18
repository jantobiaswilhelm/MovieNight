import 'dotenv/config';
import express from 'express';
import cors from 'cors';

import authRoutes from './routes/auth.js';
import movieRoutes from './routes/movies.js';
import ratingRoutes from './routes/ratings.js';
import statsRoutes from './routes/stats.js';
import votingRoutes from './routes/voting.js';
import adminRoutes from './routes/admin.js';
import wishlistRoutes from './routes/wishlists.js';
import tmdbRoutes from './routes/tmdb.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true
}));
app.use(express.json());

// Routes
app.use('/auth', authRoutes);
app.use('/api/movies', movieRoutes);
app.use('/api/ratings', ratingRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/voting', votingRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/wishlists', wishlistRoutes);
app.use('/api/tmdb', tmdbRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Catch unhandled errors
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
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
