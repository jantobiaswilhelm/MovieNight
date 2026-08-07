import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { validateIntParams, validateGuildId } from '../middleware/validate.js';
import { isAdmin } from '../utils/admin.js';
import * as db from '../models/index.js';

const router = Router();

// Middleware to check admin status
const requireAdmin = (req, res, next) => {
  if (!req.user || !isAdmin(req.user.discord_id)) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

// Check if current user is admin
router.get('/check', authenticateToken, (req, res) => {
  res.json({ isAdmin: isAdmin(req.user.discord_id) });
});

// Delete a movie
router.delete('/movies/:id', validateIntParams('id'), authenticateToken, requireAdmin, validateGuildId, async (req, res) => {
  const { id } = req.params;

  try {
    const movie = await db.getMovieNightById(parseInt(id));
    if (!movie || movie.guild_id !== req.guildId) {
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
router.delete('/suggestions/:id', validateIntParams('id'), authenticateToken, requireAdmin, async (req, res) => {
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

// Get cached guild channels
router.get('/channels', authenticateToken, requireAdmin, validateGuildId, async (req, res) => {
  try {
    const channels = await db.getGuildChannels(req.guildId);
    res.json(channels);
  } catch (err) {
    console.error('Error fetching guild channels:', err);
    res.status(500).json({ error: 'Failed to fetch channels' });
  }
});

// Get guild settings
router.get('/settings', authenticateToken, requireAdmin, validateGuildId, async (req, res) => {
  try {
    const settings = await db.getGuildSettings(req.guildId);
    const testMovieCount = await db.getTestMovieCount(req.guildId);
    res.json({ ...settings, test_movie_count: testMovieCount });
  } catch (err) {
    console.error('Error fetching guild settings:', err);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// Update guild settings
router.put('/settings', authenticateToken, requireAdmin, validateGuildId, async (req, res) => {
  const { test_mode, test_channel_id } = req.body;

  try {
    const settings = await db.upsertGuildSettings(req.guildId, test_mode, test_channel_id);
    res.json(settings);
  } catch (err) {
    console.error('Error updating guild settings:', err);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// Delete all test movies for a guild
router.delete('/test-movies', authenticateToken, requireAdmin, validateGuildId, async (req, res) => {
  try {
    const deletedCount = await db.deleteTestMovies(req.guildId);
    res.json({ success: true, deleted_count: deletedCount });
  } catch (err) {
    console.error('Error deleting test movies:', err);
    res.status(500).json({ error: 'Failed to delete test movies' });
  }
});

export default router;
