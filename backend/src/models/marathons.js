import pool from '../config/database.js';

// Create a draft marathon. Items are added separately.
export const createMarathon = async (guildId, userId, name, description = null) => {
  const result = await pool.query(
    `INSERT INTO marathons (guild_id, created_by, name, description)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [guildId, userId, name, description]
  );
  return result.rows[0];
};

// Browse list: one row per marathon with counts, next-up, and poster fan.
// Ordered active → paused → draft → completed, newest-updated first.
export const getMarathons = async (guildId) => {
  const result = await pool.query(
    `SELECT m.*,
            u.username AS created_by_name,
            u.discord_id AS created_by_discord_id,
            u.avatar AS created_by_avatar,
            (SELECT COUNT(*) FROM marathon_items mi WHERE mi.marathon_id = m.id)::int AS item_count,
            -- Watched means finished, not merely started: count only items whose
            -- runtime has fully elapsed. Counting from scheduled_at alone marked a
            -- film as watched the moment it began. An item logged by hand as
            -- 'watched' counts outright — its runtime may not have elapsed yet.
            (SELECT COUNT(*) FROM marathon_items mi
               WHERE mi.marathon_id = m.id
                 AND (mi.status = 'watched'
                      OR (mi.scheduled_at IS NOT NULL
                          AND mi.scheduled_at + INTERVAL '1 minute' * COALESCE(mi.runtime, 90) < NOW())))::int AS watched_count,
            -- The film on screen right now, if any: started but not yet finished.
            -- A hand-logged film is history, never on screen.
            (SELECT json_build_object('title', mi.title, 'scheduled_at', mi.scheduled_at, 'runtime', mi.runtime)
               FROM marathon_items mi
               WHERE mi.marathon_id = m.id AND mi.status <> 'watched' AND mi.scheduled_at IS NOT NULL
                 AND mi.scheduled_at <= NOW()
                 AND mi.scheduled_at + INTERVAL '1 minute' * COALESCE(mi.runtime, 90) > NOW()
               ORDER BY mi.position ASC LIMIT 1) AS airing_item,
            (SELECT json_build_object('title', mi.title, 'scheduled_at', mi.scheduled_at)
               FROM marathon_items mi
               WHERE mi.marathon_id = m.id AND mi.status <> 'watched'
                 AND (mi.scheduled_at IS NULL OR mi.scheduled_at >= NOW())
               ORDER BY mi.position ASC LIMIT 1) AS next_item,
            (SELECT json_agg(mi.image_url ORDER BY mi.position)
               FROM marathon_items mi WHERE mi.marathon_id = m.id) AS poster_urls
     FROM marathons m
     LEFT JOIN users u ON m.created_by = u.id
     WHERE m.guild_id = $1
     ORDER BY CASE m.status
                WHEN 'active' THEN 0 WHEN 'paused' THEN 1
                WHEN 'draft' THEN 2 ELSE 3 END,
              m.updated_at DESC`,
    [guildId]
  );
  return result.rows;
};

export const getMarathonById = async (id) => {
  const result = await pool.query(
    `SELECT m.*, u.username AS created_by_name, u.discord_id AS created_by_discord_id
     FROM marathons m LEFT JOIN users u ON m.created_by = u.id
     WHERE m.id = $1`,
    [id]
  );
  return result.rows[0];
};

export const getMarathonItems = async (marathonId) => {
  const result = await pool.query(
    `SELECT * FROM marathon_items WHERE marathon_id = $1 ORDER BY position ASC`,
    [marathonId]
  );
  return result.rows;
};

// Append a film. movie carries TMDB metadata (from GET /api/tmdb/:id).
export const addMarathonItem = async (marathonId, movie) => {
  const posResult = await pool.query(
    `SELECT COALESCE(MAX(position), -1) + 1 AS pos FROM marathon_items WHERE marathon_id = $1`,
    [marathonId]
  );
  const position = posResult.rows[0].pos;
  const {
    tmdbId, title, imageUrl, backdropUrl, description, tmdbRating,
    genres, runtime, releaseYear, tagline, imdbId, originalLanguage, trailerUrl
  } = movie;
  const result = await pool.query(
    `INSERT INTO marathon_items
       (marathon_id, position, tmdb_id, title, image_url, backdrop_url, description,
        tmdb_rating, genres, runtime, release_year, tagline, imdb_id, original_language, trailer_url)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
     RETURNING *`,
    [
      marathonId, position, tmdbId || null, title, imageUrl || null, backdropUrl || null,
      description || null, tmdbRating ?? null, genres || null, runtime ?? null,
      releaseYear || null, tagline || null, imdbId || null, originalLanguage || null, trailerUrl || null
    ]
  );
  return result.rows[0];
};

// Delete + close the gap. Positions must stay contiguous: the bot announces a
// film as "position + 1 of COUNT(*)", so a hole would post "Film 4 of 5" and
// then "Film 6 of 5".
export const removeMarathonItem = async (marathonId, itemId) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `DELETE FROM marathon_items WHERE id = $1 AND marathon_id = $2 RETURNING *`,
      [itemId, marathonId]
    );
    if (result.rows[0]) {
      await client.query(
        `UPDATE marathon_items AS mi SET position = ranked.pos
           FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY position ASC) - 1 AS pos
                   FROM marathon_items WHERE marathon_id = $1) AS ranked
          WHERE mi.id = ranked.id AND mi.position <> ranked.pos`,
        [marathonId]
      );
    }
    await client.query('COMMIT');
    return result.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

// Reorder: orderedItemIds is the full list of item ids in the new order.
export const reorderMarathonItems = async (marathonId, orderedItemIds) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (let i = 0; i < orderedItemIds.length; i++) {
      await client.query(
        `UPDATE marathon_items SET position = $1 WHERE id = $2 AND marathon_id = $3`,
        [i, orderedItemIds[i], marathonId]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  return getMarathonItems(marathonId);
};

export const updateMarathonItemDate = async (marathonId, itemId, scheduledAt) => {
  const result = await pool.query(
    `UPDATE marathon_items SET scheduled_at = $1 WHERE id = $2 AND marathon_id = $3 RETURNING *`,
    [scheduledAt, itemId, marathonId]
  );
  return result.rows[0];
};

// Launch: persist per-item dates + cadence, flip to active. items = [{ id, scheduled_at }].
export const launchMarathon = async (marathonId, cadenceType, items) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const it of items) {
      await client.query(
        `UPDATE marathon_items SET scheduled_at = $1, status = 'pending' WHERE id = $2 AND marathon_id = $3`,
        [it.scheduled_at, it.id, marathonId]
      );
    }
    const result = await client.query(
      `UPDATE marathons
       SET status = 'active', cadence_type = $2, current_position = 0, updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [marathonId, cadenceType]
    );
    await client.query('COMMIT');
    return result.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

export const setMarathonStatus = async (marathonId, status) => {
  const result = await pool.query(
    `UPDATE marathons SET status = $2, updated_at = NOW() WHERE id = $1 RETURNING *`,
    [marathonId, status]
  );
  return result.rows[0];
};

export const updateMarathon = async (marathonId, { name, description }) => {
  const result = await pool.query(
    `UPDATE marathons
     SET name = COALESCE($2, name), description = COALESCE($3, description), updated_at = NOW()
     WHERE id = $1 RETURNING *`,
    [marathonId, name ?? null, description ?? null]
  );
  return result.rows[0];
};

export const deleteMarathon = async (marathonId) => {
  const result = await pool.query(
    `DELETE FROM marathons WHERE id = $1 RETURNING *`,
    [marathonId]
  );
  return result.rows[0];
};

// Append many films at once (source-built lineups). movies = array of the same
// shape addMarathonItem accepts (camelCase TMDB fields). Preserves array order.
export const addMarathonItemsBulk = async (marathonId, movies) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const posResult = await client.query(
      `SELECT COALESCE(MAX(position), -1) + 1 AS pos FROM marathon_items WHERE marathon_id = $1`,
      [marathonId]
    );
    let position = posResult.rows[0].pos;
    const inserted = [];
    for (const m of movies) {
      const {
        tmdbId, title, imageUrl, backdropUrl, description, tmdbRating,
        genres, runtime, releaseYear, tagline, imdbId, originalLanguage, trailerUrl
      } = m;
      const r = await client.query(
        `INSERT INTO marathon_items
           (marathon_id, position, tmdb_id, title, image_url, backdrop_url, description,
            tmdb_rating, genres, runtime, release_year, tagline, imdb_id, original_language, trailer_url)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
         RETURNING *`,
        [
          marathonId, position, tmdbId || null, title, imageUrl || null, backdropUrl || null,
          description || null, tmdbRating ?? null, genres || null, runtime ?? null,
          releaseYear || null, tagline || null, imdbId || null, originalLanguage || null, trailerUrl || null
        ]
      );
      inserted.push(r.rows[0]);
      position += 1;
    }
    await client.query('COMMIT');
    return inserted;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

// One item by id, scoped to its marathon. Used by the routes to check a film's
// current state before changing it.
export const getMarathonItemById = async (marathonId, itemId) => {
  const result = await pool.query(
    `SELECT * FROM marathon_items WHERE id = $1 AND marathon_id = $2`,
    [itemId, marathonId]
  );
  return result.rows[0];
};

// A film the group watched outside the roll-out. status 'watched' is what keeps
// the bot's hands off it — marathonProcessor only ever picks up 'pending' items.
// scheduled_at becomes the date it actually played, which is what every derived
// read already keys on (progress, next-up, the row's "Watched <day>" label).
//
// The WHERE clause carries the invariant rather than trusting the caller: a film
// the bot has already taken ('scheduled', whether or not it has been back-linked
// yet) can never be logged by hand, and an existing link can never be nulled.
// Re-marking with the same night — to correct a date — still works.
// IS DISTINCT FROM, not <>, so a NULL status could never silently refuse.
export const markMarathonItemWatched = async (marathonId, itemId, watchedAt, movieNightId = null) => {
  const result = await pool.query(
    `UPDATE marathon_items
     SET status = 'watched', scheduled_at = $3, scheduled_movie_night_id = $4
     WHERE id = $1 AND marathon_id = $2
       AND status IS DISTINCT FROM 'scheduled'
       AND (scheduled_movie_night_id IS NULL OR scheduled_movie_night_id = $4)
     RETURNING *`,
    [itemId, marathonId, watchedAt, movieNightId]
  );
  return result.rows[0];
};

// Undo. The watched date overwrote whatever was planned, so there is nothing to
// restore — the film goes back to TBD, a state the detail page already renders.
// Guarded on status = 'watched' so it can only ever undo this feature's own work.
export const unmarkMarathonItemWatched = async (marathonId, itemId) => {
  const result = await pool.query(
    `UPDATE marathon_items
     SET status = 'pending', scheduled_at = NULL, scheduled_movie_night_id = NULL
     WHERE id = $1 AND marathon_id = $2 AND status = 'watched'
     RETURNING *`,
    [itemId, marathonId]
  );
  return result.rows[0];
};

// Bring a completed marathon back to active. Guarded in SQL rather than by reading
// the status first: the bot's completeMarathonIfDone runs every 5 minutes and can
// land between a read and this write, which would leave a queued film sitting in a
// completed marathon that getActiveMarathons never looks at again.
export const reviveCompletedMarathon = async (marathonId) => {
  const result = await pool.query(
    `UPDATE marathons SET status = 'active', updated_at = NOW()
     WHERE id = $1 AND status = 'completed'
     RETURNING *`,
    [marathonId]
  );
  return result.rows[0];
};
