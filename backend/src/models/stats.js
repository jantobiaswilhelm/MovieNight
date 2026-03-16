import pool from '../config/database.js';

export const getGuildStats = async (guildId) => {
  const result = await pool.query(
    `SELECT
       COUNT(DISTINCT mn.id) as total_movies,
       COUNT(DISTINCT r.user_id) as total_raters,
       COALESCE(AVG(r.score), 0) as overall_avg_rating,
       COUNT(r.id) as total_ratings
     FROM movie_nights mn
     LEFT JOIN ratings r ON mn.id = r.movie_night_id
     WHERE mn.guild_id = $1 AND (mn.is_test = false OR mn.is_test IS NULL)`,
    [guildId]
  );
  return result.rows[0];
};

export const getUserStats = async (userId) => {
  const result = await pool.query(
    `SELECT
       COUNT(r.id) as total_ratings,
       COALESCE(AVG(r.score), 0) as avg_rating_given,
       MIN(r.score) as lowest_rating,
       MAX(r.score) as highest_rating
     FROM ratings r
     WHERE r.user_id = $1`,
    [userId]
  );
  return result.rows[0];
};

export const getAvailableMonths = async (guildId) => {
  const result = await pool.query(
    `SELECT DISTINCT TO_CHAR(scheduled_at, 'YYYY-MM') as month
     FROM movie_nights
     WHERE guild_id = $1 AND scheduled_at IS NOT NULL AND (is_test = false OR is_test IS NULL)
     ORDER BY month DESC`,
    [guildId]
  );
  return result.rows.map(r => r.month);
};

export const getMostActiveRaters = async (guildId, limit = 5) => {
  const result = await pool.query(
    `SELECT u.id, u.username, u.discord_id, u.avatar,
            COUNT(r.id) as rating_count,
            AVG(r.score) as avg_rating
     FROM users u
     JOIN ratings r ON u.id = r.user_id
     JOIN movie_nights mn ON r.movie_night_id = mn.id
     WHERE mn.guild_id = $1 AND (mn.is_test = false OR mn.is_test IS NULL)
     GROUP BY u.id
     ORDER BY rating_count DESC
     LIMIT $2`,
    [guildId, limit]
  );
  return result.rows;
};

export const getUserRatingHistogram = async (userId) => {
  const result = await pool.query(
    `SELECT gs.score, COALESCE(counts.count, 0)::integer as count
     FROM generate_series(1.0, 10.0, 0.5) as gs(score)
     LEFT JOIN (
       SELECT score, COUNT(*)::integer as count
       FROM ratings
       WHERE user_id = $1
       GROUP BY score
     ) counts ON gs.score = counts.score
     ORDER BY gs.score`,
    [userId]
  );
  return result.rows;
};

export const getUserVsGuildAverage = async (userId, guildId) => {
  const result = await pool.query(
    `SELECT
       (SELECT COALESCE(AVG(score), 0) FROM ratings WHERE user_id = $1) as user_avg,
       (SELECT COALESCE(AVG(r.score), 0)
        FROM ratings r
        JOIN movie_nights mn ON r.movie_night_id = mn.id
        WHERE mn.guild_id = $2) as guild_avg`,
    [userId, guildId]
  );
  return result.rows[0];
};

export const getUserGenreStats = async (userId) => {
  const result = await pool.query(
    `SELECT
       genre,
       COUNT(*)::integer as count,
       AVG(r.score) as avg_rating
     FROM ratings r
     JOIN movie_nights mn ON r.movie_night_id = mn.id
     CROSS JOIN LATERAL unnest(string_to_array(mn.genres, ', ')) as genre
     WHERE r.user_id = $1 AND mn.genres IS NOT NULL AND mn.genres != ''
     GROUP BY genre
     ORDER BY avg_rating DESC`,
    [userId]
  );
  return result.rows;
};

export const getUserTotalWatchtime = async (userId) => {
  const result = await pool.query(
    `SELECT COALESCE(SUM(mn.runtime), 0)::integer as total_minutes
     FROM ratings r
     JOIN movie_nights mn ON r.movie_night_id = mn.id
     WHERE r.user_id = $1 AND mn.runtime IS NOT NULL`,
    [userId]
  );
  return result.rows[0];
};

export const getGuildTotalRuntime = async (guildId) => {
  const result = await pool.query(
    `SELECT COALESCE(SUM(runtime), 0)::integer as total_minutes
     FROM movie_nights
     WHERE guild_id = $1 AND started_at IS NOT NULL AND runtime IS NOT NULL
       AND (is_test = false OR is_test IS NULL)`,
    [guildId]
  );
  return result.rows[0];
};

export const updateUserStreak = async (userId, movieNightId, guildId) => {
  // Get the previous movie night that the user should have rated
  const prevMovieResult = await pool.query(
    `SELECT mn.id
     FROM movie_nights mn
     WHERE mn.guild_id = $1
       AND mn.started_at IS NOT NULL
       AND mn.scheduled_at < (SELECT scheduled_at FROM movie_nights WHERE id = $2)
     ORDER BY mn.scheduled_at DESC
     LIMIT 1`,
    [guildId, movieNightId]
  );

  // Get user's current streak info
  const userResult = await pool.query(
    `SELECT current_streak, longest_streak, last_rated_movie_night_id FROM users WHERE id = $1`,
    [userId]
  );
  const user = userResult.rows[0];

  let newStreak = 1;

  if (prevMovieResult.rows.length > 0) {
    const prevMovieId = prevMovieResult.rows[0].id;

    // Check if user rated the previous movie
    const prevRatingResult = await pool.query(
      `SELECT id FROM ratings WHERE movie_night_id = $1 AND user_id = $2`,
      [prevMovieId, userId]
    );

    if (prevRatingResult.rows.length > 0 && user.last_rated_movie_night_id === prevMovieId) {
      // User rated the previous movie, increment streak
      newStreak = (user.current_streak || 0) + 1;
    }
  }

  const newLongestStreak = Math.max(newStreak, user.longest_streak || 0);

  // Update user's streak
  await pool.query(
    `UPDATE users
     SET current_streak = $2, longest_streak = $3, last_rated_movie_night_id = $4
     WHERE id = $1`,
    [userId, newStreak, newLongestStreak, movieNightId]
  );

  return { current_streak: newStreak, longest_streak: newLongestStreak };
};

export const getUserStreak = async (userId) => {
  const result = await pool.query(
    `SELECT current_streak, longest_streak FROM users WHERE id = $1`,
    [userId]
  );
  return result.rows[0] || { current_streak: 0, longest_streak: 0 };
};

export const getStreakLeaderboard = async (guildId, limit = 10) => {
  const result = await pool.query(
    `SELECT DISTINCT u.id, u.username, u.discord_id, u.avatar, u.current_streak, u.longest_streak
     FROM users u
     JOIN ratings r ON u.id = r.user_id
     JOIN movie_nights mn ON r.movie_night_id = mn.id
     WHERE mn.guild_id = $1 AND u.longest_streak > 0
     ORDER BY u.longest_streak DESC, u.current_streak DESC
     LIMIT $2`,
    [guildId, limit]
  );
  return result.rows;
};
