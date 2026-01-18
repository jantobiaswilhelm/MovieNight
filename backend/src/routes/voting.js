import { Router } from 'express';
import { authenticateToken, optionalAuth } from '../middleware/auth.js';
import { isAdmin } from '../utils/admin.js';
import * as db from '../models/index.js';

const router = Router();

const GUILD_ID = process.env.GUILD_ID;

// Admin middleware
const requireAdmin = (req, res, next) => {
  if (!req.user || !isAdmin(req.user.discord_id)) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

// Get active voting session for a guild
router.get('/active', optionalAuth, async (req, res) => {
  const { guild_id } = req.query;

  if (!guild_id) {
    return res.status(400).json({ error: 'guild_id is required' });
  }

  try {
    const session = await db.getActiveVotingSession(guild_id);

    if (!session) {
      return res.json(null);
    }

    const suggestions = await db.getSuggestionsForSession(session.id);
    const voters = await db.getVotersForSession(session.id);

    // Group voters by suggestion_id
    const votersBySuggestion = {};
    voters.forEach(voter => {
      if (!votersBySuggestion[voter.suggestion_id]) {
        votersBySuggestion[voter.suggestion_id] = [];
      }
      votersBySuggestion[voter.suggestion_id].push({
        discord_id: voter.discord_id,
        username: voter.username,
        avatar: voter.avatar
      });
    });

    // Attach voters to each suggestion
    const suggestionsWithVoters = suggestions.map(s => ({
      ...s,
      voters: votersBySuggestion[s.id] || []
    }));

    let userVote = null;
    if (req.user) {
      userVote = await db.getUserVoteForSession(session.id, req.user.id);
    }

    res.json({
      ...session,
      suggestions: suggestionsWithVoters,
      user_vote: userVote
    });
  } catch (err) {
    console.error('Error fetching voting session:', err);
    res.status(500).json({ error: 'Failed to fetch voting session' });
  }
});

// Get voting session by ID
router.get('/:id', optionalAuth, async (req, res) => {
  const { id } = req.params;

  try {
    const session = await db.getVotingSessionById(parseInt(id));

    if (!session) {
      return res.status(404).json({ error: 'Voting session not found' });
    }

    const suggestions = await db.getSuggestionsForSession(session.id);

    let userVote = null;
    if (req.user) {
      userVote = await db.getUserVoteForSession(session.id, req.user.id);
    }

    res.json({
      ...session,
      suggestions,
      user_vote: userVote
    });
  } catch (err) {
    console.error('Error fetching voting session:', err);
    res.status(500).json({ error: 'Failed to fetch voting session' });
  }
});

// Create a new voting session (admin only)
router.post('/', authenticateToken, requireAdmin, async (req, res) => {
  const { scheduled_at, guild_id } = req.body;

  const guildId = guild_id || GUILD_ID;
  if (!guildId) {
    return res.status(400).json({ error: 'guild_id is required' });
  }

  if (!scheduled_at) {
    return res.status(400).json({ error: 'scheduled_at is required' });
  }

  const scheduledDate = new Date(scheduled_at);
  if (isNaN(scheduledDate.getTime())) {
    return res.status(400).json({ error: 'Invalid scheduled_at date' });
  }

  try {
    // Check if there's already an active voting session
    const existingSession = await db.getActiveVotingSession(guildId);
    if (existingSession) {
      return res.status(400).json({ error: 'An active voting session already exists' });
    }

    // Create the voting session (no message_id since it's from web)
    const session = await db.createVotingSession(
      guildId,
      null, // channel_id - not applicable for web
      null, // message_id - not applicable for web
      scheduledDate,
      req.user.id
    );

    res.json(session);
  } catch (err) {
    console.error('Error creating voting session:', err);
    res.status(500).json({ error: 'Failed to create voting session' });
  }
});

// Close voting and optionally create movie night (admin only)
router.post('/:id/close', authenticateToken, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { create_movie } = req.body;

  try {
    const session = await db.getVotingSessionById(parseInt(id));

    if (!session) {
      return res.status(404).json({ error: 'Voting session not found' });
    }

    if (session.status !== 'open') {
      return res.status(400).json({ error: 'Voting session is already closed' });
    }

    // Get the winner (most voted suggestion)
    const winner = await db.getWinningSuggestion(parseInt(id));

    if (!winner) {
      // No suggestions, just close the session
      await db.closeVotingSession(parseInt(id), null);
      return res.json({ success: true, message: 'Voting closed with no winner', winner: null });
    }

    // Close the session with the winner
    await db.closeVotingSession(parseInt(id), winner.id);

    // Optionally create a movie night from the winner
    if (create_movie && winner) {
      await db.createPendingAnnouncement({
        guildId: session.guild_id,
        channelId: null,
        userId: winner.suggested_by,
        title: winner.release_year
          ? `${winner.title} (${winner.release_year})`
          : winner.title,
        imageUrl: winner.image_url,
        backdropUrl: winner.backdrop_url,
        description: winner.description,
        tmdbId: winner.tmdb_id,
        imdbId: winner.imdb_id,
        tmdbRating: winner.tmdb_rating,
        genres: winner.genres,
        runtime: winner.runtime,
        releaseYear: winner.release_year,
        trailerUrl: winner.trailer_url,
        scheduledAt: session.scheduled_at
      });
    }

    res.json({
      success: true,
      winner: winner,
      movie_created: create_movie && winner ? true : false
    });
  } catch (err) {
    console.error('Error closing voting session:', err);
    res.status(500).json({ error: 'Failed to close voting session' });
  }
});

// Delete/cancel a voting session (admin only)
router.delete('/:id', authenticateToken, requireAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    const session = await db.getVotingSessionById(parseInt(id));

    if (!session) {
      return res.status(404).json({ error: 'Voting session not found' });
    }

    await db.deleteVotingSession(parseInt(id));
    res.json({ success: true, deleted: session });
  } catch (err) {
    console.error('Error deleting voting session:', err);
    res.status(500).json({ error: 'Failed to delete voting session' });
  }
});

// Submit a suggestion (requires auth)
router.post('/:id/suggestions', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { title, image_url, tmdb_data } = req.body;

  if (!title) {
    return res.status(400).json({ error: 'Title is required' });
  }

  if (!image_url) {
    return res.status(400).json({ error: 'Image URL is required' });
  }

  try {
    const session = await db.getVotingSessionById(parseInt(id));

    if (!session) {
      return res.status(404).json({ error: 'Voting session not found' });
    }

    if (session.status !== 'open') {
      return res.status(400).json({ error: 'Voting session is closed' });
    }

    const suggestion = await db.createSuggestion(
      parseInt(id),
      title,
      image_url,
      req.user.id,
      tmdb_data || {}
    );

    res.json(suggestion);
  } catch (err) {
    console.error('Error creating suggestion:', err);
    res.status(500).json({ error: 'Failed to create suggestion' });
  }
});

// Cast a vote (requires auth)
router.post('/suggestions/:suggestionId/vote', authenticateToken, async (req, res) => {
  const { suggestionId } = req.params;

  try {
    const suggestion = await db.getSuggestionById(parseInt(suggestionId));

    if (!suggestion) {
      return res.status(404).json({ error: 'Suggestion not found' });
    }

    const session = await db.getVotingSessionById(suggestion.voting_session_id);

    if (session.status !== 'open') {
      return res.status(400).json({ error: 'Voting session is closed' });
    }

    // Remove any existing vote for this session first
    const existingVote = await db.getUserVoteForSession(suggestion.voting_session_id, req.user.id);
    if (existingVote) {
      await db.removeVote(existingVote.suggestion_id, req.user.id);
    }

    // Cast new vote
    const vote = await db.castVote(parseInt(suggestionId), req.user.id);

    res.json({ success: true, vote });
  } catch (err) {
    console.error('Error casting vote:', err);
    res.status(500).json({ error: 'Failed to cast vote' });
  }
});

// Remove vote (requires auth)
router.delete('/suggestions/:suggestionId/vote', authenticateToken, async (req, res) => {
  const { suggestionId } = req.params;

  try {
    await db.removeVote(parseInt(suggestionId), req.user.id);
    res.json({ success: true });
  } catch (err) {
    console.error('Error removing vote:', err);
    res.status(500).json({ error: 'Failed to remove vote' });
  }
});

export default router;
