import pool from '../config/database.js';

export const followUser = async (followerId, followingId) => {
  if (followerId === followingId) {
    throw new Error('Cannot follow yourself');
  }

  const result = await pool.query(
    `INSERT INTO user_follows (follower_id, following_id)
     VALUES ($1, $2)
     ON CONFLICT (follower_id, following_id) DO NOTHING
     RETURNING *`,
    [followerId, followingId]
  );
  return result.rows[0];
};

export const unfollowUser = async (followerId, followingId) => {
  const result = await pool.query(
    `DELETE FROM user_follows WHERE follower_id = $1 AND following_id = $2 RETURNING *`,
    [followerId, followingId]
  );
  return result.rows[0];
};

export const getFollowers = async (userId, limit = 100, offset = 0) => {
  const result = await pool.query(
    `SELECT u.id, u.username, u.discord_id, u.avatar, uf.created_at as followed_at
     FROM user_follows uf
     JOIN users u ON uf.follower_id = u.id
     WHERE uf.following_id = $1
     ORDER BY uf.created_at DESC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  );
  return result.rows;
};

export const getFollowing = async (userId, limit = 100, offset = 0) => {
  const result = await pool.query(
    `SELECT u.id, u.username, u.discord_id, u.avatar, uf.created_at as followed_at
     FROM user_follows uf
     JOIN users u ON uf.following_id = u.id
     WHERE uf.follower_id = $1
     ORDER BY uf.created_at DESC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  );
  return result.rows;
};

export const isFollowing = async (followerId, followingId) => {
  const result = await pool.query(
    `SELECT id FROM user_follows WHERE follower_id = $1 AND following_id = $2`,
    [followerId, followingId]
  );
  return result.rows.length > 0;
};

export const getFollowCounts = async (userId) => {
  const result = await pool.query(
    `SELECT
       (SELECT COUNT(*)::integer FROM user_follows WHERE following_id = $1) as followers,
       (SELECT COUNT(*)::integer FROM user_follows WHERE follower_id = $1) as following`,
    [userId]
  );
  return result.rows[0];
};

export const getRandomComments = async (guildId, limit = 10) => {
  const result = await pool.query(
    `SELECT r.comment, r.score, mn.title as movie_title, u.username, u.discord_id, u.avatar
     FROM ratings r
     JOIN movie_nights mn ON r.movie_night_id = mn.id
     JOIN users u ON r.user_id = u.id
     WHERE mn.guild_id = $1 AND r.comment IS NOT NULL AND r.comment != ''
     ORDER BY RANDOM()
     LIMIT $2`,
    [guildId, limit]
  );
  return result.rows;
};

export const logActivity = async (userId, guildId, activityType, referenceId = null, data = null) => {
  const result = await pool.query(
    `INSERT INTO activity_feed (user_id, guild_id, activity_type, reference_id, data)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [userId, guildId, activityType, referenceId, data ? JSON.stringify(data) : null]
  );
  return result.rows[0];
};

export const getActivityFeed = async (userId, guildId, limit = 20, offset = 0) => {
  // Get activities from users that this user follows
  const result = await pool.query(
    `SELECT af.*, u.username, u.discord_id, u.avatar
     FROM activity_feed af
     JOIN users u ON af.user_id = u.id
     JOIN user_follows uf ON af.user_id = uf.following_id
     WHERE uf.follower_id = $1 AND af.guild_id = $2
     ORDER BY af.created_at DESC
     LIMIT $3 OFFSET $4`,
    [userId, guildId, limit, offset]
  );
  return result.rows;
};

export const getUserActivity = async (userId, limit = 20) => {
  const result = await pool.query(
    `SELECT af.*, u.username, u.discord_id, u.avatar
     FROM activity_feed af
     JOIN users u ON af.user_id = u.id
     WHERE af.user_id = $1
     ORDER BY af.created_at DESC
     LIMIT $2`,
    [userId, limit]
  );
  return result.rows;
};
