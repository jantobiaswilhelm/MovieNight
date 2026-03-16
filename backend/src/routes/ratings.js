import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { validateIntParams, parsePagination } from '../middleware/validate.js';
import * as db from '../models/index.js';

const router = Router();

// Get user's rating history
router.get('/user/:userId', validateIntParams('userId'), parsePagination, async (req, res) => {
  const { userId } = req.params;

  try {
    const ratings = await db.getUserRatings(parseInt(userId), req.pagination.limit);
    res.json(ratings);
  } catch (err) {
    console.error('Error fetching user ratings:', err);
    res.status(500).json({ error: 'Failed to fetch ratings' });
  }
});

// Get current user's ratings
router.get('/me', authenticateToken, parsePagination, async (req, res) => {
  try {
    const ratings = await db.getUserRatings(req.user.id, req.pagination.limit);
    res.json(ratings);
  } catch (err) {
    console.error('Error fetching ratings:', err);
    res.status(500).json({ error: 'Failed to fetch ratings' });
  }
});

// Add reaction to a rating
router.post('/:ratingId/reactions', validateIntParams('ratingId'), authenticateToken, async (req, res) => {
  const { ratingId } = req.params;
  const { emoji } = req.body;

  if (!emoji) {
    return res.status(400).json({ error: 'emoji is required' });
  }

  try {
    const reaction = await db.addReaction(parseInt(ratingId), req.user.id, emoji);
    if (!reaction) {
      return res.json({ message: 'Reaction already exists' });
    }
    res.json(reaction);
  } catch (err) {
    if (err.message === 'Invalid emoji') {
      return res.status(400).json({ error: 'Invalid emoji. Allowed: thumbsup, thumbsdown, heart, fire, laugh, thinking' });
    }
    console.error('Error adding reaction:', err);
    res.status(500).json({ error: 'Failed to add reaction' });
  }
});

// Remove reaction from a rating
router.delete('/:ratingId/reactions/:emoji', validateIntParams('ratingId'), authenticateToken, async (req, res) => {
  const { ratingId, emoji } = req.params;

  try {
    const removed = await db.removeReaction(parseInt(ratingId), req.user.id, emoji);
    if (!removed) {
      return res.status(404).json({ error: 'Reaction not found' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Error removing reaction:', err);
    res.status(500).json({ error: 'Failed to remove reaction' });
  }
});

// Get reactions for a rating
router.get('/:ratingId/reactions', validateIntParams('ratingId'), async (req, res) => {
  const { ratingId } = req.params;

  try {
    const reactions = await db.getReactionsForRating(parseInt(ratingId));
    res.json(reactions);
  } catch (err) {
    console.error('Error fetching reactions:', err);
    res.status(500).json({ error: 'Failed to fetch reactions' });
  }
});

export default router;
