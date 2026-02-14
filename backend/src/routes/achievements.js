import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.js';
import * as db from '../models/index.js';

const router = Router();

// Get all achievements
router.get('/', async (req, res) => {
  try {
    const achievements = await db.getAllAchievements();
    res.json(achievements);
  } catch (err) {
    console.error('Error fetching achievements:', err);
    res.status(500).json({ error: 'Failed to fetch achievements' });
  }
});

// Get current user's achievements with progress
router.get('/me', authenticateToken, async (req, res) => {
  const { guild_id } = req.query;

  try {
    const [achievements, progress] = await Promise.all([
      db.getUserAchievements(req.user.id),
      guild_id ? db.getAchievementProgress(req.user.id, guild_id) : null
    ]);

    res.json({
      achievements,
      progress
    });
  } catch (err) {
    console.error('Error fetching user achievements:', err);
    res.status(500).json({ error: 'Failed to fetch achievements' });
  }
});

// Get another user's achievements
router.get('/user/:userId', async (req, res) => {
  const { userId } = req.params;

  try {
    const achievements = await db.getUserAchievements(parseInt(userId));
    // Filter out hidden achievements that aren't unlocked
    const visible = achievements.filter(a => !a.is_hidden || a.unlocked_at);
    res.json(visible);
  } catch (err) {
    console.error('Error fetching user achievements:', err);
    res.status(500).json({ error: 'Failed to fetch achievements' });
  }
});

export default router;
