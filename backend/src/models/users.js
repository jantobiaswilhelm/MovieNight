import pool from '../config/database.js';

// PARALLEL to bot/src/models/index.js (findOrCreateUser) — intentionally differs: backend has a 4th discordAccessToken param for web OAuth
export const findOrCreateUser = async (discordId, username, avatar, discordAccessToken = null) => {
  const query = discordAccessToken
    ? `INSERT INTO users (discord_id, username, avatar, discord_access_token)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (discord_id)
       DO UPDATE SET username = $2, avatar = $3, discord_access_token = $4, updated_at = CURRENT_TIMESTAMP
       RETURNING *`
    : `INSERT INTO users (discord_id, username, avatar)
       VALUES ($1, $2, $3)
       ON CONFLICT (discord_id)
       DO UPDATE SET username = $2, avatar = $3, updated_at = CURRENT_TIMESTAMP
       RETURNING *`;
  const params = discordAccessToken
    ? [discordId, username, avatar, discordAccessToken]
    : [discordId, username, avatar];
  const result = await pool.query(query, params);
  return result.rows[0];
};

// SHARED: keep identical with bot/src/models/index.js (getUserByDiscordId)
export const getUserByDiscordId = async (discordId) => {
  const result = await pool.query(
    'SELECT * FROM users WHERE discord_id = $1',
    [discordId]
  );
  return result.rows[0];
};

export const getUserById = async (id) => {
  const result = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
  return result.rows[0];
};

// Invalidate every outstanding token for a user (logout / "sign out everywhere").
export const bumpTokenVersion = async (id) => {
  const result = await pool.query(
    `UPDATE users SET token_version = token_version + 1, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 RETURNING token_version`,
    [id]
  );
  return result.rows[0];
};

export const getGuildUsers = async (guildId) => {
  const result = await pool.query(
    `SELECT DISTINCT u.id, u.username, u.discord_id, u.avatar, COUNT(r.id)::integer as rating_count
     FROM users u
     JOIN ratings r ON u.id = r.user_id
     JOIN movie_nights mn ON r.movie_night_id = mn.id
     WHERE mn.guild_id = $1
     GROUP BY u.id
     ORDER BY rating_count DESC`,
    [guildId]
  );
  return result.rows;
};
