import pool from '../config/database.js';

export const findRatingTwin = async (userId, guildId) => {
  const result = await pool.query(
    `WITH user_ratings AS (
       SELECT movie_night_id, score
       FROM ratings
       WHERE user_id = $1
     ),
     other_users AS (
       SELECT DISTINCT r.user_id
       FROM ratings r
       JOIN movie_nights mn ON r.movie_night_id = mn.id
       WHERE mn.guild_id = $2 AND r.user_id != $1
     ),
     correlations AS (
       SELECT
         ou.user_id,
         CORR(ur.score, r.score) as correlation,
         COUNT(*) as shared_count
       FROM other_users ou
       JOIN ratings r ON r.user_id = ou.user_id
       JOIN user_ratings ur ON ur.movie_night_id = r.movie_night_id
       GROUP BY ou.user_id
       HAVING COUNT(*) >= 5
     )
     SELECT c.user_id, c.correlation, c.shared_count,
            u.username, u.discord_id, u.avatar
     FROM correlations c
     JOIN users u ON u.id = c.user_id
     WHERE c.correlation IS NOT NULL
     ORDER BY c.correlation DESC
     LIMIT 1`,
    [userId, guildId]
  );
  return result.rows[0];
};

export const getUserHotTakes = async (userId, limit = 5) => {
  const result = await pool.query(
    `SELECT
       mn.id as movie_night_id,
       mn.title,
       mn.image_url,
       r.score as user_score,
       movie_avg.avg_score,
       (r.score - movie_avg.avg_score) as difference,
       ABS(r.score - movie_avg.avg_score) as abs_difference,
       movie_avg.rating_count
     FROM ratings r
     JOIN movie_nights mn ON r.movie_night_id = mn.id
     JOIN (
       SELECT movie_night_id, AVG(score) as avg_score, COUNT(*)::integer as rating_count
       FROM ratings
       GROUP BY movie_night_id
       HAVING COUNT(*) >= 3
     ) movie_avg ON movie_avg.movie_night_id = mn.id
     WHERE r.user_id = $1
     ORDER BY abs_difference DESC
     LIMIT $2`,
    [userId, limit]
  );
  return result.rows;
};

export const getUserFavoriteMovies = async (userId) => {
  const result = await pool.query(
    `SELECT ufm.position, ufm.created_at, ufm.tmdb_id,
            COALESCE(ufm.title, mn.title) as title,
            COALESCE(ufm.image_url, mn.image_url) as image_url,
            COALESCE(ufm.release_year, mn.release_year) as release_year,
            mn.id as movie_night_id
     FROM user_favorite_movies ufm
     LEFT JOIN movie_nights mn ON ufm.movie_night_id = mn.id
     WHERE ufm.user_id = $1
     ORDER BY ufm.position`,
    [userId]
  );
  return result.rows;
};

export const setUserFavoriteMovie = async (userId, position, movieData) => {
  // movieData can have: movieNightId (for watched movies) or tmdbId, title, imageUrl, releaseYear (for any movie)
  const { movieNightId, tmdbId, title, imageUrl, releaseYear } = movieData;

  // Delete any existing entry at this position
  await pool.query(
    `DELETE FROM user_favorite_movies WHERE user_id = $1 AND position = $2`,
    [userId, position]
  );

  // Insert new favorite
  const result = await pool.query(
    `INSERT INTO user_favorite_movies (user_id, position, movie_night_id, tmdb_id, title, image_url, release_year)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [userId, position, movieNightId || null, tmdbId || null, title || null, imageUrl || null, releaseYear || null]
  );
  return result.rows[0];
};

export const removeUserFavoriteMovie = async (userId, position) => {
  const result = await pool.query(
    `DELETE FROM user_favorite_movies WHERE user_id = $1 AND position = $2 RETURNING *`,
    [userId, position]
  );
  return result.rows[0];
};

export const getUserRatedMoviesForFavorites = async (userId) => {
  const result = await pool.query(
    `SELECT mn.id as movie_night_id, mn.title, mn.image_url, mn.release_year, r.score
     FROM ratings r
     JOIN movie_nights mn ON r.movie_night_id = mn.id
     WHERE r.user_id = $1
     ORDER BY r.score DESC, mn.title ASC`,
    [userId]
  );
  return result.rows;
};

export const getUserFavoriteDirectors = async (userId, limit = 5) => {
  const result = await pool.query(
    `SELECT mc.person_name, mc.person_tmdb_id, mc.profile_path,
            COUNT(DISTINCT mn.id)::integer as movie_count,
            AVG(r.score) as avg_rating
     FROM movie_credits mc
     JOIN movie_nights mn ON mc.movie_night_id = mn.id
     JOIN ratings r ON mn.id = r.movie_night_id AND r.user_id = $1
     WHERE mc.role = 'director'
     GROUP BY mc.person_name, mc.person_tmdb_id, mc.profile_path
     HAVING COUNT(DISTINCT mn.id) >= 2
     ORDER BY avg_rating DESC, movie_count DESC
     LIMIT $2`,
    [userId, limit]
  );
  return result.rows;
};

export const getUserFavoriteActors = async (userId, limit = 5) => {
  const result = await pool.query(
    `SELECT mc.person_name, mc.person_tmdb_id, mc.profile_path,
            COUNT(DISTINCT mn.id)::integer as movie_count,
            AVG(r.score) as avg_rating
     FROM movie_credits mc
     JOIN movie_nights mn ON mc.movie_night_id = mn.id
     JOIN ratings r ON mn.id = r.movie_night_id AND r.user_id = $1
     WHERE mc.role = 'actor'
     GROUP BY mc.person_name, mc.person_tmdb_id, mc.profile_path
     HAVING COUNT(DISTINCT mn.id) >= 2
     ORDER BY avg_rating DESC, movie_count DESC
     LIMIT $2`,
    [userId, limit]
  );
  return result.rows;
};

export const addPersonalMovie = async (userId, movieData) => {
  const { tmdbId, title, imageUrl, releaseYear, runtime, genres, score, comment, watchedAt } = movieData;
  const result = await pool.query(
    `INSERT INTO personal_movies (user_id, tmdb_id, title, image_url, release_year, runtime, genres, score, comment, watched_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (user_id, tmdb_id)
     DO UPDATE SET score = COALESCE($8, personal_movies.score),
                   comment = COALESCE($9, personal_movies.comment),
                   watched_at = COALESCE($10, personal_movies.watched_at),
                   updated_at = CURRENT_TIMESTAMP
     RETURNING *`,
    [userId, tmdbId, title, imageUrl, releaseYear, runtime, genres, score, comment, watchedAt]
  );
  return result.rows[0];
};

export const getUserPersonalMovies = async (userId, sort = 'newest', limit = 100, offset = 0) => {
  let orderBy = 'pm.created_at DESC';
  if (sort === 'oldest') orderBy = 'pm.created_at ASC';
  else if (sort === 'rating') orderBy = 'pm.score DESC NULLS LAST, pm.created_at DESC';
  else if (sort === 'alphabetical') orderBy = 'pm.title ASC';

  const result = await pool.query(
    `SELECT pm.*
     FROM personal_movies pm
     WHERE pm.user_id = $1
     ORDER BY ${orderBy}
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  );
  return result.rows;
};

export const updatePersonalMovie = async (id, userId, data) => {
  const { score, comment, watchedAt } = data;
  const result = await pool.query(
    `UPDATE personal_movies
     SET score = COALESCE($3, score),
         comment = COALESCE($4, comment),
         watched_at = COALESCE($5, watched_at),
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND user_id = $2
     RETURNING *`,
    [id, userId, score, comment, watchedAt]
  );
  return result.rows[0];
};

export const deletePersonalMovie = async (id, userId) => {
  const result = await pool.query(
    `DELETE FROM personal_movies WHERE id = $1 AND user_id = $2 RETURNING *`,
    [id, userId]
  );
  return result.rows[0];
};
