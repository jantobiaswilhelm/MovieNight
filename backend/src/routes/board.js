import { Router } from 'express';
import { authenticateToken, optionalAuth } from '../middleware/auth.js';
import { validateIntParams, validateGuildId } from '../middleware/validate.js';
import { isAdmin } from '../utils/admin.js';
import * as db from '../models/index.js';

const router = Router();

// GET /api/board — the active board + caller's own upvote state.
router.get('/', validateGuildId, optionalAuth, async (req, res) => {
  try {
    const userId = req.user ? req.user.id : null;
    const suggestions = await db.getBoardSuggestions(req.guildId, userId);
    const upvoters = await db.getUpvotersForBoard(req.guildId);

    const byId = {};
    upvoters.forEach((v) => {
      (byId[v.suggestion_id] ||= []).push({
        discord_id: v.discord_id,
        username: v.username,
        avatar: v.avatar
      });
    });

    res.json(suggestions.map((s) => ({ ...s, upvoters: byId[s.id] || [] })));
  } catch (err) {
    console.error('Error fetching board:', err);
    res.status(500).json({ error: 'Failed to fetch board' });
  }
});

// POST /api/board/suggestions — add a suggestion (auth). Dedupe by tmdb_id.
router.post('/suggestions', validateGuildId, authenticateToken, async (req, res) => {
  const { title, image_url, tmdb_data } = req.body;

  if (!title || typeof title !== 'string') {
    return res.status(400).json({ error: 'Title is required' });
  }
  if (title.length > 500) {
    return res.status(400).json({ error: 'Title too long (max 500 characters)' });
  }

  try {
    const tmdbId = tmdb_data && tmdb_data.tmdbId;
    if (tmdbId) {
      const existing = await db.findOpenSuggestionByTmdb(req.guildId, tmdbId);
      if (existing) {
        return res.status(409).json({ error: 'That movie is already on the board', suggestion: existing });
      }
    }

    const suggestion = await db.createBoardSuggestion(
      req.guildId,
      req.user.id,
      title,
      image_url,
      tmdb_data || {}
    );
    res.json(suggestion);
  } catch (err) {
    console.error('Error creating suggestion:', err);
    res.status(500).json({ error: 'Failed to create suggestion' });
  }
});

// POST /api/board/suggestions/:id/vote — set caller's vote (+1 up / -1 down).
router.post('/suggestions/:id/vote', validateGuildId, validateIntParams('id'), authenticateToken, async (req, res) => {
  const { vote } = req.body;
  if (vote !== 1 && vote !== -1) {
    return res.status(400).json({ error: 'vote must be 1 or -1' });
  }
  try {
    const suggestion = await db.getBoardSuggestionById(parseInt(req.params.id));
    if (!suggestion || suggestion.guild_id !== req.guildId) {
      return res.status(404).json({ error: 'Suggestion not found' });
    }
    await db.setVote(parseInt(req.params.id), req.user.id, vote);
    res.json({ success: true });
  } catch (err) {
    console.error('Error setting vote:', err);
    res.status(500).json({ error: 'Failed to vote' });
  }
});

// DELETE /api/board/suggestions/:id/vote — clear caller's vote.
router.delete('/suggestions/:id/vote', validateGuildId, validateIntParams('id'), authenticateToken, async (req, res) => {
  try {
    const suggestion = await db.getBoardSuggestionById(parseInt(req.params.id));
    if (!suggestion || suggestion.guild_id !== req.guildId) {
      return res.status(404).json({ error: 'Suggestion not found' });
    }
    await db.clearVote(parseInt(req.params.id), req.user.id);
    res.json({ success: true });
  } catch (err) {
    console.error('Error clearing vote:', err);
    res.status(500).json({ error: 'Failed to clear vote' });
  }
});

// POST /api/board/suggestions/:id/announce — any auth user promotes to a movie night.
router.post('/suggestions/:id/announce', validateGuildId, validateIntParams('id'), authenticateToken, async (req, res) => {
  const { scheduled_at } = req.body;

  if (!scheduled_at) {
    return res.status(400).json({ error: 'scheduled_at is required' });
  }
  const scheduledDate = new Date(scheduled_at);
  if (isNaN(scheduledDate.getTime())) {
    return res.status(400).json({ error: 'Invalid scheduled_at' });
  }
  if (scheduledDate <= new Date()) {
    return res.status(400).json({ error: 'The time must be in the future' });
  }

  try {
    const s = await db.getBoardSuggestionById(parseInt(req.params.id));
    if (!s) return res.status(404).json({ error: 'Suggestion not found' });
    if (s.guild_id !== req.guildId) return res.status(404).json({ error: 'Suggestion not found' });
    if (s.status === 'scheduled') {
      return res.status(409).json({ error: 'That suggestion is already scheduled' });
    }

    await db.createPendingAnnouncement({
      guildId: s.guild_id,
      channelId: null,
      userId: req.user.id,
      title: s.release_year ? `${s.title} (${s.release_year})` : s.title,
      imageUrl: s.image_url,
      backdropUrl: s.backdrop_url,
      description: s.description,
      tmdbId: s.tmdb_id,
      imdbId: s.imdb_id,
      tmdbRating: s.tmdb_rating,
      genres: s.genres,
      runtime: s.runtime,
      releaseYear: s.release_year,
      trailerUrl: s.trailer_url,
      scheduledAt: scheduledDate
    });

    const updated = await db.markSuggestionScheduled(s.id, scheduledDate);
    res.json({ success: true, suggestion: updated });
  } catch (err) {
    console.error('Error announcing suggestion:', err);
    res.status(500).json({ error: 'Failed to announce suggestion' });
  }
});

// DELETE /api/board/suggestions/:id — suggester removes own; admin removes any.
router.delete('/suggestions/:id', validateGuildId, validateIntParams('id'), authenticateToken, async (req, res) => {
  try {
    const s = await db.getBoardSuggestionById(parseInt(req.params.id));
    if (!s) return res.status(404).json({ error: 'Suggestion not found' });
    if (s.guild_id !== req.guildId) return res.status(404).json({ error: 'Suggestion not found' });

    const owns = s.suggested_by === req.user.id;
    if (!owns && !isAdmin(req.user.discord_id)) {
      return res.status(403).json({ error: 'Not allowed' });
    }

    await db.deleteBoardSuggestion(s.id);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting suggestion:', err);
    res.status(500).json({ error: 'Failed to delete suggestion' });
  }
});

export default router;
