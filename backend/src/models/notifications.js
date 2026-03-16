import pool from '../config/database.js';

export const createNotification = async (userId, type, title, message, link = null, data = null) => {
  const result = await pool.query(
    `INSERT INTO notifications (user_id, type, title, message, link, data)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [userId, type, title, message, link, data ? JSON.stringify(data) : null]
  );
  return result.rows[0];
};

export const createBulkNotifications = async (userIds, type, title, message, link = null, data = null) => {
  if (!userIds || userIds.length === 0) return [];

  const values = userIds.map((_, i) => `($${i * 6 + 1}, $${i * 6 + 2}, $${i * 6 + 3}, $${i * 6 + 4}, $${i * 6 + 5}, $${i * 6 + 6})`).join(', ');
  const params = userIds.flatMap(uid => [uid, type, title, message, link, data ? JSON.stringify(data) : null]);

  const result = await pool.query(
    `INSERT INTO notifications (user_id, type, title, message, link, data)
     VALUES ${values}
     RETURNING *`,
    params
  );
  return result.rows;
};

export const getUserNotifications = async (userId, limit = 20, offset = 0) => {
  const result = await pool.query(
    `SELECT * FROM notifications
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  );
  return result.rows;
};

export const getUnreadNotificationCount = async (userId) => {
  const result = await pool.query(
    `SELECT COUNT(*)::integer as count FROM notifications WHERE user_id = $1 AND is_read = false`,
    [userId]
  );
  return result.rows[0].count;
};

export const markNotificationRead = async (notificationId, userId) => {
  const result = await pool.query(
    `UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2 RETURNING *`,
    [notificationId, userId]
  );
  return result.rows[0];
};

export const markAllNotificationsRead = async (userId) => {
  await pool.query(
    `UPDATE notifications SET is_read = true WHERE user_id = $1 AND is_read = false`,
    [userId]
  );
};
