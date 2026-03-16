import pool from '../config/database.js';

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
