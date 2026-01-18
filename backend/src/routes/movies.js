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

// Get upcoming movies with attendees (must be before /:id)
router.get('/upcoming/with-attendees', optionalAuth, async (req, res) => {
  const { guild_id, limit = 10 } = req.query;

  if (!guild_id) {
    return res.status(400).json({ error: 'guild_id is required' });
  }

  try {
    const movies = await db.getUpcomingMoviesWithAttendees(guild_id, parseInt(limit));
    res.json(movies);
  } catch (err) {
    console.error('Error fetching upcoming movies:', err);
    res.status(500).json({ error: 'Failed to fetch upcoming movies' });
  }
});

// Get next movie with attendees (for homepage hero) (must be before /:id)
router.get('/next/with-attendees', optionalAuth, async (req, res) => {
  const { guild_id } = req.query;

  if (!guild_id) {
    return res.status(400).json({ error: 'guild_id is required' });
  }

  try {
    const movie = await db.getNextMovieWithAttendees(guild_id);

    let isAttending = false;
    if (req.user && movie) {
      isAttending = await db.isUserAttending(movie.id, req.user.id);
    }

    res.json(movie ? { ...movie, is_attending: isAttending } : null);
  } catch (err) {
    console.error('Error fetching next movie:', err);
    res.status(500).json({ error: 'Failed to fetch next movie' });
  }
});

// Announce movie directly (creates pending announcement for bot)
router.post('/announce', authenticateToken, async (req, res) => {
  const { tmdb_data, scheduled_at, guild_id } = req.body;

  if (!tmdb_data || !scheduled_at || !guild_id) {
    return res.status(400).json({ error: 'tmdb_data, scheduled_at, and guild_id are required' });
  }

  const scheduledDate = new Date(scheduled_at);
  if (isNaN(scheduledDate.getTime())) {
    return res.status(400).json({ error: 'Invalid scheduled_at date' });
  }

  if (scheduledDate <= new Date()) {
    return res.status(400).json({ error: 'Scheduled time must be in the future' });
  }

  try {
    // Create pending announcement with TMDB data
    const announcement = await db.createPendingAnnouncement({
      guildId: guild_id,
      channelId: null, // Bot will use default channel
      userId: req.user.id,
      wishlistId: null, // Not from wishlist
      title: tmdb_data.releaseYear
        ? `${tmdb_data.title} (${tmdb_data.releaseYear})`
        : tmdb_data.title,
      imageUrl: tmdb_data.posterPath,
      backdropUrl: tmdb_data.backdropPath,
      description: tmdb_data.overview,
      tmdbId: tmdb_data.id,
      imdbId: tmdb_data.imdbId,
      tmdbRating: tmdb_data.rating,
      genres: tmdb_data.genres,
      runtime: tmdb_data.runtime,
      releaseYear: tmdb_data.releaseYear || tmdb_data.year,
      trailerUrl: tmdb_data.trailerUrl,
      scheduledAt: scheduledDate
    });

    res.json(announcement);
  } catch (err) {
    console.error('Error creating announcement:', err);
    res.status(500).json({ error: 'Failed to create announcement' });
  }
});

// Get single movie with ratings and attendance
router.get('/:id', optionalAuth, async (req, res) => {
  const { id } = req.params;

  try {
    const movie = await db.getMovieNightById(parseInt(id));

    if (!movie) {
      return res.status(404).json({ error: 'Movie not found' });
    }

    const [ratings, attendees] = await Promise.all([
      db.getRatingsForMovie(parseInt(id)),
      db.getAttendees(parseInt(id))
    ]);

    // Calculate average
    const avgRating = ratings.length > 0
      ? ratings.reduce((sum, r) => sum + parseFloat(r.score), 0) / ratings.length
      : 0;

    // Check if current user is attending
    let isAttending = false;
    if (req.user) {
      isAttending = await db.isUserAttending(parseInt(id), req.user.id);
    }

    res.json({
      ...movie,
      ratings,
      avg_rating: avgRating,
      rating_count: ratings.length,
      attendees,
      is_attending: isAttending
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

    // Check if movie has started
    if (!movie.started_at) {
      return res.status(400).json({ error: 'Movie has not started yet. Ratings will be available once the movie night begins.' });
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

// Toggle attendance for a movie
router.post('/:id/attend', authenticateToken, async (req, res) => {
  const { id } = req.params;

  try {
    const movie = await db.getMovieNightById(parseInt(id));

    if (!movie) {
      return res.status(404).json({ error: 'Movie not found' });
    }

    // Only allow attendance for upcoming movies (not started)
    if (movie.started_at) {
      return res.status(400).json({ error: 'Cannot change attendance for movies that have already started' });
    }

    const result = await db.toggleAttendance(parseInt(id), req.user.id);

    // Return updated attendees list
    const attendees = await db.getAttendees(parseInt(id));

    res.json({
      ...result,
      attendees
    });
  } catch (err) {
    console.error('Error toggling attendance:', err);
    res.status(500).json({ error: 'Failed to update attendance' });
  }
});

// Get attendees for a movie
router.get('/:id/attendees', optionalAuth, async (req, res) => {
  const { id } = req.params;

  try {
    const attendees = await db.getAttendees(parseInt(id));

    let isAttending = false;
    if (req.user) {
      isAttending = await db.isUserAttending(parseInt(id), req.user.id);
    }

    res.json({
      attendees,
      is_attending: isAttending
    });
  } catch (err) {
    console.error('Error fetching attendees:', err);
    res.status(500).json({ error: 'Failed to fetch attendees' });
  }
});

export default router;
