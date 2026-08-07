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

export const getOnThisDay = async (guildId) => {
  const result = await pool.query(
    `SELECT
       mn.id AS movie_night_id,
       mn.title,
       mn.image_url,
       EXTRACT(YEAR FROM mn.scheduled_at)::integer AS watched_year,
       (EXTRACT(YEAR FROM CURRENT_DATE) - EXTRACT(YEAR FROM mn.scheduled_at))::integer AS years_ago,
       COALESCE(AVG(r.score), 0) AS avg_rating,
       COUNT(r.id)::integer AS rating_count
     FROM movie_nights mn
     LEFT JOIN ratings r ON mn.id = r.movie_night_id
     WHERE mn.guild_id = $1
       AND (mn.is_test = false OR mn.is_test IS NULL)
       AND mn.scheduled_at <= NOW()
       AND EXTRACT(MONTH FROM mn.scheduled_at) = EXTRACT(MONTH FROM CURRENT_DATE)
       AND EXTRACT(DAY   FROM mn.scheduled_at) = EXTRACT(DAY   FROM CURRENT_DATE)
       AND EXTRACT(YEAR  FROM mn.scheduled_at) < EXTRACT(YEAR  FROM CURRENT_DATE)
     GROUP BY mn.id, mn.title, mn.image_url, mn.scheduled_at
     ORDER BY avg_rating DESC, mn.scheduled_at DESC
     LIMIT 1`,
    [guildId]
  );
  return result.rows[0] || null;
};

export const getTopHosts = async (guildId, limit = 5) => {
  const result = await pool.query(
    `SELECT u.id, u.username, u.discord_id, u.avatar,
            COUNT(DISTINCT mn.id)::integer AS night_count,
            COALESCE(AVG(r.score), 0) AS avg_pick_rating
     FROM users u
     JOIN movie_nights mn ON mn.announced_by = u.id
     LEFT JOIN ratings r ON r.movie_night_id = mn.id
     WHERE mn.guild_id = $1 AND (mn.is_test = false OR mn.is_test IS NULL)
     GROUP BY u.id
     ORDER BY night_count DESC, u.id
     LIMIT $2`,
    [guildId, limit]
  );
  return result.rows;
};

export const getBestTasteHosts = async (guildId, limit = 5, minHosted = 3) => {
  const result = await pool.query(
    `SELECT u.id, u.username, u.discord_id, u.avatar,
            AVG(r.score) AS avg_rating,
            COUNT(DISTINCT mn.id)::integer AS nights_hosted
     FROM users u
     JOIN movie_nights mn ON mn.announced_by = u.id
     JOIN ratings r ON r.movie_night_id = mn.id
     WHERE mn.guild_id = $1 AND (mn.is_test = false OR mn.is_test IS NULL)
     GROUP BY u.id
     HAVING COUNT(DISTINCT mn.id) >= $3
     ORDER BY avg_rating DESC, nights_hosted DESC, u.id
     LIMIT $2`,
    [guildId, limit, minHosted]
  );
  return result.rows;
};

export const getRaterExtremes = async (guildId, minRatings = 5) => {
  const result = await pool.query(
    `SELECT u.id, u.username, u.discord_id, u.avatar,
            AVG(r.score) AS avg_given,
            COUNT(*)::integer AS rating_count
     FROM users u
     JOIN ratings r ON r.user_id = u.id
     JOIN movie_nights mn ON mn.id = r.movie_night_id
     WHERE mn.guild_id = $1 AND (mn.is_test = false OR mn.is_test IS NULL)
     GROUP BY u.id
     HAVING COUNT(*) >= $2
     ORDER BY avg_given DESC, rating_count DESC, u.id`,
    [guildId, minRatings]
  );
  const rows = result.rows;
  return {
    most_generous: rows.length > 0 ? rows[0] : null,
    harshest: rows.length > 1 ? rows[rows.length - 1] : null
  };
};

export const getMostLoyalAttendees = async (guildId, limit = 5) => {
  const result = await pool.query(
    `SELECT u.id, u.username, u.discord_id, u.avatar,
            COUNT(DISTINCT ma.movie_night_id)::integer AS attended_count
     FROM users u
     JOIN movie_attendance ma ON ma.user_id = u.id
     JOIN movie_nights mn ON mn.id = ma.movie_night_id
     WHERE mn.guild_id = $1 AND (mn.is_test = false OR mn.is_test IS NULL)
     GROUP BY u.id
     ORDER BY attended_count DESC, u.id
     LIMIT $2`,
    [guildId, limit]
  );
  return result.rows;
};

export const getMostDivisiveFilm = async (guildId, minVotes = 3) => {
  const result = await pool.query(
    `SELECT mn.id, mn.title, mn.image_url, mn.backdrop_url,
            AVG(r.score) AS avg,
            MAX(r.score) AS high,
            MIN(r.score) AS low,
            STDDEV_POP(r.score) AS spread,
            COUNT(*)::integer AS rating_count
     FROM movie_nights mn
     JOIN ratings r ON r.movie_night_id = mn.id
     WHERE mn.guild_id = $1 AND (mn.is_test = false OR mn.is_test IS NULL)
     GROUP BY mn.id
     HAVING COUNT(*) >= $2
     ORDER BY spread DESC, rating_count DESC, mn.id`,
    [guildId, minVotes]
  );
  const rows = result.rows;
  return {
    most_divisive: rows.length > 0 ? rows[0] : null,
    most_agreed: rows.length > 1 ? rows[rows.length - 1] : null
  };
};

export const getSignatureGenreAndDecade = async (guildId) => {
  const genreResult = await pool.query(
    `SELECT genre, COUNT(*)::integer AS count
     FROM movie_nights mn
     CROSS JOIN LATERAL unnest(string_to_array(mn.genres, ', ')) AS genre
     WHERE mn.guild_id = $1 AND (mn.is_test = false OR mn.is_test IS NULL)
       AND mn.genres IS NOT NULL AND mn.genres != ''
     GROUP BY genre
     ORDER BY count DESC, genre
     LIMIT 1`,
    [guildId]
  );
  const decadeResult = await pool.query(
    `SELECT (FLOOR(mn.release_year / 10.0) * 10)::integer AS decade,
            COUNT(*)::integer AS count
     FROM movie_nights mn
     WHERE mn.guild_id = $1 AND (mn.is_test = false OR mn.is_test IS NULL)
       AND mn.release_year IS NOT NULL
     GROUP BY decade
     ORDER BY count DESC, decade DESC
     LIMIT 1`,
    [guildId]
  );
  return {
    top_genre: genreResult.rows[0] || null,
    top_decade: decadeResult.rows[0] || null
  };
};

export const getCadence = async (guildId) => {
  const result = await pool.query(
    `SELECT TO_CHAR(scheduled_at, 'YYYY-MM') AS month, COUNT(*)::integer AS count
     FROM movie_nights
     WHERE guild_id = $1 AND scheduled_at IS NOT NULL
       AND (is_test = false OR is_test IS NULL)
     GROUP BY month
     ORDER BY count DESC, month DESC`,
    [guildId]
  );
  const rows = result.rows;
  const totalNights = rows.reduce((sum, r) => sum + r.count, 0);
  const monthCount = rows.length;
  return {
    avg_per_month: monthCount > 0 ? totalNights / monthCount : 0,
    busiest_month: rows.length > 0 ? rows[0].month : null,
    busiest_count: rows.length > 0 ? rows[0].count : 0
  };
};

export const getReigningChampion = async (guildId, minVotes = 3) => {
  const result = await pool.query(
    `SELECT mn.id, mn.title, mn.image_url, mn.backdrop_url, mn.release_year, mn.genres,
            AVG(r.score) AS avg_rating,
            COUNT(r.id)::integer AS rating_count,
            u.username AS host_name
     FROM movie_nights mn
     JOIN ratings r ON r.movie_night_id = mn.id
     LEFT JOIN users u ON mn.announced_by = u.id
     WHERE mn.guild_id = $1 AND (mn.is_test = false OR mn.is_test IS NULL)
     GROUP BY mn.id, u.username
     HAVING COUNT(r.id) >= $2
     ORDER BY avg_rating DESC, rating_count DESC, mn.id
     LIMIT 1`,
    [guildId, minVotes]
  );
  return result.rows[0] || null;
};

export const getClubRatingDistribution = async (guildId) => {
  const result = await pool.query(
    `SELECT gs.score::integer AS score, COALESCE(counts.count, 0)::integer AS count
     FROM generate_series(1, 10, 1) AS gs(score)
     LEFT JOIN (
       SELECT ROUND(r.score)::integer AS bucket, COUNT(*)::integer AS count
       FROM ratings r
       JOIN movie_nights mn ON mn.id = r.movie_night_id
       WHERE mn.guild_id = $1 AND (mn.is_test = false OR mn.is_test IS NULL)
       GROUP BY bucket
     ) counts ON gs.score = counts.bucket
     ORDER BY gs.score`,
    [guildId]
  );
  return result.rows;
};

export const getFilmExtremes = async (guildId) => {
  const one = async (orderCol, dir, notNullCol) => {
    const res = await pool.query(
      `SELECT id, title, image_url, backdrop_url, runtime, release_year
       FROM movie_nights
       WHERE guild_id = $1 AND (is_test = false OR is_test IS NULL)
         AND ${notNullCol} IS NOT NULL
       ORDER BY ${orderCol} ${dir}, id
       LIMIT 1`,
      [guildId]
    );
    return res.rows[0] || null;
  };
  const [longest, shortest, oldest, newest] = await Promise.all([
    one('runtime', 'DESC', 'runtime'),
    one('runtime', 'ASC', 'runtime'),
    one('release_year', 'ASC', 'release_year'),
    one('release_year', 'DESC', 'release_year')
  ]);
  return { longest, shortest, oldest, newest };
};

export const getAttendanceStats = async (guildId) => {
  const bestResult = await pool.query(
    `SELECT mn.id, mn.title, mn.image_url, mn.backdrop_url, COUNT(ma.id)::integer AS attendee_count
     FROM movie_nights mn
     JOIN movie_attendance ma ON ma.movie_night_id = mn.id
     WHERE mn.guild_id = $1 AND (mn.is_test = false OR mn.is_test IS NULL)
     GROUP BY mn.id
     ORDER BY attendee_count DESC, mn.id
     LIMIT 1`,
    [guildId]
  );
  const avgResult = await pool.query(
    `SELECT COALESCE(AVG(cnt), 0) AS avg_attendance
     FROM (
       SELECT COUNT(ma.id)::integer AS cnt
       FROM movie_nights mn
       JOIN movie_attendance ma ON ma.movie_night_id = mn.id
       WHERE mn.guild_id = $1 AND (mn.is_test = false OR mn.is_test IS NULL)
       GROUP BY mn.id
     ) t`,
    [guildId]
  );
  return {
    avg_attendance: Number(avgResult.rows[0].avg_attendance) || 0,
    best: bestResult.rows[0] || null
  };
};
