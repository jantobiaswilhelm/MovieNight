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

export const getMovieNights = async (guildId, limit = 10) => {
  const result = await pool.query(
    `SELECT mn.*, u.username as announced_by_name,
            COALESCE(AVG(r.score), 0) as avg_rating,
            COUNT(r.id) as rating_count
     FROM movie_nights mn
     LEFT JOIN users u ON mn.announced_by = u.id
     LEFT JOIN ratings r ON mn.id = r.movie_night_id
     WHERE mn.guild_id = $1
     GROUP BY mn.id, u.username
     ORDER BY mn.scheduled_at DESC
     LIMIT $2`,
    [guildId, limit]
  );
  return result.rows;
};

export const getMovieNightById = async (id) => {
  const result = await pool.query(
    `SELECT mn.*, u.username as announced_by_name
     FROM movie_nights mn
     LEFT JOIN users u ON mn.announced_by = u.id
     WHERE mn.id = $1`,
    [id]
  );
  return result.rows[0];
};

export const getRecentMovieNightsForRating = async (guildId, limit = 10) => {
  const result = await pool.query(
    `SELECT mn.id, mn.title, mn.scheduled_at
     FROM movie_nights mn
     WHERE mn.guild_id = $1 AND mn.started_at IS NOT NULL
     ORDER BY mn.started_at DESC
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
    `SELECT r.*, u.username, u.discord_id
     FROM ratings r
     JOIN users u ON r.user_id = u.id
     WHERE r.movie_night_id = $1
     ORDER BY r.created_at DESC`,
    [movieNightId]
  );
  return result.rows;
};

export const getUserRatings = async (discordId, limit = 10) => {
  const result = await pool.query(
    `SELECT r.*, mn.title, mn.scheduled_at
     FROM ratings r
     JOIN users u ON r.user_id = u.id
     JOIN movie_nights mn ON r.movie_night_id = mn.id
     WHERE u.discord_id = $1
     ORDER BY mn.scheduled_at DESC
     LIMIT $2`,
    [discordId, limit]
  );
  return result.rows;
};

export const getUserRating = async (movieNightId, discordId) => {
  const result = await pool.query(
    `SELECT r.* FROM ratings r
     JOIN users u ON r.user_id = u.id
     WHERE r.movie_night_id = $1 AND u.discord_id = $2`,
    [movieNightId, discordId]
  );
  return result.rows[0];
};

// Stats operations
export const getGuildStats = async (guildId) => {
  const result = await pool.query(
    `SELECT
       COUNT(DISTINCT mn.id) as total_movies,
       COUNT(DISTINCT r.user_id) as total_raters,
       COALESCE(ROUND(AVG(r.score)::numeric, 1), 0) as overall_avg_rating,
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
    `SELECT mn.id, mn.title, mn.scheduled_at,
            ROUND(AVG(r.score)::numeric, 1) as avg_rating,
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

export const getMostActiveRaters = async (guildId, limit = 5) => {
  const result = await pool.query(
    `SELECT u.discord_id, u.username,
            COUNT(r.id) as rating_count,
            ROUND(AVG(r.score)::numeric, 1) as avg_rating
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
    `SELECT ms.*, u.username as suggested_by_name,
            COUNT(v.id) as vote_count
     FROM movie_suggestions ms
     LEFT JOIN users u ON ms.suggested_by = u.id
     LEFT JOIN votes v ON ms.id = v.suggestion_id
     WHERE ms.voting_session_id = $1
     GROUP BY ms.id, u.username
     ORDER BY vote_count DESC, ms.created_at ASC`,
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

// Vote operations
export const castVote = async (suggestionId, userId) => {
  // First, get the voting session for this suggestion to remove any existing vote
  const suggestionResult = await pool.query(
    'SELECT voting_session_id FROM movie_suggestions WHERE id = $1',
    [suggestionId]
  );

  if (suggestionResult.rows.length > 0) {
    const sessionId = suggestionResult.rows[0].voting_session_id;

    // Remove any existing vote for this user in this session
    await pool.query(
      `DELETE FROM votes v
       USING movie_suggestions ms
       WHERE v.suggestion_id = ms.id
       AND ms.voting_session_id = $1
       AND v.user_id = $2`,
      [sessionId, userId]
    );
  }

  // Now insert the new vote
  const result = await pool.query(
    `INSERT INTO votes (suggestion_id, user_id)
     VALUES ($1, $2)
     ON CONFLICT (suggestion_id, user_id) DO NOTHING
     RETURNING *`,
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

export const removeVoteByDiscordId = async (votingSessionId, discordId) => {
  const result = await pool.query(
    `DELETE FROM votes v
     USING movie_suggestions ms, users u
     WHERE v.suggestion_id = ms.id
     AND v.user_id = u.id
     AND ms.voting_session_id = $1
     AND u.discord_id = $2
     RETURNING v.*`,
    [votingSessionId, discordId]
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

export const getUpcomingMovies = async (guildId) => {
  const result = await pool.query(
    `SELECT id, title, scheduled_at FROM movie_nights
     WHERE guild_id = $1 AND started_at IS NULL
     ORDER BY scheduled_at ASC`,
    [guildId]
  );
  return result.rows;
};
