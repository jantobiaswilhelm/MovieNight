import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { validateGuildId } from '../middleware/validate.js';
import * as db from '../models/index.js';

const router = Router();

// Get server-wide stats
router.get('/', validateGuildId, async (req, res) => {
  const { month } = req.query;

  // Validate month format to prevent SQL injection
  if (month && !/^\d{4}-\d{2}$/.test(month)) {
    return res.status(400).json({ error: 'Invalid month format. Use YYYY-MM.' });
  }

  try {
    const [
      stats,
      topMovies,
      topRaters,
      topMonth,
      topYear,
      topAllTime,
      worstMonth,
      worstYear,
      worstAllTime,
      availableMonths,
      totalRuntime,
      streakLeaderboard,
      topHosts,
      bestTasteHosts,
      raterExtremes,
      mostLoyal,
      mostDivisive,
      signature,
      cadence
    ] = await Promise.all([
      db.getGuildStats(req.guildId),
      db.getTopRatedMovies(req.guildId, 5),
      db.getMostActiveRaters(req.guildId, 5),
      db.getTopRatedMoviesByPeriod(req.guildId, 'month', 5, 3, month || null),
      db.getTopRatedMoviesByPeriod(req.guildId, 'year', 5, 3),
      db.getTopRatedMoviesByPeriod(req.guildId, 'all', 5, 3),
      db.getWorstRatedMoviesByPeriod(req.guildId, 'month', 5, 3, month || null),
      db.getWorstRatedMoviesByPeriod(req.guildId, 'year', 5, 3),
      db.getWorstRatedMoviesByPeriod(req.guildId, 'all', 5, 3),
      db.getAvailableMonths(req.guildId),
      db.getGuildTotalRuntime(req.guildId),
      db.getStreakLeaderboard(req.guildId, 5),
      db.getTopHosts(req.guildId, 5),
      db.getBestTasteHosts(req.guildId, 5, 3),
      db.getRaterExtremes(req.guildId, 5),
      db.getMostLoyalAttendees(req.guildId, 5),
      db.getMostDivisiveFilm(req.guildId, 3),
      db.getSignatureGenreAndDecade(req.guildId),
      db.getCadence(req.guildId)
    ]);

    res.json({
      ...stats,
      top_movies: topMovies,
      top_raters: topRaters,
      top_month: topMonth,
      top_year: topYear,
      top_all_time: topAllTime,
      worst_month: worstMonth,
      worst_year: worstYear,
      worst_all_time: worstAllTime,
      available_months: availableMonths,
      selected_month: month || null,
      total_runtime: totalRuntime.total_minutes,
      streak_leaderboard: streakLeaderboard,
      top_hosts: topHosts,
      best_taste_hosts: bestTasteHosts,
      rater_extremes: raterExtremes,
      most_loyal: mostLoyal,
      most_divisive: mostDivisive,
      signature,
      cadence
    });
  } catch (err) {
    console.error('Error fetching stats:', err);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// Get user stats
router.get('/user/:userId', async (req, res) => {
  const { userId } = req.params;

  try {
    const stats = await db.getUserStats(parseInt(userId));
    res.json(stats);
  } catch (err) {
    console.error('Error fetching user stats:', err);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// Get current user's stats
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const stats = await db.getUserStats(req.user.id);
    res.json(stats);
  } catch (err) {
    console.error('Error fetching stats:', err);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// Get comprehensive profile stats
router.get('/me/profile', authenticateToken, validateGuildId, async (req, res) => {
  try {
    const [
      basicStats,
      histogram,
      guildComparison,
      ratingTwin,
      genreStats,
      hotTakes,
      watchtime,
      favoriteMovies,
      wishlistPreview,
      topRatedMovies,
      streak,
      favoriteDirectors,
      favoriteActors
    ] = await Promise.all([
      db.getUserStats(req.user.id),
      db.getUserRatingHistogram(req.user.id),
      db.getUserVsGuildAverage(req.user.id, req.guildId),
      db.findRatingTwin(req.user.id, req.guildId),
      db.getUserGenreStats(req.user.id),
      db.getUserHotTakes(req.user.id, 5),
      db.getUserTotalWatchtime(req.user.id),
      db.getUserFavoriteMovies(req.user.id),
      db.getUserWishlistPreview(req.user.id, req.guildId, 5),
      db.getUserTopRatedMovies(req.user.id, 10),
      db.getUserStreak(req.user.id),
      db.getUserFavoriteDirectors(req.user.id, 5),
      db.getUserFavoriteActors(req.user.id, 5)
    ]);

    res.json({
      basic_stats: basicStats,
      histogram,
      guild_comparison: guildComparison,
      rating_twin: ratingTwin,
      genre_stats: genreStats,
      hot_takes: hotTakes,
      watchtime: watchtime.total_minutes,
      favorite_movies: favoriteMovies,
      wishlist_preview: wishlistPreview,
      top_rated_movies: topRatedMovies,
      streak,
      favorite_directors: favoriteDirectors,
      favorite_actors: favoriteActors
    });
  } catch (err) {
    console.error('Error fetching profile stats:', err);
    res.status(500).json({ error: 'Failed to fetch profile stats' });
  }
});

// Get user's favorite movies
router.get('/me/favorites', authenticateToken, async (req, res) => {
  try {
    const favorites = await db.getUserFavoriteMovies(req.user.id);
    res.json(favorites);
  } catch (err) {
    console.error('Error fetching favorites:', err);
    res.status(500).json({ error: 'Failed to fetch favorites' });
  }
});

// Set a favorite movie
router.post('/me/favorites', authenticateToken, async (req, res) => {
  const { position, movie_night_id, tmdb_id, title, image_url, release_year } = req.body;

  if (!position) {
    return res.status(400).json({ error: 'position is required' });
  }

  if (!movie_night_id && !tmdb_id) {
    return res.status(400).json({ error: 'Either movie_night_id or tmdb_id is required' });
  }

  if (position < 1 || position > 5) {
    return res.status(400).json({ error: 'position must be between 1 and 5' });
  }

  try {
    const movieData = {
      movieNightId: movie_night_id,
      tmdbId: tmdb_id,
      title,
      imageUrl: image_url,
      releaseYear: release_year
    };
    const favorite = await db.setUserFavoriteMovie(req.user.id, position, movieData);
    res.json(favorite);
  } catch (err) {
    console.error('Error setting favorite:', err);
    res.status(500).json({ error: 'Failed to set favorite' });
  }
});

// Remove a favorite movie
router.delete('/me/favorites/:position', authenticateToken, async (req, res) => {
  const position = parseInt(req.params.position);

  if (position < 1 || position > 5) {
    return res.status(400).json({ error: 'position must be between 1 and 5' });
  }

  try {
    const removed = await db.removeUserFavoriteMovie(req.user.id, position);
    if (!removed) {
      return res.status(404).json({ error: 'No favorite at this position' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Error removing favorite:', err);
    res.status(500).json({ error: 'Failed to remove favorite' });
  }
});

// Get rated movies for favorite picker
router.get('/me/rated-movies', authenticateToken, async (req, res) => {
  try {
    const movies = await db.getUserRatedMoviesForFavorites(req.user.id);
    res.json(movies);
  } catch (err) {
    console.error('Error fetching rated movies:', err);
    res.status(500).json({ error: 'Failed to fetch rated movies' });
  }
});

// Get all guild users
router.get('/users', validateGuildId, async (req, res) => {
  try {
    const users = await db.getGuildUsers(req.guildId);
    res.json(users);
  } catch (err) {
    console.error('Error fetching guild users:', err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Get random comments for homepage ticker
router.get('/comments/random', validateGuildId, async (req, res) => {
  const { limit = 10 } = req.query;

  try {
    const comments = await db.getRandomComments(req.guildId, parseInt(limit));
    res.json(comments);
  } catch (err) {
    console.error('Error fetching random comments:', err);
    res.status(500).json({ error: 'Failed to fetch comments' });
  }
});

// Get the highest-rated movie watched on today's date in a prior year (nostalgia banner)
router.get('/on-this-day', validateGuildId, async (req, res) => {
  try {
    const movie = await db.getOnThisDay(req.guildId);
    res.json(movie);
  } catch (err) {
    console.error('Error fetching on this day:', err);
    res.status(500).json({ error: 'Failed to fetch on this day' });
  }
});

// Get another user's profile (public preview)
router.get('/user/:userId/profile', validateGuildId, async (req, res) => {
  const { userId } = req.params;

  try {
    const user = await db.getUserById(parseInt(userId));
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const [
      basicStats,
      histogram,
      guildComparison,
      genreStats,
      hotTakes,
      watchtime,
      favoriteMovies,
      topRatedMovies,
      streak,
      favoriteDirectors,
      favoriteActors
    ] = await Promise.all([
      db.getUserStats(parseInt(userId)),
      db.getUserRatingHistogram(parseInt(userId)),
      db.getUserVsGuildAverage(parseInt(userId), req.guildId),
      db.getUserGenreStats(parseInt(userId)),
      db.getUserHotTakes(parseInt(userId), 5),
      db.getUserTotalWatchtime(parseInt(userId)),
      db.getUserFavoriteMovies(parseInt(userId)),
      db.getUserTopRatedMovies(parseInt(userId), 10),
      db.getUserStreak(parseInt(userId)),
      db.getUserFavoriteDirectors(parseInt(userId), 5),
      db.getUserFavoriteActors(parseInt(userId), 5)
    ]);

    res.json({
      user: {
        id: user.id,
        username: user.username,
        discord_id: user.discord_id,
        avatar: user.avatar
      },
      basic_stats: basicStats,
      histogram,
      guild_comparison: guildComparison,
      genre_stats: genreStats,
      hot_takes: hotTakes,
      watchtime: watchtime.total_minutes,
      favorite_movies: favoriteMovies,
      top_rated_movies: topRatedMovies,
      streak,
      favorite_directors: favoriteDirectors,
      favorite_actors: favoriteActors
    });
  } catch (err) {
    console.error('Error fetching user profile:', err);
    res.status(500).json({ error: 'Failed to fetch user profile' });
  }
});

export default router;
