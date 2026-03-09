import { Router } from 'express';
import { authenticateToken, optionalAuth } from '../middleware/auth.js';
import * as db from '../models/index.js';
import { notifyNewFollower } from '../services/notificationService.js';

const router = Router();

// ============================================
// FOLLOWS
// ============================================

// Get current user's followers
router.get('/followers', authenticateToken, async (req, res) => {
  try {
    const followers = await db.getFollowers(req.user.id);
    res.json(followers);
  } catch (err) {
    console.error('Error fetching followers:', err);
    res.status(500).json({ error: 'Failed to fetch followers' });
  }
});

// Get current user's following
router.get('/following', authenticateToken, async (req, res) => {
  try {
    const following = await db.getFollowing(req.user.id);
    res.json(following);
  } catch (err) {
    console.error('Error fetching following:', err);
    res.status(500).json({ error: 'Failed to fetch following' });
  }
});

// Follow a user
router.post('/follow/:userId', authenticateToken, async (req, res) => {
  const { userId } = req.params;
  const targetUserId = parseInt(userId);

  if (targetUserId === req.user.id) {
    return res.status(400).json({ error: 'Cannot follow yourself' });
  }

  try {
    // Verify target user exists
    const targetUser = await db.getUserById(targetUserId);
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    const follow = await db.followUser(req.user.id, targetUserId);

    // Send notification to the followed user
    if (follow) {
      const follower = await db.getUserById(req.user.id);
      notifyNewFollower(targetUserId, follower.username, req.user.id).catch(console.error);
    }

    const counts = await db.getFollowCounts(targetUserId);
    res.json({ following: true, ...counts });
  } catch (err) {
    console.error('Error following user:', err);
    res.status(500).json({ error: 'Failed to follow user' });
  }
});

// Unfollow a user
router.delete('/follow/:userId', authenticateToken, async (req, res) => {
  const { userId } = req.params;

  try {
    await db.unfollowUser(req.user.id, parseInt(userId));
    const counts = await db.getFollowCounts(parseInt(userId));
    res.json({ following: false, ...counts });
  } catch (err) {
    console.error('Error unfollowing user:', err);
    res.status(500).json({ error: 'Failed to unfollow user' });
  }
});

// Check if following a user
router.get('/following/:userId', authenticateToken, async (req, res) => {
  const { userId } = req.params;

  try {
    const isFollowing = await db.isFollowing(req.user.id, parseInt(userId));
    const counts = await db.getFollowCounts(parseInt(userId));
    res.json({ following: isFollowing, ...counts });
  } catch (err) {
    console.error('Error checking follow status:', err);
    res.status(500).json({ error: 'Failed to check follow status' });
  }
});

// ============================================
// ACTIVITY FEED
// ============================================

// Get activity feed (from followed users)
router.get('/feed', authenticateToken, async (req, res) => {
  const { guild_id } = req.query;
  const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 100);
  const offset = Math.max(parseInt(req.query.offset) || 0, 0);

  if (!guild_id) {
    return res.status(400).json({ error: 'guild_id is required' });
  }

  try {
    const activities = await db.getActivityFeed(req.user.id, guild_id, limit, offset);
    res.json(activities);
  } catch (err) {
    console.error('Error fetching activity feed:', err);
    res.status(500).json({ error: 'Failed to fetch activity feed' });
  }
});

// Get a specific user's activity
router.get('/activity/:userId', async (req, res) => {
  const { userId } = req.params;
  const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 100);

  try {
    const activities = await db.getUserActivity(parseInt(userId), limit);
    res.json(activities);
  } catch (err) {
    console.error('Error fetching user activity:', err);
    res.status(500).json({ error: 'Failed to fetch activity' });
  }
});

// ============================================
// SHARED WISHLISTS
// ============================================

// Get all shared wishlists for a guild
router.get('/wishlists', async (req, res) => {
  const { guild_id } = req.query;

  if (!guild_id) {
    return res.status(400).json({ error: 'guild_id is required' });
  }

  try {
    const wishlists = await db.getSharedWishlists(guild_id);
    res.json(wishlists);
  } catch (err) {
    console.error('Error fetching shared wishlists:', err);
    res.status(500).json({ error: 'Failed to fetch wishlists' });
  }
});

// Create a shared wishlist
router.post('/wishlists', authenticateToken, async (req, res) => {
  const { name, description, is_collaborative, guild_id } = req.body;

  if (!name || !guild_id) {
    return res.status(400).json({ error: 'name and guild_id are required' });
  }

  try {
    const wishlist = await db.createSharedWishlist(
      req.user.id,
      guild_id,
      name,
      description || null,
      is_collaborative || false
    );
    res.json(wishlist);
  } catch (err) {
    console.error('Error creating shared wishlist:', err);
    res.status(500).json({ error: 'Failed to create wishlist' });
  }
});

// Get a specific shared wishlist
router.get('/wishlists/:id', optionalAuth, async (req, res) => {
  const { id } = req.params;

  try {
    const wishlist = await db.getSharedWishlistById(parseInt(id));

    if (!wishlist) {
      return res.status(404).json({ error: 'Wishlist not found' });
    }

    const [items, members] = await Promise.all([
      db.getSharedWishlistItems(parseInt(id)),
      db.getSharedWishlistMembers(parseInt(id))
    ]);

    let canEdit = false;
    if (req.user) {
      canEdit = await db.canEditSharedWishlist(parseInt(id), req.user.id);
    }

    res.json({
      ...wishlist,
      items,
      members,
      can_edit: canEdit,
      is_owner: req.user && req.user.id === wishlist.owner_id
    });
  } catch (err) {
    console.error('Error fetching shared wishlist:', err);
    res.status(500).json({ error: 'Failed to fetch wishlist' });
  }
});

// Add item to shared wishlist
router.post('/wishlists/:id/items', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { tmdb_id, title, image_url, importance } = req.body;

  if (!tmdb_id || !title) {
    return res.status(400).json({ error: 'tmdb_id and title are required' });
  }

  try {
    // Check if user can edit
    const canEdit = await db.canEditSharedWishlist(parseInt(id), req.user.id);
    if (!canEdit) {
      return res.status(403).json({ error: 'Not authorized to add items' });
    }

    const item = await db.addSharedWishlistItem(parseInt(id), req.user.id, {
      tmdbId: tmdb_id,
      title,
      imageUrl: image_url,
      importance
    });

    res.json(item);
  } catch (err) {
    console.error('Error adding wishlist item:', err);
    res.status(500).json({ error: 'Failed to add item' });
  }
});

// Remove item from shared wishlist
router.delete('/wishlists/:id/items/:itemId', authenticateToken, async (req, res) => {
  const { id, itemId } = req.params;

  try {
    const canEdit = await db.canEditSharedWishlist(parseInt(id), req.user.id);
    if (!canEdit) {
      return res.status(403).json({ error: 'Not authorized to remove items' });
    }

    const removed = await db.removeSharedWishlistItem(parseInt(id), parseInt(itemId));
    if (!removed) {
      return res.status(404).json({ error: 'Item not found' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Error removing wishlist item:', err);
    res.status(500).json({ error: 'Failed to remove item' });
  }
});

// Add member to shared wishlist
router.post('/wishlists/:id/members', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { user_id, can_edit } = req.body;

  if (!user_id) {
    return res.status(400).json({ error: 'user_id is required' });
  }

  try {
    // Verify ownership
    const wishlist = await db.getSharedWishlistById(parseInt(id));
    if (!wishlist || wishlist.owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Only the owner can add members' });
    }

    const member = await db.addSharedWishlistMember(parseInt(id), parseInt(user_id), can_edit || false);
    res.json(member);
  } catch (err) {
    console.error('Error adding member:', err);
    res.status(500).json({ error: 'Failed to add member' });
  }
});

// Remove member from shared wishlist
router.delete('/wishlists/:id/members/:userId', authenticateToken, async (req, res) => {
  const { id, userId } = req.params;

  try {
    // Verify ownership or self-removal
    const wishlist = await db.getSharedWishlistById(parseInt(id));
    if (!wishlist) {
      return res.status(404).json({ error: 'Wishlist not found' });
    }

    if (wishlist.owner_id !== req.user.id && parseInt(userId) !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    await db.removeSharedWishlistMember(parseInt(id), parseInt(userId));
    res.json({ success: true });
  } catch (err) {
    console.error('Error removing member:', err);
    res.status(500).json({ error: 'Failed to remove member' });
  }
});

export default router;
