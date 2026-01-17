import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { isAdmin } from '../utils/admin.js';
import * as db from '../models/index.js';

const router = Router();

// Middleware to check admin status
const requireAdmin = (req, res, next) => {
  if (!req.user || !isAdmin(req.user.discordId)) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

// Check if current user is admin
router.get('/check', authenticateToken, (req, res) => {
  res.json({ isAdmin: isAdmin(req.user.discordId) });
});

// Delete a movie
router.delete('/movies/:id', authenticateToken, requireAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    const movie = await db.getMovieNightById(parseInt(id));
    if (!movie) {
      return res.status(404).json({ error: 'Movie not found' });
    }

    await db.deleteMovieNight(parseInt(id));
    res.json({ success: true, deleted: movie });
  } catch (err) {
    console.error('Error deleting movie:', err);
    res.status(500).json({ error: 'Failed to delete movie' });
  }
});

// Delete a suggestion
router.delete('/suggestions/:id', authenticateToken, requireAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    const suggestion = await db.getSuggestionById(parseInt(id));
    if (!suggestion) {
      return res.status(404).json({ error: 'Suggestion not found' });
    }

    await db.deleteSuggestion(parseInt(id));
    res.json({ success: true, deleted: suggestion });
  } catch (err) {
    console.error('Error deleting suggestion:', err);
    res.status(500).json({ error: 'Failed to delete suggestion' });
  }
});

export default router;
