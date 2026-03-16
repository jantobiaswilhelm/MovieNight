import pool from '../config/database.js';

export const addToWishlist = async (data) => {
  const result = await pool.query(
    `INSERT INTO wishlists (user_id, guild_id, title, image_url, backdrop_url, description, tmdb_id, imdb_id, tmdb_rating, genres, runtime, release_year, trailer_url, importance)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
     ON CONFLICT (user_id, tmdb_id, guild_id)
     DO UPDATE SET importance = $14, updated_at = CURRENT_TIMESTAMP
     RETURNING *`,
    [data.userId, data.guildId, data.title, data.imageUrl, data.backdropUrl, data.description, data.tmdbId, data.imdbId, data.tmdbRating, data.genres, data.runtime, data.releaseYear, data.trailerUrl, data.importance]
  );
  return result.rows[0];
};

export const getUserWishlist = async (userId, guildId, sort = 'importance', limit = 100, offset = 0) => {
  let orderBy = 'w.importance DESC, w.created_at DESC';
  if (sort === 'newest') orderBy = 'w.created_at DESC';
  else if (sort === 'alphabetical') orderBy = 'w.title ASC';

  const result = await pool.query(
    `SELECT w.*, u.username, u.discord_id, u.avatar
     FROM wishlists w
     JOIN users u ON w.user_id = u.id
     WHERE w.user_id = $1 AND w.guild_id = $2
     ORDER BY ${orderBy}
     LIMIT $3 OFFSET $4`,
    [userId, guildId, limit, offset]
  );
  return result.rows;
};

export const getGuildWishlist = async (guildId, sort = 'importance', limit = 100, offset = 0) => {
  let orderBy = 'w.importance DESC, w.created_at DESC';
  if (sort === 'newest') orderBy = 'w.created_at DESC';
  else if (sort === 'alphabetical') orderBy = 'w.title ASC';

  const result = await pool.query(
    `SELECT w.*, u.username, u.discord_id, u.avatar
     FROM wishlists w
     JOIN users u ON w.user_id = u.id
     WHERE w.guild_id = $1
     ORDER BY ${orderBy}
     LIMIT $2 OFFSET $3`,
    [guildId, limit, offset]
  );
  return result.rows;
};

export const updateWishlistImportance = async (id, userId, importance) => {
  const result = await pool.query(
    `UPDATE wishlists
     SET importance = $3, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND user_id = $2
     RETURNING *`,
    [id, userId, importance]
  );
  return result.rows[0];
};

export const removeFromWishlist = async (id, userId) => {
  const result = await pool.query(
    `DELETE FROM wishlists WHERE id = $1 AND user_id = $2 RETURNING *`,
    [id, userId]
  );
  return result.rows[0];
};

export const removeFromWishlistById = async (id) => {
  const result = await pool.query(
    `DELETE FROM wishlists WHERE id = $1 RETURNING *`,
    [id]
  );
  return result.rows[0];
};

export const getWishlistItem = async (userId, tmdbId, guildId) => {
  const result = await pool.query(
    `SELECT * FROM wishlists WHERE user_id = $1 AND tmdb_id = $2 AND guild_id = $3`,
    [userId, tmdbId, guildId]
  );
  return result.rows[0];
};

export const getWishlistById = async (id) => {
  const result = await pool.query(
    `SELECT w.*, u.username, u.discord_id, u.avatar
     FROM wishlists w
     JOIN users u ON w.user_id = u.id
     WHERE w.id = $1`,
    [id]
  );
  return result.rows[0];
};

export const getUserWishlistPreview = async (userId, guildId, limit = 5) => {
  const result = await pool.query(
    `SELECT id, title, image_url, tmdb_rating, importance
     FROM wishlists
     WHERE user_id = $1 AND guild_id = $2
     ORDER BY importance DESC, created_at DESC
     LIMIT $3`,
    [userId, guildId, limit]
  );
  return result.rows;
};

export const createSharedWishlist = async (ownerId, guildId, name, description, isCollaborative = false) => {
  const result = await pool.query(
    `INSERT INTO shared_wishlists (owner_id, guild_id, name, description, is_collaborative)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [ownerId, guildId, name, description, isCollaborative]
  );
  return result.rows[0];
};

export const getSharedWishlists = async (guildId, limit = 100, offset = 0) => {
  const result = await pool.query(
    `SELECT sw.*, u.username, u.discord_id, u.avatar,
            COUNT(swi.id)::integer as item_count
     FROM shared_wishlists sw
     JOIN users u ON sw.owner_id = u.id
     LEFT JOIN shared_wishlist_items swi ON sw.id = swi.wishlist_id
     WHERE sw.guild_id = $1
     GROUP BY sw.id, u.id
     ORDER BY sw.updated_at DESC
     LIMIT $2 OFFSET $3`,
    [guildId, limit, offset]
  );
  return result.rows;
};

export const getSharedWishlistById = async (wishlistId) => {
  const result = await pool.query(
    `SELECT sw.*, u.username, u.discord_id, u.avatar
     FROM shared_wishlists sw
     JOIN users u ON sw.owner_id = u.id
     WHERE sw.id = $1`,
    [wishlistId]
  );
  return result.rows[0];
};

export const getSharedWishlistItems = async (wishlistId) => {
  const result = await pool.query(
    `SELECT swi.*, u.username as added_by_name
     FROM shared_wishlist_items swi
     LEFT JOIN users u ON swi.added_by = u.id
     WHERE swi.wishlist_id = $1
     ORDER BY swi.importance DESC, swi.created_at DESC`,
    [wishlistId]
  );
  return result.rows;
};

export const getSharedWishlistMembers = async (wishlistId) => {
  const result = await pool.query(
    `SELECT swm.*, u.username, u.discord_id, u.avatar
     FROM shared_wishlist_members swm
     JOIN users u ON swm.user_id = u.id
     WHERE swm.wishlist_id = $1`,
    [wishlistId]
  );
  return result.rows;
};

export const addSharedWishlistMember = async (wishlistId, userId, canEdit = false) => {
  const result = await pool.query(
    `INSERT INTO shared_wishlist_members (wishlist_id, user_id, can_edit)
     VALUES ($1, $2, $3)
     ON CONFLICT (wishlist_id, user_id) DO UPDATE SET can_edit = $3
     RETURNING *`,
    [wishlistId, userId, canEdit]
  );
  return result.rows[0];
};

export const removeSharedWishlistMember = async (wishlistId, userId) => {
  const result = await pool.query(
    `DELETE FROM shared_wishlist_members WHERE wishlist_id = $1 AND user_id = $2 RETURNING *`,
    [wishlistId, userId]
  );
  return result.rows[0];
};

export const addSharedWishlistItem = async (wishlistId, addedBy, item) => {
  const result = await pool.query(
    `INSERT INTO shared_wishlist_items (wishlist_id, added_by, tmdb_id, title, image_url, importance)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (wishlist_id, tmdb_id) DO UPDATE SET importance = $6
     RETURNING *`,
    [wishlistId, addedBy, item.tmdbId, item.title, item.imageUrl, item.importance || 3]
  );

  // Update wishlist updated_at
  await pool.query('UPDATE shared_wishlists SET updated_at = CURRENT_TIMESTAMP WHERE id = $1', [wishlistId]);

  return result.rows[0];
};

export const removeSharedWishlistItem = async (wishlistId, itemId) => {
  const result = await pool.query(
    `DELETE FROM shared_wishlist_items WHERE id = $1 AND wishlist_id = $2 RETURNING *`,
    [itemId, wishlistId]
  );
  return result.rows[0];
};

export const canEditSharedWishlist = async (wishlistId, userId) => {
  // Check if user is owner or has edit permission
  const result = await pool.query(
    `SELECT 1 FROM shared_wishlists WHERE id = $1 AND owner_id = $2
     UNION
     SELECT 1 FROM shared_wishlist_members WHERE wishlist_id = $1 AND user_id = $2 AND can_edit = true
     UNION
     SELECT 1 FROM shared_wishlists sw
     JOIN shared_wishlist_members swm ON sw.id = swm.wishlist_id
     WHERE sw.id = $1 AND sw.is_collaborative = true AND swm.user_id = $2`,
    [wishlistId, userId]
  );
  return result.rows.length > 0;
};
