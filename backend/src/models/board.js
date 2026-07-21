import pool from '../config/database.js';

// Insert a new suggestion. tmdbData carries the TMDB metadata columns.
export const createBoardSuggestion = async (guildId, suggestedBy, title, imageUrl, tmdbData = {}) => {
  const {
    description, tmdbId, tmdbRating, genres, runtime, releaseYear,
    backdropUrl, tagline, imdbId, originalLanguage, collectionName, trailerUrl
  } = tmdbData;
  const result = await pool.query(
    `INSERT INTO board_suggestions
       (guild_id, suggested_by, title, image_url, description, tmdb_id, tmdb_rating,
        genres, runtime, release_year, backdrop_url, tagline, imdb_id,
        original_language, collection_name, trailer_url)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
     RETURNING *`,
    [
      guildId, suggestedBy, title, imageUrl || null, description || null,
      tmdbId || null, tmdbRating ?? null, genres || null, runtime ?? null,
      releaseYear || null, backdropUrl || null, tagline || null, imdbId || null,
      originalLanguage || null, collectionName || null, trailerUrl || null
    ]
  );
  return result.rows[0];
};

// Active board: open suggestions + still-upcoming scheduled ones.
// Past-dated scheduled rows drop off automatically (auto-clear, no cron).
// Includes aggregated upvote_count and, when userId given, user_upvoted.
export const getBoardSuggestions = async (guildId, userId = null) => {
  const result = await pool.query(
    `SELECT bs.*,
            u.username  AS suggested_by_name,
            u.discord_id AS suggested_by_discord_id,
            COUNT(bu.id) AS upvote_count,
            COALESCE(BOOL_OR(bu.user_id = $2), false) AS user_upvoted
     FROM board_suggestions bs
     LEFT JOIN users u ON bs.suggested_by = u.id
     LEFT JOIN board_upvotes bu ON bs.id = bu.suggestion_id
     WHERE bs.guild_id = $1
       AND (bs.status = 'open' OR (bs.status = 'scheduled' AND bs.scheduled_at >= NOW()))
     GROUP BY bs.id, u.username, u.discord_id
     ORDER BY upvote_count DESC, bs.created_at DESC`,
    [guildId, userId]
  );
  return result.rows;
};

export const getBoardSuggestionById = async (id) => {
  const result = await pool.query(
    `SELECT bs.*, u.username AS suggested_by_name
     FROM board_suggestions bs
     LEFT JOIN users u ON bs.suggested_by = u.id
     WHERE bs.id = $1`,
    [id]
  );
  return result.rows[0];
};

// Dedupe guard: is this TMDB movie already an OPEN suggestion in this guild?
export const findOpenSuggestionByTmdb = async (guildId, tmdbId) => {
  if (!tmdbId) return undefined;
  const result = await pool.query(
    `SELECT * FROM board_suggestions
     WHERE guild_id = $1 AND tmdb_id = $2 AND status = 'open'
     LIMIT 1`,
    [guildId, tmdbId]
  );
  return result.rows[0];
};

export const addUpvote = async (suggestionId, userId) => {
  const result = await pool.query(
    `INSERT INTO board_upvotes (suggestion_id, user_id)
     VALUES ($1, $2)
     ON CONFLICT (suggestion_id, user_id) DO NOTHING
     RETURNING *`,
    [suggestionId, userId]
  );
  return result.rows[0];
};

export const removeUpvote = async (suggestionId, userId) => {
  const result = await pool.query(
    `DELETE FROM board_upvotes WHERE suggestion_id = $1 AND user_id = $2 RETURNING *`,
    [suggestionId, userId]
  );
  return result.rows[0];
};

// Voter avatars per suggestion (parity with the old voter-avatar display).
export const getUpvotersForBoard = async (guildId) => {
  const result = await pool.query(
    `SELECT bu.suggestion_id, u.discord_id, u.username, u.avatar
     FROM board_upvotes bu
     JOIN users u ON bu.user_id = u.id
     JOIN board_suggestions bs ON bu.suggestion_id = bs.id
     WHERE bs.guild_id = $1
     ORDER BY bu.created_at ASC`,
    [guildId]
  );
  return result.rows;
};

export const markSuggestionScheduled = async (id, scheduledAt, movieNightId = null) => {
  const result = await pool.query(
    `UPDATE board_suggestions
     SET status = 'scheduled', scheduled_at = $2, scheduled_movie_night_id = $3
     WHERE id = $1
     RETURNING *`,
    [id, scheduledAt, movieNightId]
  );
  return result.rows[0];
};

export const deleteBoardSuggestion = async (id) => {
  const result = await pool.query(
    `DELETE FROM board_suggestions WHERE id = $1 RETURNING *`,
    [id]
  );
  return result.rows[0];
};
