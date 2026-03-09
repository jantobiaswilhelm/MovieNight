import pool from '../config/database.js';

// User operations
export const findOrCreateUser = async (discordId, username, avatar, discordAccessToken = null) => {
  const query = discordAccessToken
    ? `INSERT INTO users (discord_id, username, avatar, discord_access_token)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (discord_id)
       DO UPDATE SET username = $2, avatar = $3, discord_access_token = $4, updated_at = CURRENT_TIMESTAMP
       RETURNING *`
    : `INSERT INTO users (discord_id, username, avatar)
       VALUES ($1, $2, $3)
       ON CONFLICT (discord_id)
       DO UPDATE SET username = $2, avatar = $3, updated_at = CURRENT_TIMESTAMP
       RETURNING *`;
  const params = discordAccessToken
    ? [discordId, username, avatar, discordAccessToken]
    : [discordId, username, avatar];
  const result = await pool.query(query, params);
  return result.rows[0];
};

export const getUserByDiscordId = async (discordId) => {
  const result = await pool.query(
    'SELECT * FROM users WHERE discord_id = $1',
    [discordId]
  );
  return result.rows[0];
};

export const getUserById = async (id) => {
  const result = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
  return result.rows[0];
};

// Movie night operations
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

// Rating operations
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
    `SELECT r.*, u.username, u.discord_id, u.avatar
     FROM ratings r
     JOIN users u ON r.user_id = u.id
     WHERE r.movie_night_id = $1
     ORDER BY r.created_at DESC`,
    [movieNightId]
  );
  return result.rows;
};

export const getUserRatings = async (userId, limit = 20) => {
  const result = await pool.query(
    `SELECT r.id, r.movie_night_id, r.user_id, r.score, r.comment, r.created_at, r.updated_at,
            mn.title, mn.scheduled_at, mn.image_url
     FROM ratings r
     JOIN movie_nights mn ON r.movie_night_id = mn.id
     WHERE r.user_id = $1
     ORDER BY mn.scheduled_at DESC
     LIMIT $2`,
    [userId, limit]
  );
  return result.rows;
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

export const getUserRating = async (movieNightId, userId) => {
  const result = await pool.query(
    'SELECT * FROM ratings WHERE movie_night_id = $1 AND user_id = $2',
    [movieNightId, userId]
  );
  return result.rows[0];
};

// Stats operations
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

// Voting operations
export const createVotingSession = async (guildId, channelId, messageId, scheduledAt, createdBy) => {
  const result = await pool.query(
    `INSERT INTO voting_sessions (guild_id, channel_id, message_id, scheduled_at, created_by, status)
     VALUES ($1, $2, $3, $4, $5, 'open')
     RETURNING *`,
    [guildId, channelId, messageId, scheduledAt, createdBy]
  );
  return result.rows[0];
};

export const getActiveVotingSession = async (guildId) => {
  const result = await pool.query(
    `SELECT vs.*, u.username as created_by_name
     FROM voting_sessions vs
     LEFT JOIN users u ON vs.created_by = u.id
     WHERE vs.guild_id = $1 AND vs.status = 'open'
     ORDER BY vs.created_at DESC
     LIMIT 1`,
    [guildId]
  );
  return result.rows[0];
};

export const getVotingSessionById = async (id) => {
  const result = await pool.query(
    `SELECT vs.*, u.username as created_by_name
     FROM voting_sessions vs
     LEFT JOIN users u ON vs.created_by = u.id
     WHERE vs.id = $1`,
    [id]
  );
  return result.rows[0];
};

export const closeVotingSession = async (id, winnerId) => {
  const result = await pool.query(
    `UPDATE voting_sessions
     SET status = 'closed', winner_id = $2, closed_at = CURRENT_TIMESTAMP
     WHERE id = $1
     RETURNING *`,
    [id, winnerId]
  );
  return result.rows[0];
};

export const updateVotingSessionSchedule = async (id, scheduledAt) => {
  const result = await pool.query(
    `UPDATE voting_sessions SET scheduled_at = $2 WHERE id = $1 RETURNING *`,
    [id, scheduledAt]
  );
  return result.rows[0];
};

// Suggestion operations
export const createSuggestion = async (votingSessionId, title, imageUrl, suggestedBy, tmdbData = {}) => {
  const { description, tmdbId, tmdbRating, genres, runtime, releaseYear, backdropUrl, tagline, imdbId, originalLanguage, collectionName, trailerUrl } = tmdbData;
  const result = await pool.query(
    `INSERT INTO movie_suggestions (voting_session_id, title, image_url, suggested_by, description, tmdb_id, tmdb_rating, genres, runtime, release_year, backdrop_url, tagline, imdb_id, original_language, collection_name, trailer_url)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
     RETURNING *`,
    [votingSessionId, title, imageUrl, suggestedBy, description || null, tmdbId || null, tmdbRating || null, genres || null, runtime || null, releaseYear || null, backdropUrl || null, tagline || null, imdbId || null, originalLanguage || null, collectionName || null, trailerUrl || null]
  );
  return result.rows[0];
};

export const getSuggestionsForSession = async (votingSessionId) => {
  const result = await pool.query(
    `SELECT ms.*, u.username as suggested_by_name, u.discord_id as suggested_by_discord_id,
            COUNT(v.id) as vote_count
     FROM movie_suggestions ms
     LEFT JOIN users u ON ms.suggested_by = u.id
     LEFT JOIN votes v ON ms.id = v.suggestion_id
     WHERE ms.voting_session_id = $1
     GROUP BY ms.id, u.username, u.discord_id
     ORDER BY vote_count DESC, ms.created_at ASC`,
    [votingSessionId]
  );
  return result.rows;
};

export const getSuggestionById = async (id) => {
  const result = await pool.query(
    `SELECT ms.*, u.username as suggested_by_name
     FROM movie_suggestions ms
     LEFT JOIN users u ON ms.suggested_by = u.id
     WHERE ms.id = $1`,
    [id]
  );
  return result.rows[0];
};

// Vote operations
export const castVote = async (suggestionId, userId) => {
  const result = await pool.query(
    `INSERT INTO votes (suggestion_id, user_id)
     VALUES ($1, $2)
     ON CONFLICT (suggestion_id, user_id) DO NOTHING
     RETURNING *`,
    [suggestionId, userId]
  );
  return result.rows[0];
};

export const removeVote = async (suggestionId, userId) => {
  const result = await pool.query(
    `DELETE FROM votes WHERE suggestion_id = $1 AND user_id = $2 RETURNING *`,
    [suggestionId, userId]
  );
  return result.rows[0];
};

export const getUserVoteForSession = async (votingSessionId, userId) => {
  const result = await pool.query(
    `SELECT v.*, ms.title
     FROM votes v
     JOIN movie_suggestions ms ON v.suggestion_id = ms.id
     WHERE ms.voting_session_id = $1 AND v.user_id = $2`,
    [votingSessionId, userId]
  );
  return result.rows[0];
};

export const getVotersForSession = async (votingSessionId) => {
  const result = await pool.query(
    `SELECT v.suggestion_id, u.discord_id, u.username, u.avatar
     FROM votes v
     JOIN users u ON v.user_id = u.id
     JOIN movie_suggestions ms ON v.suggestion_id = ms.id
     WHERE ms.voting_session_id = $1
     ORDER BY v.created_at ASC`,
    [votingSessionId]
  );
  return result.rows;
};

export const getWinningSuggestion = async (votingSessionId) => {
  const result = await pool.query(
    `SELECT ms.*, u.username as suggested_by_name,
            COUNT(v.id) as vote_count
     FROM movie_suggestions ms
     LEFT JOIN users u ON ms.suggested_by = u.id
     LEFT JOIN votes v ON ms.id = v.suggestion_id
     WHERE ms.voting_session_id = $1
     GROUP BY ms.id, u.username
     ORDER BY vote_count DESC, ms.created_at ASC
     LIMIT 1`,
    [votingSessionId]
  );
  return result.rows[0];
};

// Admin delete operations
export const deleteSuggestion = async (suggestionId) => {
  // First delete all votes for this suggestion
  await pool.query('DELETE FROM votes WHERE suggestion_id = $1', [suggestionId]);
  // Then delete the suggestion
  const result = await pool.query(
    'DELETE FROM movie_suggestions WHERE id = $1 RETURNING *',
    [suggestionId]
  );
  return result.rows[0];
};

export const deleteVotingSession = async (sessionId) => {
  // Delete all votes for suggestions in this session
  await pool.query(
    `DELETE FROM votes WHERE suggestion_id IN
     (SELECT id FROM movie_suggestions WHERE voting_session_id = $1)`,
    [sessionId]
  );
  // Delete all suggestions
  await pool.query('DELETE FROM movie_suggestions WHERE voting_session_id = $1', [sessionId]);
  // Delete the session
  const result = await pool.query(
    'DELETE FROM voting_sessions WHERE id = $1 RETURNING *',
    [sessionId]
  );
  return result.rows[0];
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

// Movie start operations
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

// Wishlist operations
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

export const getUserWishlist = async (userId, guildId, sort = 'importance') => {
  let orderBy = 'w.importance DESC, w.created_at DESC';
  if (sort === 'newest') orderBy = 'w.created_at DESC';
  else if (sort === 'alphabetical') orderBy = 'w.title ASC';

  const result = await pool.query(
    `SELECT w.*, u.username, u.discord_id, u.avatar
     FROM wishlists w
     JOIN users u ON w.user_id = u.id
     WHERE w.user_id = $1 AND w.guild_id = $2
     ORDER BY ${orderBy}`,
    [userId, guildId]
  );
  return result.rows;
};

export const getGuildWishlist = async (guildId, sort = 'importance') => {
  let orderBy = 'w.importance DESC, w.created_at DESC';
  if (sort === 'newest') orderBy = 'w.created_at DESC';
  else if (sort === 'alphabetical') orderBy = 'w.title ASC';

  const result = await pool.query(
    `SELECT w.*, u.username, u.discord_id, u.avatar
     FROM wishlists w
     JOIN users u ON w.user_id = u.id
     WHERE w.guild_id = $1
     ORDER BY ${orderBy}`,
    [guildId]
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

// Pending announcement operations
export const createPendingAnnouncement = async (data) => {
  const result = await pool.query(
    `INSERT INTO pending_announcements (guild_id, channel_id, user_id, wishlist_id, title, image_url, backdrop_url, description, tmdb_id, imdb_id, tmdb_rating, genres, runtime, release_year, trailer_url, scheduled_at, is_test)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
     RETURNING *`,
    [data.guildId, data.channelId, data.userId, data.wishlistId || null, data.title, data.imageUrl, data.backdropUrl, data.description, data.tmdbId, data.imdbId, data.tmdbRating, data.genres, data.runtime, data.releaseYear, data.trailerUrl, data.scheduledAt, data.isTest || false]
  );
  return result.rows[0];
};

// Attendance operations
export const toggleAttendance = async (movieNightId, userId) => {
  // Check if already attending
  const existing = await pool.query(
    'SELECT * FROM movie_attendance WHERE movie_night_id = $1 AND user_id = $2',
    [movieNightId, userId]
  );

  if (existing.rows.length > 0) {
    // Remove attendance
    await pool.query(
      'DELETE FROM movie_attendance WHERE movie_night_id = $1 AND user_id = $2',
      [movieNightId, userId]
    );
    return { attending: false };
  } else {
    // Add attendance
    await pool.query(
      'INSERT INTO movie_attendance (movie_night_id, user_id) VALUES ($1, $2)',
      [movieNightId, userId]
    );
    return { attending: true };
  }
};

export const getAttendees = async (movieNightId) => {
  const result = await pool.query(
    `SELECT u.id, u.discord_id, u.username, u.avatar, ma.created_at
     FROM movie_attendance ma
     JOIN users u ON ma.user_id = u.id
     WHERE ma.movie_night_id = $1
     ORDER BY ma.created_at ASC`,
    [movieNightId]
  );
  return result.rows;
};

export const isUserAttending = async (movieNightId, userId) => {
  const result = await pool.query(
    'SELECT * FROM movie_attendance WHERE movie_night_id = $1 AND user_id = $2',
    [movieNightId, userId]
  );
  return result.rows.length > 0;
};

export const getUpcomingMoviesWithAttendees = async (guildId, limit = 10) => {
  const result = await pool.query(
    `SELECT mn.*, u.username as announced_by_name, u.discord_id as announced_by_discord_id,
            COALESCE(
              json_agg(
                json_build_object('id', att_u.id, 'discord_id', att_u.discord_id, 'username', att_u.username, 'avatar', att_u.avatar)
              ) FILTER (WHERE att_u.id IS NOT NULL),
              '[]'
            ) as attendees
     FROM movie_nights mn
     LEFT JOIN users u ON mn.announced_by = u.id
     LEFT JOIN movie_attendance ma ON mn.id = ma.movie_night_id
     LEFT JOIN users att_u ON ma.user_id = att_u.id
     WHERE mn.guild_id = $1 AND mn.started_at IS NULL AND mn.scheduled_at > CURRENT_TIMESTAMP
       AND (mn.is_test = false OR mn.is_test IS NULL)
     GROUP BY mn.id, u.username, u.discord_id
     ORDER BY mn.scheduled_at ASC
     LIMIT $2`,
    [guildId, limit]
  );
  return result.rows;
};

export const getNextMovieWithAttendees = async (guildId) => {
  const result = await pool.query(
    `SELECT mn.*, u.username as announced_by_name, u.discord_id as announced_by_discord_id,
            COALESCE(
              json_agg(
                json_build_object('id', att_u.id, 'discord_id', att_u.discord_id, 'username', att_u.username, 'avatar', att_u.avatar)
              ) FILTER (WHERE att_u.id IS NOT NULL),
              '[]'
            ) as attendees
     FROM movie_nights mn
     LEFT JOIN users u ON mn.announced_by = u.id
     LEFT JOIN movie_attendance ma ON mn.id = ma.movie_night_id
     LEFT JOIN users att_u ON ma.user_id = att_u.id
     WHERE mn.guild_id = $1 AND mn.started_at IS NULL AND mn.scheduled_at > CURRENT_TIMESTAMP
       AND (mn.is_test = false OR mn.is_test IS NULL)
     GROUP BY mn.id, u.username, u.discord_id
     ORDER BY mn.scheduled_at ASC
     LIMIT 1`,
    [guildId]
  );
  return result.rows[0];
};

// Profile stats operations
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

export const getGuildUsers = async (guildId) => {
  const result = await pool.query(
    `SELECT DISTINCT u.id, u.username, u.discord_id, u.avatar, COUNT(r.id)::integer as rating_count
     FROM users u
     JOIN ratings r ON u.id = r.user_id
     JOIN movie_nights mn ON r.movie_night_id = mn.id
     WHERE mn.guild_id = $1
     GROUP BY u.id
     ORDER BY rating_count DESC`,
    [guildId]
  );
  return result.rows;
};

export const getRandomComments = async (guildId, limit = 10) => {
  const result = await pool.query(
    `SELECT r.comment, r.score, mn.title as movie_title, u.username, u.discord_id, u.avatar
     FROM ratings r
     JOIN movie_nights mn ON r.movie_night_id = mn.id
     JOIN users u ON r.user_id = u.id
     WHERE mn.guild_id = $1 AND r.comment IS NOT NULL AND r.comment != ''
     ORDER BY RANDOM()
     LIMIT $2`,
    [guildId, limit]
  );
  return result.rows;
};

// Personal movies operations
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

export const getUserPersonalMovies = async (userId, sort = 'newest') => {
  let orderBy = 'pm.created_at DESC';
  if (sort === 'oldest') orderBy = 'pm.created_at ASC';
  else if (sort === 'rating') orderBy = 'pm.score DESC NULLS LAST, pm.created_at DESC';
  else if (sort === 'alphabetical') orderBy = 'pm.title ASC';

  const result = await pool.query(
    `SELECT pm.*
     FROM personal_movies pm
     WHERE pm.user_id = $1
     ORDER BY ${orderBy}`,
    [userId]
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

// ============================================
// STREAK OPERATIONS
// ============================================

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

// ============================================
// GUILD RUNTIME STATS
// ============================================

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

// ============================================
// RATING REACTIONS
// ============================================

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

// ============================================
// COLLECTIONS
// ============================================

export const getCollections = async (guildId) => {
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
     ORDER BY movie_count DESC`,
    [guildId]
  );
  return result.rows;
};

export const getCollectionMovies = async (guildId, collectionName) => {
  const result = await pool.query(
    `SELECT mn.*, AVG(r.score) as avg_rating, COUNT(r.id)::integer as rating_count
     FROM movie_nights mn
     LEFT JOIN ratings r ON mn.id = r.movie_night_id
     WHERE mn.guild_id = $1 AND mn.collection_name = $2
       AND (mn.is_test = false OR mn.is_test IS NULL)
     GROUP BY mn.id
     ORDER BY mn.release_year ASC, mn.scheduled_at ASC`,
    [guildId, collectionName]
  );
  return result.rows;
};

// ============================================
// MOVIE CREDITS
// ============================================

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

// ============================================
// CUSTOM LISTS
// ============================================

export const createCustomList = async (userId, guildId, name, description, isPublic = true) => {
  const result = await pool.query(
    `INSERT INTO custom_lists (user_id, guild_id, name, description, is_public)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [userId, guildId, name, description, isPublic]
  );
  return result.rows[0];
};

export const getUserLists = async (userId) => {
  const result = await pool.query(
    `SELECT cl.*, COUNT(cli.id)::integer as item_count
     FROM custom_lists cl
     LEFT JOIN custom_list_items cli ON cl.id = cli.list_id
     WHERE cl.user_id = $1
     GROUP BY cl.id
     ORDER BY cl.updated_at DESC`,
    [userId]
  );
  return result.rows;
};

export const getPublicLists = async (guildId) => {
  const result = await pool.query(
    `SELECT cl.*, u.username, u.discord_id, u.avatar, COUNT(cli.id)::integer as item_count
     FROM custom_lists cl
     JOIN users u ON cl.user_id = u.id
     LEFT JOIN custom_list_items cli ON cl.id = cli.list_id
     WHERE cl.guild_id = $1 AND cl.is_public = true
     GROUP BY cl.id, u.id
     ORDER BY cl.updated_at DESC`,
    [guildId]
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

// ============================================
// ACHIEVEMENTS
// ============================================

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
  const [ratingCount, streak, avgRating, watchtime, hotTakeCount] = await Promise.all([
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
                ) hot`, [userId])
  ]);

  return {
    rating_count: ratingCount.rows[0].count,
    current_streak: streak.rows[0]?.current_streak || 0,
    longest_streak: streak.rows[0]?.longest_streak || 0,
    avg_rating: parseFloat(avgRating.rows[0]?.avg || 0),
    watchtime_minutes: watchtime.rows[0].minutes,
    hot_take_count: hotTakeCount.rows[0].count
  };
};

// ============================================
// NOTIFICATIONS
// ============================================

export const createNotification = async (userId, type, title, message, link = null, data = null) => {
  const result = await pool.query(
    `INSERT INTO notifications (user_id, type, title, message, link, data)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [userId, type, title, message, link, data ? JSON.stringify(data) : null]
  );
  return result.rows[0];
};

export const createBulkNotifications = async (userIds, type, title, message, link = null, data = null) => {
  if (!userIds || userIds.length === 0) return [];

  const values = userIds.map((_, i) => `($${i * 6 + 1}, $${i * 6 + 2}, $${i * 6 + 3}, $${i * 6 + 4}, $${i * 6 + 5}, $${i * 6 + 6})`).join(', ');
  const params = userIds.flatMap(uid => [uid, type, title, message, link, data ? JSON.stringify(data) : null]);

  const result = await pool.query(
    `INSERT INTO notifications (user_id, type, title, message, link, data)
     VALUES ${values}
     RETURNING *`,
    params
  );
  return result.rows;
};

export const getUserNotifications = async (userId, limit = 20, offset = 0) => {
  const result = await pool.query(
    `SELECT * FROM notifications
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  );
  return result.rows;
};

export const getUnreadNotificationCount = async (userId) => {
  const result = await pool.query(
    `SELECT COUNT(*)::integer as count FROM notifications WHERE user_id = $1 AND is_read = false`,
    [userId]
  );
  return result.rows[0].count;
};

export const markNotificationRead = async (notificationId, userId) => {
  const result = await pool.query(
    `UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2 RETURNING *`,
    [notificationId, userId]
  );
  return result.rows[0];
};

export const markAllNotificationsRead = async (userId) => {
  await pool.query(
    `UPDATE notifications SET is_read = true WHERE user_id = $1 AND is_read = false`,
    [userId]
  );
};

// ============================================
// SOCIAL: FOLLOWS
// ============================================

export const followUser = async (followerId, followingId) => {
  if (followerId === followingId) {
    throw new Error('Cannot follow yourself');
  }

  const result = await pool.query(
    `INSERT INTO user_follows (follower_id, following_id)
     VALUES ($1, $2)
     ON CONFLICT (follower_id, following_id) DO NOTHING
     RETURNING *`,
    [followerId, followingId]
  );
  return result.rows[0];
};

export const unfollowUser = async (followerId, followingId) => {
  const result = await pool.query(
    `DELETE FROM user_follows WHERE follower_id = $1 AND following_id = $2 RETURNING *`,
    [followerId, followingId]
  );
  return result.rows[0];
};

export const getFollowers = async (userId) => {
  const result = await pool.query(
    `SELECT u.id, u.username, u.discord_id, u.avatar, uf.created_at as followed_at
     FROM user_follows uf
     JOIN users u ON uf.follower_id = u.id
     WHERE uf.following_id = $1
     ORDER BY uf.created_at DESC`,
    [userId]
  );
  return result.rows;
};

export const getFollowing = async (userId) => {
  const result = await pool.query(
    `SELECT u.id, u.username, u.discord_id, u.avatar, uf.created_at as followed_at
     FROM user_follows uf
     JOIN users u ON uf.following_id = u.id
     WHERE uf.follower_id = $1
     ORDER BY uf.created_at DESC`,
    [userId]
  );
  return result.rows;
};

export const isFollowing = async (followerId, followingId) => {
  const result = await pool.query(
    `SELECT id FROM user_follows WHERE follower_id = $1 AND following_id = $2`,
    [followerId, followingId]
  );
  return result.rows.length > 0;
};

export const getFollowCounts = async (userId) => {
  const result = await pool.query(
    `SELECT
       (SELECT COUNT(*)::integer FROM user_follows WHERE following_id = $1) as followers,
       (SELECT COUNT(*)::integer FROM user_follows WHERE follower_id = $1) as following`,
    [userId]
  );
  return result.rows[0];
};

// ============================================
// SOCIAL: ACTIVITY FEED
// ============================================

export const logActivity = async (userId, guildId, activityType, referenceId = null, data = null) => {
  const result = await pool.query(
    `INSERT INTO activity_feed (user_id, guild_id, activity_type, reference_id, data)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [userId, guildId, activityType, referenceId, data ? JSON.stringify(data) : null]
  );
  return result.rows[0];
};

export const getActivityFeed = async (userId, guildId, limit = 20, offset = 0) => {
  // Get activities from users that this user follows
  const result = await pool.query(
    `SELECT af.*, u.username, u.discord_id, u.avatar
     FROM activity_feed af
     JOIN users u ON af.user_id = u.id
     JOIN user_follows uf ON af.user_id = uf.following_id
     WHERE uf.follower_id = $1 AND af.guild_id = $2
     ORDER BY af.created_at DESC
     LIMIT $3 OFFSET $4`,
    [userId, guildId, limit, offset]
  );
  return result.rows;
};

export const getUserActivity = async (userId, limit = 20) => {
  const result = await pool.query(
    `SELECT af.*, u.username, u.discord_id, u.avatar
     FROM activity_feed af
     JOIN users u ON af.user_id = u.id
     WHERE af.user_id = $1
     ORDER BY af.created_at DESC
     LIMIT $2`,
    [userId, limit]
  );
  return result.rows;
};

// ============================================
// SOCIAL: SHARED WISHLISTS
// ============================================

export const createSharedWishlist = async (ownerId, guildId, name, description, isCollaborative = false) => {
  const result = await pool.query(
    `INSERT INTO shared_wishlists (owner_id, guild_id, name, description, is_collaborative)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [ownerId, guildId, name, description, isCollaborative]
  );
  return result.rows[0];
};

export const getSharedWishlists = async (guildId) => {
  const result = await pool.query(
    `SELECT sw.*, u.username, u.discord_id, u.avatar,
            COUNT(swi.id)::integer as item_count
     FROM shared_wishlists sw
     JOIN users u ON sw.owner_id = u.id
     LEFT JOIN shared_wishlist_items swi ON sw.id = swi.wishlist_id
     WHERE sw.guild_id = $1
     GROUP BY sw.id, u.id
     ORDER BY sw.updated_at DESC`,
    [guildId]
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

// ============================================
// GUILD SETTINGS & CHANNELS (Admin Test Mode)
// ============================================

export const getGuildChannels = async (guildId) => {
  const result = await pool.query(
    `SELECT channel_id, channel_name, position, parent_name
     FROM guild_channels
     WHERE guild_id = $1
     ORDER BY position ASC`,
    [guildId]
  );
  return result.rows;
};

export const getGuildSettings = async (guildId) => {
  const result = await pool.query(
    `SELECT test_mode, test_channel_id FROM guild_settings WHERE guild_id = $1`,
    [guildId]
  );
  return result.rows[0] || { test_mode: false, test_channel_id: null };
};

export const upsertGuildSettings = async (guildId, testMode, testChannelId) => {
  const result = await pool.query(
    `INSERT INTO guild_settings (guild_id, test_mode, test_channel_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (guild_id)
     DO UPDATE SET test_mode = $2, test_channel_id = $3, updated_at = CURRENT_TIMESTAMP
     RETURNING *`,
    [guildId, testMode, testChannelId || null]
  );
  return result.rows[0];
};

export const deleteTestMovies = async (guildId) => {
  // Delete ratings, attendance, and credits for test movies first
  await pool.query(
    `DELETE FROM ratings WHERE movie_night_id IN
     (SELECT id FROM movie_nights WHERE guild_id = $1 AND is_test = true)`,
    [guildId]
  );
  await pool.query(
    `DELETE FROM movie_attendance WHERE movie_night_id IN
     (SELECT id FROM movie_nights WHERE guild_id = $1 AND is_test = true)`,
    [guildId]
  );
  await pool.query(
    `DELETE FROM movie_credits WHERE movie_night_id IN
     (SELECT id FROM movie_nights WHERE guild_id = $1 AND is_test = true)`,
    [guildId]
  );
  const result = await pool.query(
    `DELETE FROM movie_nights WHERE guild_id = $1 AND is_test = true RETURNING id`,
    [guildId]
  );
  return result.rows.length;
};

export const getTestMovieCount = async (guildId) => {
  const result = await pool.query(
    `SELECT COUNT(*)::integer as count FROM movie_nights WHERE guild_id = $1 AND is_test = true`,
    [guildId]
  );
  return result.rows[0].count;
};
