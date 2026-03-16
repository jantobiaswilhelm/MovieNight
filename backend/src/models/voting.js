import pool from '../config/database.js';

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
