import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.js';
import * as db from '../models/index.js';

const router = Router();

// Get server-wide stats
router.get('/', async (req, res) => {
  const { guild_id, month } = req.query;

  if (!guild_id) {
    return res.status(400).json({ error: 'guild_id is required' });
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
      availableMonths
    ] = await Promise.all([
      db.getGuildStats(guild_id),
      db.getTopRatedMovies(guild_id, 5),
      db.getMostActiveRaters(guild_id, 5),
      db.getTopRatedMoviesByPeriod(guild_id, 'month', 5, 3, month || null),
      db.getTopRatedMoviesByPeriod(guild_id, 'year', 5, 3),
      db.getTopRatedMoviesByPeriod(guild_id, 'all', 5, 3),
      db.getWorstRatedMoviesByPeriod(guild_id, 'month', 5, 3, month || null),
      db.getWorstRatedMoviesByPeriod(guild_id, 'year', 5, 3),
      db.getWorstRatedMoviesByPeriod(guild_id, 'all', 5, 3),
      db.getAvailableMonths(guild_id)
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
      selected_month: month || null
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
router.get('/me/profile', authenticateToken, async (req, res) => {
  const { guild_id } = req.query;

  if (!guild_id) {
    return res.status(400).json({ error: 'guild_id is required' });
  }

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
      wishlistPreview
    ] = await Promise.all([
      db.getUserStats(req.user.id),
      db.getUserRatingHistogram(req.user.id),
      db.getUserVsGuildAverage(req.user.id, guild_id),
      db.findRatingTwin(req.user.id, guild_id),
      db.getUserGenreStats(req.user.id),
      db.getUserHotTakes(req.user.id, 5),
      db.getUserTotalWatchtime(req.user.id),
      db.getUserFavoriteMovies(req.user.id),
      db.getUserWishlistPreview(req.user.id, guild_id, 5)
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
      wishlist_preview: wishlistPreview
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
router.get('/users', async (req, res) => {
  const { guild_id } = req.query;

  if (!guild_id) {
    return res.status(400).json({ error: 'guild_id is required' });
  }

  try {
    const users = await db.getGuildUsers(guild_id);
    res.json(users);
  } catch (err) {
    console.error('Error fetching guild users:', err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Get random comments for homepage ticker
router.get('/comments/random', async (req, res) => {
  const { guild_id, limit = 10 } = req.query;

  if (!guild_id) {
    return res.status(400).json({ error: 'guild_id is required' });
  }

  try {
    const comments = await db.getRandomComments(guild_id, parseInt(limit));
    res.json(comments);
  } catch (err) {
    console.error('Error fetching random comments:', err);
    res.status(500).json({ error: 'Failed to fetch comments' });
  }
});

// Get another user's profile (public preview)
router.get('/user/:userId/profile', async (req, res) => {
  const { userId } = req.params;
  const { guild_id } = req.query;

  if (!guild_id) {
    return res.status(400).json({ error: 'guild_id is required' });
  }

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
      favoriteMovies
    ] = await Promise.all([
      db.getUserStats(parseInt(userId)),
      db.getUserRatingHistogram(parseInt(userId)),
      db.getUserVsGuildAverage(parseInt(userId), guild_id),
      db.getUserGenreStats(parseInt(userId)),
      db.getUserHotTakes(parseInt(userId), 5),
      db.getUserTotalWatchtime(parseInt(userId)),
      db.getUserFavoriteMovies(parseInt(userId))
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
      favorite_movies: favoriteMovies
    });
  } catch (err) {
    console.error('Error fetching user profile:', err);
    res.status(500).json({ error: 'Failed to fetch user profile' });
  }
});

export default router;
