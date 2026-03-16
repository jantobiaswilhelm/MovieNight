import pool from '../config/database.js';

export const getGuildChannels = async (guildId) => {
  const result = await pool.query(
    `SELECT channel_id, channel_name, position, parent_name
     FROM guild_channels
     WHERE guild_id = $1
     ORDER BY position ASC`,
    [guildId]
  );
  return result.rows;
};

export const getGuildSettings = async (guildId) => {
  const result = await pool.query(
    `SELECT test_mode, test_channel_id FROM guild_settings WHERE guild_id = $1`,
    [guildId]
  );
  return result.rows[0] || { test_mode: false, test_channel_id: null };
};

export const upsertGuildSettings = async (guildId, testMode, testChannelId) => {
  const result = await pool.query(
    `INSERT INTO guild_settings (guild_id, test_mode, test_channel_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (guild_id)
     DO UPDATE SET test_mode = $2, test_channel_id = $3, updated_at = CURRENT_TIMESTAMP
     RETURNING *`,
    [guildId, testMode, testChannelId || null]
  );
  return result.rows[0];
};

export const deleteTestMovies = async (guildId) => {
  // Delete ratings, attendance, and credits for test movies first
  await pool.query(
    `DELETE FROM ratings WHERE movie_night_id IN
     (SELECT id FROM movie_nights WHERE guild_id = $1 AND is_test = true)`,
    [guildId]
  );
  await pool.query(
    `DELETE FROM movie_attendance WHERE movie_night_id IN
     (SELECT id FROM movie_nights WHERE guild_id = $1 AND is_test = true)`,
    [guildId]
  );
  await pool.query(
    `DELETE FROM movie_credits WHERE movie_night_id IN
     (SELECT id FROM movie_nights WHERE guild_id = $1 AND is_test = true)`,
    [guildId]
  );
  const result = await pool.query(
    `DELETE FROM movie_nights WHERE guild_id = $1 AND is_test = true RETURNING id`,
    [guildId]
  );
  return result.rows.length;
};

export const getTestMovieCount = async (guildId) => {
  const result = await pool.query(
    `SELECT COUNT(*)::integer as count FROM movie_nights WHERE guild_id = $1 AND is_test = true`,
    [guildId]
  );
  return result.rows[0].count;
};
