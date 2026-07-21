# Suggestion Board Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the session-based voting feature with an always-on Suggestion Board where any signed-in user suggests a movie, everyone upvotes as many as they like, and any user can announce a suggestion to a real movie night.

**Architecture:** Two new guild-scoped tables (`board_suggestions`, `board_upvotes`). A new `/api/board` Express router backed by a `models/board.js` domain file. A self-contained `SuggestionBoard.jsx` React component replaces the "Vote" tab in the Home sidebar. Announcing reuses the existing `createPendingAnnouncement()` → `announcementProcessor` pipeline, so the bot posts the Discord embed and creates the movie night unchanged. The old voting tables, routes, frontend, and bot commands/handlers are removed.

**Tech Stack:** Express + pg (raw parameterized SQL, ESM), React 18 + Vite (plain CSS, design tokens), Discord.js.

**Spec:** `docs/superpowers/specs/2026-07-22-suggestion-board-design.md`

**Testing note:** This repo has no test framework (per CLAUDE.md). Each task ends with a manual verification step and a commit. Local Postgres is usually not running (per project memory), so DB-touching verification may need the deployed site; where possible, verify with `node --check` / build steps locally.

---

## File Structure

**Backend**
- Create `backend/src/models/board.js` — all board DB operations.
- Create `backend/src/routes/board.js` — `/api/board` router.
- Modify `backend/src/models/index.js` — swap the `voting.js` barrel export for `board.js`.
- Modify `backend/src/index.js` — mount `/api/board`, remove `/api/voting`.
- Modify `backend/src/config/migrate.js` — create the two tables + indexes, drop the old voting tables.
- Delete `backend/src/models/voting.js`, `backend/src/routes/voting.js`.

**Frontend**
- Create `frontend/src/components/home/SuggestionBoard.jsx` — self-contained board (fetch, suggest, upvote, announce, delete).
- Modify `frontend/src/api/client.js` — replace voting methods with board methods.
- Modify `frontend/src/pages/Home.jsx` — render `SuggestionBoard` in the sidebar's second tab; drop voting state/handlers.
- Modify `frontend/src/pages/Home.css` — add board styles.
- Modify `frontend/src/components/home/index.js` — drop `VotingSection` export, add `SuggestionBoard`.
- Delete `frontend/src/components/home/VotingSection.jsx` (dead code).

**Bot**
- Delete `bot/src/commands/startvote.js`, `bot/src/commands/endvote.js`, `bot/src/commands/suggest.js`, `bot/src/commands/admin.js`, `bot/src/utils/votingEmbed.js`, and the `bot/src/handlers/voting/` directory.
- Modify `bot/src/handlers/index.js` — remove the voting handler re-exports.
- Modify `bot/src/events/interactionCreate.js` — remove voting imports and button/modal/select routing.
- Modify `bot/src/commands/help.js` — remove voting command entries.

---

## PHASE 1 — Backend

### Task 1: Database migration for board tables

**Files:**
- Modify: `backend/src/config/migrate.js`

- [ ] **Step 1: Add the two CREATE TABLE blocks.** In `migrate.js`, find the voting tables block that starts with the comment `// Voting sessions table` (around line 131). Immediately **after** the `movie_suggestions` / `votes` create blocks in that section (before the next unrelated table), add:

```javascript
    // ── Suggestion board (replaces voting) ─────────────────────────────
    // Standing, guild-scoped board. Anyone suggests; everyone upvotes
    // (one heart each); any user can announce a suggestion to a movie night.
    await client.query(`
      CREATE TABLE IF NOT EXISTS board_suggestions (
        id SERIAL PRIMARY KEY,
        guild_id VARCHAR(20) NOT NULL,
        suggested_by INTEGER REFERENCES users(id),
        status VARCHAR(20) DEFAULT 'open',
        scheduled_at TIMESTAMP,
        scheduled_movie_night_id INTEGER,
        title VARCHAR(255) NOT NULL,
        image_url VARCHAR(500),
        backdrop_url VARCHAR(500),
        description TEXT,
        tmdb_id INTEGER,
        tmdb_rating DECIMAL(3,1),
        genres VARCHAR(255),
        runtime INTEGER,
        release_year INTEGER,
        tagline VARCHAR(500),
        imdb_id VARCHAR(20),
        original_language VARCHAR(10),
        collection_name VARCHAR(255),
        trailer_url VARCHAR(500),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS board_upvotes (
        id SERIAL PRIMARY KEY,
        suggestion_id INTEGER REFERENCES board_suggestions(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(suggestion_id, user_id)
      )
    `);
```

> Note: use the same client/query variable the surrounding migration code uses. If the file uses `pool.query(...)` rather than `client.query(...)`, match that. Check the lines around the voting block and mirror them exactly.

- [ ] **Step 2: Add the indexes.** Find the index section (around line 354, `CREATE INDEX IF NOT EXISTS idx_voting_sessions_guild ...`). Add alongside it:

```javascript
    await client.query(`CREATE INDEX IF NOT EXISTS idx_board_suggestions_guild ON board_suggestions(guild_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_board_upvotes_suggestion ON board_upvotes(suggestion_id)`);
```

(Match the exact call style used by the neighboring index statements.)

- [ ] **Step 3: Drop the old voting tables.** At the **end** of the migration's table section (after all CREATE/ALTER/INDEX statements, still inside the transaction), add:

```javascript
    // Retire the legacy voting feature — replaced by the suggestion board.
    await client.query(`DROP TABLE IF EXISTS votes, movie_suggestions, voting_sessions CASCADE`);
```

Also **remove** the now-dead `idx_voting_sessions_guild` and `idx_suggestions_session` index-creation lines (they reference dropped tables). And remove the original `voting_sessions` / `movie_suggestions` / `votes` CREATE blocks — they are superseded. (Leaving the CREATEs before the DROP would just create-then-drop each run; delete them to keep the migration clean.)

- [ ] **Step 4: Syntax-check.**

Run: `node --check backend/src/config/migrate.js`
Expected: no output (exit 0).

- [ ] **Step 5: (If local Postgres available) run the migration.**

Run: `cd backend && npm run db:migrate`
Expected: completes without error. If Postgres isn't running locally, skip — this is verified on deploy.

- [ ] **Step 6: Commit.**

```bash
git add backend/src/config/migrate.js
git commit -m "db: add board_suggestions/board_upvotes, drop voting tables"
```

---

### Task 2: Board model (`models/board.js`)

**Files:**
- Create: `backend/src/models/board.js`
- Modify: `backend/src/models/index.js`
- Delete: `backend/src/models/voting.js`

- [ ] **Step 1: Create `backend/src/models/board.js`** with the full contents:

```javascript
import pool from '../config/database.js';

// Insert a new suggestion. tmdbData carries the TMDB metadata columns.
export const createBoardSuggestion = async (guildId, suggestedBy, title, imageUrl, tmdbData = {}) => {
  const {
    description, tmdbId, tmdbRating, genres, runtime, releaseYear,
    backdropUrl, tagline, imdbId, originalLanguage, collectionName, trailerUrl
  } = tmdbData;
  const result = await pool.query(
    `INSERT INTO board_suggestions
       (guild_id, suggested_by, title, image_url, description, tmdb_id, tmdb_rating,
        genres, runtime, release_year, backdrop_url, tagline, imdb_id,
        original_language, collection_name, trailer_url)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
     RETURNING *`,
    [
      guildId, suggestedBy, title, imageUrl || null, description || null,
      tmdbId || null, tmdbRating || null, genres || null, runtime || null,
      releaseYear || null, backdropUrl || null, tagline || null, imdbId || null,
      originalLanguage || null, collectionName || null, trailerUrl || null
    ]
  );
  return result.rows[0];
};

// Active board: open suggestions + still-upcoming scheduled ones.
// Past-dated scheduled rows drop off automatically (auto-clear, no cron).
// Includes aggregated upvote_count and, when userId given, user_upvoted.
export const getBoardSuggestions = async (guildId, userId = null) => {
  const result = await pool.query(
    `SELECT bs.*,
            u.username  AS suggested_by_name,
            u.discord_id AS suggested_by_discord_id,
            COUNT(bu.id) AS upvote_count,
            BOOL_OR(bu.user_id = $2) AS user_upvoted
     FROM board_suggestions bs
     LEFT JOIN users u ON bs.suggested_by = u.id
     LEFT JOIN board_upvotes bu ON bs.id = bu.suggestion_id
     WHERE bs.guild_id = $1
       AND (bs.status = 'open' OR (bs.status = 'scheduled' AND bs.scheduled_at >= NOW()))
     GROUP BY bs.id, u.username, u.discord_id
     ORDER BY upvote_count DESC, bs.created_at DESC`,
    [guildId, userId]
  );
  return result.rows;
};

export const getBoardSuggestionById = async (id) => {
  const result = await pool.query(
    `SELECT bs.*, u.username AS suggested_by_name
     FROM board_suggestions bs
     LEFT JOIN users u ON bs.suggested_by = u.id
     WHERE bs.id = $1`,
    [id]
  );
  return result.rows[0];
};

// Dedupe guard: is this TMDB movie already an OPEN suggestion in this guild?
export const findOpenSuggestionByTmdb = async (guildId, tmdbId) => {
  if (!tmdbId) return undefined;
  const result = await pool.query(
    `SELECT * FROM board_suggestions
     WHERE guild_id = $1 AND tmdb_id = $2 AND status = 'open'
     LIMIT 1`,
    [guildId, tmdbId]
  );
  return result.rows[0];
};

export const addUpvote = async (suggestionId, userId) => {
  const result = await pool.query(
    `INSERT INTO board_upvotes (suggestion_id, user_id)
     VALUES ($1, $2)
     ON CONFLICT (suggestion_id, user_id) DO NOTHING
     RETURNING *`,
    [suggestionId, userId]
  );
  return result.rows[0];
};

export const removeUpvote = async (suggestionId, userId) => {
  const result = await pool.query(
    `DELETE FROM board_upvotes WHERE suggestion_id = $1 AND user_id = $2 RETURNING *`,
    [suggestionId, userId]
  );
  return result.rows[0];
};

// Voter avatars per suggestion (parity with the old voter-avatar display).
export const getUpvotersForBoard = async (guildId) => {
  const result = await pool.query(
    `SELECT bu.suggestion_id, u.discord_id, u.username, u.avatar
     FROM board_upvotes bu
     JOIN users u ON bu.user_id = u.id
     JOIN board_suggestions bs ON bu.suggestion_id = bs.id
     WHERE bs.guild_id = $1
     ORDER BY bu.created_at ASC`,
    [guildId]
  );
  return result.rows;
};

export const markSuggestionScheduled = async (id, scheduledAt, movieNightId = null) => {
  const result = await pool.query(
    `UPDATE board_suggestions
     SET status = 'scheduled', scheduled_at = $2, scheduled_movie_night_id = $3
     WHERE id = $1
     RETURNING *`,
    [id, scheduledAt, movieNightId]
  );
  return result.rows[0];
};

export const deleteBoardSuggestion = async (id) => {
  const result = await pool.query(
    `DELETE FROM board_suggestions WHERE id = $1 RETURNING *`,
    [id]
  );
  return result.rows[0];
};
```

- [ ] **Step 2: Update the barrel export.** In `backend/src/models/index.js`, replace the line `export * from './voting.js';` with `export * from './board.js';`.

- [ ] **Step 3: Delete the old model.**

```bash
git rm backend/src/models/voting.js
```

- [ ] **Step 4: Syntax-check.**

Run: `node --check backend/src/models/board.js && node --check backend/src/models/index.js`
Expected: no output (exit 0).

- [ ] **Step 5: Commit.**

```bash
git add backend/src/models/board.js backend/src/models/index.js
git commit -m "models: add board domain, remove voting model"
```

---

### Task 3: Board routes (`routes/board.js`)

**Files:**
- Create: `backend/src/routes/board.js`
- Modify: `backend/src/index.js`
- Delete: `backend/src/routes/voting.js`

- [ ] **Step 1: Create `backend/src/routes/board.js`** with the full contents:

```javascript
import { Router } from 'express';
import { authenticateToken, optionalAuth } from '../middleware/auth.js';
import { validateIntParams, validateGuildId } from '../middleware/validate.js';
import { isAdmin } from '../utils/admin.js';
import * as db from '../models/index.js';

const router = Router();

const GUILD_ID = process.env.GUILD_ID;

// GET /api/board — the active board + caller's own upvote state.
router.get('/', validateGuildId, optionalAuth, async (req, res) => {
  try {
    const userId = req.user ? req.user.id : null;
    const suggestions = await db.getBoardSuggestions(req.guildId, userId);
    const upvoters = await db.getUpvotersForBoard(req.guildId);

    const byId = {};
    upvoters.forEach((v) => {
      (byId[v.suggestion_id] ||= []).push({
        discord_id: v.discord_id,
        username: v.username,
        avatar: v.avatar
      });
    });

    res.json(suggestions.map((s) => ({ ...s, upvoters: byId[s.id] || [] })));
  } catch (err) {
    console.error('Error fetching board:', err);
    res.status(500).json({ error: 'Failed to fetch board' });
  }
});

// POST /api/board/suggestions — add a suggestion (auth). Dedupe by tmdb_id.
router.post('/suggestions', validateGuildId, authenticateToken, async (req, res) => {
  const { title, image_url, tmdb_data } = req.body;

  if (!title || typeof title !== 'string') {
    return res.status(400).json({ error: 'Title is required' });
  }
  if (title.length > 500) {
    return res.status(400).json({ error: 'Title too long (max 500 characters)' });
  }

  try {
    const tmdbId = tmdb_data && tmdb_data.tmdbId;
    if (tmdbId) {
      const existing = await db.findOpenSuggestionByTmdb(req.guildId, tmdbId);
      if (existing) {
        return res.status(409).json({ error: 'That movie is already on the board', suggestion: existing });
      }
    }

    const suggestion = await db.createBoardSuggestion(
      req.guildId,
      req.user.id,
      title,
      image_url,
      tmdb_data || {}
    );
    res.json(suggestion);
  } catch (err) {
    console.error('Error creating suggestion:', err);
    res.status(500).json({ error: 'Failed to create suggestion' });
  }
});

// POST /api/board/suggestions/:id/upvote — add caller's heart (auth).
router.post('/suggestions/:id/upvote', validateIntParams('id'), authenticateToken, async (req, res) => {
  try {
    const suggestion = await db.getBoardSuggestionById(parseInt(req.params.id));
    if (!suggestion) return res.status(404).json({ error: 'Suggestion not found' });
    await db.addUpvote(parseInt(req.params.id), req.user.id);
    res.json({ success: true });
  } catch (err) {
    console.error('Error adding upvote:', err);
    res.status(500).json({ error: 'Failed to upvote' });
  }
});

// DELETE /api/board/suggestions/:id/upvote — remove caller's heart (auth).
router.delete('/suggestions/:id/upvote', validateIntParams('id'), authenticateToken, async (req, res) => {
  try {
    await db.removeUpvote(parseInt(req.params.id), req.user.id);
    res.json({ success: true });
  } catch (err) {
    console.error('Error removing upvote:', err);
    res.status(500).json({ error: 'Failed to remove upvote' });
  }
});

// POST /api/board/suggestions/:id/announce — any auth user promotes to a movie night.
router.post('/suggestions/:id/announce', validateIntParams('id'), authenticateToken, async (req, res) => {
  const { scheduled_at } = req.body;

  if (!scheduled_at) {
    return res.status(400).json({ error: 'scheduled_at is required' });
  }
  const scheduledDate = new Date(scheduled_at);
  if (isNaN(scheduledDate.getTime())) {
    return res.status(400).json({ error: 'Invalid scheduled_at' });
  }
  if (scheduledDate <= new Date()) {
    return res.status(400).json({ error: 'The time must be in the future' });
  }

  try {
    const s = await db.getBoardSuggestionById(parseInt(req.params.id));
    if (!s) return res.status(404).json({ error: 'Suggestion not found' });
    if (s.status === 'scheduled') {
      return res.status(409).json({ error: 'That suggestion is already scheduled' });
    }

    await db.createPendingAnnouncement({
      guildId: s.guild_id,
      channelId: null,
      userId: req.user.id,
      title: s.release_year ? `${s.title} (${s.release_year})` : s.title,
      imageUrl: s.image_url,
      backdropUrl: s.backdrop_url,
      description: s.description,
      tmdbId: s.tmdb_id,
      imdbId: s.imdb_id,
      tmdbRating: s.tmdb_rating,
      genres: s.genres,
      runtime: s.runtime,
      releaseYear: s.release_year,
      trailerUrl: s.trailer_url,
      scheduledAt: scheduledDate
    });

    const updated = await db.markSuggestionScheduled(s.id, scheduledDate);
    res.json({ success: true, suggestion: updated });
  } catch (err) {
    console.error('Error announcing suggestion:', err);
    res.status(500).json({ error: 'Failed to announce suggestion' });
  }
});

// DELETE /api/board/suggestions/:id — suggester removes own; admin removes any.
router.delete('/suggestions/:id', validateIntParams('id'), authenticateToken, async (req, res) => {
  try {
    const s = await db.getBoardSuggestionById(parseInt(req.params.id));
    if (!s) return res.status(404).json({ error: 'Suggestion not found' });

    const owns = s.suggested_by === req.user.id;
    if (!owns && !isAdmin(req.user.discord_id)) {
      return res.status(403).json({ error: 'Not allowed' });
    }

    await db.deleteBoardSuggestion(s.id);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting suggestion:', err);
    res.status(500).json({ error: 'Failed to delete suggestion' });
  }
});

export default router;
```

> Verify the middleware import path/names match `routes/voting.js` (it imported `validateIntParams, validateGuildId, validateDate` from `../middleware/validate.js`). We only need `validateIntParams` and `validateGuildId`. `validateGuildId` sets `req.guildId` from the `guild_id` query param (GET) — for POST routes it reads the body/query; confirm it populates `req.guildId` for the POST `/suggestions` route (the old code passed `guild_id` in the body for POST `/`). If `validateGuildId` only reads the query string, have the frontend send `guild_id` as a query param on POST `/suggestions` (the client method in Task 5 does this).

- [ ] **Step 2: Mount the router, remove the voting mount.** In `backend/src/index.js`:
  - Replace the import `import votingRoutes from './routes/voting.js';` with `import boardRoutes from './routes/board.js';`
  - Replace `app.use('/api/voting', votingRoutes);` with `app.use('/api/board', boardRoutes);`

- [ ] **Step 3: Delete the old route.**

```bash
git rm backend/src/routes/voting.js
```

- [ ] **Step 4: Syntax-check.**

Run: `node --check backend/src/routes/board.js && node --check backend/src/index.js`
Expected: no output (exit 0).

- [ ] **Step 5: (If local Postgres available) smoke-test the GET.**

Run backend (`cd backend && npm run dev`), then:
`curl "http://localhost:3001/api/board?guild_id=$env:VITE_GUILD_ID"`
Expected: `[]` (empty board) or a JSON array — not a 500. Skip if no local DB.

- [ ] **Step 6: Commit.**

```bash
git add backend/src/routes/board.js backend/src/index.js
git commit -m "api: add /api/board routes, remove /api/voting"
```

---

## PHASE 2 — Frontend

### Task 4: API client methods

**Files:**
- Modify: `frontend/src/api/client.js`

- [ ] **Step 1: Replace the voting block.** In `frontend/src/api/client.js`, delete the entire `// Voting` block (the `getActiveVoting`, `createVotingSession`, `closeVotingSession`, `deleteVotingSession`, `submitSuggestion`, `castVote`, `removeVote` exports, ~lines 130-165) and replace with:

```javascript
// Suggestion board
export const getBoard = () =>
  fetchAPI(`/api/board?guild_id=${GUILD_ID}`);

export const addSuggestion = (title, imageUrl, tmdbData = null) =>
  fetchAPI(`/api/board/suggestions?guild_id=${GUILD_ID}`, {
    method: 'POST',
    body: JSON.stringify({ title, image_url: imageUrl, tmdb_data: tmdbData })
  });

export const upvoteSuggestion = (suggestionId) =>
  fetchAPI(`/api/board/suggestions/${suggestionId}/upvote`, {
    method: 'POST'
  });

export const removeUpvote = (suggestionId) =>
  fetchAPI(`/api/board/suggestions/${suggestionId}/upvote`, {
    method: 'DELETE'
  });

export const announceSuggestion = (suggestionId, scheduledAt) =>
  fetchAPI(`/api/board/suggestions/${suggestionId}/announce`, {
    method: 'POST',
    body: JSON.stringify({ scheduled_at: scheduledAt })
  });

export const deleteSuggestion = (suggestionId) =>
  fetchAPI(`/api/board/suggestions/${suggestionId}`, {
    method: 'DELETE'
  });
```

> Keep `searchTMDB`, `getTMDBMovie`, and `announceMovie` (used by AnnounceFlow) untouched. Note the existing `deleteSuggestion` name is reused for the board — confirm no other file imports the old voting `deleteSuggestion` with the old signature (the only user was `VotingSection.jsx`, which we delete in Task 6).

- [ ] **Step 2: Verify no dangling imports.** Search for removed names:

Run: `grep -rn "getActiveVoting\|createVotingSession\|closeVotingSession\|deleteVotingSession\|castVote\|submitSuggestion" frontend/src`
Expected: matches only in `Home.jsx` and `VotingSection.jsx` — both handled in Tasks 5 & 6. If matches appear elsewhere, fix them.

- [ ] **Step 3: Commit.**

```bash
git add frontend/src/api/client.js
git commit -m "client: replace voting API methods with board methods"
```

---

### Task 5: SuggestionBoard component + Home wiring

**Files:**
- Create: `frontend/src/components/home/SuggestionBoard.jsx`
- Modify: `frontend/src/components/home/index.js`
- Modify: `frontend/src/pages/Home.jsx`
- Modify: `frontend/src/pages/Home.css`

- [ ] **Step 1: Create `frontend/src/components/home/SuggestionBoard.jsx`** with the full contents:

```jsx
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useConfirm } from '../../context/ConfirmContext';
import { getAvatarUrl } from '../../utils/helpers';
import {
  getBoard, addSuggestion, upvoteSuggestion, removeUpvote,
  announceSuggestion, deleteSuggestion, searchTMDB, getTMDBMovie
} from '../../api/client';
import { Icon, Badge } from '../ui';

/** Format a Date as YYYY-MM-DD in the browser's local timezone (never UTC). */
const localDateStr = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * Always-on suggestion board. Fetches its own data. Lives in the Home sidebar.
 * Calls `onAnnounced()` after a successful announce so the parent can refresh
 * its movie data (hero, calendar).
 */
const SuggestionBoard = ({ onAnnounced }) => {
  const { isAuthenticated, isAdmin, user, login } = useAuth();
  const { showError, showSuccess } = useToast();
  const confirm = useConfirm();

  const [board, setBoard] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  // Suggest modal
  const [showSuggest, setShowSuggest] = useState(false);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [addingId, setAddingId] = useState(null);

  // Announce modal
  const [announceFor, setAnnounceFor] = useState(null); // suggestion object
  const [date, setDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + ((5 + 7 - d.getDay()) % 7 || 7)); // next Friday
    return localDateStr(d);
  });
  const [time, setTime] = useState('20:30');
  const [announcing, setAnnouncing] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const data = await getBoard();
      setBoard(data);
    } catch (err) {
      console.error('Error loading board:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const handleToggleUpvote = async (s) => {
    if (!isAuthenticated || busyId) return;
    setBusyId(s.id);
    try {
      if (s.user_upvoted) await removeUpvote(s.id);
      else await upvoteSuggestion(s.id);
      await refresh();
    } catch (err) {
      console.error('Error upvoting:', err);
    } finally {
      setBusyId(null);
    }
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!search.trim()) return;
    setSearching(true);
    try {
      setResults(await searchTMDB(search));
    } catch {
      showError('Failed to search movies');
    } finally {
      setSearching(false);
    }
  };

  const handleAdd = async (movie) => {
    setAddingId(movie.id);
    try {
      const d = await getTMDBMovie(movie.id);
      await addSuggestion(d.title, d.posterPath, {
        description: d.overview, tmdbId: d.id, tmdbRating: d.rating,
        genres: d.genres, runtime: d.runtime, releaseYear: d.year,
        backdropUrl: d.backdropPath, tagline: d.tagline, imdbId: d.imdbId,
        originalLanguage: d.originalLanguage, collectionName: d.collectionName,
        trailerUrl: d.trailerUrl
      });
      setShowSuggest(false);
      setSearch('');
      setResults([]);
      await refresh();
    } catch (err) {
      if (err.status === 409) showError('That movie is already on the board.');
      else showError('Failed to add movie: ' + err.message);
    } finally {
      setAddingId(null);
    }
  };

  const handleAnnounce = async (e) => {
    e.preventDefault();
    if (!announceFor) return;
    const scheduledAt = new Date(`${date}T${time}`);
    if (scheduledAt <= new Date()) {
      showError('The time must be in the future.');
      return;
    }
    setAnnouncing(true);
    try {
      await announceSuggestion(announceFor.id, scheduledAt.toISOString());
      showSuccess(`${announceFor.title} is on the calendar.`);
      setAnnounceFor(null);
      await refresh();
      if (onAnnounced) onAnnounced();
    } catch (err) {
      if (err.status === 409) showError('That suggestion is already scheduled.');
      else showError('Failed to announce: ' + err.message);
    } finally {
      setAnnouncing(false);
    }
  };

  const handleDelete = async (s) => {
    if (!(await confirm({
      title: 'Remove suggestion?',
      message: `Remove "${s.title}" from the board?`,
      confirmLabel: 'Remove',
      danger: true
    }))) return;
    setBusyId(s.id);
    try {
      await deleteSuggestion(s.id);
      await refresh();
    } catch (err) {
      showError('Failed to remove: ' + err.message);
    } finally {
      setBusyId(null);
    }
  };

  const canRemove = (s) => isAdmin || (user && s.suggested_by === user.id);

  return (
    <div className="sb">
      <header className="sb-head">
        <div>
          <div className="sb-eyebrow">The board</div>
          <h3 className="sb-title">Suggest a movie</h3>
        </div>
        {isAuthenticated && (
          <button className="btn sm" onClick={() => setShowSuggest(true)}>
            <Icon name="plus" size={14} /> <span>Suggest</span>
          </button>
        )}
      </header>

      {loading ? (
        <div className="sb-empty"><p>Loading…</p></div>
      ) : board.length === 0 ? (
        <div className="sb-empty">
          <Icon name="film" size={24} stroke={1.25} />
          <p>No suggestions yet.</p>
          {isAuthenticated
            ? <small>Be the first — hit Suggest.</small>
            : <small>Log in to suggest and upvote.</small>}
        </div>
      ) : (
        <ul className="sb-list">
          {board.map((s) => {
            const count = parseInt(s.upvote_count) || 0;
            const scheduled = s.status === 'scheduled';
            return (
              <li key={s.id} className={`sb-item ${scheduled ? 'scheduled' : ''}`}>
                {s.image_url ? (
                  <img src={s.image_url} alt="" className="sb-poster" loading="lazy" />
                ) : (
                  <div className="sb-poster no-poster"><Icon name="film" size={16} /></div>
                )}
                <div className="sb-info">
                  <span className="sb-item-title">{s.title}</span>
                  {scheduled ? (
                    <span className="sb-scheduled">
                      <Icon name="calendar" size={12} /> Scheduled ·{' '}
                      {new Date(s.scheduled_at).toLocaleDateString('en-US', {
                        weekday: 'short', month: 'short', day: 'numeric'
                      })}
                    </span>
                  ) : (
                    <div className="sb-upvoters">
                      {(s.upvoters || []).slice(0, 4).map((v) => (
                        <img
                          key={v.discord_id}
                          src={getAvatarUrl(v.discord_id, v.avatar)}
                          alt={v.username}
                          title={v.username}
                          className="sb-upvoter-avatar"
                          loading="lazy"
                        />
                      ))}
                      {count > 4 && <span className="sb-upvoter-more">+{count - 4}</span>}
                    </div>
                  )}
                </div>

                <div className="sb-actions">
                  <button
                    className={`sb-heart ${s.user_upvoted ? 'on' : ''}`}
                    onClick={() => handleToggleUpvote(s)}
                    disabled={!isAuthenticated || busyId === s.id || scheduled}
                    title={isAuthenticated ? 'Upvote' : 'Log in to upvote'}
                  >
                    <Icon name="heart" size={14} />
                    <span>{count}</span>
                  </button>
                  {!scheduled && isAuthenticated && (
                    <button
                      className="sb-announce"
                      onClick={() => setAnnounceFor(s)}
                      title="Announce to movie night"
                    >
                      <Icon name="megaphone" size={14} />
                    </button>
                  )}
                  {canRemove(s) && (
                    <button
                      className="sb-remove"
                      onClick={() => handleDelete(s)}
                      disabled={busyId === s.id}
                      title="Remove"
                    >
                      <Icon name="close" size={12} />
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {!isAuthenticated && board.length > 0 && (
        <div className="sb-login">
          <button onClick={login} className="btn sm">Log in to upvote</button>
        </div>
      )}

      {/* Suggest modal */}
      {showSuggest && (
        <div className="modal-overlay" onClick={() => setShowSuggest(false)}>
          <div className="modal-content modal-large" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Suggest a movie</h2>
              <button className="modal-close" onClick={() => setShowSuggest(false)}>
                <Icon name="close" size={16} />
              </button>
            </div>
            <form onSubmit={handleSearch} className="search-form">
              <input
                type="text"
                placeholder="Search for a movie…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoFocus
              />
              <button type="submit" className="btn" disabled={searching}>
                {searching ? 'Searching…' : 'Search'}
              </button>
            </form>
            {results.length > 0 && (
              <div className="search-results">
                {results.map((movie) => (
                  <div key={movie.id} className="search-result-item" onClick={() => handleAdd(movie)}>
                    {movie.posterPath ? (
                      <img src={movie.posterPath} alt="" className="result-poster" loading="lazy" />
                    ) : (
                      <div className="result-poster no-poster">No Image</div>
                    )}
                    <div className="result-info">
                      <span className="result-title">{movie.title}</span>
                      <span className="result-year">{movie.year}</span>
                    </div>
                    <button className="btn sm" disabled={addingId === movie.id}>
                      {addingId === movie.id ? 'Adding…' : 'Add'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Announce modal */}
      {announceFor && (
        <div className="modal-overlay" onClick={() => setAnnounceFor(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Announce “{announceFor.title}”</h2>
              <button className="modal-close" onClick={() => setAnnounceFor(null)}>
                <Icon name="close" size={16} />
              </button>
            </div>
            <form onSubmit={handleAnnounce} className="sb-announce-form">
              <div className="sb-when-fields">
                <label className="sb-field">
                  <span>Date</span>
                  <input type="date" value={date} min={localDateStr(new Date())}
                    onChange={(e) => setDate(e.target.value)} required />
                </label>
                <label className="sb-field">
                  <span>Time</span>
                  <input type="time" value={time}
                    onChange={(e) => setTime(e.target.value)} required />
                </label>
              </div>
              <button type="submit" className="btn lg" disabled={announcing}>
                {announcing ? 'Scheduling…' : <><Icon name="megaphone" size={16} /> <span>Announce screening</span></>}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default SuggestionBoard;
```

> **Icon names:** this uses `plus`, `heart`, `megaphone`, `calendar`, `film`, `close`. `megaphone`, `calendar`, `film`, `close` are already used elsewhere in the app. Before finishing, confirm `plus` and `heart` exist in the `Icon` primitive (`frontend/src/components/ui/Icon.jsx`). If a name is missing, either add the Lucide icon to that primitive or substitute an existing one (e.g. use `star` instead of `heart`). Do not use emoji (per frontend rules).
>
> **`err.status`:** confirm the `fetchAPI` wrapper attaches the HTTP status to thrown errors (used for the 409 branch). If it doesn't, adjust the wrapper to include `err.status`, or match on `err.message`.

- [ ] **Step 2: Update the barrel.** In `frontend/src/components/home/index.js`, remove the line `export { default as VotingSection } from './VotingSection';` and add `export { default as SuggestionBoard } from './SuggestionBoard';`.

- [ ] **Step 3: Wire into Home.jsx.** In `frontend/src/pages/Home.jsx`:
  - Remove `getActiveVoting`, `castVote`, `removeVote` from the `../api/client` import.
  - Add `SuggestionBoard` to the `../components/home` import.
  - Remove the `voting` and `votingLoading` state (`const [voting, setVoting] = ...`, `const [votingLoading, ...]`).
  - In `fetchData`, remove `getActiveVoting().catch(() => null)` from the `Promise.all` array and its `votingData` destructuring + `setVoting(votingData)` line.
  - Delete the entire `handleVote` function.
  - Delete the `VoteList` function (bottom of file) — the board replaces it.
  - Update `<HomeSidebar ... />` usage: remove the `voting`, `votingLoading`, `onVote` props; keep `isAuthenticated`, `loading`, `onAnnounced={fetchData}`.
  - Replace the `HomeSidebar` function body's second tab. Change the tab label from "Vote"/`star` to "Board"/`star` (keep an icon that exists). Remove the `hasActiveVote` logic and the `hs-tab-dot`. In the panel, replace the whole `hasActiveVote ? <VoteList .../> : <div className="hv-empty">…` branch for the `vote` tab with simply `<SuggestionBoard onAnnounced={onAnnounced} />`.

  The resulting `HomeSidebar` should read:

```jsx
function HomeSidebar({ isAuthenticated, loading, onAnnounced }) {
  const [tab, setTab] = useState(isAuthenticated ? 'announce' : 'board');

  return (
    <aside className="home-sidebar">
      <nav className="hs-tabs" role="tablist" aria-label="Home sidebar">
        <button
          role="tab"
          aria-selected={tab === 'announce'}
          className={`hs-tab ${tab === 'announce' ? 'active' : ''}`}
          onClick={() => setTab('announce')}
        >
          <Icon name="megaphone" size={14} stroke={1.5} />
          <span>Announce</span>
        </button>
        <button
          role="tab"
          aria-selected={tab === 'board'}
          className={`hs-tab ${tab === 'board' ? 'active' : ''}`}
          onClick={() => setTab('board')}
        >
          <Icon name="star" size={14} stroke={1.5} />
          <span>Board</span>
        </button>
      </nav>

      <div className="hs-panel" role="tabpanel">
        {tab === 'announce' ? (
          isAuthenticated ? (
            <AnnounceFlow onAnnounced={onAnnounced} />
          ) : (
            <div className="hs-login">
              <div className="hs-login-eyebrow">Host the next night</div>
              <h3 className="hs-login-title">Want to schedule the next movie?</h3>
              <p>Log in with Discord and use this space to search a film, pick a date, and announce it to the club.</p>
            </div>
          )
        ) : (
          <SuggestionBoard onAnnounced={onAnnounced} />
        )}
      </div>
    </aside>
  );
}
```

  Update the `<HomeSidebar ... />` call in the JSX to:

```jsx
        <HomeSidebar
          isAuthenticated={isAuthenticated}
          loading={loading}
          onAnnounced={fetchData}
        />
```

- [ ] **Step 4: Add board styles to `frontend/src/pages/Home.css`.** Append (reusing existing tokens; adjust token names if the file uses different ones — check the neighboring `.hv-` / `.af-` rules):

```css
/* ── Suggestion board (sidebar) ─────────────────────────────── */
.sb { display: flex; flex-direction: column; gap: var(--s-3); }
.sb-head { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--s-2); }
.sb-eyebrow {
  font-family: var(--font-mono); font-size: 11px; letter-spacing: .28em;
  text-transform: uppercase; color: var(--ink-3);
}
.sb-title { font-family: var(--font-display); font-style: italic; margin: 2px 0 0; }

.sb-empty { text-align: center; color: var(--ink-3); padding: var(--s-4) 0; display: flex; flex-direction: column; align-items: center; gap: var(--s-2); }
.sb-empty p { margin: 0; }

.sb-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--s-2); }
.sb-item { display: flex; align-items: center; gap: var(--s-2); padding: var(--s-2); border: 1px solid var(--rule); border-radius: 6px; }
.sb-item.scheduled { opacity: .72; }
.sb-poster { width: 34px; height: 51px; object-fit: cover; border-radius: 2px; flex: none; }
.sb-poster.no-poster { display: flex; align-items: center; justify-content: center; background: var(--ink); color: var(--ink-3); }
.sb-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.sb-item-title { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sb-scheduled { font-family: var(--font-mono); font-size: 11px; letter-spacing: .04em; color: var(--ember); display: inline-flex; align-items: center; gap: 4px; }
.sb-upvoters { display: flex; align-items: center; gap: 2px; }
.sb-upvoter-avatar { width: 18px; height: 18px; border-radius: 50%; border: 1px solid var(--bone); margin-left: -4px; }
.sb-upvoter-avatar:first-child { margin-left: 0; }
.sb-upvoter-more { font-size: 11px; color: var(--ink-3); margin-left: 4px; }

.sb-actions { display: flex; align-items: center; gap: var(--s-1); flex: none; }
.sb-heart, .sb-announce, .sb-remove {
  display: inline-flex; align-items: center; gap: 4px; cursor: pointer;
  background: none; border: 1px solid var(--rule); border-radius: full;
  border-radius: 999px; padding: 4px 8px; color: var(--ink-2);
}
.sb-heart.on { color: var(--ember); border-color: var(--ember); }
.sb-heart:disabled { cursor: default; }
.sb-announce:hover, .sb-remove:hover { color: var(--ink); }
.sb-remove:hover { color: var(--red); border-color: var(--red); }

.sb-login { margin-top: var(--s-2); text-align: center; }

.sb-announce-form { display: flex; flex-direction: column; gap: var(--s-3); padding: var(--s-3) 0 0; }
.sb-when-fields { display: flex; gap: var(--s-2); }
.sb-field { display: flex; flex-direction: column; gap: 4px; flex: 1; }
.sb-field span { font-family: var(--font-mono); font-size: 11px; letter-spacing: .1em; text-transform: uppercase; color: var(--ink-3); }
.sb-field input { width: 100%; }
```

- [ ] **Step 5: Build to verify it compiles.**

Run: `cd frontend && npm run build`
Expected: build succeeds with no unresolved-import or JSX errors. Fix any missing Icon names / token names surfaced here.

- [ ] **Step 6: Commit.**

```bash
git add frontend/src/components/home/SuggestionBoard.jsx frontend/src/components/home/index.js frontend/src/pages/Home.jsx frontend/src/pages/Home.css
git commit -m "home: replace Vote tab with always-on Suggestion Board"
```

---

### Task 6: Delete dead VotingSection

**Files:**
- Delete: `frontend/src/components/home/VotingSection.jsx`

- [ ] **Step 1: Confirm it's unreferenced.**

Run: `grep -rn "VotingSection" frontend/src`
Expected: no matches (the barrel export was removed in Task 5). If any remain, remove them.

- [ ] **Step 2: Delete and commit.**

```bash
git rm frontend/src/components/home/VotingSection.jsx
git commit -m "home: remove dead VotingSection component"
```

---

## PHASE 3 — Bot cleanup

### Task 7: Remove voting commands, handlers, and wiring

**Files:**
- Delete: `bot/src/commands/startvote.js`, `bot/src/commands/endvote.js`, `bot/src/commands/suggest.js`, `bot/src/commands/admin.js`, `bot/src/utils/votingEmbed.js`, and the `bot/src/handlers/voting/` directory.
- Modify: `bot/src/handlers/index.js`, `bot/src/events/interactionCreate.js`, `bot/src/commands/help.js`.

- [ ] **Step 1: Delete the voting files.**

```bash
git rm bot/src/commands/startvote.js bot/src/commands/endvote.js bot/src/commands/suggest.js bot/src/commands/admin.js bot/src/utils/votingEmbed.js
git rm -r bot/src/handlers/voting
```

> `admin.js` exists solely to show admin buttons on the voting message, so it goes too. If a later grep shows `admin.js` is referenced by something non-voting, keep it and prune only its voting body instead.

- [ ] **Step 2: Prune `bot/src/handlers/index.js`.** Replace the whole file with:

```javascript
export { handleRatingButton, handleRatingCommentModal } from './rating/index.js';
```

- [ ] **Step 3: Prune `bot/src/events/interactionCreate.js`.**
  - In the top import from `../handlers/index.js`, remove every voting name, leaving only `handleRatingButton, handleRatingCommentModal`:

```javascript
import {
  handleRatingButton,
  handleRatingCommentModal
} from '../handlers/index.js';
```

  - In the `isButton()` block, remove the `vote_suggest`, `vote_for_`, `vote_delete_`, `vote_cancel_session`, and `vote_show_admin` branches, leaving only the `rate_` branch:

```javascript
  if (interaction.isButton()) {
    const customId = interaction.customId;
    if (customId.startsWith('rate_')) {
      await handleRatingButton(interaction);
    }
    return;
  }
```

  - In the `isModalSubmit()` block, remove the `suggest_movie_modal` branch, leaving only the rating-comment branch:

```javascript
  if (interaction.isModalSubmit()) {
    if (interaction.customId.startsWith('rating_comment_modal_')) {
      await handleRatingCommentModal(interaction);
    }
    return;
  }
```

  - Remove the entire `isStringSelectMenu()` block (it only handled `tmdb_select_`).

- [ ] **Step 4: Prune `bot/src/commands/help.js`.** Remove the `/startvote`, `/suggest`, and `/endvote` help entries (the objects at lines ~34-43). In the admin help entry (~line 51), remove the `` `/admin` - Show delete controls on voting\n `` fragment so it no longer references `/admin` or voting. Leave the other admin lines intact.

- [ ] **Step 5: Syntax-check the touched bot files.**

Run: `node --check bot/src/handlers/index.js && node --check bot/src/events/interactionCreate.js && node --check bot/src/commands/help.js`
Expected: no output (exit 0).

- [ ] **Step 6: Verify no dangling voting references remain in the bot.**

Run: `grep -rn "votingEmbed\|handlers/voting\|handleSuggest\|handleVote\|buildVotingEmbed\|getActiveVotingSession\|getSuggestionsForSession" bot/src`
Expected: no matches. If any appear (e.g. in `bot/src/models/index.js` re-exports), they are harmless dead DB functions — leave them, or remove the specific voting exports if they import from a dropped table helper. Do not break unrelated exports.

- [ ] **Step 7: Commit.**

```bash
git add -A bot/src
git commit -m "bot: remove voting commands, handlers, and wiring"
```

- [ ] **Step 8: Redeploy slash commands (manual, after merge/deploy).**

Note for the operator: `startvote`, `endvote`, `suggest`, and `admin` were removed. Run `cd bot && npm run deploy` to deregister them from Discord. (This needs the bot token/env and is not part of local verification.)

---

## Final verification (deployed site — see project memory)

After deploy + migration, on the live site:

- [ ] Open Home → the sidebar shows **Announce** and **Board** tabs. Board loads without error.
- [ ] Logged in: **Suggest** a movie via TMDB search → it appears on the board.
- [ ] Suggest the **same** movie again → friendly "already on the board" notice; no duplicate card.
- [ ] Click the **heart** on a suggestion → count increments, heart fills; click again → decrements. Refresh persists state.
- [ ] Click **Announce** on a suggestion, pick a future date → card flips to **"Scheduled · <date>"**; a Discord embed posts; the movie appears as the next screening / on the calendar.
- [ ] Announcing an already-scheduled suggestion is blocked (409 notice).
- [ ] The suggester (and admins) can **remove** a suggestion; a non-owner non-admin cannot.
- [ ] Confirm a scheduled suggestion whose date has passed no longer appears on the board.

---

## Self-review notes

- **Spec coverage:** replace-voting (Tasks 1-3, 5-7), upvote-many-one-each (`board_upvotes` UNIQUE + toggle in Task 5), anyone-announces-with-date (Task 3 announce route, Task 5 modal), scheduled-badge + auto-clear-by-date (`getBoardSuggestions` WHERE clause + Task 5 badge), web-first Discord-announce-only (reuse `createPendingAnnouncement`; Task 7 removes bot voting), dedupe-by-tmdb_id (Task 3 `findOpenSuggestionByTmdb` → 409; Task 5 handles it). All covered.
- **Assumptions to confirm during execution (flagged inline):** `validateGuildId` populates `req.guildId` on the POST `/suggestions` route (else send `guild_id` as query param — the client already does); `fetchAPI` attaches `err.status`; `Icon` has `plus` and `heart`; CSS token names match this file. Each has a fallback noted at its step.
- **`scheduled_movie_night_id`** is created but left null (reserved) — the board auto-clears by date, so the bot needs no changes. Not wired to avoid coupling; safe to populate later.
