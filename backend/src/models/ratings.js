import pool from '../config/database.js';

// Whether the rater watched ≥50% of the movie's runtime in voice.
// Grandfathered nights (voice_tracking_enabled IS NOT TRUE) always return true.
// Open presence rows (left_at NULL) are counted up to CURRENT_TIMESTAMP.
const ATTENDED_SQL = `(
  mn.voice_tracking_enabled IS NOT TRUE
  OR COALESCE((
    SELECT EXTRACT(EPOCH FROM SUM(COALESCE(vp.left_at, CURRENT_TIMESTAMP) - vp.joined_at))
    FROM movie_night_voice_presence vp
    WHERE vp.movie_night_id = mn.id AND vp.user_discord_id = u.discord_id
  ), 0) >= COALESCE(mn.runtime, 120) * 60 * 0.5
)`;

export const upsertRating = async (movieNightId, userId, score, comment = null) => {
  const result = await pool.query(
    `INSERT INTO ratings (movie_night_id, user_id, score, comment)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (movie_night_id, user_id)
     DO UPDATE SET score = $3, comment = $4, updated_at = CURRENT_TIMESTAMP
     RETURNING *`,
    [movieNightId, userId, score, comment]
  );
  return result.rows[0];
};

export const getRatingsForMovie = async (movieNightId) => {
  const result = await pool.query(
    `SELECT r.*, u.username, u.discord_id, u.avatar,
            ${ATTENDED_SQL} AS attended
     FROM ratings r
     JOIN users u ON r.user_id = u.id
     JOIN movie_nights mn ON r.movie_night_id = mn.id
     WHERE r.movie_night_id = $1
     ORDER BY r.created_at DESC`,
    [movieNightId]
  );
  return result.rows;
};

// Combined ratings for a film across every screening (movie_nights sharing the
// same tmdb_id). If the same person rated more than one screening, only their
// latest score is kept; their prior score is returned as previous_score so the
// UI can show "8 — previously rated 6". Films without a tmdb_id resolve to just
// their own screening, so this behaves exactly like getRatingsForMovie for them.
export const getCombinedRatingsForMovie = async (movieNightId) => {
  const result = await pool.query(
    `WITH target AS (SELECT id, guild_id, tmdb_id FROM movie_nights WHERE id = $1),
     sibling AS (
       SELECT mn.id FROM movie_nights mn, target t
       WHERE mn.guild_id = t.guild_id
         AND ((t.tmdb_id IS NOT NULL AND mn.tmdb_id = t.tmdb_id)
              OR (t.tmdb_id IS NULL AND mn.id = t.id))
     ),
     rated AS (
       SELECT r.id, r.movie_night_id, r.user_id, r.score, r.comment,
              r.created_at, r.updated_at,
              u.username, u.discord_id, u.avatar,
              mn.scheduled_at AS screening_date,
              ${ATTENDED_SQL} AS attended,
              ROW_NUMBER() OVER (PARTITION BY r.user_id
                                 ORDER BY r.updated_at DESC, r.id DESC) AS rn,
              LEAD(r.score) OVER (PARTITION BY r.user_id
                                  ORDER BY r.updated_at DESC, r.id DESC) AS previous_score
       FROM ratings r
       JOIN users u ON r.user_id = u.id
       JOIN movie_nights mn ON r.movie_night_id = mn.id
       WHERE r.movie_night_id IN (SELECT id FROM sibling)
     )
     SELECT * FROM rated WHERE rn = 1 ORDER BY created_at DESC`,
    [movieNightId]
  );
  return result.rows;
};

export const getUserRatings = async (userId, limit = 20) => {
  const result = await pool.query(
    `SELECT r.id, r.movie_night_id, r.user_id, r.score, r.comment, r.created_at, r.updated_at,
            mn.title, mn.scheduled_at, mn.image_url,
            ${ATTENDED_SQL} AS attended
     FROM ratings r
     JOIN users u ON r.user_id = u.id
     JOIN movie_nights mn ON r.movie_night_id = mn.id
     WHERE r.user_id = $1
     ORDER BY mn.scheduled_at DESC
     LIMIT $2`,
    [userId, limit]
  );
  return result.rows;
};

export const getUserRating = async (movieNightId, userId) => {
  const result = await pool.query(
    'SELECT * FROM ratings WHERE movie_night_id = $1 AND user_id = $2',
    [movieNightId, userId]
  );
  return result.rows[0];
};

export const getUserTopRatedMovies = async (userId, limit = 10) => {
  const result = await pool.query(
    `SELECT r.id, r.movie_night_id, r.score, r.comment,
            mn.title, mn.scheduled_at, mn.image_url,
            AVG(r2.score) as community_avg,
            COUNT(r2.id)::integer as rating_count
     FROM ratings r
     JOIN movie_nights mn ON r.movie_night_id = mn.id
     LEFT JOIN ratings r2 ON r2.movie_night_id = mn.id
     WHERE r.user_id = $1
     GROUP BY r.id, mn.id
     HAVING COUNT(r2.id) >= 3
     ORDER BY r.score DESC, mn.scheduled_at DESC
     LIMIT $2`,
    [userId, limit]
  );
  return result.rows;
};

export const getTopRatedMovies = async (guildId, limit = 5) => {
  const result = await pool.query(
    `SELECT mn.id, mn.title, mn.scheduled_at, mn.image_url,
            AVG(r.score) as avg_rating,
            COUNT(r.id) as rating_count
     FROM movie_nights mn
     JOIN ratings r ON mn.id = r.movie_night_id
     WHERE mn.guild_id = $1 AND (mn.is_test = false OR mn.is_test IS NULL)
     GROUP BY mn.id
     HAVING COUNT(r.id) >= 1
     ORDER BY avg_rating DESC
     LIMIT $2`,
    [guildId, limit]
  );
  return result.rows;
};

export const getTopRatedMoviesByPeriod = async (guildId, period, limit = 5, minVotes = 3, specificMonth = null) => {
  let dateFilter = '';
  const params = [guildId, limit, minVotes];
  if (specificMonth) {
    dateFilter = `AND TO_CHAR(mn.scheduled_at, 'YYYY-MM') = $4`;
    params.push(specificMonth);
  } else if (period === 'month') {
    dateFilter = `AND mn.scheduled_at >= DATE_TRUNC('month', CURRENT_DATE)`;
  } else if (period === 'year') {
    dateFilter = `AND mn.scheduled_at >= DATE_TRUNC('year', CURRENT_DATE)`;
  }
  // 'all' = no date filter

  const result = await pool.query(
    `SELECT mn.id, mn.title, mn.scheduled_at, mn.image_url,
            AVG(r.score) as avg_rating,
            COUNT(r.id) as rating_count
     FROM movie_nights mn
     JOIN ratings r ON mn.id = r.movie_night_id
     WHERE mn.guild_id = $1 AND (mn.is_test = false OR mn.is_test IS NULL) ${dateFilter}
     GROUP BY mn.id
     HAVING COUNT(r.id) >= $3
     ORDER BY avg_rating DESC
     LIMIT $2`,
    params
  );
  return result.rows;
};

export const getWorstRatedMoviesByPeriod = async (guildId, period, limit = 5, minVotes = 3, specificMonth = null) => {
  let dateFilter = '';
  const params = [guildId, limit, minVotes];
  if (specificMonth) {
    dateFilter = `AND TO_CHAR(mn.scheduled_at, 'YYYY-MM') = $4`;
    params.push(specificMonth);
  } else if (period === 'month') {
    dateFilter = `AND mn.scheduled_at >= DATE_TRUNC('month', CURRENT_DATE)`;
  } else if (period === 'year') {
    dateFilter = `AND mn.scheduled_at >= DATE_TRUNC('year', CURRENT_DATE)`;
  }
  // 'all' = no date filter

  const result = await pool.query(
    `SELECT mn.id, mn.title, mn.scheduled_at, mn.image_url,
            AVG(r.score) as avg_rating,
            COUNT(r.id) as rating_count
     FROM movie_nights mn
     JOIN ratings r ON mn.id = r.movie_night_id
     WHERE mn.guild_id = $1 AND (mn.is_test = false OR mn.is_test IS NULL) ${dateFilter}
     GROUP BY mn.id
     HAVING COUNT(r.id) >= $3
     ORDER BY avg_rating ASC
     LIMIT $2`,
    params
  );
  return result.rows;
};

export const addReaction = async (ratingId, userId, emoji) => {
  const allowedEmojis = ['thumbsup', 'thumbsdown', 'heart', 'fire', 'laugh', 'thinking'];
  if (!allowedEmojis.includes(emoji)) {
    throw new Error('Invalid emoji');
  }

  const result = await pool.query(
    `INSERT INTO rating_reactions (rating_id, user_id, emoji)
     VALUES ($1, $2, $3)
     ON CONFLICT (rating_id, user_id, emoji) DO NOTHING
     RETURNING *`,
    [ratingId, userId, emoji]
  );
  return result.rows[0];
};

export const removeReaction = async (ratingId, userId, emoji) => {
  const result = await pool.query(
    `DELETE FROM rating_reactions WHERE rating_id = $1 AND user_id = $2 AND emoji = $3 RETURNING *`,
    [ratingId, userId, emoji]
  );
  return result.rows[0];
};

export const getReactionsForRating = async (ratingId) => {
  const result = await pool.query(
    `SELECT emoji, COUNT(*)::integer as count,
            json_agg(json_build_object('user_id', user_id)) as users
     FROM rating_reactions
     WHERE rating_id = $1
     GROUP BY emoji`,
    [ratingId]
  );
  return result.rows;
};

export const getReactionsForRatings = async (ratingIds) => {
  if (!ratingIds || ratingIds.length === 0) return {};

  const result = await pool.query(
    `SELECT rating_id, emoji, COUNT(*)::integer as count,
            json_agg(user_id) as user_ids
     FROM rating_reactions
     WHERE rating_id = ANY($1)
     GROUP BY rating_id, emoji`,
    [ratingIds]
  );

  // Group by rating_id
  const grouped = {};
  for (const row of result.rows) {
    if (!grouped[row.rating_id]) {
      grouped[row.rating_id] = [];
    }
    grouped[row.rating_id].push({
      emoji: row.emoji,
      count: row.count,
      user_ids: row.user_ids
    });
  }
  return grouped;
};
