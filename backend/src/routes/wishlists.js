import { Router } from 'express';
import { authenticateToken, optionalAuth } from '../middleware/auth.js';
import * as db from '../models/index.js';

const router = Router();

// Get user's wishlist
router.get('/me', authenticateToken, async (req, res) => {
  const { guild_id, sort = 'importance' } = req.query;

  if (!guild_id) {
    return res.status(400).json({ error: 'guild_id is required' });
  }

  try {
    const items = await db.getUserWishlist(req.user.id, guild_id, sort);
    res.json(items);
  } catch (err) {
    console.error('Error fetching user wishlist:', err);
    res.status(500).json({ error: 'Failed to fetch wishlist' });
  }
});

// Get combined guild wishlist
router.get('/guild', optionalAuth, async (req, res) => {
  const { guild_id, sort = 'importance' } = req.query;

  if (!guild_id) {
    return res.status(400).json({ error: 'guild_id is required' });
  }

  try {
    const items = await db.getGuildWishlist(guild_id, sort);
    res.json(items);
  } catch (err) {
    console.error('Error fetching guild wishlist:', err);
    res.status(500).json({ error: 'Failed to fetch wishlist' });
  }
});

// Add movie to wishlist
router.post('/', authenticateToken, async (req, res) => {
  const { guild_id, title, image_url, backdrop_url, description, tmdb_id, imdb_id, tmdb_rating, genres, runtime, release_year, trailer_url, importance = 3 } = req.body;

  if (!guild_id) {
    return res.status(400).json({ error: 'guild_id is required' });
  }

  if (!title || !tmdb_id) {
    return res.status(400).json({ error: 'title and tmdb_id are required' });
  }

  if (importance < 1 || importance > 5) {
    return res.status(400).json({ error: 'importance must be between 1 and 5' });
  }

  try {
    const item = await db.addToWishlist({
      userId: req.user.id,
      guildId: guild_id,
      title,
      imageUrl: image_url,
      backdropUrl: backdrop_url,
      description,
      tmdbId: tmdb_id,
      imdbId: imdb_id,
      tmdbRating: tmdb_rating,
      genres,
      runtime,
      releaseYear: release_year,
      trailerUrl: trailer_url,
      importance
    });
    res.json(item);
  } catch (err) {
    console.error('Error adding to wishlist:', err);
    res.status(500).json({ error: 'Failed to add to wishlist' });
  }
});

// Update wishlist item importance
router.put('/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { importance } = req.body;

  if (!importance || importance < 1 || importance > 5) {
    return res.status(400).json({ error: 'importance must be between 1 and 5' });
  }

  try {
    const item = await db.updateWishlistImportance(parseInt(id), req.user.id, importance);

    if (!item) {
      return res.status(404).json({ error: 'Wishlist item not found or not owned by user' });
    }

    res.json(item);
  } catch (err) {
    console.error('Error updating wishlist item:', err);
    res.status(500).json({ error: 'Failed to update wishlist item' });
  }
});

// Remove from wishlist
router.delete('/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;

  try {
    const item = await db.removeFromWishlist(parseInt(id), req.user.id);

    if (!item) {
      return res.status(404).json({ error: 'Wishlist item not found or not owned by user' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Error removing from wishlist:', err);
    res.status(500).json({ error: 'Failed to remove from wishlist' });
  }
});

// Announce movie from wishlist (creates pending announcement for bot)
router.post('/announce', authenticateToken, async (req, res) => {
  const { wishlist_id, scheduled_at } = req.body;

  if (!wishlist_id || !scheduled_at) {
    return res.status(400).json({ error: 'wishlist_id and scheduled_at are required' });
  }

  const scheduledDate = new Date(scheduled_at);
  if (isNaN(scheduledDate.getTime())) {
    return res.status(400).json({ error: 'Invalid scheduled_at date' });
  }

  if (scheduledDate <= new Date()) {
    return res.status(400).json({ error: 'Scheduled time must be in the future' });
  }

  try {
    // Get the wishlist item
    const wishlistItem = await db.getWishlistById(parseInt(wishlist_id));

    if (!wishlistItem) {
      return res.status(404).json({ error: 'Wishlist item not found' });
    }

    // Create pending announcement
    const announcement = await db.createPendingAnnouncement({
      guildId: wishlistItem.guild_id,
      channelId: null, // Bot will use default channel
      userId: req.user.id,
      wishlistId: parseInt(wishlist_id),
      title: wishlistItem.release_year
        ? `${wishlistItem.title} (${wishlistItem.release_year})`
        : wishlistItem.title,
      imageUrl: wishlistItem.image_url,
      backdropUrl: wishlistItem.backdrop_url,
      description: wishlistItem.description,
      tmdbId: wishlistItem.tmdb_id,
      imdbId: wishlistItem.imdb_id,
      tmdbRating: wishlistItem.tmdb_rating,
      genres: wishlistItem.genres,
      runtime: wishlistItem.runtime,
      releaseYear: wishlistItem.release_year,
      trailerUrl: wishlistItem.trailer_url,
      scheduledAt: scheduledDate
    });

    // Remove from wishlist immediately to prevent duplicate scheduling
    await db.removeFromWishlistById(parseInt(wishlist_id));

    res.json(announcement);
  } catch (err) {
    console.error('Error creating announcement:', err);
    res.status(500).json({ error: 'Failed to create announcement' });
  }
});

export default router;
