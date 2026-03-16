import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { validateIntParams, parsePagination } from '../middleware/validate.js';
import * as db from '../models/index.js';

const router = Router();

// Get current user's notifications
router.get('/', authenticateToken, parsePagination, async (req, res) => {
  try {
    const notifications = await db.getUserNotifications(req.user.id, req.pagination.limit, req.pagination.offset);
    res.json(notifications);
  } catch (err) {
    console.error('Error fetching notifications:', err);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

// Get unread notification count
router.get('/unread/count', authenticateToken, async (req, res) => {
  try {
    const count = await db.getUnreadNotificationCount(req.user.id);
    res.json({ count });
  } catch (err) {
    console.error('Error fetching unread count:', err);
    res.status(500).json({ error: 'Failed to fetch count' });
  }
});

// Mark a notification as read
router.put('/:id/read', validateIntParams('id'), authenticateToken, async (req, res) => {
  const { id } = req.params;

  try {
    const notification = await db.markNotificationRead(parseInt(id), req.user.id);
    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }
    res.json(notification);
  } catch (err) {
    console.error('Error marking notification read:', err);
    res.status(500).json({ error: 'Failed to update notification' });
  }
});

// Mark all notifications as read
router.put('/read-all', authenticateToken, async (req, res) => {
  try {
    await db.markAllNotificationsRead(req.user.id);
    res.json({ success: true });
  } catch (err) {
    console.error('Error marking all read:', err);
    res.status(500).json({ error: 'Failed to update notifications' });
  }
});

export default router;
