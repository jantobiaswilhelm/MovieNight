import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.js';
import * as db from '../models/index.js';

const router = Router();

// Get server-wide stats
router.get('/', async (req, res) => {
  const { guild_id, month } = req.query;

  if (!guild_id) {
    return res.status(400).json({ error: 'guild_id is required' });
  }

  try {
    const [
      stats,
      topMovies,
      topRaters,
      topMonth,
      topYear,
      topAllTime,
      worstMonth,
      worstYear,
      worstAllTime,
      availableMonths
    ] = await Promise.all([
      db.getGuildStats(guild_id),
      db.getTopRatedMovies(guild_id, 5),
      db.getMostActiveRaters(guild_id, 5),
      db.getTopRatedMoviesByPeriod(guild_id, 'month', 5, 3, month || null),
      db.getTopRatedMoviesByPeriod(guild_id, 'year', 5, 3),
      db.getTopRatedMoviesByPeriod(guild_id, 'all', 5, 3),
      db.getWorstRatedMoviesByPeriod(guild_id, 'month', 5, 3, month || null),
      db.getWorstRatedMoviesByPeriod(guild_id, 'year', 5, 3),
      db.getWorstRatedMoviesByPeriod(guild_id, 'all', 5, 3),
      db.getAvailableMonths(guild_id)
    ]);

    res.json({
      ...stats,
      top_movies: topMovies,
      top_raters: topRaters,
      top_month: topMonth,
      top_year: topYear,
      top_all_time: topAllTime,
      worst_month: worstMonth,
      worst_year: worstYear,
      worst_all_time: worstAllTime,
      available_months: availableMonths,
      selected_month: month || null
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
