import pool from '../config/database.js';

export const createCustomList = async (userId, guildId, name, description, isPublic = true) => {
  const result = await pool.query(
    `INSERT INTO custom_lists (user_id, guild_id, name, description, is_public)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [userId, guildId, name, description, isPublic]
  );
  return result.rows[0];
};

export const getUserLists = async (userId, limit = 100, offset = 0) => {
  const result = await pool.query(
    `SELECT cl.*, COUNT(cli.id)::integer as item_count
     FROM custom_lists cl
     LEFT JOIN custom_list_items cli ON cl.id = cli.list_id
     WHERE cl.user_id = $1
     GROUP BY cl.id
     ORDER BY cl.updated_at DESC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  );
  return result.rows;
};

export const getPublicLists = async (guildId, limit = 100, offset = 0) => {
  const result = await pool.query(
    `SELECT cl.*, u.username, u.discord_id, u.avatar, COUNT(cli.id)::integer as item_count
     FROM custom_lists cl
     JOIN users u ON cl.user_id = u.id
     LEFT JOIN custom_list_items cli ON cl.id = cli.list_id
     WHERE cl.guild_id = $1 AND cl.is_public = true
     GROUP BY cl.id, u.id
     ORDER BY cl.updated_at DESC
     LIMIT $2 OFFSET $3`,
    [guildId, limit, offset]
  );
  return result.rows;
};

export const getListById = async (listId) => {
  const result = await pool.query(
    `SELECT cl.*, u.username, u.discord_id, u.avatar
     FROM custom_lists cl
     JOIN users u ON cl.user_id = u.id
     WHERE cl.id = $1`,
    [listId]
  );
  return result.rows[0];
};

export const getListItems = async (listId) => {
  const result = await pool.query(
    `SELECT * FROM custom_list_items WHERE list_id = $1 ORDER BY position, created_at`,
    [listId]
  );
  return result.rows;
};

export const updateList = async (listId, userId, data) => {
  const { name, description, isPublic } = data;
  const result = await pool.query(
    `UPDATE custom_lists
     SET name = COALESCE($3, name),
         description = COALESCE($4, description),
         is_public = COALESCE($5, is_public),
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND user_id = $2
     RETURNING *`,
    [listId, userId, name, description, isPublic]
  );
  return result.rows[0];
};

export const deleteList = async (listId, userId) => {
  // Delete items first
  await pool.query('DELETE FROM custom_list_items WHERE list_id = $1', [listId]);
  const result = await pool.query(
    'DELETE FROM custom_lists WHERE id = $1 AND user_id = $2 RETURNING *',
    [listId, userId]
  );
  return result.rows[0];
};

export const addListItem = async (listId, item) => {
  // Get max position
  const posResult = await pool.query(
    'SELECT COALESCE(MAX(position), 0) + 1 as next_pos FROM custom_list_items WHERE list_id = $1',
    [listId]
  );
  const position = posResult.rows[0].next_pos;

  const result = await pool.query(
    `INSERT INTO custom_list_items (list_id, tmdb_id, title, image_url, release_year, position, note)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (list_id, tmdb_id) DO UPDATE SET note = $7
     RETURNING *`,
    [listId, item.tmdbId, item.title, item.imageUrl, item.releaseYear, position, item.note]
  );

  // Update list updated_at
  await pool.query('UPDATE custom_lists SET updated_at = CURRENT_TIMESTAMP WHERE id = $1', [listId]);

  return result.rows[0];
};

export const removeListItem = async (listId, itemId) => {
  const result = await pool.query(
    'DELETE FROM custom_list_items WHERE id = $1 AND list_id = $2 RETURNING *',
    [itemId, listId]
  );
  return result.rows[0];
};

export const getCollections = async (guildId, limit = 100, offset = 0) => {
  const result = await pool.query(
    `SELECT collection_name,
            COUNT(*)::integer as movie_count,
            AVG(r.score) as avg_rating,
            json_agg(DISTINCT mn.image_url) FILTER (WHERE mn.image_url IS NOT NULL) as posters
     FROM movie_nights mn
     LEFT JOIN ratings r ON mn.id = r.movie_night_id
     WHERE mn.guild_id = $1 AND mn.collection_name IS NOT NULL AND mn.collection_name != ''
       AND (mn.is_test = false OR mn.is_test IS NULL)
     GROUP BY mn.collection_name
     ORDER BY movie_count DESC
     LIMIT $2 OFFSET $3`,
    [guildId, limit, offset]
  );
  return result.rows;
};

export const getCollectionMovies = async (guildId, collectionName, limit = 100, offset = 0) => {
  const result = await pool.query(
    `SELECT mn.*, AVG(r.score) as avg_rating, COUNT(r.id)::integer as rating_count
     FROM movie_nights mn
     LEFT JOIN ratings r ON mn.id = r.movie_night_id
     WHERE mn.guild_id = $1 AND mn.collection_name = $2
       AND (mn.is_test = false OR mn.is_test IS NULL)
     GROUP BY mn.id
     ORDER BY mn.release_year ASC, mn.scheduled_at ASC
     LIMIT $3 OFFSET $4`,
    [guildId, collectionName, limit, offset]
  );
  return result.rows;
};
