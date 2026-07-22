# Movie Marathons — Core (MVP) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the core marathon loop — create a named, ordered set of movies (manual source), schedule it with a Daily/Weekly cadence, and have the bot roll it out one film at a time into real movie nights.

**Architecture:** Two new tables (`marathons`, `marathon_items`) feed the *existing* `pending_announcements → announcementProcessor → movie_nights` pipeline. A new bot cron (`marathonProcessor`) queues only the next-due film per active marathon by inserting a `pending_announcement` carrying marathon context; the existing announcement processor posts it, creates the movie night, and back-links it to the marathon item. Frontend adds a `Marathons` tab with a browse view, a create wizard (manual + cadence), and a detail view.

**Tech Stack:** Express + `pg` (raw parameterized SQL, no ORM), Discord.js v14 + node-cron, React 18 + Vite (plain CSS, lazy routes), shared PostgreSQL.

> **Testing note (repo reality):** This repo has **no test framework, linter, or CI** (see `CLAUDE.md`). Per instruction priority, we follow the repo, not the skill's pytest/TDD template. Each task's verification is **manual**: run the dev servers, hit endpoints with `curl`/browser, and inspect the DB / rendered page. Verify UI by rendering it; verify data by querying. Where the DB isn't reachable locally, verify on the Railway deploy.

---

## Scope

**In this plan (Plan 1):** DB schema, backend model + routes, api client, `Marathons` nav/route, browse view, create wizard (manual source, Daily/Weekly/Custom cadence, editable dates), detail view (progress, next-up, lineup, pause/resume/delete), bot `marathonProcessor`, marathon-aware announcement embed + item back-link.

**Deferred to later plans:** franchise/by-person/Gemini sources (Plan 2), back-to-back binge cadence (Plan 3), home-page "On the calendar" agenda + inline scheduling calendar (Plan 4). This plan intentionally ships **weekly/interval, manual-source marathons** as a complete, usable feature.

---

## File Structure

**Backend**
- Create `backend/src/models/marathons.js` — all marathon DB operations.
- Modify `backend/src/models/index.js` — barrel-export the new model.
- Create `backend/src/routes/marathons.js` — REST endpoints.
- Modify `backend/src/routes/movies.js` (`createPendingAnnouncement` is here) — no change needed; referenced only.
- Modify `backend/src/index.js` — mount the router.
- Modify `backend/src/config/migrate.js` — two tables + `pending_announcements` marathon columns + indexes.

**Bot**
- Create `bot/src/jobs/marathonProcessor.js` — cron that advances active marathons.
- Modify `bot/src/models/index.js` — marathon read/advance helpers.
- Modify `bot/src/jobs/announcementProcessor.js` — marathon-aware embed + back-link on post.
- Modify `bot/src/events/ready.js` — start the new job (alongside `startAnnouncementProcessorJob`).

**Frontend**
- Modify `frontend/src/api/client.js` — marathon methods.
- Modify `frontend/src/components/layout/Header.jsx` — add `Marathons` to `PRIMARY_NAV`.
- Modify `frontend/src/App.jsx` — lazy import + routes.
- Create `frontend/src/pages/MarathonsPage.jsx` — browse + routes into detail.
- Create `frontend/src/components/marathons/MarathonWizard.jsx` — create flow.
- Create `frontend/src/components/marathons/MarathonDetail.jsx` — detail view.
- Create `frontend/src/pages/MarathonsPage.css` — styles for all three.

---

## Task 1: Database migration

**Files:**
- Modify: `backend/src/config/migrate.js` (insert before the final `await client.query('COMMIT');` at ~line 743)

- [ ] **Step 1: Add the two tables + pending_announcements columns + indexes**

Insert this block in `migrate.js` immediately before `await client.query('COMMIT');`:

```js
    // ── Marathons ──────────────────────────────────────────────────────
    // A marathon is a named, ordered set of films with a schedule that rolls
    // out one movie night at a time. Items store TMDB metadata inline (like
    // board_suggestions) so scheduling needs no re-fetch.
    await client.query(`
      CREATE TABLE IF NOT EXISTS marathons (
        id SERIAL PRIMARY KEY,
        guild_id VARCHAR(20) NOT NULL,
        created_by INTEGER REFERENCES users(id),
        name VARCHAR(255) NOT NULL,
        description TEXT,
        status VARCHAR(20) DEFAULT 'draft',
        cadence_type VARCHAR(20),
        current_position INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS marathon_items (
        id SERIAL PRIMARY KEY,
        marathon_id INTEGER REFERENCES marathons(id) ON DELETE CASCADE,
        position INTEGER NOT NULL,
        status VARCHAR(20) DEFAULT 'pending',
        scheduled_at TIMESTAMP,
        scheduled_movie_night_id INTEGER REFERENCES movie_nights(id) ON DELETE SET NULL,
        tmdb_id INTEGER,
        title VARCHAR(255) NOT NULL,
        image_url VARCHAR(500),
        backdrop_url VARCHAR(500),
        description TEXT,
        tmdb_rating DECIMAL(3,1),
        genres VARCHAR(255),
        runtime INTEGER,
        release_year INTEGER,
        tagline VARCHAR(500),
        imdb_id VARCHAR(20),
        original_language VARCHAR(10),
        trailer_url VARCHAR(500),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Marathon context carried on the announcement queue so the embed can show
    // the ribbon + progress and the processor can back-link the item.
    const marathonPaCols = [
      { name: 'marathon_id', type: 'INTEGER' },
      { name: 'marathon_item_id', type: 'INTEGER' },
      { name: 'marathon_name', type: 'VARCHAR(255)' },
      { name: 'marathon_position', type: 'INTEGER' },
      { name: 'marathon_total', type: 'INTEGER' }
    ];
    for (const col of marathonPaCols) {
      const check = await client.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'pending_announcements' AND column_name = $1
      `, [col.name]);
      if (check.rows.length === 0) {
        await client.query(`ALTER TABLE pending_announcements ADD COLUMN ${col.name} ${col.type}`);
      }
    }

    await client.query(`CREATE INDEX IF NOT EXISTS idx_marathons_guild ON marathons(guild_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_marathon_items_marathon ON marathon_items(marathon_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_marathon_items_next ON marathon_items(marathon_id, status, position)`);
```

- [ ] **Step 2: Run the migration**

Run: `cd backend && npm run db:migrate`
Expected: `Migration completed successfully!` with no errors. (If local Postgres isn't running, this runs automatically on the next Railway deploy via `npm start`.)

- [ ] **Step 3: Verify the tables exist**

Run: `psql "$DATABASE_URL" -c "\d marathons" -c "\d marathon_items"`
Expected: both tables print with the columns above. (Skip if verifying on Railway — confirm after deploy.)

- [ ] **Step 4: Commit**

```bash
git add backend/src/config/migrate.js
git commit -m "feat(marathons): add marathons + marathon_items tables and pending_announcements columns"
```

---

## Task 2: Backend model (`marathons.js`)

**Files:**
- Create: `backend/src/models/marathons.js`
- Modify: `backend/src/models/index.js`

- [ ] **Step 1: Write the model**

Create `backend/src/models/marathons.js`:

```js
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
            (SELECT COUNT(*) FROM marathon_items mi
               WHERE mi.marathon_id = m.id AND mi.scheduled_at IS NOT NULL AND mi.scheduled_at < NOW())::int AS watched_count,
            (SELECT json_build_object('title', mi.title, 'scheduled_at', mi.scheduled_at)
               FROM marathon_items mi
               WHERE mi.marathon_id = m.id AND (mi.scheduled_at IS NULL OR mi.scheduled_at >= NOW())
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

export const removeMarathonItem = async (marathonId, itemId) => {
  const result = await pool.query(
    `DELETE FROM marathon_items WHERE id = $1 AND marathon_id = $2 RETURNING *`,
    [itemId, marathonId]
  );
  return result.rows[0];
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
```

- [ ] **Step 2: Barrel-export it**

In `backend/src/models/index.js`, add a re-export alongside the others (match the existing `export * from './<domain>.js'` style):

```js
export * from './marathons.js';
```

- [ ] **Step 3: Verify it imports cleanly**

Run: `cd backend && node -e "import('./src/models/index.js').then(m => console.log(typeof m.createMarathon, typeof m.launchMarathon))"`
Expected: `function function`

- [ ] **Step 4: Commit**

```bash
git add backend/src/models/marathons.js backend/src/models/index.js
git commit -m "feat(marathons): add marathons model with CRUD, reorder, launch"
```

---

## Task 3: Backend routes (`marathons.js`)

**Files:**
- Create: `backend/src/routes/marathons.js`
- Modify: `backend/src/index.js` (mount router near line 97 where `app.use('/api/board', boardRoutes)` lives)

- [ ] **Step 1: Write the router**

Create `backend/src/routes/marathons.js`. Mirrors `routes/board.js` conventions (`validateGuildId` sets `req.guildId`, `validateIntParams`, `authenticateToken`, `isAdmin(req.user.discord_id)`):

```js
import { Router } from 'express';
import { authenticateToken, optionalAuth } from '../middleware/auth.js';
import { validateIntParams, validateGuildId } from '../middleware/validate.js';
import { isAdmin } from '../utils/admin.js';
import * as db from '../models/index.js';

const router = Router();

// Owner-or-admin guard for mutations.
const canManage = (marathon, user) =>
  marathon.created_by === user.id || isAdmin(user.discord_id);

// GET /api/marathons — browse list for the guild.
router.get('/', validateGuildId, optionalAuth, async (req, res) => {
  try {
    const marathons = await db.getMarathons(req.guildId);
    res.json(marathons);
  } catch (err) {
    console.error('Error fetching marathons:', err);
    res.status(500).json({ error: 'Failed to fetch marathons' });
  }
});

// GET /api/marathons/:id — marathon + its items.
router.get('/:id', validateGuildId, validateIntParams('id'), optionalAuth, async (req, res) => {
  try {
    const marathon = await db.getMarathonById(parseInt(req.params.id));
    if (!marathon || marathon.guild_id !== req.guildId) {
      return res.status(404).json({ error: 'Marathon not found' });
    }
    const items = await db.getMarathonItems(marathon.id);
    const isOwner = req.user ? canManage(marathon, req.user) : false;
    res.json({ ...marathon, items, is_owner: isOwner });
  } catch (err) {
    console.error('Error fetching marathon:', err);
    res.status(500).json({ error: 'Failed to fetch marathon' });
  }
});

// POST /api/marathons — create a draft.
router.post('/', validateGuildId, authenticateToken, async (req, res) => {
  const { name, description } = req.body;
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Name is required' });
  }
  if (name.length > 255) {
    return res.status(400).json({ error: 'Name too long (max 255 characters)' });
  }
  try {
    const marathon = await db.createMarathon(req.guildId, req.user.id, name.trim(), description || null);
    res.json(marathon);
  } catch (err) {
    console.error('Error creating marathon:', err);
    res.status(500).json({ error: 'Failed to create marathon' });
  }
});

// Helper: load marathon and enforce guild + management rights.
const loadManageable = async (req, res) => {
  const marathon = await db.getMarathonById(parseInt(req.params.id));
  if (!marathon || marathon.guild_id !== req.guildId) {
    res.status(404).json({ error: 'Marathon not found' });
    return null;
  }
  if (!canManage(marathon, req.user)) {
    res.status(403).json({ error: 'Not allowed' });
    return null;
  }
  return marathon;
};

// POST /api/marathons/:id/items — append a film (tmdb_data carries metadata).
router.post('/:id/items', validateGuildId, validateIntParams('id'), authenticateToken, async (req, res) => {
  const { tmdb_data } = req.body;
  if (!tmdb_data || !tmdb_data.title) {
    return res.status(400).json({ error: 'tmdb_data with a title is required' });
  }
  try {
    const marathon = await loadManageable(req, res);
    if (!marathon) return;
    const item = await db.addMarathonItem(marathon.id, tmdb_data);
    res.json(item);
  } catch (err) {
    console.error('Error adding marathon item:', err);
    res.status(500).json({ error: 'Failed to add item' });
  }
});

// DELETE /api/marathons/:id/items/:itemId
router.delete('/:id/items/:itemId', validateGuildId, validateIntParams('id', 'itemId'), authenticateToken, async (req, res) => {
  try {
    const marathon = await loadManageable(req, res);
    if (!marathon) return;
    await db.removeMarathonItem(marathon.id, parseInt(req.params.itemId));
    res.json({ success: true });
  } catch (err) {
    console.error('Error removing marathon item:', err);
    res.status(500).json({ error: 'Failed to remove item' });
  }
});

// PUT /api/marathons/:id/reorder — body: { item_ids: [id, id, ...] }
router.put('/:id/reorder', validateGuildId, validateIntParams('id'), authenticateToken, async (req, res) => {
  const { item_ids } = req.body;
  if (!Array.isArray(item_ids)) {
    return res.status(400).json({ error: 'item_ids array is required' });
  }
  try {
    const marathon = await loadManageable(req, res);
    if (!marathon) return;
    const items = await db.reorderMarathonItems(marathon.id, item_ids);
    res.json(items);
  } catch (err) {
    console.error('Error reordering marathon:', err);
    res.status(500).json({ error: 'Failed to reorder' });
  }
});

// PUT /api/marathons/:id/items/:itemId — body: { scheduled_at }
router.put('/:id/items/:itemId', validateGuildId, validateIntParams('id', 'itemId'), authenticateToken, async (req, res) => {
  const { scheduled_at } = req.body;
  if (!scheduled_at || isNaN(new Date(scheduled_at).getTime())) {
    return res.status(400).json({ error: 'Valid scheduled_at is required' });
  }
  try {
    const marathon = await loadManageable(req, res);
    if (!marathon) return;
    const item = await db.updateMarathonItemDate(marathon.id, parseInt(req.params.itemId), new Date(scheduled_at));
    res.json(item);
  } catch (err) {
    console.error('Error updating item date:', err);
    res.status(500).json({ error: 'Failed to update date' });
  }
});

// POST /api/marathons/:id/launch — body: { cadence_type, items: [{ id, scheduled_at }] }
router.post('/:id/launch', validateGuildId, validateIntParams('id'), authenticateToken, async (req, res) => {
  const { cadence_type, items } = req.body;
  if (!['interval', 'binge'].includes(cadence_type)) {
    return res.status(400).json({ error: 'cadence_type must be interval or binge' });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'items array is required' });
  }
  for (const it of items) {
    if (!it.id || !it.scheduled_at || isNaN(new Date(it.scheduled_at).getTime())) {
      return res.status(400).json({ error: 'Each item needs an id and a valid scheduled_at' });
    }
  }
  try {
    const marathon = await loadManageable(req, res);
    if (!marathon) return;
    const normalized = items.map((it) => ({ id: it.id, scheduled_at: new Date(it.scheduled_at) }));
    const updated = await db.launchMarathon(marathon.id, cadence_type, normalized);
    res.json(updated);
  } catch (err) {
    console.error('Error launching marathon:', err);
    res.status(500).json({ error: 'Failed to launch' });
  }
});

// POST /api/marathons/:id/pause  and  /resume
router.post('/:id/pause', validateGuildId, validateIntParams('id'), authenticateToken, async (req, res) => {
  try {
    const marathon = await loadManageable(req, res);
    if (!marathon) return;
    const updated = await db.setMarathonStatus(marathon.id, 'paused');
    res.json(updated);
  } catch (err) {
    console.error('Error pausing marathon:', err);
    res.status(500).json({ error: 'Failed to pause' });
  }
});

router.post('/:id/resume', validateGuildId, validateIntParams('id'), authenticateToken, async (req, res) => {
  try {
    const marathon = await loadManageable(req, res);
    if (!marathon) return;
    const updated = await db.setMarathonStatus(marathon.id, 'active');
    res.json(updated);
  } catch (err) {
    console.error('Error resuming marathon:', err);
    res.status(500).json({ error: 'Failed to resume' });
  }
});

// DELETE /api/marathons/:id
router.delete('/:id', validateGuildId, validateIntParams('id'), authenticateToken, async (req, res) => {
  try {
    const marathon = await loadManageable(req, res);
    if (!marathon) return;
    await db.deleteMarathon(marathon.id);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting marathon:', err);
    res.status(500).json({ error: 'Failed to delete' });
  }
});

export default router;
```

> **Note:** confirm `validateIntParams` accepts multiple param names (`validateIntParams('id', 'itemId')`). If it only accepts one, chain two calls: `validateIntParams('id'), validateIntParams('itemId')`. Check `backend/src/middleware/validate.js` before writing the item routes.

- [ ] **Step 2: Mount the router**

In `backend/src/index.js`, near the existing `app.use('/api/board', boardRoutes);` (line ~97): add the import at the top with the other route imports, and the mount with the others:

```js
import marathonRoutes from './routes/marathons.js';
```
```js
app.use('/api/marathons', marathonRoutes);
```

- [ ] **Step 3: Verify end-to-end with curl**

Start the API (`cd backend && npm run dev`). With a valid JWT in `$TOKEN` and guild in `$GUILD`:

```bash
# create
curl -s -X POST "http://localhost:3001/api/marathons?guild_id=$GUILD" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"Test Marathon"}'
# list
curl -s "http://localhost:3001/api/marathons?guild_id=$GUILD"
```
Expected: create returns a marathon row with `status:"draft"`; list returns an array containing it with `item_count:0`.

- [ ] **Step 4: Commit**

```bash
git add backend/src/routes/marathons.js backend/src/index.js
git commit -m "feat(marathons): add marathons REST routes"
```

---

## Task 4: Frontend API client methods

**Files:**
- Modify: `frontend/src/api/client.js` (append with the other exported methods)

- [ ] **Step 1: Add the methods**

Append to `frontend/src/api/client.js` (uses the existing `fetchAPI`, `GUILD_ID`):

```js
// ── Marathons ──────────────────────────────────────────────────────────────
export const getMarathons = () =>
  fetchAPI(`/api/marathons?guild_id=${GUILD_ID}`);

export const getMarathon = (id) =>
  fetchAPI(`/api/marathons/${id}?guild_id=${GUILD_ID}`);

export const createMarathon = (name, description) =>
  fetchAPI(`/api/marathons?guild_id=${GUILD_ID}`, {
    method: 'POST',
    body: JSON.stringify({ name, description })
  });

export const addMarathonItem = (id, tmdbData) =>
  fetchAPI(`/api/marathons/${id}/items?guild_id=${GUILD_ID}`, {
    method: 'POST',
    body: JSON.stringify({ tmdb_data: tmdbData })
  });

export const removeMarathonItem = (id, itemId) =>
  fetchAPI(`/api/marathons/${id}/items/${itemId}?guild_id=${GUILD_ID}`, { method: 'DELETE' });

export const reorderMarathonItems = (id, itemIds) =>
  fetchAPI(`/api/marathons/${id}/reorder?guild_id=${GUILD_ID}`, {
    method: 'PUT',
    body: JSON.stringify({ item_ids: itemIds })
  });

export const updateMarathonItemDate = (id, itemId, scheduledAt) =>
  fetchAPI(`/api/marathons/${id}/items/${itemId}?guild_id=${GUILD_ID}`, {
    method: 'PUT',
    body: JSON.stringify({ scheduled_at: scheduledAt })
  });

export const launchMarathon = (id, cadenceType, items) =>
  fetchAPI(`/api/marathons/${id}/launch?guild_id=${GUILD_ID}`, {
    method: 'POST',
    body: JSON.stringify({ cadence_type: cadenceType, items })
  });

export const pauseMarathon = (id) =>
  fetchAPI(`/api/marathons/${id}/pause?guild_id=${GUILD_ID}`, { method: 'POST' });

export const resumeMarathon = (id) =>
  fetchAPI(`/api/marathons/${id}/resume?guild_id=${GUILD_ID}`, { method: 'POST' });

export const deleteMarathon = (id) =>
  fetchAPI(`/api/marathons/${id}?guild_id=${GUILD_ID}`, { method: 'DELETE' });
```

- [ ] **Step 2: Verify import**

Run: `cd frontend && node -e "console.log('ok')"` (syntax sanity — the real check is the dev build in later tasks). Confirm no typos by eye against the route paths in Task 3.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/api/client.js
git commit -m "feat(marathons): add marathon API client methods"
```

---

## Task 5: Marathons nav, route, and browse page

**Files:**
- Modify: `frontend/src/components/layout/Header.jsx` (`PRIMARY_NAV`, line ~9)
- Modify: `frontend/src/App.jsx` (lazy import ~line 22, routes ~line 49)
- Create: `frontend/src/pages/MarathonsPage.jsx`
- Create: `frontend/src/pages/MarathonsPage.css`

- [ ] **Step 1: Add the nav item**

In `frontend/src/components/layout/Header.jsx`, add to `PRIMARY_NAV` (after the Archive entry):

```js
  { to: '/marathons',   label: 'Marathons', icon: 'film' },
```

> If a distinct icon is wanted, add one to the `Icon` component; `film` is safe (already registered).

- [ ] **Step 2: Wire the routes**

In `frontend/src/App.jsx`, add the lazy import with the others:

```js
const MarathonsPage = lazy(() => import('./pages/MarathonsPage'));
```
and the routes inside `<Routes>`:

```jsx
            <Route path="/marathons" element={<MarathonsPage />} />
            <Route path="/marathons/:id" element={<MarathonsPage />} />
```

- [ ] **Step 3: Write the browse page**

Create `frontend/src/pages/MarathonsPage.jsx`. When `:id` is present it renders `MarathonDetail` (Task 7); otherwise the browse list. The wizard (Task 6) mounts as an overlay.

```jsx
import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import * as api from '../api/client';
import { Icon } from '../components/ui';
import MarathonWizard from '../components/marathons/MarathonWizard';
import MarathonDetail from '../components/marathons/MarathonDetail';
import './MarathonsPage.css';

const STATUS_LABEL = { active: 'Active', paused: 'Paused', draft: 'Draft', completed: 'Done' };

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) : '';

function MarathonCard({ m }) {
  const posters = (m.poster_urls || []).filter(Boolean).slice(0, 4);
  const total = m.item_count || 0;
  const watched = m.watched_count || 0;
  const pct = total ? Math.round((watched / total) * 100) : 0;
  return (
    <Link to={`/marathons/${m.id}`} className="mara-card">
      <div className="mara-posters">
        {posters.length === 0 && <div className="mara-poster empty" />}
        {posters.map((url, i) => (
          <div key={i} className="mara-poster" style={{ backgroundImage: url ? `url(${url})` : 'none' }} />
        ))}
      </div>
      <div className="mara-body">
        <h3>{m.name}</h3>
        <div className="mara-meta">
          <span className={`mara-chip ${m.status}`}>{STATUS_LABEL[m.status] || m.status}</span>
          {m.cadence_type && <span className="mara-cadence">{m.cadence_type === 'binge' ? 'Back-to-back' : 'Weekly'}</span>}
        </div>
        <div className="mara-progress">
          <div className="mara-bar"><i style={{ width: `${pct}%` }} /></div>
          <div className="mara-progress-meta">
            <span>{m.next_item ? `Next: ${m.next_item.title} · ${fmtDate(m.next_item.scheduled_at)}` : (total ? 'All watched' : 'No films yet')}</span>
            <span>{watched} / {total}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}

export default function MarathonsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { showError } = useNotification();
  const [marathons, setMarathons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [wizardOpen, setWizardOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setMarathons(await api.getMarathons());
    } catch (err) {
      showError(err.message || 'Failed to load marathons');
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => { if (!id) load(); }, [id, load]);

  if (id) {
    return <MarathonDetail id={id} onBack={() => navigate('/marathons')} />;
  }

  return (
    <div className="mara-page">
      <header className="mara-header">
        <div>
          <div className="mara-eyebrow">Series &amp; Marathons</div>
          <h1>Movie Marathons</h1>
          <p>Build an ordered set of films and let it schedule itself, one a week.</p>
        </div>
        {isAuthenticated && (
          <button className="btn btn-primary" onClick={() => setWizardOpen(true)}>
            <Icon name="plus" size={16} /> New marathon
          </button>
        )}
      </header>

      {loading ? (
        <p className="muted">Loading…</p>
      ) : marathons.length === 0 ? (
        <div className="empty">
          <h3>No marathons yet.</h3>
          <p>Create one to schedule a series of movies.</p>
        </div>
      ) : (
        <div className="mara-list">
          {marathons.map((m) => <MarathonCard key={m.id} m={m} />)}
        </div>
      )}

      {wizardOpen && (
        <MarathonWizard
          onClose={() => setWizardOpen(false)}
          onLaunched={(newId) => { setWizardOpen(false); navigate(`/marathons/${newId}`); }}
          onSavedDraft={() => { setWizardOpen(false); load(); }}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Add the stylesheet**

Create `frontend/src/pages/MarathonsPage.css` (uses design tokens from `index.css`):

```css
.mara-page { max-width: 1120px; margin: 0 auto; }
.mara-header { display: flex; justify-content: space-between; align-items: flex-end; gap: 24px;
  padding: 32px 0; border-bottom: 1px solid var(--rule); margin-bottom: 32px; }
.mara-eyebrow { font-family: var(--font-mono); font-size: 11px; letter-spacing: .28em;
  text-transform: uppercase; color: var(--bone-mute); }
.mara-header h1 { font-family: var(--font-display); font-style: italic; font-weight: 400;
  font-size: var(--fs-48); margin-top: 12px; }
.mara-header p { color: var(--bone-dim); margin-top: 10px; max-width: 440px; }

.mara-list { display: flex; flex-direction: column; gap: 16px; }
.mara-card { display: grid; grid-template-columns: auto 1fr; gap: 22px; align-items: center;
  background: var(--ink-2); border: 1px solid var(--rule); border-radius: var(--r-3);
  padding: 18px 20px; text-decoration: none; color: var(--bone); transition: border-color var(--dur-1), background var(--dur-1); }
.mara-card:hover { border-color: var(--rule-strong); background: var(--ink-3); }
.mara-posters { display: flex; }
.mara-poster { width: 44px; height: 66px; border-radius: var(--r-2); margin-left: -14px;
  border: 2px solid var(--ink-2); background: var(--ink-3) center/cover no-repeat; }
.mara-poster:first-child { margin-left: 0; }
.mara-body { min-width: 0; }
.mara-body h3 { font-family: var(--font-display); font-style: italic; font-weight: 600; font-size: 20px; }
.mara-meta { display: flex; align-items: center; gap: 10px; margin: 8px 0 12px; }
.mara-chip { font-family: var(--font-mono); font-size: 10px; letter-spacing: .14em; text-transform: uppercase;
  padding: 4px 9px; border-radius: var(--r-full); border: 1px solid var(--rule-strong); color: var(--bone-dim); }
.mara-chip.active { color: var(--ember); border-color: var(--ember-dim); background: var(--ember-soft); }
.mara-chip.paused { color: var(--gold); }
.mara-cadence { font-size: 13px; color: var(--bone-dim); }
.mara-bar { height: 5px; background: var(--ink-4); border-radius: var(--r-full); overflow: hidden; max-width: 320px; }
.mara-bar i { display: block; height: 100%; background: var(--ember); border-radius: var(--r-full); }
.mara-progress-meta { display: flex; justify-content: space-between; max-width: 320px; margin-top: 8px;
  font-size: 12.5px; color: var(--bone-dim); }

/* Wizard + detail shared bits */
.mara-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.6); display: flex;
  align-items: flex-start; justify-content: center; padding: 40px 20px; overflow-y: auto; z-index: 50; }
.mara-modal { background: var(--ink-2); border: 1px solid var(--rule-strong); border-radius: var(--r-3);
  width: 100%; max-width: 760px; padding: 28px; }
.mara-modal h2 { font-family: var(--font-display); font-style: italic; font-weight: 400; font-size: var(--fs-32); }
.mara-field { margin: 18px 0; }
.mara-label { font-family: var(--font-mono); font-size: 11px; letter-spacing: .16em; text-transform: uppercase;
  color: var(--bone-dim); display: block; margin-bottom: 8px; }
.mara-row { display: flex; align-items: center; gap: 12px; }
.mara-item { display: flex; align-items: center; gap: 12px; background: var(--ink); border: 1px solid var(--rule);
  border-radius: var(--r-2); padding: 10px 12px; margin-bottom: 8px; }
.mara-item .pos { font-family: var(--font-mono); font-size: 12px; color: var(--bone-mute); width: 18px; text-align: center; }
.mara-item .thumb { width: 34px; height: 51px; border-radius: 4px; background: var(--ink-3) center/cover no-repeat; flex-shrink: 0; }
.mara-item .grow { flex: 1; min-width: 0; }
.mara-item .grow h4 { font-size: 14px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mara-item .grow .sub { font-size: 12px; color: var(--bone-mute); margin-top: 2px; }
.mara-iconbtn { background: none; border: none; color: var(--bone-mute); cursor: pointer; padding: 4px; }
.mara-iconbtn:hover { color: var(--ember); }
.mara-iconbtn.danger:hover { color: var(--red); }
.mara-actions { display: flex; justify-content: space-between; gap: 12px; margin-top: 24px;
  padding-top: 20px; border-top: 1px solid var(--rule); }
.mara-search-results { max-height: 260px; overflow-y: auto; margin-top: 8px; }
.mara-datewrap { display: flex; gap: 8px; }
.mara-datewrap input { flex: 1; }
```

- [ ] **Step 5: Verify it renders**

Run the frontend (`cd frontend && npm run dev`), open `http://localhost:5173/marathons`.
Expected: the "Movie Marathons" header + "New marathon" button render; empty state shows if no marathons; any created via curl appear as cards. (Verify UI by rendering — build/lint won't catch layout bugs.)

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/layout/Header.jsx frontend/src/App.jsx frontend/src/pages/MarathonsPage.jsx frontend/src/pages/MarathonsPage.css
git commit -m "feat(marathons): add Marathons nav, route, and browse page"
```

---

## Task 6: Create wizard (manual source + cadence + launch)

**Files:**
- Create: `frontend/src/components/marathons/MarathonWizard.jsx`

Uses `api.searchTMDB(query)` (returns `{id,title,year,posterPath,...}`) and `api.getTMDBMovie(id)` (full metadata incl. `runtime`, `backdropPath`, `genres`, etc.) so items carry complete metadata.

- [ ] **Step 1: Write the wizard**

Create `frontend/src/components/marathons/MarathonWizard.jsx`:

```jsx
import { useState } from 'react';
import { useNotification } from '../../context/NotificationContext';
import * as api from '../../api/client';
import { Icon } from '../ui';

// Map GET /api/tmdb/:id detail shape → the tmdb_data our item endpoint expects.
const toItemData = (d) => ({
  tmdbId: d.id, title: d.title, imageUrl: d.posterPath, backdropUrl: d.backdropPath,
  description: d.overview, tmdbRating: d.rating, genres: d.genres, runtime: d.runtime,
  releaseYear: d.year, tagline: d.tagline, imdbId: d.imdbId,
  originalLanguage: d.originalLanguage, trailerUrl: d.trailerUrl
});

// Local pad helper for datetime-local values.
const pad = (n) => String(n).padStart(2, '0');
const toLocalInput = (date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;

export default function MarathonWizard({ onClose, onLaunched }) {
  const { showError } = useNotification();
  const [step, setStep] = useState(1);           // 1 name, 2 lineup, 3 schedule
  const [marathonId, setMarathonId] = useState(null);
  const [name, setName] = useState('');
  const [items, setItems] = useState([]);        // {id, title, image_url, runtime, release_year, scheduled_at}
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);
  // cadence
  const [unit, setUnit] = useState('week');      // 'day' | 'week'
  const [interval, setIntervalN] = useState(1);
  const [start, setStart] = useState(toLocalInput(new Date(Date.now() + 3 * 864e5)));

  // Step 1 → create the draft so we have an id to attach items to.
  const createDraft = async () => {
    if (!name.trim()) return showError('Give the marathon a name');
    setBusy(true);
    try {
      const m = await api.createMarathon(name.trim());
      setMarathonId(m.id);
      setStep(2);
    } catch (err) { showError(err.message); } finally { setBusy(false); }
  };

  const search = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    try { setResults(await api.searchTMDB(query.trim())); }
    catch (err) { showError(err.message); } finally { setSearching(false); }
  };

  const addMovie = async (r) => {
    setBusy(true);
    try {
      const detail = await api.getTMDBMovie(r.id);       // full metadata
      const item = await api.addMarathonItem(marathonId, toItemData(detail));
      setItems((prev) => [...prev, item]);
      setResults([]); setQuery('');
    } catch (err) { showError(err.message); } finally { setBusy(false); }
  };

  const removeMovie = async (item) => {
    try {
      await api.removeMarathonItem(marathonId, item.id);
      setItems((prev) => prev.filter((i) => i.id !== item.id));
    } catch (err) { showError(err.message); }
  };

  const move = (idx, dir) => {
    setItems((prev) => {
      const next = [...prev];
      const j = idx + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
  };

  // Compute a date per item from the cadence, then let the user edit each.
  const autofill = () => {
    const base = new Date(start);
    const stepMs = (unit === 'day' ? 1 : 7) * interval * 864e5;
    setItems((prev) => prev.map((it, i) => ({
      ...it, scheduled_at: toLocalInput(new Date(base.getTime() + i * stepMs))
    })));
  };

  const setItemDate = (idx, value) =>
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, scheduled_at: value } : it)));

  const goSchedule = () => {
    if (items.length === 0) return showError('Add at least one film');
    autofill();
    setStep(3);
  };

  const launch = async () => {
    if (items.some((it) => !it.scheduled_at)) return showError('Every film needs a date');
    // Persist order first (in case the user reordered), then launch with dates.
    setBusy(true);
    try {
      await api.reorderMarathonItems(marathonId, items.map((i) => i.id));
      await api.launchMarathon(marathonId, 'interval',
        items.map((i) => ({ id: i.id, scheduled_at: new Date(i.scheduled_at).toISOString() })));
      onLaunched(marathonId);
    } catch (err) { showError(err.message); } finally { setBusy(false); }
  };

  return (
    <div className="mara-overlay" onClick={onClose}>
      <div className="mara-modal" onClick={(e) => e.stopPropagation()}>
        {step === 1 && (
          <>
            <h2>New marathon</h2>
            <div className="mara-field">
              <label className="mara-label">Marathon name</label>
              <input value={name} onChange={(e) => setName(e.target.value)}
                     placeholder="e.g. The Nolan Batman Trilogy" autoFocus />
            </div>
            <div className="mara-actions">
              <button className="btn ghost" onClick={onClose}>Cancel</button>
              <button className="btn btn-primary" disabled={busy} onClick={createDraft}>Next: add films</button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <h2>Add films</h2>
            <form className="mara-field" onSubmit={search}>
              <label className="mara-label">Search movies</label>
              <div className="mara-row">
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search TMDB…" />
                <button className="btn ghost" type="submit" disabled={searching}>
                  <Icon name="search" size={16} />
                </button>
              </div>
            </form>
            {results.length > 0 && (
              <div className="mara-search-results">
                {results.map((r) => (
                  <div key={r.id} className="mara-item">
                    <div className="thumb" style={{ backgroundImage: r.posterPath ? `url(${r.posterPath})` : 'none' }} />
                    <div className="grow"><h4>{r.title}</h4><div className="sub">{r.year || '—'}</div></div>
                    <button className="mara-iconbtn" onClick={() => addMovie(r)} disabled={busy}>
                      <Icon name="plus" size={18} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="mara-field">
              <label className="mara-label">Lineup · {items.length}</label>
              {items.map((it, idx) => (
                <div key={it.id} className="mara-item">
                  <span className="pos">{idx + 1}</span>
                  <div className="thumb" style={{ backgroundImage: it.image_url ? `url(${it.image_url})` : 'none' }} />
                  <div className="grow">
                    <h4>{it.title}</h4>
                    <div className="sub">{it.release_year || '—'}{it.runtime ? ` · ${it.runtime}m` : ''}</div>
                  </div>
                  <button className="mara-iconbtn" onClick={() => move(idx, -1)}><Icon name="chevron-up" size={16} /></button>
                  <button className="mara-iconbtn" onClick={() => move(idx, 1)}><Icon name="chevron-down" size={16} /></button>
                  <button className="mara-iconbtn danger" onClick={() => removeMovie(it)}><Icon name="x" size={16} /></button>
                </div>
              ))}
            </div>
            <div className="mara-actions">
              <button className="btn ghost" onClick={() => setStep(1)}>Back</button>
              <button className="btn btn-primary" onClick={goSchedule}>Next: schedule</button>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <h2>Schedule</h2>
            <div className="mara-field">
              <label className="mara-label">Repeat</label>
              <div className="mara-row">
                <input type="number" min="1" value={interval}
                       onChange={(e) => setIntervalN(Math.max(1, parseInt(e.target.value) || 1))} style={{ width: 80 }} />
                <select value={unit} onChange={(e) => setUnit(e.target.value)}>
                  <option value="day">day(s)</option>
                  <option value="week">week(s)</option>
                </select>
                <label className="mara-label" style={{ margin: 0 }}>starting</label>
                <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
                <button className="btn ghost" onClick={autofill}>Auto-fill dates</button>
              </div>
            </div>
            <div className="mara-field">
              <label className="mara-label">Dates — edit any by hand</label>
              {items.map((it, idx) => (
                <div key={it.id} className="mara-item">
                  <span className="pos">{idx + 1}</span>
                  <div className="grow"><h4>{it.title}</h4></div>
                  <input type="datetime-local" value={it.scheduled_at || ''}
                         onChange={(e) => setItemDate(idx, e.target.value)} />
                </div>
              ))}
            </div>
            <div className="mara-actions">
              <button className="btn ghost" onClick={() => setStep(2)}>Back</button>
              <button className="btn btn-primary" disabled={busy} onClick={launch}>Launch marathon</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
```

> **Icon names:** `plus`, `search`, `x`, `chevron-up`, `chevron-down` — confirm these exist in `frontend/src/components/ui/Icon`. If a name is missing, substitute a registered one (the Icon set is small; check before running).

- [ ] **Step 2: Verify the full create flow**

With frontend + backend running and logged in, click **New marathon** → name it → add 2–3 films via search → Next → Auto-fill → adjust a date → **Launch**. Expected: you land on the detail page (Task 7), and the DB shows `marathons.status='active'` with `marathon_items.scheduled_at` populated:
```bash
psql "$DATABASE_URL" -c "SELECT id,status,cadence_type,current_position FROM marathons ORDER BY id DESC LIMIT 1;"
psql "$DATABASE_URL" -c "SELECT position,title,status,scheduled_at FROM marathon_items ORDER BY id DESC LIMIT 5;"
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/marathons/MarathonWizard.jsx
git commit -m "feat(marathons): add create wizard (manual source + cadence)"
```

---

## Task 7: Marathon detail view

**Files:**
- Create: `frontend/src/components/marathons/MarathonDetail.jsx`

- [ ] **Step 1: Write the detail component**

Create `frontend/src/components/marathons/MarathonDetail.jsx`:

```jsx
import { useEffect, useState, useCallback } from 'react';
import { useNotification } from '../../context/NotificationContext';
import * as api from '../../api/client';
import { Icon } from '../ui';

const fmt = (d) =>
  d ? new Date(d).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'unscheduled';

const itemState = (it) => {
  if (!it.scheduled_at) return 'pending';
  return new Date(it.scheduled_at) < new Date() ? 'watched' : 'upcoming';
};

export default function MarathonDetail({ id, onBack }) {
  const { showError, showSuccess } = useNotification();
  const [m, setM] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { setM(await api.getMarathon(id)); }
    catch (err) { showError(err.message); } finally { setLoading(false); }
  }, [id, showError]);

  useEffect(() => { load(); }, [load]);

  const doAction = async (fn, msg) => {
    try { await fn(); showSuccess(msg); load(); }
    catch (err) { showError(err.message); }
  };

  if (loading) return <p className="muted">Loading…</p>;
  if (!m) return <p className="muted">Marathon not found.</p>;

  const items = m.items || [];
  const total = items.length;
  const watched = items.filter((it) => itemState(it) === 'watched').length;
  const pct = total ? Math.round((watched / total) * 100) : 0;
  const nextItem = items.find((it) => itemState(it) !== 'watched');

  return (
    <div className="mara-page">
      <button className="btn text" onClick={onBack}><Icon name="chevron-left" size={16} /> All marathons</button>

      <header className="mara-header">
        <div>
          <div className="mara-eyebrow">Marathon · {m.cadence_type === 'binge' ? 'Back-to-back' : 'Weekly'}</div>
          <h1>{m.name}</h1>
          <div className="mara-meta">
            <span className={`mara-chip ${m.status}`}>{m.status}</span>
            <span className="mara-cadence">{m.created_by_name ? `by ${m.created_by_name}` : ''} · {total} films</span>
          </div>
        </div>
        {m.is_owner && (
          <div className="mara-row">
            {m.status === 'active' && <button className="btn ghost" onClick={() => doAction(() => api.pauseMarathon(m.id), 'Paused')}><Icon name="pause" size={16} /> Pause</button>}
            {m.status === 'paused' && <button className="btn ghost" onClick={() => doAction(() => api.resumeMarathon(m.id), 'Resumed')}><Icon name="play" size={16} /> Resume</button>}
            <button className="btn ghost danger" onClick={() => doAction(() => api.deleteMarathon(m.id), 'Deleted')}><Icon name="trash" size={16} /></button>
          </div>
        )}
      </header>

      <div className="mara-field">
        <div className="mara-bar" style={{ maxWidth: 'none' }}><i style={{ width: `${pct}%` }} /></div>
        <div className="mara-progress-meta" style={{ maxWidth: 'none' }}>
          <span>{watched} of {total} watched</span>
          <span>{nextItem ? `Next: ${nextItem.title} · ${fmt(nextItem.scheduled_at)}` : 'Complete'}</span>
        </div>
      </div>

      <div className="mara-field">
        <label className="mara-label">The lineup</label>
        {items.map((it, idx) => {
          const st = itemState(it);
          return (
            <div key={it.id} className="mara-item">
              <span className="pos">{idx + 1}</span>
              <div className="thumb" style={{ backgroundImage: it.image_url ? `url(${it.image_url})` : 'none' }} />
              <div className="grow">
                <h4>{it.title}</h4>
                <div className="sub">
                  {st === 'watched' ? 'Watched' : st === 'upcoming' ? (it.id === nextItem?.id ? 'Next up' : 'Upcoming') : 'Not scheduled'}
                  {' · '}{fmt(it.scheduled_at)}
                </div>
              </div>
              {st === 'watched' && <Icon name="check" size={16} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

> **Icon names:** `chevron-left`, `pause`, `play`, `trash`, `check` — confirm against the `Icon` component and substitute if needed.

- [ ] **Step 2: Verify**

Open the detail page for a launched marathon (`/marathons/:id`). Expected: header with status chip, progress bar, "Next: …" line, and the lineup with per-item state. As owner, Pause flips the status to `paused` (verify the chip updates and re-query the DB).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/marathons/MarathonDetail.jsx
git commit -m "feat(marathons): add marathon detail view with pause/resume/delete"
```

---

## Task 8: Bot marathon roll-out job

**Files:**
- Modify: `bot/src/models/index.js` (append helpers)
- Create: `bot/src/jobs/marathonProcessor.js`
- Modify: `bot/src/events/ready.js` (start the job where `startAnnouncementProcessorJob(client)` is called)

- [ ] **Step 1: Add bot model helpers**

Append to `bot/src/models/index.js`:

```js
// ── Marathons (bot side) ─────────────────────────────────────────────────────
export const getActiveMarathons = async () => {
  const result = await pool.query(`SELECT * FROM marathons WHERE status = 'active'`);
  return result.rows;
};

// Next film still waiting to be queued, in order.
export const getNextPendingMarathonItem = async (marathonId) => {
  const result = await pool.query(
    `SELECT * FROM marathon_items
     WHERE marathon_id = $1 AND status = 'pending'
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
// Fires NOTIFY so the existing announcement processor posts it immediately.
export const createMarathonPendingAnnouncement = async (item, marathon, total) => {
  const title = item.release_year ? `${item.title} (${item.release_year})` : item.title;
  const result = await pool.query(
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
  try { await pool.query('NOTIFY movie_announcement'); } catch (err) {
    console.error('Failed to NOTIFY movie_announcement:', err.message);
  }
  return result.rows[0];
};

export const markMarathonItemScheduled = async (itemId) => {
  await pool.query(`UPDATE marathon_items SET status = 'scheduled' WHERE id = $1`, [itemId]);
};

export const advanceMarathonPosition = async (marathonId, position) => {
  await pool.query(
    `UPDATE marathons SET current_position = $2, updated_at = NOW() WHERE id = $1`,
    [marathonId, position]
  );
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
```

- [ ] **Step 2: Write the job**

Create `bot/src/jobs/marathonProcessor.js`:

```js
import cron from 'node-cron';
import {
  getActiveMarathons, getNextPendingMarathonItem, countMarathonItems,
  createMarathonPendingAnnouncement, markMarathonItemScheduled,
  advanceMarathonPosition, completeMarathonIfDone
} from '../models/index.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('marathonProcessor');

const CRON_EVERY_5_MINUTES = '*/5 * * * *';
// How far ahead of a film's date we queue its announcement. This is what makes
// the marathon "roll out one at a time" — only near-term films are posted.
const ANNOUNCE_LEAD_MS = 72 * 60 * 60 * 1000; // 3 days

let running = false;

// Queue the next due film for every active marathon (one film per marathon per pass).
export const processMarathons = async () => {
  if (running) return;
  running = true;
  try {
    const marathons = await getActiveMarathons();
    for (const marathon of marathons) {
      try {
        const item = await getNextPendingMarathonItem(marathon.id);
        if (!item) { await completeMarathonIfDone(marathon.id); continue; }
        if (!item.scheduled_at) continue;
        const due = new Date(item.scheduled_at).getTime() - Date.now() <= ANNOUNCE_LEAD_MS;
        if (!due) continue;

        const total = await countMarathonItems(marathon.id);
        await createMarathonPendingAnnouncement(item, marathon, total);
        await markMarathonItemScheduled(item.id);
        await advanceMarathonPosition(marathon.id, item.position + 1);
        logger.info(`Queued marathon ${marathon.id} · item ${item.id} (${item.title})`);
      } catch (err) {
        logger.error(`Error advancing marathon ${marathon.id}`, err);
      }
    }
  } finally {
    running = false;
  }
};

export const startMarathonProcessorJob = () => {
  cron.schedule(CRON_EVERY_5_MINUTES, () => processMarathons());
  logger.info('Marathon processor job scheduled (runs every 5 minutes)');
};
```

- [ ] **Step 3: Start the job**

In `bot/src/events/ready.js`, find where `startAnnouncementProcessorJob(client)` is called and add next to it:

```js
import { startMarathonProcessorJob } from '../jobs/marathonProcessor.js';
```
```js
startMarathonProcessorJob();
```

- [ ] **Step 4: Verify the queueing (without waiting 3 days)**

Temporarily set a launched marathon's first item date to now, then run one pass:
```bash
psql "$DATABASE_URL" -c "UPDATE marathon_items SET scheduled_at = NOW() + INTERVAL '1 hour', status='pending' WHERE id = <first_item_id>;"
psql "$DATABASE_URL" -c "UPDATE marathons SET status='active', current_position=0 WHERE id = <marathon_id>;"
```
Run the bot (`cd bot && npm run dev`). Within 5 minutes (or invoke `processMarathons()` manually via a one-off script), expect a new `pending_announcements` row with `marathon_id`/`marathon_name` set, and the item flipped to `status='scheduled'`:
```bash
psql "$DATABASE_URL" -c "SELECT id, title, marathon_id, marathon_position, marathon_total FROM pending_announcements ORDER BY id DESC LIMIT 1;"
```

- [ ] **Step 5: Commit**

```bash
git add bot/src/models/index.js bot/src/jobs/marathonProcessor.js bot/src/events/ready.js
git commit -m "feat(marathons): add bot marathonProcessor roll-out job"
```

---

## Task 9: Marathon-aware announcement + item back-link

**Files:**
- Modify: `bot/src/jobs/announcementProcessor.js` (`processAnnouncement`, ~line 110)

- [ ] **Step 1: Import the back-link helpers**

At the top of `bot/src/jobs/announcementProcessor.js`, extend the model import:

```js
import {
  getPendingAnnouncements, markAnnouncementProcessed, createMovieNight, findOrCreateUser,
  linkMarathonItemMovieNight, completeMarathonIfDone
} from '../models/index.js';
```

- [ ] **Step 2: Add the ribbon to the embed and back-link the movie night**

Replace the body of `processAnnouncement` (from the `const embed = createAnnouncementEmbed(...)` call through the `createMovieNight(...)` call and `markAnnouncementProcessed`) with:

```js
  // Create the announcement embed
  const embed = createAnnouncementEmbed(
    announcement.title,
    scheduledAt,
    announcement.image_url,
    announcerName
  );

  // Marathon context: ribbon + progress, when this announcement is part of a marathon.
  if (announcement.marathon_name) {
    embed.setAuthor({ name: announcement.marathon_name });
    embed.addFields({
      name: 'Marathon',
      value: `Film ${announcement.marathon_position} of ${announcement.marathon_total}`,
      inline: true
    });
  }

  // Send the announcement with role ping
  const content = MOVIE_NIGHT_ROLE_ID ? `<@&${MOVIE_NIGHT_ROLE_ID}>` : undefined;
  const reply = await channel.send({ content, embeds: [embed] });

  const userId = announcement.user_id;

  // Create the movie night in the database
  const movieNight = await createMovieNight(
    announcement.title,
    scheduledAt,
    userId,
    announcement.guild_id,
    channel.id,
    reply.id,
    announcement.image_url,
    {
      description: announcement.description,
      tmdbId: announcement.tmdb_id,
      tmdbRating: announcement.tmdb_rating,
      genres: announcement.genres,
      runtime: announcement.runtime,
      releaseYear: announcement.release_year,
      backdropUrl: announcement.backdrop_url,
      imdbId: announcement.imdb_id,
      trailerUrl: announcement.trailer_url
    },
    announcement.is_test || false
  );

  // Back-link the marathon item and complete the marathon if this was the last film.
  if (announcement.marathon_item_id) {
    await linkMarathonItemMovieNight(announcement.marathon_item_id, movieNight.id);
    await completeMarathonIfDone(announcement.marathon_id);
  }

  // Mark as processed
  await markAnnouncementProcessed(announcement.id, 'processed');

  logger.info(`Processed announcement: ${announcement.title} (ID: ${announcement.id})`);
```

> This only *adds* behavior; a non-marathon announcement (`marathon_name`/`marathon_item_id` null) posts exactly as before. `createMovieNight` already `RETURNING *`, so `movieNight.id` is available.

- [ ] **Step 2: Verify the full loop**

Using the marathon from Task 8 Step 4 (item date set to near-now), let the bot run. Expected:
1. `marathonProcessor` queues the film → `pending_announcements` row with marathon columns.
2. `announcementProcessor` posts a Discord embed showing the marathon name + "Film 1 of N", creates a `movie_night`, and sets `marathon_items.scheduled_movie_night_id`:
```bash
psql "$DATABASE_URL" -c "SELECT id, title, scheduled_movie_night_id, status FROM marathon_items WHERE scheduled_movie_night_id IS NOT NULL ORDER BY id DESC LIMIT 1;"
```
3. Rate/attend on that movie night via the web works unchanged (it's an ordinary `movie_night`).

- [ ] **Step 3: Commit**

```bash
git add bot/src/jobs/announcementProcessor.js
git commit -m "feat(marathons): marathon ribbon on embeds + back-link movie night to item"
```

---

## Final verification (on Railway)

- [ ] Deploy the branch; migrations run on `npm start`.
- [ ] Create a manual marathon of 2 short films, Weekly, first date ~today.
- [ ] Confirm the bot posts film 1 with the marathon ribbon and creates a movie night.
- [ ] Advance/adjust the second film's date to today; confirm it posts on the next pass and the marathon flips to `completed` after both dates pass.
- [ ] Pause/resume a marathon and confirm the roll-out stops/starts.

---

## Self-Review

**Spec coverage (Plan 1 scope):**
- Tables `marathons` + `marathon_items` → Task 1 ✓
- Backend model + routes (CRUD, reorder, item dates, launch, pause/resume, delete) → Tasks 2–3 ✓
- Manual source + cadence template (Daily/Weekly/Custom interval) + editable dates → Task 6 ✓
- Roll-out one-at-a-time via lead window + existing pipeline → Tasks 8–9 ✓
- Weekly Discord embed with ribbon + progress; each embed still creates a movie_night → Task 9 ✓
- Any-logged-in-user permissions; owner/admin for edits → Task 3 ✓
- Marathons in primary nav; browse + detail → Tasks 5, 7 ✓
- No collision logic (nothing added) ✓
- *Deferred by design:* franchise/person/Gemini sources, binge cadence, home calendar/inline scheduler → Plans 2–4.

**Placeholder scan:** No TBD/TODO. Three "confirm the name exists" notes (`validateIntParams` arity, `Icon` names) are verification instructions, not missing content — each has a concrete fallback.

**Type/name consistency:** client method names ↔ route paths ↔ model functions checked: `launchMarathon(id, cadenceType, items)` (client) → `POST /:id/launch {cadence_type, items}` (route) → `launchMarathon(marathonId, cadenceType, items)` (model). `item.scheduled_at`, `marathon_item_id`, `marathon_name`, `marathon_position`, `marathon_total` are used consistently across bot insert, embed read, and back-link. `toItemData` output keys match `addMarathonItem`'s destructured `movie` fields.
