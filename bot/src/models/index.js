import pool from '../config/database.js';

// User operations
// PARALLEL to backend/src/models/users.js (findOrCreateUser) — intentionally differs: backend has a 4th discordAccessToken param for web OAuth
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

// SHARED: keep identical with backend/src/models/users.js (getUserByDiscordId)
export const getUserByDiscordId = async (discordId) => {
  const result = await pool.query(
    'SELECT * FROM users WHERE discord_id = $1',
    [discordId]
  );
  return result.rows[0];
};

// Movie night operations
// PARALLEL to backend/src/models/movies.js (createMovieNight) — intentionally differs: bot signature carries imageUrl/tmdbData/isTest; backend inserts base columns only
export const createMovieNight = async (title, scheduledAt, announcedBy, guildId, channelId, messageId, imageUrl, tmdbData = {}, isTest = false) => {
  const { description, tmdbId, tmdbRating, genres, runtime, releaseYear, backdropUrl, tagline, imdbId, originalLanguage, collectionName, trailerUrl } = tmdbData;
  const result = await pool.query(
    `INSERT INTO movie_nights (title, scheduled_at, announced_by, guild_id, channel_id, message_id, image_url, description, tmdb_id, tmdb_rating, genres, runtime, release_year, backdrop_url, tagline, imdb_id, original_language, collection_name, trailer_url, is_test)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
     RETURNING *`,
    [title, scheduledAt, announcedBy, guildId, channelId, messageId, imageUrl, description || null, tmdbId || null, tmdbRating || null, genres || null, runtime || null, releaseYear || null, backdropUrl || null, tagline || null, imdbId || null, originalLanguage || null, collectionName || null, trailerUrl || null, isTest]
  );
  return result.rows[0];
};

// PARALLEL to backend/src/models/movies.js (getMovieNights) — intentionally differs: web collapses re-screenings by tmdb_id + paginates; bot returns flat rows
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

// One page of finished movie nights for /history, newest first.
//
// PARALLEL to backend/src/models/movies.js (getMovieNights) — intentionally
// differs: the web collapses re-screenings by tmdb_id, the bot lists every
// night as it happened.
//
// Differs from getMovieNights above in three ways the flat query can't have:
// it is bounded to nights that are actually behind us (a night the bot never
// started still counts once its date passes — otherwise an outage would erase
// it from history), it drops test nights the way the web does, and it carries
// the total so the caller knows how many pages exist without a second query.
//
// avg_rating is deliberately NULL rather than 0 for an unrated night — zero is
// a score, "nobody rated it" is not.
export const getMovieNightsPaged = async (guildId, limit = 5, offset = 0) => {
  const result = await pool.query(
    `SELECT mn.id, mn.title, mn.release_year, mn.image_url, mn.scheduled_at, mn.runtime,
            ROUND(AVG(r.score), 1) AS avg_rating,
            COUNT(r.id)::int AS rating_count,
            (SELECT COUNT(*) FROM movie_attendance ma
               WHERE ma.movie_night_id = mn.id)::int AS attendee_count,
            COUNT(*) OVER()::int AS total_count
     FROM movie_nights mn
     LEFT JOIN ratings r ON mn.id = r.movie_night_id
     WHERE mn.guild_id = $1
       AND (mn.started_at IS NOT NULL OR mn.scheduled_at < NOW())
       AND (mn.is_test = false OR mn.is_test IS NULL)
     GROUP BY mn.id
     ORDER BY mn.scheduled_at DESC
     LIMIT $2 OFFSET $3`,
    [guildId, limit, offset]
  );
  return result.rows;
};

// Total minutes the guild has spent watching — the sum of every finished night's
// runtime. COALESCE covers nights announced before TMDB metadata existed; 90 is
// the same stand-in the marathon queries use for an unknown runtime.
export const getGuildWatchTime = async (guildId, since = null) => {
  const result = await pool.query(
    `SELECT COALESCE(SUM(COALESCE(mn.runtime, 90)), 0)::int AS minutes
     FROM movie_nights mn
     WHERE mn.guild_id = $1
       AND (mn.started_at IS NOT NULL OR mn.scheduled_at < NOW())
       AND (mn.is_test = false OR mn.is_test IS NULL)
       AND ($2::timestamp IS NULL OR mn.scheduled_at >= $2)`,
    [guildId, since]
  );
  return result.rows[0].minutes;
};

// PARALLEL to backend/src/models/movies.js (getMovieNightById) — intentionally differs: backend selects extra display columns for the web UI
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

// PARALLEL to backend/src/models/movies.js (getRecentMovieNightsForRating) — intentionally differs: bot targets started movies; web targets scheduled movies
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
// SHARED: keep identical with backend/src/models/ratings.js (upsertRating)
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

// PARALLEL to backend/src/models/ratings.js (getRatingsForMovie) — intentionally differs: backend adds avatar + attended column for the web UI
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

// PARALLEL to backend/src/models/ratings.js (getUserRatings) — intentionally differs: bot keys on discord_id (single guild); web is guild-scoped + test-filtered
export const getUserRatings = async (discordId, limit = 10) => {
  const result = await pool.query(
    `SELECT r.id, r.movie_night_id, r.user_id, r.score, r.comment, r.created_at, r.updated_at,
            mn.title, mn.scheduled_at
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

// One page of a member's ratings, with the room's average beside each score so
// you can see where you disagreed.
//
// PARALLEL to backend/src/models/ratings.js (getUserRatings) — intentionally
// differs: the bot keys on discord_id and pages; the web keys on internal
// user_id and is guild-scoped.
//
// `sort` is resolved through a lookup, never interpolated — it arrives from a
// select menu, which means it arrives from the user.
const RATING_SORTS = {
  recent: 'mn.scheduled_at DESC',
  score: 'r.score DESC, mn.scheduled_at DESC'
};

export const getUserRatingsPaged = async (discordId, { limit = 8, offset = 0, sort = 'recent' } = {}) => {
  const orderBy = RATING_SORTS[sort] ?? RATING_SORTS.recent;

  const result = await pool.query(
    `SELECT r.id, r.score, r.comment, r.updated_at,
            mn.id AS movie_night_id, mn.title, mn.release_year, mn.image_url, mn.scheduled_at,
            (SELECT ROUND(AVG(cr.score), 1) FROM ratings cr
               WHERE cr.movie_night_id = mn.id) AS community_avg,
            COUNT(*) OVER()::int AS total_count
     FROM ratings r
     JOIN users u ON r.user_id = u.id
     JOIN movie_nights mn ON r.movie_night_id = mn.id
     WHERE u.discord_id = $1
     ORDER BY ${orderBy}
     LIMIT $2 OFFSET $3`,
    [discordId, limit, offset]
  );
  return result.rows;
};

export const RATING_SORT_KEYS = Object.keys(RATING_SORTS);

// PARALLEL to backend/src/models/ratings.js (getUserTopRatedMovies) — intentionally differs: bot keys on discord_id + JOINs users; backend keys on user_id
export const getUserTopRatedMovies = async (discordId, limit = 10) => {
  const result = await pool.query(
    `SELECT r.id, r.movie_night_id, r.score, r.comment,
            mn.title, mn.scheduled_at, mn.image_url,
            ROUND(AVG(r2.score)::numeric, 1) as community_avg,
            COUNT(r2.id)::integer as rating_count
     FROM ratings r
     JOIN users u ON r.user_id = u.id
     JOIN movie_nights mn ON r.movie_night_id = mn.id
     LEFT JOIN ratings r2 ON r2.movie_night_id = mn.id
     WHERE u.discord_id = $1
     GROUP BY r.id, mn.id
     HAVING COUNT(r2.id) >= 3
     ORDER BY r.score DESC, mn.scheduled_at DESC
     LIMIT $2`,
    [discordId, limit]
  );
  return result.rows;
};

// PARALLEL to backend/src/models/ratings.js (getUserRating) — intentionally differs: bot keys on discord_id; backend keys on user_id
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
//
// The three queries below take an optional `since` — the date filter behind
// /stats' This month / This year buttons. It is bot-only: the web has its own
// date handling. Passing null reproduces the original SQL exactly, which is why
// the guard is written as "no bound, or within it" rather than a branch.
//
// PARALLEL to backend/src/models/stats.js (getGuildStats) — intentionally differs: backend adds is_test filter; bot ROUNDs aggregates for Discord embeds, and takes a bot-only `since` bound
export const getGuildStats = async (guildId, since = null) => {
  const result = await pool.query(
    `SELECT
       COUNT(DISTINCT mn.id) as total_movies,
       COUNT(DISTINCT r.user_id) as total_raters,
       COALESCE(ROUND(AVG(r.score)::numeric, 1), 0) as overall_avg_rating,
       COUNT(r.id) as total_ratings
     FROM movie_nights mn
     LEFT JOIN ratings r ON mn.id = r.movie_night_id
     WHERE mn.guild_id = $1
       AND ($2::timestamp IS NULL OR mn.scheduled_at >= $2)`,
    [guildId, since]
  );
  return result.rows[0];
};

// PARALLEL to backend/src/models/ratings.js (getTopRatedMovies) — intentionally differs: backend adds image_url + is_test filter; bot ROUNDs for embeds, selects the poster for the stats backdrop, and takes a bot-only `since` bound
export const getTopRatedMovies = async (guildId, limit = 5, since = null) => {
  const result = await pool.query(
    `SELECT mn.id, mn.title, mn.scheduled_at, mn.release_year, mn.image_url, mn.backdrop_url,
            ROUND(AVG(r.score)::numeric, 1) as avg_rating,
            COUNT(r.id) as rating_count
     FROM movie_nights mn
     JOIN ratings r ON mn.id = r.movie_night_id
     WHERE mn.guild_id = $1
       AND ($3::timestamp IS NULL OR mn.scheduled_at >= $3)
     GROUP BY mn.id
     HAVING COUNT(r.id) >= 1
     ORDER BY avg_rating DESC
     LIMIT $2`,
    [guildId, limit, since]
  );
  return result.rows;
};

// PARALLEL to backend/src/models/stats.js (getMostActiveRaters) — intentionally differs: backend adds id/avatar + is_test filter; bot ROUNDs for embeds, counts nights attended, and takes a bot-only `since` bound
export const getMostActiveRaters = async (guildId, limit = 5, since = null) => {
  const result = await pool.query(
    `SELECT u.discord_id, u.username,
            COUNT(r.id) as rating_count,
            ROUND(AVG(r.score)::numeric, 1) as avg_rating,
            -- Counted in a subquery, not a join: attendance and ratings are
            -- independent one-to-many relations, so joining both would multiply
            -- the rows and inflate every aggregate above.
            (SELECT COUNT(*) FROM movie_attendance ma
               JOIN movie_nights amn ON amn.id = ma.movie_night_id
              WHERE ma.user_id = u.id AND amn.guild_id = $1)::int AS attended_count
     FROM users u
     JOIN ratings r ON u.id = r.user_id
     JOIN movie_nights mn ON r.movie_night_id = mn.id
     WHERE mn.guild_id = $1
       AND ($3::timestamp IS NULL OR mn.scheduled_at >= $3)
     GROUP BY u.id
     ORDER BY rating_count DESC
     LIMIT $2`,
    [guildId, limit, since]
  );
  return result.rows;
};

// People who actually show up — distinct attendees across finished nights.
export const getRegularCount = async (guildId, since = null) => {
  const result = await pool.query(
    `SELECT COUNT(DISTINCT ma.user_id)::int AS regulars
     FROM movie_attendance ma
     JOIN movie_nights mn ON mn.id = ma.movie_night_id
     WHERE mn.guild_id = $1
       AND (mn.is_test = false OR mn.is_test IS NULL)
       AND ($2::timestamp IS NULL OR mn.scheduled_at >= $2)`,
    [guildId, since]
  );
  return result.rows[0].regulars;
};

// SHARED: keep identical with backend/src/models/movies.js (deleteMovieNight)
export const deleteMovieNight = async (movieId) => {
  // Child rows (ratings, movie_attendance, movie_credits, movie_night_voice_presence)
  // are removed by ON DELETE CASCADE. SET NULL refs (user_favorite_movies,
  // board_suggestions, marathon_items) are preserved. Single statement = atomic.
  const result = await pool.query(
    'DELETE FROM movie_nights WHERE id = $1 RETURNING *',
    [movieId]
  );
  return result.rows[0];
};

// Discord IDs of everyone who RSVP'd to a movie night (for reschedule pings).
export const getAttendeeDiscordIds = async (movieId) => {
  const result = await pool.query(
    `SELECT u.discord_id
     FROM movie_attendance ma
     JOIN users u ON ma.user_id = u.id
     WHERE ma.movie_night_id = $1`,
    [movieId]
  );
  return result.rows.map((r) => r.discord_id);
};

// Attach the posted message to the movie night. The announcement flow creates
// the row before sending, because the RSVP button needs the row id in its
// customId — so message_id is filled in a beat later.
export const updateMovieNightMessage = async (movieNightId, messageId, channelId) => {
  const result = await pool.query(
    `UPDATE movie_nights
     SET message_id = $2, channel_id = COALESCE($3, channel_id)
     WHERE id = $1
     RETURNING *`,
    [movieNightId, messageId, channelId ?? null]
  );
  return result.rows[0];
};

// PARALLEL to backend/src/models/attendance.js (toggleAttendance) — intentionally
// differs: the bot resolves the Discord user to an internal id via
// findOrCreateUser first, while the web already holds req.user.id.
// Returns true if the user is now attending, false if they just withdrew.
export const toggleAttendance = async (movieNightId, userId) => {
  const existing = await pool.query(
    'SELECT id FROM movie_attendance WHERE movie_night_id = $1 AND user_id = $2',
    [movieNightId, userId]
  );

  if (existing.rows.length > 0) {
    await pool.query(
      'DELETE FROM movie_attendance WHERE movie_night_id = $1 AND user_id = $2',
      [movieNightId, userId]
    );
    return false;
  }

  // ON CONFLICT guards the race where two clicks land at once — the UNIQUE
  // constraint on (movie_night_id, user_id) makes the second a no-op.
  await pool.query(
    `INSERT INTO movie_attendance (movie_night_id, user_id)
     VALUES ($1, $2)
     ON CONFLICT (movie_night_id, user_id) DO NOTHING`,
    [movieNightId, userId]
  );
  return true;
};

// "I'm in" on a binge kickoff means the whole evening, so attendance toggles
// across every film in the marathon at once. The user's state on the first film
// decides the direction, so a half-toggled marathon converges to all-or-nothing.
// A hand-logged film is excluded: its scheduled_movie_night_id points at a real
// past screening, and RSVPs for tonight must not be written onto that history —
// nor may an old RSVP there decide tonight's toggle direction.
export const toggleMarathonAttendance = async (marathonId, userId) => {
  const items = await pool.query(
    `SELECT scheduled_movie_night_id AS id
     FROM marathon_items
     WHERE marathon_id = $1 AND scheduled_movie_night_id IS NOT NULL
       AND status IS DISTINCT FROM 'watched'
     ORDER BY position ASC`,
    [marathonId]
  );
  const movieNightIds = items.rows.map((r) => r.id);
  if (movieNightIds.length === 0) return { attending: false, count: 0 };

  const existing = await pool.query(
    'SELECT id FROM movie_attendance WHERE movie_night_id = $1 AND user_id = $2',
    [movieNightIds[0], userId]
  );
  const attending = existing.rows.length === 0;

  if (attending) {
    await pool.query(
      `INSERT INTO movie_attendance (movie_night_id, user_id)
       SELECT unnest($1::int[]), $2
       ON CONFLICT (movie_night_id, user_id) DO NOTHING`,
      [movieNightIds, userId]
    );
  } else {
    await pool.query(
      'DELETE FROM movie_attendance WHERE movie_night_id = ANY($1::int[]) AND user_id = $2',
      [movieNightIds, userId]
    );
  }

  return { attending, count: movieNightIds.length };
};

// Attendees of a binge = attendees across its films, which the marathon-wide
// toggle keeps in sync with one another. A hand-logged film is excluded for the
// same reason the toggle skips it: it points at a real past screening, and the
// people who were at that screening are not tonight's attendees.
export const getMarathonAttendees = async (marathonId) => {
  const result = await pool.query(
    `SELECT u.username, MIN(ma.created_at) AS joined_at
     FROM marathon_items mi
     JOIN movie_attendance ma ON ma.movie_night_id = mi.scheduled_movie_night_id
     JOIN users u ON ma.user_id = u.id
     WHERE mi.marathon_id = $1 AND mi.status IS DISTINCT FROM 'watched'
     GROUP BY u.username
     ORDER BY joined_at ASC`,
    [marathonId]
  );
  return result.rows;
};

// The guild that owns a marathon, for validating a binge RSVP click. Joins the
// creator so the kickoff embed can be rebuilt with its original footer —
// `marathons` stores created_by (a user id), not a name.
export const getMarathonById = async (marathonId) => {
  const result = await pool.query(
    `SELECT m.*, u.username AS created_by_name
     FROM marathons m
     LEFT JOIN users u ON m.created_by = u.id
     WHERE m.id = $1`,
    [marathonId]
  );
  return result.rows[0];
};

// PARALLEL to backend/src/models/attendance.js (getAttendees) — intentionally
// differs: the bot needs only usernames in RSVP order for the embed field,
// while the web returns full user objects with avatars.
export const getAttendees = async (movieNightId) => {
  const result = await pool.query(
    `SELECT u.username
     FROM movie_attendance ma
     JOIN users u ON ma.user_id = u.id
     WHERE ma.movie_night_id = $1
     ORDER BY ma.created_at ASC`,
    [movieNightId]
  );
  return result.rows;
};

// Attach the screening card's message to the movie night, so later state
// transitions can find and edit it.
export const updateStartingMessageId = async (movieNightId, messageId) => {
  const result = await pool.query(
    `UPDATE movie_nights SET starting_message_id = $2 WHERE id = $1 RETURNING *`,
    [movieNightId, messageId]
  );
  return result.rows[0];
};

// Everything the screening card needs about the movie itself, plus how many
// people RSVP'd (the denominator in "4 of 6 rated").
export const getScreeningRow = async (movieNightId) => {
  const result = await pool.query(
    `SELECT mn.*,
            (SELECT COUNT(*) FROM movie_attendance WHERE movie_night_id = mn.id) AS attendee_count
     FROM movie_nights mn
     WHERE mn.id = $1`,
    [movieNightId]
  );
  return result.rows[0];
};

// Cards whose rating window has aged out and that haven't been settled yet.
// card_settled_at is the claim marker — without it this would re-edit every
// settled card on every tick.
export const getMoviesToSettle = async () => {
  const result = await pool.query(
    `SELECT * FROM movie_nights
     WHERE rating_prompt_sent_at IS NOT NULL
       AND card_settled_at IS NULL
       AND starting_message_id IS NOT NULL
       AND CURRENT_TIMESTAMP >= rating_prompt_sent_at + INTERVAL '24 hours'
     ORDER BY rating_prompt_sent_at ASC`
  );
  return result.rows;
};

// Atomically claim a card for settling, mirroring markRatingPromptSent.
export const markCardSettled = async (movieNightId) => {
  const result = await pool.query(
    `UPDATE movie_nights
     SET card_settled_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND card_settled_at IS NULL
     RETURNING *`,
    [movieNightId]
  );
  return result.rows[0];
};

// Everything the announcement embed needs in one round trip: the movie night,
// its announcer, and marathon context when the film belongs to one.
// marathon_items links back via scheduled_movie_night_id.
export const getMovieNightForAnnouncement = async (movieNightId) => {
  const result = await pool.query(
    `SELECT mn.*,
            u.username AS announced_by_name,
            m.name AS marathon_name,
            mi.position AS marathon_position,
            (SELECT COUNT(*) FROM marathon_items WHERE marathon_id = m.id) AS marathon_total
     FROM movie_nights mn
     LEFT JOIN users u ON mn.announced_by = u.id
     LEFT JOIN marathon_items mi ON mi.scheduled_movie_night_id = mn.id
     LEFT JOIN marathons m ON mi.marathon_id = m.id
     WHERE mn.id = $1`,
    [movieNightId]
  );
  return result.rows[0];
};

// Movie start operations
// SHARED: keep identical with backend/src/models/movies.js (getMoviesToStart)
export const getMoviesToStart = async () => {
  const result = await pool.query(
    `SELECT * FROM movie_nights
     WHERE scheduled_at <= CURRENT_TIMESTAMP
       AND started_at IS NULL
     ORDER BY scheduled_at ASC`
  );
  return result.rows;
};

// Atomically claim-and-start: the `started_at IS NULL` guard means two
// overlapping cron ticks can't both start the same movie. Returns undefined
// if it was already started, so the caller knows to skip re-posting.
// SHARED: keep identical with backend/src/models/movies.js (startMovieNight)
export const startMovieNight = async (movieId) => {
  const result = await pool.query(
    `UPDATE movie_nights
     SET started_at = CURRENT_TIMESTAMP
     WHERE id = $1
       AND started_at IS NULL
     RETURNING *`,
    [movieId]
  );
  return result.rows[0];
};

// SHARED: keep identical with backend/src/models/movies.js (rescheduleMovieNight)
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

// The /next board: everything a screening needs on screen, in one round-trip.
// Deliberately separate from getUpcomingMovies above, whose narrow
// {id, title, scheduled_at} shape the /start and /reschedule autocompletes read.
//
// "Upcoming" here means not-yet-finished rather than not-yet-started, so a film
// halfway through still holds the top of the board instead of vanishing mid-
// screening. The runtime-elapsed test is the same one the web uses to decide a
// marathon item is behind it (backend/src/models/marathons.js). It also gives the
// window a floor for free: a night nobody ever started stops leading the list
// once its runtime is spent, which the unbounded query above never does.
export const getUpcomingMovieNights = async (guildId, limit = 5) => {
  const result = await pool.query(
    `SELECT mn.id, mn.title, mn.scheduled_at, mn.image_url, mn.runtime, mn.genres,
            mn.release_year, mn.tmdb_id,
            (SELECT COUNT(*) FROM movie_attendance ma
               WHERE ma.movie_night_id = mn.id)::int AS attendee_count,
            m.name AS marathon_name,
            mi.position AS marathon_position,
            (SELECT COUNT(*) FROM marathon_items x
               WHERE x.marathon_id = m.id)::int AS marathon_total
     FROM movie_nights mn
     -- LATERAL … LIMIT 1 rather than a plain join: hand-logging a film as
     -- watched also points a marathon item at a night, so one night can be
     -- claimed by more than one item. A join would print it twice.
     LEFT JOIN LATERAL (
       SELECT mi.position, mi.marathon_id
       FROM marathon_items mi
       WHERE mi.scheduled_movie_night_id = mn.id
       ORDER BY mi.id ASC
       LIMIT 1
     ) mi ON TRUE
     LEFT JOIN marathons m ON m.id = mi.marathon_id
     WHERE mn.guild_id = $1
       AND mn.scheduled_at + INTERVAL '1 minute' * COALESCE(mn.runtime, 90) > NOW()
       AND (mn.is_test = false OR mn.is_test IS NULL)
     ORDER BY mn.scheduled_at ASC
     LIMIT $2`,
    [guildId, limit]
  );
  return result.rows;
};

// Pending announcement operations
export const getPendingAnnouncements = async () => {
  const result = await pool.query(
    `SELECT pa.*, u.username, u.discord_id
     FROM pending_announcements pa
     LEFT JOIN users u ON pa.user_id = u.id
     WHERE pa.status = 'pending'
     ORDER BY pa.created_at ASC`
  );
  return result.rows;
};

// Atomically claim a pending announcement so only one processor (or bot
// instance) ever posts it. The `status = 'pending'` guard means a second claimer
// — or a re-run after a crash — gets no row back and skips the work, preventing
// duplicate Discord posts and duplicate movie_night rows. Returns undefined if
// the row was already claimed/processed.
export const claimPendingAnnouncement = async (id) => {
  const result = await pool.query(
    `UPDATE pending_announcements
     SET status = 'processing'
     WHERE id = $1 AND status = 'pending'
     RETURNING *`,
    [id]
  );
  return result.rows[0];
};

export const markAnnouncementProcessed = async (id, status = 'processed') => {
  const result = await pool.query(
    `UPDATE pending_announcements
     SET status = $2, processed_at = CURRENT_TIMESTAMP
     WHERE id = $1
     RETURNING *`,
    [id, status]
  );
  return result.rows[0];
};

// Rating notification operations
export const getMoviesReadyForRatingNotification = async () => {
  // Movies that have started, haven't been prompted yet, and have now run their
  // full length. Rating opens when the credits roll — the audience is still in
  // voice, so editing the card in place reaches them.
  // Must stay in step with backend/src/routes/movies.js RATING_BUFFER_MINUTES.
  const result = await pool.query(
    `SELECT * FROM movie_nights
     WHERE started_at IS NOT NULL
       AND rating_prompt_sent_at IS NULL
       AND CURRENT_TIMESTAMP >= started_at + INTERVAL '1 minute' * COALESCE(runtime, 90)
     ORDER BY started_at ASC`
  );
  return result.rows;
};

// Guild channel sync operations
export const upsertGuildChannel = async (guildId, channelId, channelName, position, parentName) => {
  const result = await pool.query(
    `INSERT INTO guild_channels (guild_id, channel_id, channel_name, position, parent_name, updated_at)
     VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
     ON CONFLICT (guild_id, channel_id)
     DO UPDATE SET channel_name = $3, position = $4, parent_name = $5, updated_at = CURRENT_TIMESTAMP
     RETURNING *`,
    [guildId, channelId, channelName, position, parentName]
  );
  return result.rows[0];
};

export const removeStaleGuildChannels = async (guildId, currentChannelIds) => {
  if (!currentChannelIds || currentChannelIds.length === 0) {
    // Remove all channels for this guild if none are current
    await pool.query('DELETE FROM guild_channels WHERE guild_id = $1', [guildId]);
    return;
  }
  await pool.query(
    `DELETE FROM guild_channels WHERE guild_id = $1 AND channel_id != ALL($2)`,
    [guildId, currentChannelIds]
  );
};

// Atomically claim the rating prompt: the `rating_prompt_sent_at IS NULL` guard
// means only one cron tick can win the claim, so the prompt can't be double-sent.
// Returns undefined if it was already claimed.
export const markRatingPromptSent = async (movieId) => {
  const result = await pool.query(
    `UPDATE movie_nights
     SET rating_prompt_sent_at = CURRENT_TIMESTAMP
     WHERE id = $1
       AND rating_prompt_sent_at IS NULL
     RETURNING *`,
    [movieId]
  );
  return result.rows[0];
};

// Voice presence tracking
// Active window: movie has started and now is before started_at + runtime + 30min buffer.
export const findActiveMovieNight = async (guildId, at = new Date()) => {
  const result = await pool.query(
    `SELECT id, guild_id, started_at, runtime, voice_tracking_enabled
     FROM movie_nights
     WHERE guild_id = $1
       AND voice_tracking_enabled = true
       AND started_at IS NOT NULL
       AND started_at <= $2::timestamp
       AND started_at + (COALESCE(runtime, 120) + 30) * INTERVAL '1 minute' >= $2::timestamp
     ORDER BY started_at DESC
     LIMIT 1`,
    [guildId, at]
  );
  return result.rows[0];
};

export const openVoicePresence = async (movieNightId, userDiscordId, at = new Date()) => {
  const existing = await pool.query(
    `SELECT id FROM movie_night_voice_presence
     WHERE movie_night_id = $1 AND user_discord_id = $2 AND left_at IS NULL
     LIMIT 1`,
    [movieNightId, userDiscordId]
  );
  if (existing.rows.length > 0) return existing.rows[0];
  const result = await pool.query(
    `INSERT INTO movie_night_voice_presence (movie_night_id, user_discord_id, joined_at)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [movieNightId, userDiscordId, at]
  );
  return result.rows[0];
};

export const closeVoicePresenceForUser = async (userDiscordId, at = new Date()) => {
  const result = await pool.query(
    `UPDATE movie_night_voice_presence
     SET left_at = $2
     WHERE user_discord_id = $1 AND left_at IS NULL
     RETURNING *`,
    [userDiscordId, at]
  );
  return result.rows;
};

export const getOpenVoicePresence = async () => {
  const result = await pool.query(
    `SELECT vp.id, vp.movie_night_id, vp.user_discord_id, vp.joined_at, mn.guild_id
     FROM movie_night_voice_presence vp
     JOIN movie_nights mn ON vp.movie_night_id = mn.id
     WHERE vp.left_at IS NULL`
  );
  return result.rows;
};

// Zero out a dangling session (user is no longer in voice after bot restart):
// setting left_at = joined_at avoids over-counting time the bot wasn't watching.
export const zeroOutPresenceById = async (ids) => {
  if (!ids || ids.length === 0) return;
  await pool.query(
    `UPDATE movie_night_voice_presence
     SET left_at = joined_at
     WHERE id = ANY($1::int[])`,
    [ids]
  );
};

// What the group has asked for but nobody has scheduled — the fallback the
// /next board offers when the schedule is empty. Board suggestions replaced the
// retired voting feature (see the DROP in backend/src/config/migrate.js).
export const getTopBoardSuggestions = async (guildId, limit = 3) => {
  const result = await pool.query(
    `SELECT bs.id, bs.title, bs.release_year,
            (SELECT COUNT(*) FROM board_upvotes bu
               WHERE bu.suggestion_id = bs.id)::int AS upvotes
     FROM board_suggestions bs
     WHERE bs.guild_id = $1 AND bs.status = 'open'
     ORDER BY upvotes DESC, bs.created_at ASC
     LIMIT $2`,
    [guildId, limit]
  );
  return result.rows;
};

// ── Marathons (bot side) ─────────────────────────────────────────────────────

// PARALLEL to backend/src/models/marathons.js (getMarathons) — intentionally
// differs: the web lists marathons in every state with poster fans, creator
// identity and an airing_item; the bot's /next board shows only the running ones
// and only what it prints. The watched/next-up definitions are copied on purpose
// — watched means finished, not merely started, and a film with no date yet is
// still the one that's next.
export const getGuildActiveMarathons = async (guildId) => {
  const result = await pool.query(
    `SELECT m.id, m.name, m.cadence_type,
            (SELECT COUNT(*) FROM marathon_items mi
               WHERE mi.marathon_id = m.id)::int AS item_count,
            (SELECT COUNT(*) FROM marathon_items mi
               WHERE mi.marathon_id = m.id
                 AND (mi.status = 'watched'
                      OR (mi.scheduled_at IS NOT NULL
                          AND mi.scheduled_at + INTERVAL '1 minute' * COALESCE(mi.runtime, 90) < NOW())))::int AS watched_count,
            (SELECT json_build_object('title', mi.title, 'scheduled_at', mi.scheduled_at)
               FROM marathon_items mi
               WHERE mi.marathon_id = m.id AND mi.status IS DISTINCT FROM 'watched'
                 AND (mi.scheduled_at IS NULL OR mi.scheduled_at >= NOW())
               ORDER BY mi.position ASC LIMIT 1) AS next_item
     FROM marathons m
     WHERE m.guild_id = $1 AND m.status = 'active'
     ORDER BY m.updated_at DESC`,
    [guildId]
  );
  return result.rows;
};

export const getActiveMarathons = async () => {
  const result = await pool.query(`SELECT * FROM marathons WHERE status = 'active'`);
  return result.rows;
};

// Next film still waiting to be queued, in order.
export const getNextPendingMarathonItem = async (marathonId) => {
  // Only dated films are eligible to roll out. TBD (null-date) items are skipped
  // so they never block a later, dated film in a mixed marathon — they simply
  // wait until the host gives them a date.
  const result = await pool.query(
    `SELECT * FROM marathon_items
     WHERE marathon_id = $1 AND status = 'pending' AND scheduled_at IS NOT NULL
     ORDER BY position ASC LIMIT 1`,
    [marathonId]
  );
  return result.rows[0];
};

export const countMarathonItems = async (marathonId) => {
  const result = await pool.query(
    `SELECT COUNT(*)::int AS n FROM marathon_items WHERE marathon_id = $1`,
    [marathonId]
  );
  return result.rows[0].n;
};

// Queue one film onto the shared announcement pipeline, carrying marathon context.
// The `db` parameter accepts either the shared pool or a transaction client, so
// the marathon processor can run enqueue+mark+advance atomically (see the *Tx
// helpers below). NOTIFY is intentionally NOT fired here — inside a transaction a
// NOTIFY only delivers on COMMIT anyway, so the caller fires it after commit.
const insertMarathonPendingAnnouncement = async (db, item, marathon, total) => {
  const title = item.release_year ? `${item.title} (${item.release_year})` : item.title;
  const result = await db.query(
    `INSERT INTO pending_announcements
       (guild_id, channel_id, user_id, title, image_url, backdrop_url, description,
        tmdb_id, imdb_id, tmdb_rating, genres, runtime, release_year, trailer_url,
        scheduled_at, marathon_id, marathon_item_id, marathon_name, marathon_position, marathon_total)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
     RETURNING *`,
    [
      marathon.guild_id, null, marathon.created_by, title, item.image_url, item.backdrop_url,
      item.description, item.tmdb_id, item.imdb_id, item.tmdb_rating, item.genres, item.runtime,
      item.release_year, item.trailer_url, item.scheduled_at,
      marathon.id, item.id, marathon.name, item.position + 1, total
    ]
  );
  return result.rows[0];
};

// Non-transactional convenience wrapper (fires NOTIFY immediately). Kept for any
// standalone callers; the marathon processor uses the atomic path instead.
export const createMarathonPendingAnnouncement = async (item, marathon, total) => {
  const row = await insertMarathonPendingAnnouncement(pool, item, marathon, total);
  await notifyMovieAnnouncement();
  return row;
};

const markMarathonItemScheduledOn = async (db, itemId) => {
  await db.query(`UPDATE marathon_items SET status = 'scheduled' WHERE id = $1`, [itemId]);
};

export const markMarathonItemScheduled = async (itemId) => {
  await markMarathonItemScheduledOn(pool, itemId);
};

const advanceMarathonPositionOn = async (db, marathonId, position) => {
  await db.query(
    `UPDATE marathons SET current_position = $2, updated_at = NOW() WHERE id = $1`,
    [marathonId, position]
  );
};

export const advanceMarathonPosition = async (marathonId, position) => {
  await advanceMarathonPositionOn(pool, marathonId, position);
};

// Fire the LISTEN/NOTIFY trigger so the announcement processor drains the queue
// immediately. Best-effort — a missed NOTIFY is caught by the 5-minute cron backstop.
const notifyMovieAnnouncement = async () => {
  try { await pool.query('NOTIFY movie_announcement'); } catch (err) {
    console.error('Failed to NOTIFY movie_announcement:', err.message);
  }
};

// Atomically enqueue one interval-marathon film: INSERT the announcement, mark the
// item 'scheduled', and advance the marathon position in a single transaction. A
// crash between any two of these no longer re-queues the same film next tick
// (which caused duplicate announcements). NOTIFY fires only after COMMIT.
export const enqueueMarathonItemAtomic = async (item, marathon, total) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const row = await insertMarathonPendingAnnouncement(client, item, marathon, total);
    await markMarathonItemScheduledOn(client, item.id);
    await advanceMarathonPositionOn(client, marathon.id, item.position + 1);
    await client.query('COMMIT');
    await notifyMovieAnnouncement();
    return row;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* connection may be dead */ }
    throw err;
  } finally {
    client.release();
  }
};

// Back-link the created movie night to its marathon item (called at post time).
export const linkMarathonItemMovieNight = async (itemId, movieNightId) => {
  await pool.query(
    `UPDATE marathon_items SET scheduled_movie_night_id = $2 WHERE id = $1`,
    [itemId, movieNightId]
  );
};

// Complete a marathon once nothing is pending and no scheduled film is still upcoming.
export const completeMarathonIfDone = async (marathonId) => {
  await pool.query(
    `UPDATE marathons SET status = 'completed', updated_at = NOW()
     WHERE id = $1 AND status = 'active'
       AND NOT EXISTS (SELECT 1 FROM marathon_items WHERE marathon_id = $1 AND status = 'pending')
       AND NOT EXISTS (SELECT 1 FROM marathon_items WHERE marathon_id = $1 AND scheduled_at >= NOW())`,
    [marathonId]
  );
};

// The evening's lineup for a binge marathon, in play order. Excludes a film logged
// as already watched: it is history, not part of tonight, and including it would
// announce it a second time and overwrite its link to the real screening. Filtered
// here rather than at each call site — there are three, and one of them was missed.
export const getMarathonItemsByMarathon = async (marathonId) => {
  const result = await pool.query(
    `SELECT * FROM marathon_items
     WHERE marathon_id = $1 AND status IS DISTINCT FROM 'watched'
     ORDER BY position ASC`,
    [marathonId]
  );
  return result.rows;
};

// Mark every still-pending item scheduled in one shot (binge queues the whole night at once).
const markAllMarathonItemsScheduledOn = async (db, marathonId) => {
  await db.query(
    `UPDATE marathon_items SET status = 'scheduled' WHERE marathon_id = $1 AND status = 'pending'`,
    [marathonId]
  );
};

export const markAllMarathonItemsScheduled = async (marathonId) => {
  await markAllMarathonItemsScheduledOn(pool, marathonId);
};

// Queue ONE kickoff announcement for a binge marathon. Carries marathon_binge=true
// so the announcement processor knows to expand it into the whole evening.
// firstItem seeds the thumbnail/title; the processor reads all items for the lineup.
// `db` accepts the pool or a transaction client (used by the atomic binge path).
const insertBingeKickoffPendingAnnouncement = async (db, firstItem, marathon, total) => {
  const result = await db.query(
    `INSERT INTO pending_announcements
       (guild_id, channel_id, user_id, title, image_url, backdrop_url, description,
        tmdb_id, imdb_id, tmdb_rating, genres, runtime, release_year, trailer_url,
        scheduled_at, marathon_id, marathon_name, marathon_total, marathon_binge)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
     RETURNING *`,
    [
      marathon.guild_id, null, marathon.created_by, marathon.name, firstItem.image_url,
      firstItem.backdrop_url, firstItem.description, firstItem.tmdb_id, firstItem.imdb_id,
      firstItem.tmdb_rating, firstItem.genres, firstItem.runtime, firstItem.release_year,
      firstItem.trailer_url, firstItem.scheduled_at, marathon.id, marathon.name, total, true
    ]
  );
  return result.rows[0];
};

export const createBingeKickoffPendingAnnouncement = async (firstItem, marathon, total) => {
  const row = await insertBingeKickoffPendingAnnouncement(pool, firstItem, marathon, total);
  await notifyMovieAnnouncement();
  return row;
};

// Atomically queue a binge marathon: INSERT the single kickoff announcement, mark
// ALL pending items 'scheduled', and advance the position past the last film — all
// in one transaction. A crash mid-pass no longer re-queues a second kickoff for the
// same evening. NOTIFY fires only after COMMIT.
export const enqueueBingeMarathonAtomic = async (firstItem, marathon, itemCount) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const row = await insertBingeKickoffPendingAnnouncement(client, firstItem, marathon, itemCount);
    await markAllMarathonItemsScheduledOn(client, marathon.id);
    await advanceMarathonPositionOn(client, marathon.id, itemCount);
    await client.query('COMMIT');
    await notifyMovieAnnouncement();
    return row;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* connection may be dead */ }
    throw err;
  } finally {
    client.release();
  }
};
