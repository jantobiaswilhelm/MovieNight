import pool from '../config/database.js';

// User operations
export const findOrCreateUser = async (discordId, username, avatar) => {
  const result = await pool.query(
    `INSERT INTO users (discord_id, username, avatar)
     VALUES ($1, $2, $3)
     ON CONFLICT (discord_id)
     DO UPDATE SET username = $2, avatar = $3, updated_at = CURRENT_TIMESTAMP
     RETURNING *`,
    [discordId, username, avatar]
  );
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

export const getMovieNights = async (guildId, limit = 20, offset = 0) => {
  const result = await pool.query(
    `SELECT mn.*, u.username as announced_by_name, u.discord_id as announced_by_discord_id,
            COALESCE(AVG(r.score), 0) as avg_rating,
            COUNT(r.id) as rating_count
     FROM movie_nights mn
     LEFT JOIN users u ON mn.announced_by = u.id
     LEFT JOIN ratings r ON mn.id = r.movie_night_id
     WHERE mn.guild_id = $1
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
export const upsertRating = async (movieNightId, userId, score) => {
  const result = await pool.query(
    `INSERT INTO ratings (movie_night_id, user_id, score)
     VALUES ($1, $2, $3)
     ON CONFLICT (movie_night_id, user_id)
     DO UPDATE SET score = $3, updated_at = CURRENT_TIMESTAMP
     RETURNING *`,
    [movieNightId, userId, score]
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
    `SELECT r.*, mn.title, mn.scheduled_at, mn.image_url
     FROM ratings r
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
     WHERE mn.guild_id = $1`,
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
     WHERE mn.guild_id = $1
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
  if (specificMonth) {
    // specificMonth format: "2024-01" (year-month)
    dateFilter = `AND TO_CHAR(mn.scheduled_at, 'YYYY-MM') = '${specificMonth}'`;
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
     WHERE mn.guild_id = $1 ${dateFilter}
     GROUP BY mn.id
     HAVING COUNT(r.id) >= $3
     ORDER BY avg_rating DESC
     LIMIT $2`,
    [guildId, limit, minVotes]
  );
  return result.rows;
};

export const getWorstRatedMoviesByPeriod = async (guildId, period, limit = 5, minVotes = 3, specificMonth = null) => {
  let dateFilter = '';
  if (specificMonth) {
    // specificMonth format: "2024-01" (year-month)
    dateFilter = `AND TO_CHAR(mn.scheduled_at, 'YYYY-MM') = '${specificMonth}'`;
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
     WHERE mn.guild_id = $1 ${dateFilter}
     GROUP BY mn.id
     HAVING COUNT(r.id) >= $3
     ORDER BY avg_rating ASC
     LIMIT $2`,
    [guildId, limit, minVotes]
  );
  return result.rows;
};

export const getAvailableMonths = async (guildId) => {
  const result = await pool.query(
    `SELECT DISTINCT TO_CHAR(scheduled_at, 'YYYY-MM') as month
     FROM movie_nights
     WHERE guild_id = $1 AND scheduled_at IS NOT NULL
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
     WHERE mn.guild_id = $1
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
export const createSuggestion = async (votingSessionId, title, imageUrl, suggestedBy) => {
  const result = await pool.query(
    `INSERT INTO movie_suggestions (voting_session_id, title, image_url, suggested_by)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [votingSessionId, title, imageUrl, suggestedBy]
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
