import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.js';
import * as db from '../models/index.js';

const router = Router();

// Get user's rating history
router.get('/user/:userId', async (req, res) => {
  const { userId } = req.params;
  const { limit = 20 } = req.query;

  try {
    const ratings = await db.getUserRatings(parseInt(userId), parseInt(limit));
    res.json(ratings);
  } catch (err) {
    console.error('Error fetching user ratings:', err);
    res.status(500).json({ error: 'Failed to fetch ratings' });
  }
});

// Get current user's ratings
router.get('/me', authenticateToken, async (req, res) => {
  const { limit = 20 } = req.query;

  try {
    const ratings = await db.getUserRatings(req.user.id, parseInt(limit));
    res.json(ratings);
  } catch (err) {
    console.error('Error fetching ratings:', err);
    res.status(500).json({ error: 'Failed to fetch ratings' });
  }
});

export default router;
