import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.js';
import * as db from '../models/index.js';

const router = Router();

// Get server-wide stats
router.get('/', async (req, res) => {
  const { guild_id } = req.query;

  if (!guild_id) {
    return res.status(400).json({ error: 'guild_id is required' });
  }

  try {
    const stats = await db.getGuildStats(guild_id);
    const topMovies = await db.getTopRatedMovies(guild_id, 5);
    const topRaters = await db.getMostActiveRaters(guild_id, 5);

    res.json({
      ...stats,
      top_movies: topMovies,
      top_raters: topRaters
    });
  } catch (err) {
    console.error('Error fetching stats:', err);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// Get user stats
router.get('/user/:userId', async (req, res) => {
  const { userId } = req.params;

  try {
    const stats = await db.getUserStats(parseInt(userId));
    res.json(stats);
  } catch (err) {
    console.error('Error fetching user stats:', err);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// Get current user's stats
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const stats = await db.getUserStats(req.user.id);
    res.json(stats);
  } catch (err) {
    console.error('Error fetching stats:', err);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

export default router;
