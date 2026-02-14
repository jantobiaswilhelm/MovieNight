import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.js';
import * as db from '../models/index.js';

const router = Router();

// Get user's personal movies
router.get('/', authenticateToken, async (req, res) => {
  const { sort = 'newest' } = req.query;

  try {
    const movies = await db.getUserPersonalMovies(req.user.id, sort);
    res.json(movies);
  } catch (err) {
    console.error('Error fetching personal movies:', err);
    res.status(500).json({ error: 'Failed to fetch personal movies' });
  }
});

// Add a personal movie
router.post('/', authenticateToken, async (req, res) => {
  const { tmdb_id, title, image_url, release_year, runtime, genres, score, comment, watched_at } = req.body;

  if (!tmdb_id || !title) {
    return res.status(400).json({ error: 'tmdb_id and title are required' });
  }

  if (score !== undefined && score !== null && (score < 1 || score > 10)) {
    return res.status(400).json({ error: 'score must be between 1 and 10' });
  }

  try {
    const movie = await db.addPersonalMovie(req.user.id, {
      tmdbId: tmdb_id,
      title,
      imageUrl: image_url,
      releaseYear: release_year,
      runtime,
      genres,
      score: score || null,
      comment: comment || null,
      watchedAt: watched_at || null
    });
    res.json(movie);
  } catch (err) {
    console.error('Error adding personal movie:', err);
    res.status(500).json({ error: 'Failed to add personal movie' });
  }
});

// Update a personal movie
router.put('/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { score, comment, watched_at } = req.body;

  if (score !== undefined && score !== null && (score < 1 || score > 10)) {
    return res.status(400).json({ error: 'score must be between 1 and 10' });
  }

  try {
    const movie = await db.updatePersonalMovie(parseInt(id), req.user.id, {
      score: score !== undefined ? score : undefined,
      comment: comment !== undefined ? comment : undefined,
      watchedAt: watched_at !== undefined ? watched_at : undefined
    });

    if (!movie) {
      return res.status(404).json({ error: 'Personal movie not found or not owned by user' });
    }

    res.json(movie);
  } catch (err) {
    console.error('Error updating personal movie:', err);
    res.status(500).json({ error: 'Failed to update personal movie' });
  }
});

// Delete a personal movie
router.delete('/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;

  try {
    const movie = await db.deletePersonalMovie(parseInt(id), req.user.id);

    if (!movie) {
      return res.status(404).json({ error: 'Personal movie not found or not owned by user' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting personal movie:', err);
    res.status(500).json({ error: 'Failed to delete personal movie' });
  }
});

export default router;
