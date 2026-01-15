import { Router } from 'express';
import { authenticateToken, optionalAuth } from '../middleware/auth.js';
import * as db from '../models/index.js';

const router = Router();

// Get all movie nights (requires guild_id query param)
router.get('/', optionalAuth, async (req, res) => {
  const { guild_id, limit = 20, offset = 0 } = req.query;

  if (!guild_id) {
    return res.status(400).json({ error: 'guild_id is required' });
  }

  try {
    const movies = await db.getMovieNights(guild_id, parseInt(limit), parseInt(offset));
    res.json(movies);
  } catch (err) {
    console.error('Error fetching movies:', err);
    res.status(500).json({ error: 'Failed to fetch movies' });
  }
});

// Get single movie with ratings
router.get('/:id', optionalAuth, async (req, res) => {
  const { id } = req.params;

  try {
    const movie = await db.getMovieNightById(parseInt(id));

    if (!movie) {
      return res.status(404).json({ error: 'Movie not found' });
    }

    const ratings = await db.getRatingsForMovie(parseInt(id));

    // Calculate average
    const avgRating = ratings.length > 0
      ? ratings.reduce((sum, r) => sum + parseFloat(r.score), 0) / ratings.length
      : 0;

    res.json({
      ...movie,
      ratings,
      avg_rating: avgRating,
      rating_count: ratings.length
    });
  } catch (err) {
    console.error('Error fetching movie:', err);
    res.status(500).json({ error: 'Failed to fetch movie' });
  }
});

// Submit or update rating
router.post('/:id/ratings', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { score } = req.body;

  if (!score || score < 1 || score > 10) {
    return res.status(400).json({ error: 'Score must be between 1 and 10' });
  }

  // Validate 0.5 increments
  if ((score * 2) % 1 !== 0) {
    return res.status(400).json({ error: 'Score must be in 0.5 increments' });
  }

  try {
    const movie = await db.getMovieNightById(parseInt(id));

    if (!movie) {
      return res.status(404).json({ error: 'Movie not found' });
    }

    const rating = await db.upsertRating(parseInt(id), req.user.id, score);
    res.json(rating);
  } catch (err) {
    console.error('Error saving rating:', err);
    res.status(500).json({ error: 'Failed to save rating' });
  }
});

// Get user's rating for a movie
router.get('/:id/ratings/me', authenticateToken, async (req, res) => {
  const { id } = req.params;

  try {
    const rating = await db.getUserRating(parseInt(id), req.user.id);
    res.json(rating || null);
  } catch (err) {
    console.error('Error fetching rating:', err);
    res.status(500).json({ error: 'Failed to fetch rating' });
  }
});

export default router;
