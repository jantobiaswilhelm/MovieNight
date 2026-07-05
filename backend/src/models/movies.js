import pool from '../config/database.js';

export const createMovieNight = async (title, scheduledAt, announcedBy, guildId, channelId, messageId, imageUrl) => {
  const result = await pool.query(
    `INSERT INTO movie_nights (title, scheduled_at, announced_by, guild_id, channel_id, message_id, image_url)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [title, scheduledAt, announcedBy, guildId, channelId, messageId, imageUrl]
  );
  return result.rows[0];
};

export const getMovieNights = async (guildId, limit = 20, offset = 0, includeTest = false) => {
  const testFilter = includeTest ? '' : 'AND (mn.is_test = false OR mn.is_test IS NULL)';
  const result = await pool.query(
    `SELECT mn.*, u.username as announced_by_name, u.discord_id as announced_by_discord_id,
            COALESCE(AVG(r.score), 0) as avg_rating,
            COUNT(r.id) as rating_count
     FROM movie_nights mn
     LEFT JOIN users u ON mn.announced_by = u.id
     LEFT JOIN ratings r ON mn.id = r.movie_night_id
     WHERE mn.guild_id = $1 ${testFilter}
     GROUP BY mn.id, u.username, u.discord_id
     ORDER BY mn.scheduled_at DESC
     LIMIT $2 OFFSET $3`,
    [guildId, limit, offset]
  );
  return result.rows;
};

export const getMovieNightById = async (id) => {
  const result = await pool.query(
    `SELECT mn.*, u.username as announced_by_name, u.discord_id as announced_by_discord_id
     FROM movie_nights mn
     LEFT JOIN users u ON mn.announced_by = u.id
     WHERE mn.id = $1`,
    [id]
  );
  return result.rows[0];
};

export const getMovieNightByMessageId = async (messageId) => {
  const result = await pool.query(
    'SELECT * FROM movie_nights WHERE message_id = $1',
    [messageId]
  );
  return result.rows[0];
};

export const getRecentMovieNightsForRating = async (guildId, limit = 10) => {
  const result = await pool.query(
    `SELECT mn.id, mn.title, mn.scheduled_at
     FROM movie_nights mn
     WHERE mn.guild_id = $1 AND mn.scheduled_at <= CURRENT_TIMESTAMP
     ORDER BY mn.scheduled_at DESC
     LIMIT $2`,
    [guildId, limit]
  );
  return result.rows;
};

export const deleteMovieNight = async (movieId) => {
  // First delete all ratings for this movie
  await pool.query('DELETE FROM ratings WHERE movie_night_id = $1', [movieId]);
  // Then delete the movie
  const result = await pool.query(
    'DELETE FROM movie_nights WHERE id = $1 RETURNING *',
    [movieId]
  );
  return result.rows[0];
};

export const getMoviesToStart = async () => {
  const result = await pool.query(
    `SELECT * FROM movie_nights
     WHERE scheduled_at <= CURRENT_TIMESTAMP
       AND started_at IS NULL
     ORDER BY scheduled_at ASC`
  );
  return result.rows;
};

export const startMovieNight = async (movieId) => {
  const result = await pool.query(
    `UPDATE movie_nights
     SET started_at = CURRENT_TIMESTAMP
     WHERE id = $1
     RETURNING *`,
    [movieId]
  );
  return result.rows[0];
};

export const rescheduleMovieNight = async (movieId, newScheduledAt) => {
  const result = await pool.query(
    `UPDATE movie_nights
     SET scheduled_at = $2
     WHERE id = $1
     RETURNING *`,
    [movieId, newScheduledAt]
  );
  return result.rows[0];
};

export const createPendingAnnouncement = async (data) => {
  const result = await pool.query(
    `INSERT INTO pending_announcements (guild_id, channel_id, user_id, wishlist_id, title, image_url, backdrop_url, description, tmdb_id, imdb_id, tmdb_rating, genres, runtime, release_year, trailer_url, scheduled_at, is_test)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
     RETURNING *`,
    [data.guildId, data.channelId, data.userId, data.wishlistId || null, data.title, data.imageUrl, data.backdropUrl, data.description, data.tmdbId, data.imdbId, data.tmdbRating, data.genres, data.runtime, data.releaseYear, data.trailerUrl, data.scheduledAt, data.isTest || false]
  );

  // Wake the bot's announcement listener so it posts immediately. Non-fatal:
  // if this fails, the bot's polling backstop still picks the row up.
  try {
    await pool.query('NOTIFY movie_announcement');
  } catch (err) {
    console.error('Failed to send movie_announcement NOTIFY:', err.message);
  }

  return result.rows[0];
};

export const saveMovieCredits = async (movieNightId, credits) => {
  // Delete existing credits for this movie
  await pool.query('DELETE FROM movie_credits WHERE movie_night_id = $1', [movieNightId]);

  // Insert new credits
  for (const credit of credits) {
    await pool.query(
      `INSERT INTO movie_credits (movie_night_id, person_name, person_tmdb_id, role, character_name, credit_order, profile_path)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (movie_night_id, person_tmdb_id, role) DO NOTHING`,
      [movieNightId, credit.name, credit.tmdbId, credit.role, credit.character, credit.order, credit.profilePath]
    );
  }
};

export const getMovieCredits = async (movieNightId) => {
  const result = await pool.query(
    `SELECT * FROM movie_credits WHERE movie_night_id = $1 ORDER BY role, credit_order`,
    [movieNightId]
  );
  return result.rows;
};
