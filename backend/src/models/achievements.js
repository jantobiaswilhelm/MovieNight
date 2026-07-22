import pool from '../config/database.js';

export const getAllAchievements = async () => {
  const result = await pool.query(
    `SELECT * FROM achievements ORDER BY category, points`
  );
  return result.rows;
};

export const getUserAchievements = async (userId) => {
  const result = await pool.query(
    `SELECT a.*, ua.unlocked_at
     FROM achievements a
     LEFT JOIN user_achievements ua ON a.id = ua.achievement_id AND ua.user_id = $1
     ORDER BY a.category, a.points`,
    [userId]
  );
  return result.rows;
};

export const unlockAchievement = async (userId, achievementCode) => {
  const achievement = await pool.query(
    'SELECT id FROM achievements WHERE code = $1',
    [achievementCode]
  );

  if (achievement.rows.length === 0) return null;

  const result = await pool.query(
    `INSERT INTO user_achievements (user_id, achievement_id)
     VALUES ($1, $2)
     ON CONFLICT (user_id, achievement_id) DO NOTHING
     RETURNING *`,
    [userId, achievement.rows[0].id]
  );

  if (result.rows.length > 0) {
    // Return the full achievement info for newly unlocked
    const full = await pool.query(
      'SELECT * FROM achievements WHERE id = $1',
      [achievement.rows[0].id]
    );
    return full.rows[0];
  }
  return null;
};

export const getAchievementProgress = async (userId, guildId) => {
  // Get various stats for progress calculation
  const [ratingCount, streak, avgRating, watchtime, hotTakeCount, genres, metadata, oracle] = await Promise.all([
    pool.query('SELECT COUNT(*)::integer as count FROM ratings WHERE user_id = $1', [userId]),
    pool.query('SELECT current_streak, longest_streak FROM users WHERE id = $1', [userId]),
    pool.query('SELECT AVG(score) as avg FROM ratings WHERE user_id = $1', [userId]),
    pool.query(`SELECT COALESCE(SUM(mn.runtime), 0)::integer as minutes
                FROM ratings r JOIN movie_nights mn ON r.movie_night_id = mn.id
                WHERE r.user_id = $1`, [userId]),
    pool.query(`SELECT COUNT(*)::integer as count FROM (
                  SELECT r.id FROM ratings r
                  JOIN (SELECT movie_night_id, AVG(score) as avg FROM ratings GROUP BY movie_night_id HAVING COUNT(*) >= 3) ma
                  ON r.movie_night_id = ma.movie_night_id
                  WHERE r.user_id = $1 AND ABS(r.score - ma.avg) >= 3
                ) hot`, [userId]),
    pool.query(`SELECT COUNT(DISTINCT TRIM(g))::integer as count
                FROM ratings r
                JOIN movie_nights mn ON r.movie_night_id = mn.id
                CROSS JOIN LATERAL regexp_split_to_table(COALESCE(mn.genres, ''), ',') AS g
                WHERE r.user_id = $1 AND TRIM(g) <> ''`, [userId]),
    pool.query(`SELECT
                  COUNT(DISTINCT NULLIF(mn.original_language, ''))::integer as language_count,
                  COUNT(DISTINCT FLOOR(mn.release_year / 10.0))::integer as decade_count,
                  MIN(mn.release_year) as oldest_year
                FROM ratings r JOIN movie_nights mn ON r.movie_night_id = mn.id
                WHERE r.user_id = $1`, [userId]),
    pool.query(`SELECT COUNT(*)::integer as count FROM (
                  SELECT r.id FROM ratings r
                  JOIN (SELECT movie_night_id, AVG(score) as avg FROM ratings GROUP BY movie_night_id HAVING COUNT(*) >= 3) ma
                  ON r.movie_night_id = ma.movie_night_id
                  WHERE r.user_id = $1 AND ABS(r.score - ma.avg) <= 0.5
                ) oracle`, [userId])
  ]);

  const oldestYear = metadata.rows[0].oldest_year;

  return {
    rating_count: ratingCount.rows[0].count,
    current_streak: streak.rows[0]?.current_streak || 0,
    longest_streak: streak.rows[0]?.longest_streak || 0,
    avg_rating: parseFloat(avgRating.rows[0]?.avg || 0),
    watchtime_minutes: watchtime.rows[0].minutes,
    hot_take_count: hotTakeCount.rows[0].count,
    genre_count: genres.rows[0].count,
    language_count: metadata.rows[0].language_count,
    decade_count: metadata.rows[0].decade_count,
    oldest_year: oldestYear,
    has_pre_1970: oldestYear != null && oldestYear < 1970,
    oracle_count: oracle.rows[0].count
  };
};
