import { Router } from 'express';
import { authenticateToken, optionalAuth } from '../middleware/auth.js';
import * as db from '../models/index.js';

const router = Router();

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

// Submit a suggestion (requires auth)
router.post('/:id/suggestions', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { title, image_url } = req.body;

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
      req.user.id
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
