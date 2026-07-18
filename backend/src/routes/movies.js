import { Router } from 'express';
import { authenticateToken, optionalAuth } from '../middleware/auth.js';
import { validateIntParams, validateGuildId, parsePagination, validateDate } from '../middleware/validate.js';
import * as db from '../models/index.js';
import { isAdmin } from '../utils/admin.js';
import { checkAndUnlockAchievements, checkRatingAchievements } from '../services/achievementChecker.js';
import { logRatingActivity, logAchievementActivity } from '../services/activityService.js';

const router = Router();

// Get all movie nights (requires guild_id query param)
router.get('/', validateGuildId, parsePagination, optionalAuth, async (req, res) => {
  try {
    const includeTest = req.query.include_test === 'true' && req.user && isAdmin(req.user.discord_id);
    const movies = await db.getMovieNights(req.guildId, req.pagination.limit, req.pagination.offset, includeTest);
    res.json(movies);
  } catch (err) {
    console.error('Error fetching movies:', err);
    res.status(500).json({ error: 'Failed to fetch movies' });
  }
});

// Get upcoming movies with attendees (must be before /:id)
router.get('/upcoming/with-attendees', validateGuildId, parsePagination, optionalAuth, async (req, res) => {
  try {
    const movies = await db.getUpcomingMoviesWithAttendees(req.guildId, req.pagination.limit);
    res.json(movies);
  } catch (err) {
    console.error('Error fetching upcoming movies:', err);
    res.status(500).json({ error: 'Failed to fetch upcoming movies' });
  }
});

// Get next movie with attendees (for homepage hero) (must be before /:id)
router.get('/next/with-attendees', validateGuildId, optionalAuth, async (req, res) => {
  try {
    const movie = await db.getNextMovieWithAttendees(req.guildId);

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
router.post('/announce', authenticateToken, validateGuildId, validateDate('scheduled_at'), async (req, res) => {
  const { tmdb_data } = req.body;
  const scheduledDate = req.validatedDates.scheduled_at;

  if (!tmdb_data) {
    return res.status(400).json({ error: 'tmdb_data is required' });
  }

  if (scheduledDate <= new Date()) {
    return res.status(400).json({ error: 'Scheduled time must be in the future' });
  }

  try {
    // Check test mode settings
    const settings = await db.getGuildSettings(req.guildId);
    const isTest = settings.test_mode === true;
    const channelId = isTest ? settings.test_channel_id : null;

    // Create pending announcement with TMDB data
    const announcement = await db.createPendingAnnouncement({
      guildId: req.guildId,
      channelId, // Test channel or null (bot uses default)
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
      scheduledAt: scheduledDate,
      isTest
    });

    res.json(announcement);
  } catch (err) {
    console.error('Error creating announcement:', err);
    res.status(500).json({ error: 'Failed to create announcement' });
  }
});

// Reschedule a movie night (the original host or an admin)
router.patch('/:id/reschedule', validateIntParams('id'), authenticateToken, validateGuildId, validateDate('scheduled_at'), async (req, res) => {
  const movieId = req.params.id;
  const scheduledDate = req.validatedDates.scheduled_at;

  if (scheduledDate <= new Date()) {
    return res.status(400).json({ error: 'Scheduled time must be in the future' });
  }

  try {
    const movie = await db.getMovieNightById(movieId);
    if (!movie || movie.guild_id !== req.guildId) {
      return res.status(404).json({ error: 'Movie not found' });
    }

    const isHost = movie.announced_by === req.user.id;
    if (!isHost && !isAdmin(req.user.discord_id)) {
      return res.status(403).json({ error: 'Only the host or an admin can reschedule this movie' });
    }

    if (movie.started_at) {
      return res.status(400).json({ error: 'Cannot reschedule a movie that has already started' });
    }

    const updated = await db.rescheduleMovieNight(movieId, scheduledDate);

    // Ask the bot to post a reschedule note in the Discord channel.
    // Non-fatal: the DB is already updated regardless of Discord.
    try {
      await db.notifyReschedule(movieId);
    } catch (err) {
      console.error('Failed to send movie_reschedule NOTIFY:', err.message);
    }

    res.json(updated);
  } catch (err) {
    console.error('Error rescheduling movie:', err);
    res.status(500).json({ error: 'Failed to reschedule movie' });
  }
});

// Cancel an upcoming movie night (the original host or an admin). Deletes the
// night and asks the bot to post a cancellation note in Discord.
router.delete('/:id', validateIntParams('id'), authenticateToken, validateGuildId, async (req, res) => {
  const movieId = req.params.id;

  try {
    const movie = await db.getMovieNightById(movieId);
    if (!movie || movie.guild_id !== req.guildId) {
      return res.status(404).json({ error: 'Movie not found' });
    }

    const isHost = movie.announced_by === req.user.id;
    if (!isHost && !isAdmin(req.user.discord_id)) {
      return res.status(403).json({ error: 'Only the host or an admin can cancel this movie' });
    }

    if (movie.started_at) {
      return res.status(400).json({ error: 'Cannot cancel a movie that has already started' });
    }

    await db.deleteMovieNight(movieId);

    // Tell the bot to post a cancellation note. Non-fatal.
    if (movie.channel_id) {
      try {
        await db.notifyCancel(movie.channel_id, movie.title);
      } catch (err) {
        console.error('Failed to send movie_cancel NOTIFY:', err.message);
      }
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Error cancelling movie:', err);
    res.status(500).json({ error: 'Failed to cancel movie' });
  }
});

// Get single movie with ratings and attendance
router.get('/:id', validateIntParams('id'), optionalAuth, async (req, res) => {
  const { id } = req.params;

  try {
    const movie = await db.getMovieNightById(parseInt(id));

    if (!movie) {
      return res.status(404).json({ error: 'Movie not found' });
    }

    const [ratings, attendees, screenings] = await Promise.all([
      db.getCombinedRatingsForMovie(parseInt(id)),
      db.getAttendees(parseInt(id)),
      db.getMovieScreenings(parseInt(id))
    ]);

    // Average over the combined ratings (latest score per person)
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
      screenings,
      screening_count: screenings.length,
      is_attending: isAttending
    });
  } catch (err) {
    console.error('Error fetching movie:', err);
    res.status(500).json({ error: 'Failed to fetch movie' });
  }
});

// Submit or update rating
router.post('/:id/ratings', validateIntParams('id'), authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { score, comment } = req.body;

  if (!score || score < 1 || score > 10) {
    return res.status(400).json({ error: 'Score must be between 1 and 10' });
  }

  // Validate 0.5 increments
  if ((score * 2) % 1 !== 0) {
    return res.status(400).json({ error: 'Score must be in 0.5 increments' });
  }

  // Validate comment length if provided
  if (comment && comment.length > 500) {
    return res.status(400).json({ error: 'Comment must be 500 characters or less' });
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

    // Check if enough time has passed (runtime minus buffer before movie ends)
    const RATING_BUFFER_MINUTES = 10;
    const DEFAULT_RUNTIME_MINUTES = 90;
    const startTime = new Date(movie.started_at).getTime();
    const runtime = movie.runtime || DEFAULT_RUNTIME_MINUTES;
    const ratingDelayMinutes = Math.max(runtime - RATING_BUFFER_MINUTES, 0);
    const ratingsAvailableAt = startTime + (ratingDelayMinutes * 60 * 1000);

    if (Date.now() < ratingsAvailableAt) {
      const remainingMinutes = Math.ceil((ratingsAvailableAt - Date.now()) / (60 * 1000));
      return res.status(400).json({ error: `Ratings will be available in ${remainingMinutes} minute${remainingMinutes !== 1 ? 's' : ''}.` });
    }

    const rating = await db.upsertRating(parseInt(id), req.user.id, score, comment || null);

    // Update user's streak
    const streakResult = await db.updateUserStreak(req.user.id, parseInt(id), movie.guild_id);

    // Check and unlock achievements
    let newAchievements = [];
    try {
      const [generalAchievements, ratingAchievements] = await Promise.all([
        checkAndUnlockAchievements(req.user.id, movie.guild_id),
        checkRatingAchievements(req.user.id, score)
      ]);
      newAchievements = [...generalAchievements, ...ratingAchievements];

      // Log activity for each unlocked achievement
      for (const achievement of newAchievements) {
        await logAchievementActivity(req.user.id, movie.guild_id, achievement.code, achievement.name);
      }
    } catch (achievementErr) {
      console.error('Error checking achievements:', achievementErr);
    }

    // Log rating activity
    try {
      await logRatingActivity(req.user.id, movie.guild_id, parseInt(id), movie.title, score);
    } catch (activityErr) {
      console.error('Error logging activity:', activityErr);
    }

    res.json({
      ...rating,
      streak: streakResult,
      newAchievements
    });
  } catch (err) {
    console.error('Error saving rating:', err);
    res.status(500).json({ error: 'Failed to save rating' });
  }
});

// Get user's rating for a movie
router.get('/:id/ratings/me', validateIntParams('id'), authenticateToken, async (req, res) => {
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
router.post('/:id/attend', validateIntParams('id'), authenticateToken, async (req, res) => {
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
router.get('/:id/attendees', validateIntParams('id'), optionalAuth, async (req, res) => {
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
