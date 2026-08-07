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

// Archive listing. Screenings of the same film (same tmdb_id) collapse into one
// row: the most recent screening represents the group, ratings are combined
// (latest rating per user wins, so a re-rating on the rewatch replaces the old
// score), and screening_count / screenings expose the repeats. Movies without a
// tmdb_id fall back to their own id as the key, so they never merge with anything.
export const getMovieNights = async (guildId, limit = 20, offset = 0, includeTest = false) => {
  const testFilter = includeTest ? '' : 'AND (mn.is_test = false OR mn.is_test IS NULL)';
  const result = await pool.query(
    `WITH mk AS (
       SELECT mn.*, COALESCE(mn.tmdb_id::text, 'mn-' || mn.id) AS canon_key
       FROM movie_nights mn
       WHERE mn.guild_id = $1 ${testFilter}
     ),
     rep AS (
       SELECT DISTINCT ON (canon_key) canon_key, id AS rep_id
       FROM mk
       ORDER BY canon_key, scheduled_at DESC, id DESC
     ),
     dedup AS (
       SELECT DISTINCT ON (mk.canon_key, r.user_id) mk.canon_key, r.score
       FROM mk
       JOIN ratings r ON r.movie_night_id = mk.id
       ORDER BY mk.canon_key, r.user_id, r.updated_at DESC, r.id DESC
     ),
     agg AS (
       SELECT canon_key, AVG(score) AS avg_rating, COUNT(*) AS rating_count
       FROM dedup GROUP BY canon_key
     ),
     meta AS (
       SELECT canon_key,
              COUNT(*) AS screening_count,
              MIN(scheduled_at) AS first_screening,
              MAX(scheduled_at) AS last_screening,
              json_agg(json_build_object('id', id, 'scheduled_at', scheduled_at)
                       ORDER BY scheduled_at) AS screenings
       FROM mk GROUP BY canon_key
     )
     SELECT mn.*, u.username as announced_by_name, u.discord_id as announced_by_discord_id,
            COALESCE(agg.avg_rating, 0) as avg_rating,
            COALESCE(agg.rating_count, 0) as rating_count,
            meta.screening_count,
            meta.first_screening,
            meta.last_screening,
            meta.screenings
     FROM rep
     JOIN movie_nights mn ON mn.id = rep.rep_id
     LEFT JOIN users u ON mn.announced_by = u.id
     JOIN meta ON meta.canon_key = rep.canon_key
     LEFT JOIN agg ON agg.canon_key = rep.canon_key
     ORDER BY mn.scheduled_at DESC
     LIMIT $2 OFFSET $3`,
    [guildId, limit, offset]
  );
  return result.rows;
};

// All screenings that belong to the same film as the given movie_night, oldest
// first. Used by the detail page to list every date the film was watched.
export const getMovieScreenings = async (movieNightId) => {
  const result = await pool.query(
    `WITH target AS (SELECT id, guild_id, tmdb_id FROM movie_nights WHERE id = $1)
     SELECT mn.id, mn.scheduled_at, mn.started_at
     FROM movie_nights mn, target t
     WHERE mn.guild_id = t.guild_id
       AND ((t.tmdb_id IS NOT NULL AND mn.tmdb_id = t.tmdb_id)
            OR (t.tmdb_id IS NULL AND mn.id = t.id))
     ORDER BY mn.scheduled_at ASC`,
    [movieNightId]
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
  // Deleting the movie_nights row cascades to all child rows: ratings,
  // movie_attendance, movie_credits and movie_night_voice_presence are all
  // declared ON DELETE CASCADE, while voting_sessions / wishlists / marathon
  // items are ON DELETE SET NULL. A single delete is therefore atomic on its
  // own — no explicit transaction or manual child cleanup is needed.
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

// Signal the bot to post a "rescheduled" note in the movie's Discord channel.
// pg_notify (function form) is used so the movie id can be passed as a payload.
export const notifyReschedule = async (movieId) => {
  await pool.query("SELECT pg_notify('movie_reschedule', $1)", [String(movieId)]);
};

// Signal the bot to post a "cancelled" note. The movie row is already gone by
// the time the bot handles this, so the channel + title travel in the payload.
export const notifyCancel = async (channelId, title) => {
  await pool.query("SELECT pg_notify('movie_cancel', $1)", [JSON.stringify({ channelId, title })]);
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
  // Replace the credit set atomically: a mid-loop failure must not leave the
  // movie with the old credits deleted but only some new ones inserted.
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Delete existing credits for this movie
    await client.query('DELETE FROM movie_credits WHERE movie_night_id = $1', [movieNightId]);

    // Insert new credits
    for (const credit of credits) {
      await client.query(
        `INSERT INTO movie_credits (movie_night_id, person_name, person_tmdb_id, role, character_name, credit_order, profile_path)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (movie_night_id, person_tmdb_id, role) DO NOTHING`,
        [movieNightId, credit.name, credit.tmdbId, credit.role, credit.character, credit.order, credit.profilePath]
      );
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

export const getMovieCredits = async (movieNightId) => {
  const result = await pool.query(
    `SELECT * FROM movie_credits WHERE movie_night_id = $1 ORDER BY role, credit_order`,
    [movieNightId]
  );
  return result.rows;
};

// Everything scheduled in [start, end): upcoming one-off movie_nights UNIONed
// with upcoming marathon films not yet posted to Discord. Tagged by kind so the
// UI can show the ember "Marathon" ribbon. No collision logic — pure read.
export const getCalendar = async (guildId, startISO, endISO) => {
  const result = await pool.query(
    `SELECT * FROM (
       SELECT mn.id::text AS id, 'one-off' AS kind, mn.title, mn.scheduled_at,
              mn.image_url, mn.runtime, mn.release_year,
              NULL::int AS marathon_id, NULL::text AS marathon_name,
              NULL::int AS marathon_position, NULL::int AS marathon_total,
              NULL::varchar AS cadence_type
       FROM movie_nights mn
       WHERE mn.guild_id = $1 AND mn.started_at IS NULL
         AND mn.scheduled_at >= $2 AND mn.scheduled_at < $3
         AND (mn.is_test = false OR mn.is_test IS NULL)

       UNION ALL

       SELECT 'mi-' || mi.id::text AS id, 'marathon' AS kind, mi.title, mi.scheduled_at,
              mi.image_url, mi.runtime, mi.release_year,
              m.id AS marathon_id, m.name AS marathon_name,
              mi.position + 1 AS marathon_position,
              (SELECT COUNT(*)::int FROM marathon_items x WHERE x.marathon_id = m.id) AS marathon_total,
              m.cadence_type
       FROM marathon_items mi
       JOIN marathons m ON mi.marathon_id = m.id
       WHERE m.guild_id = $1 AND m.status = 'active'
         AND mi.scheduled_movie_night_id IS NULL
         AND mi.scheduled_at >= $2 AND mi.scheduled_at < $3
     ) cal
     ORDER BY cal.scheduled_at ASC`,
    [guildId, startISO, endISO]
  );
  return result.rows;
};
