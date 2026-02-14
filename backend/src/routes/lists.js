import { Router } from 'express';
import { authenticateToken, optionalAuth } from '../middleware/auth.js';
import * as db from '../models/index.js';
import { logListCreatedActivity } from '../services/activityService.js';

const router = Router();

// Get current user's lists
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const lists = await db.getUserLists(req.user.id);
    res.json(lists);
  } catch (err) {
    console.error('Error fetching user lists:', err);
    res.status(500).json({ error: 'Failed to fetch lists' });
  }
});

// Get public lists for a guild
router.get('/public', async (req, res) => {
  const { guild_id } = req.query;

  if (!guild_id) {
    return res.status(400).json({ error: 'guild_id is required' });
  }

  try {
    const lists = await db.getPublicLists(guild_id);
    res.json(lists);
  } catch (err) {
    console.error('Error fetching public lists:', err);
    res.status(500).json({ error: 'Failed to fetch lists' });
  }
});

// Create a new list
router.post('/', authenticateToken, async (req, res) => {
  const { name, description, is_public, guild_id } = req.body;

  if (!name || !guild_id) {
    return res.status(400).json({ error: 'name and guild_id are required' });
  }

  if (name.length > 100) {
    return res.status(400).json({ error: 'Name must be 100 characters or less' });
  }

  try {
    const list = await db.createCustomList(
      req.user.id,
      guild_id,
      name,
      description || null,
      is_public !== false
    );

    // Log activity
    try {
      await logListCreatedActivity(req.user.id, guild_id, list.id, name);
    } catch (activityErr) {
      console.error('Error logging activity:', activityErr);
    }

    res.json(list);
  } catch (err) {
    console.error('Error creating list:', err);
    res.status(500).json({ error: 'Failed to create list' });
  }
});

// Get a specific list with items
router.get('/:id', optionalAuth, async (req, res) => {
  const { id } = req.params;

  try {
    const list = await db.getListById(parseInt(id));

    if (!list) {
      return res.status(404).json({ error: 'List not found' });
    }

    // Check access
    if (!list.is_public && (!req.user || req.user.id !== list.user_id)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const items = await db.getListItems(parseInt(id));

    res.json({
      ...list,
      items,
      is_owner: req.user && req.user.id === list.user_id
    });
  } catch (err) {
    console.error('Error fetching list:', err);
    res.status(500).json({ error: 'Failed to fetch list' });
  }
});

// Update a list
router.put('/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { name, description, is_public } = req.body;

  try {
    const updated = await db.updateList(parseInt(id), req.user.id, {
      name,
      description,
      isPublic: is_public
    });

    if (!updated) {
      return res.status(404).json({ error: 'List not found or not authorized' });
    }

    res.json(updated);
  } catch (err) {
    console.error('Error updating list:', err);
    res.status(500).json({ error: 'Failed to update list' });
  }
});

// Delete a list
router.delete('/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;

  try {
    const deleted = await db.deleteList(parseInt(id), req.user.id);

    if (!deleted) {
      return res.status(404).json({ error: 'List not found or not authorized' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting list:', err);
    res.status(500).json({ error: 'Failed to delete list' });
  }
});

// Add item to a list
router.post('/:id/items', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { tmdb_id, title, image_url, release_year, note } = req.body;

  if (!tmdb_id || !title) {
    return res.status(400).json({ error: 'tmdb_id and title are required' });
  }

  try {
    // Verify ownership
    const list = await db.getListById(parseInt(id));
    if (!list || list.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const item = await db.addListItem(parseInt(id), {
      tmdbId: tmdb_id,
      title,
      imageUrl: image_url,
      releaseYear: release_year,
      note
    });

    res.json(item);
  } catch (err) {
    console.error('Error adding list item:', err);
    res.status(500).json({ error: 'Failed to add item' });
  }
});

// Remove item from a list
router.delete('/:id/items/:itemId', authenticateToken, async (req, res) => {
  const { id, itemId } = req.params;

  try {
    // Verify ownership
    const list = await db.getListById(parseInt(id));
    if (!list || list.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const removed = await db.removeListItem(parseInt(id), parseInt(itemId));

    if (!removed) {
      return res.status(404).json({ error: 'Item not found' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Error removing list item:', err);
    res.status(500).json({ error: 'Failed to remove item' });
  }
});

export default router;
