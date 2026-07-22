# Movie Marathons — Sources (Plan 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the three non-manual ways to fill a marathon lineup — **by actor/director** and **from a franchise** (both straight from TMDB, deterministic) and **describe a vibe** (Google Gemini, every pick resolved against TMDB and shown for review) — all converging on the existing Lineup+Schedule step.

**Architecture:** The wizard's **Source step** (already built as a routed page in Plan 1, mockup `02-wizard-source.html`) currently has Manual enabled and the other three cards disabled. This plan enables them: selecting a non-manual card expands an inline panel (person search / franchise search / vibe prompt); "Next: build the lineup" creates the draft and **bulk-adds** the resolved films, then lands on the same two-column Build step. New backend: TMDB person/collection endpoints, a `services/tmdb.js` helper, a bulk-add items endpoint, and a `services/curator.js` Gemini wrapper behind `POST /api/marathons/curate` that degrades gracefully when `GEMINI_API_KEY` is absent.

**Tech Stack:** Express + `pg` (raw parameterized SQL), TMDB REST (via `fetch`, no SDK), Google Gemini REST (`generativelanguage.googleapis.com`, via `fetch`, no SDK), React 18 + Vite (plain CSS, the routed wizard from Plan 1).

> **Design source of truth — MOCKUPS.** Per the user: **the mockups ARE the design source of truth; always check them.** The relevant mockup for this plan is `docs/superpowers/mockups/movie-marathons/02-wizard-source.html`. Every UI task below ends with a step that opens that mockup and matches structure + flow (not just colors). If this plan and the mockup ever disagree, the mockup wins — stop and flag it before building.

> **Testing note (repo reality):** No test framework/linter/CI (see `CLAUDE.md`). Verification is **manual**: `node --check` / module-load for syntax, `npm run build` for the frontend, `curl` for endpoints where a token/DB is available, and **Railway** for anything needing the live DB (local Postgres usually isn't running). Verify UI by rendering.

---

## Scope

**In this plan (Plan 2):** TMDB person search + a person's movies; TMDB franchise/collection lookup; a bulk-add items endpoint; a Gemini curator service + `curate` route with graceful degradation; frontend client methods; the wizard Source-step rework (enable the three cards + inline panels + bulk-add) matching mockup 02.

**Deferred (later plans):** Back-to-back **binge** cadence (Plan 3 — the "Back-to-back" mode card stays disabled "Soon"); home-page **"On the calendar"** agenda + **inline scheduler** (Plan 4). Nothing on the home page changes here.

---

## File Structure

**Backend**
- Create `backend/src/services/tmdb.js` — server-side TMDB helpers: `getMovieDetail`, `searchPeople`, `getPersonMovies`, `getMovieCollection`. One place for the TMDB fetch + mapping, reused by routes and bulk-add.
- Modify `backend/src/routes/tmdb.js` — refactor `GET /:id` to delegate to `services/tmdb.getMovieDetail`; add `GET /person`, `GET /person/:id/movies`, `GET /:id/collection`.
- Create `backend/src/services/curator.js` — Gemini wrapper (`isCurationAvailable`, `curateLineup`).
- Modify `backend/src/models/marathons.js` — add `addMarathonItemsBulk`.
- Modify `backend/src/routes/marathons.js` — add `POST /:id/items/bulk`, `POST /curate`, `GET /curate` (availability).
- Modify `backend/.env.example` (if present) / document `GEMINI_API_KEY`.

**Frontend**
- Modify `frontend/src/api/client.js` — `searchTMDBPerson`, `getPersonMovies`, `getMovieCollection`, `bulkAddMarathonItems`, `curateMarathon`, `getCurateStatus`.
- Modify `frontend/src/pages/MarathonWizardPage.jsx` — enable the three source cards; inline panels; wire bulk-add; converge on Build.
- Modify `frontend/src/pages/MarathonsPage.css` — styles for the source panels (person/franchise results, vibe box, example chips, guardrail note) per mockup 02.

---

## Task 1: Backend TMDB service + new endpoints

**Files:**
- Create: `backend/src/services/tmdb.js`
- Modify: `backend/src/routes/tmdb.js`

- [ ] **Step 1: Create the TMDB service**

Create `backend/src/services/tmdb.js`. It centralizes the TMDB base URLs/keys already used inline in `routes/tmdb.js` and adds person/collection helpers. Preview items use the same camelCase field names the frontend already maps from search results (`tmdbId`/`title`/`year`/`posterPath`).

```js
const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w500';
const TMDB_BACKDROP_BASE = 'https://image.tmdb.org/t/p/w1280';

const poster = (p) => (p ? `${TMDB_IMAGE_BASE}${p}` : null);
const yearOf = (d) => (d ? parseInt(d.split('-')[0]) : null);

export const isTmdbConfigured = () => Boolean(TMDB_API_KEY);

// Full movie detail — same shape GET /api/tmdb/:id has always returned.
export const getMovieDetail = async (id) => {
  const [detailsRes, videosRes] = await Promise.all([
    fetch(`${TMDB_BASE_URL}/movie/${id}?api_key=${TMDB_API_KEY}`),
    fetch(`${TMDB_BASE_URL}/movie/${id}/videos?api_key=${TMDB_API_KEY}`)
  ]);
  if (!detailsRes.ok) {
    const err = new Error('TMDB movie fetch failed');
    err.status = detailsRes.status;
    throw err;
  }
  const movie = await detailsRes.json();
  let trailerUrl = null;
  if (videosRes.ok) {
    const v = await videosRes.json();
    const t = v.results?.find((x) => x.type === 'Trailer' && x.site === 'YouTube' && x.official) ||
              v.results?.find((x) => x.type === 'Trailer' && x.site === 'YouTube') ||
              v.results?.find((x) => x.type === 'Teaser' && x.site === 'YouTube');
    if (t) trailerUrl = `https://www.youtube.com/watch?v=${t.key}`;
  }
  return {
    id: movie.id,
    title: movie.title,
    year: yearOf(movie.release_date),
    overview: movie.overview,
    posterPath: poster(movie.poster_path),
    backdropPath: movie.backdrop_path ? `${TMDB_BACKDROP_BASE}${movie.backdrop_path}` : null,
    rating: movie.vote_average ? parseFloat(movie.vote_average.toFixed(1)) : null,
    releaseDate: movie.release_date,
    runtime: movie.runtime || null,
    genres: movie.genres?.map((g) => g.name).join(', ') || null,
    tagline: movie.tagline || null,
    imdbId: movie.imdb_id || null,
    originalLanguage: movie.original_language || null,
    collectionId: movie.belongs_to_collection?.id || null,
    collectionName: movie.belongs_to_collection?.name || null,
    trailerUrl
  };
};

// Search people (actors/directors) by name.
export const searchPeople = async (query) => {
  const res = await fetch(
    `${TMDB_BASE_URL}/search/person?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}&include_adult=false`
  );
  if (!res.ok) { const e = new Error('TMDB person search failed'); e.status = res.status; throw e; }
  const data = await res.json();
  return (data.results || []).slice(0, 8).map((p) => ({
    id: p.id,
    name: p.name,
    profilePath: poster(p.profile_path),
    department: p.known_for_department || null,
    knownFor: (p.known_for || []).map((k) => k.title || k.name).filter(Boolean).slice(0, 3).join(', ')
  }));
};

// A person's movies. role='directing' → their directed films; else acting roles.
// Returns preview items (deduped, newest first).
export const getPersonMovies = async (personId, role = 'acting') => {
  const res = await fetch(`${TMDB_BASE_URL}/person/${personId}/movie_credits?api_key=${TMDB_API_KEY}`);
  if (!res.ok) { const e = new Error('TMDB person credits failed'); e.status = res.status; throw e; }
  const data = await res.json();
  const rows = role === 'directing'
    ? (data.crew || []).filter((c) => c.job === 'Director')
    : (data.cast || []);
  const seen = new Set();
  return rows
    .filter((m) => m.id && !seen.has(m.id) && seen.add(m.id))
    .filter((m) => m.release_date)                          // drop unreleased/dateless
    .sort((a, b) => (b.release_date || '').localeCompare(a.release_date || ''))
    .slice(0, 24)
    .map((m) => ({ tmdbId: m.id, title: m.title, year: yearOf(m.release_date), posterPath: poster(m.poster_path) }));
};

// The franchise/collection a movie belongs to, in release order.
export const getMovieCollection = async (movieId) => {
  const detail = await getMovieDetail(movieId);
  if (!detail.collectionId) return { name: null, parts: [] };
  const res = await fetch(`${TMDB_BASE_URL}/collection/${detail.collectionId}?api_key=${TMDB_API_KEY}`);
  if (!res.ok) { const e = new Error('TMDB collection failed'); e.status = res.status; throw e; }
  const data = await res.json();
  const parts = (data.parts || [])
    .filter((m) => m.release_date)
    .sort((a, b) => (a.release_date || '').localeCompare(b.release_date || ''))
    .map((m) => ({ tmdbId: m.id, title: m.title, year: yearOf(m.release_date), posterPath: poster(m.poster_path) }));
  return { name: data.name || detail.collectionName, parts };
};
```

- [ ] **Step 2: Refactor `GET /:id` to use the service and add the new routes**

In `backend/src/routes/tmdb.js`, add the import at the top:

```js
import * as tmdb from '../services/tmdb.js';
```

Replace the body of the existing `GET /:id` handler's try-block (the `Promise.all` fetch + trailer logic + `res.json({...})`) with a delegation:

```js
  try {
    const detail = await tmdb.getMovieDetail(id);
    res.json(detail);
  } catch (err) {
    if (err.status === 404) return res.status(404).json({ error: 'Movie not found' });
    console.error('TMDB details error:', err);
    res.status(err.status === 404 ? 404 : 502).json({ error: 'TMDB API error' });
  }
```

> Keep the existing `if (!/^\d+$/.test(id))` and `if (!TMDB_API_KEY)` guards at the top of the handler. The service returns `collectionId` in addition to the old fields — additive, so existing callers are unaffected.

Add these new routes (place `person` routes **before** `/:id` if any ordering conflict arises; `person` is a static segment so Express ranks it correctly, but keep them grouped):

```js
// GET /api/tmdb/person?query=... — search actors/directors
router.get('/person', async (req, res) => {
  const { query } = req.query;
  if (!query) return res.status(400).json({ error: 'query parameter is required' });
  if (!process.env.TMDB_API_KEY) return res.status(500).json({ error: 'TMDB API key not configured' });
  try {
    res.json(await tmdb.searchPeople(query));
  } catch (err) {
    console.error('TMDB person search error:', err);
    res.status(502).json({ error: 'TMDB API error' });
  }
});

// GET /api/tmdb/person/:id/movies?role=acting|directing
router.get('/person/:id/movies', async (req, res) => {
  const { id } = req.params;
  const role = req.query.role === 'directing' ? 'directing' : 'acting';
  if (!/^\d+$/.test(id)) return res.status(400).json({ error: 'Invalid person ID' });
  if (!process.env.TMDB_API_KEY) return res.status(500).json({ error: 'TMDB API key not configured' });
  try {
    res.json(await tmdb.getPersonMovies(id, role));
  } catch (err) {
    console.error('TMDB person movies error:', err);
    res.status(502).json({ error: 'TMDB API error' });
  }
});

// GET /api/tmdb/:id/collection — the movie's franchise parts, in order
router.get('/:id/collection', async (req, res) => {
  const { id } = req.params;
  if (!/^\d+$/.test(id)) return res.status(400).json({ error: 'Invalid movie ID' });
  if (!process.env.TMDB_API_KEY) return res.status(500).json({ error: 'TMDB API key not configured' });
  try {
    res.json(await tmdb.getMovieCollection(id));
  } catch (err) {
    console.error('TMDB collection error:', err);
    res.status(502).json({ error: 'TMDB API error' });
  }
});
```

- [ ] **Step 3: Verify it loads + `GET /:id` unchanged**

Run: `cd backend && node -e "import('./src/routes/tmdb.js').then(()=>console.log('OK')).catch(e=>{console.error(e);process.exit(1)})"`
Expected: `OK`. If a TMDB key + network are available: `curl "http://localhost:3001/api/tmdb/person?query=nolan"` returns an array of people; `curl "http://localhost:3001/api/tmdb/27205/collection"` (Inception has no collection) returns `{"name":null,"parts":[]}`; a franchise movie id returns ordered parts. Confirm `GET /api/tmdb/27205` still returns the original detail shape (now with an extra `collectionId`).

- [ ] **Step 4: Commit**

```bash
git add backend/src/services/tmdb.js backend/src/routes/tmdb.js
git commit -m "feat(marathons): TMDB service + person/collection endpoints"
```

---

## Task 2: Bulk-add marathon items

**Files:**
- Modify: `backend/src/models/marathons.js`
- Modify: `backend/src/routes/marathons.js`

- [ ] **Step 1: Add the bulk model function**

Append to `backend/src/models/marathons.js` (reuses the same column mapping as `addMarathonItem`, appending after the current max position in one transaction):

```js
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
```

- [ ] **Step 2: Add the bulk route (enriches each tmdb_id to full metadata server-side)**

In `backend/src/routes/marathons.js`, add the TMDB service import at the top with the others:

```js
import * as tmdb from '../services/tmdb.js';
```

Add a mapper near the top of the file (below the imports) that turns a TMDB detail into the item shape the model expects (mirrors the frontend `toItemData`):

```js
// TMDB detail (services/tmdb.getMovieDetail) → addMarathonItem/Bulk input shape.
const detailToItem = (d) => ({
  tmdbId: d.id, title: d.title, imageUrl: d.posterPath, backdropUrl: d.backdropPath,
  description: d.overview, tmdbRating: d.rating, genres: d.genres, runtime: d.runtime,
  releaseYear: d.year, tagline: d.tagline, imdbId: d.imdbId,
  originalLanguage: d.originalLanguage, trailerUrl: d.trailerUrl
});
```

Add the route (alongside the other `/:id/items` routes). It caps the batch, fetches full detail per id (so source-added films carry genres/runtime/trailer just like manually-added ones), and skips any that fail:

```js
// POST /api/marathons/:id/items/bulk — body: { tmdb_ids: [int, ...] }
router.post('/:id/items/bulk', validateGuildId, validateIntParams('id'), authenticateToken, async (req, res) => {
  const { tmdb_ids } = req.body;
  if (!Array.isArray(tmdb_ids) || tmdb_ids.length === 0) {
    return res.status(400).json({ error: 'tmdb_ids array is required' });
  }
  const ids = tmdb_ids.filter((n) => Number.isInteger(n)).slice(0, 30);
  if (ids.length === 0) return res.status(400).json({ error: 'No valid tmdb_ids' });
  try {
    const marathon = await loadManageable(req, res);
    if (!marathon) return;
    const details = await Promise.all(ids.map((tid) => tmdb.getMovieDetail(tid).catch(() => null)));
    const movies = details.filter(Boolean).map(detailToItem);
    if (movies.length === 0) return res.status(502).json({ error: 'Could not resolve any films from TMDB' });
    const items = await db.addMarathonItemsBulk(marathon.id, movies);
    res.json(items);
  } catch (err) {
    console.error('Error bulk-adding marathon items:', err);
    res.status(500).json({ error: 'Failed to add items' });
  }
});
```

- [ ] **Step 3: Verify**

Run: `cd backend && node -e "import('./src/models/index.js').then(m=>console.log(typeof m.addMarathonItemsBulk))"` → `function`.
Run: `cd backend && node -e "import('./src/routes/marathons.js').then(()=>console.log('OK'))"` → `OK`.
(Full round-trip needs a token + DB → verify on Railway.)

- [ ] **Step 4: Commit**

```bash
git add backend/src/models/marathons.js backend/src/routes/marathons.js
git commit -m "feat(marathons): bulk-add items endpoint (source-built lineups)"
```

---

## Task 3: Gemini curator service + curate routes

**Files:**
- Create: `backend/src/services/curator.js`
- Modify: `backend/src/routes/marathons.js`

- [ ] **Step 1: Write the curator service (REST, no SDK; graceful degradation)**

Create `backend/src/services/curator.js`. Uses the Gemini REST API with JSON response mode. Absent `GEMINI_API_KEY` → `isCurationAvailable()` is false and callers hide the vibe path.

```js
import * as tmdb from './tmdb.js';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
const GEMINI_URL = (model) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;

export const isCurationAvailable = () => Boolean(GEMINI_API_KEY);

const PROMPT = (vibe) => `You are curating a themed movie marathon.
Return ONLY a JSON array of 6 to 12 real, well-known films matching this request:
"${vibe}"
Each element must be {"title": string, "year": number}. Use the film's original/common English title and its release year. No commentary, no duplicates, no TV shows.`;

// Ask Gemini for titles, then resolve each against TMDB. Unmatched titles are
// dropped. Returns preview items [{tmdbId, title, year, posterPath}].
export const curateLineup = async (vibe) => {
  if (!isCurationAvailable()) { const e = new Error('Curation not configured'); e.status = 503; throw e; }

  const res = await fetch(GEMINI_URL(GEMINI_MODEL), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: PROMPT(vibe) }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.9 }
    })
  });
  if (!res.ok) {
    const e = new Error(`Gemini error ${res.status}`); e.status = 502; throw e;
  }
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '[]';

  let picks;
  try { picks = JSON.parse(text); } catch { picks = []; }
  if (!Array.isArray(picks)) picks = [];

  // Resolve each title→TMDB (search by title, prefer exact year). Drop misses.
  const resolved = await Promise.all(
    picks.slice(0, 12).map(async (p) => {
      if (!p || !p.title) return null;
      try {
        const url = `https://api.themoviedb.org/3/search/movie?api_key=${process.env.TMDB_API_KEY}&query=${encodeURIComponent(p.title)}&include_adult=false${p.year ? `&primary_release_year=${p.year}` : ''}`;
        const r = await fetch(url);
        if (!r.ok) return null;
        const d = await r.json();
        const hit = d.results?.[0];
        if (!hit) return null;
        return {
          tmdbId: hit.id,
          title: hit.title,
          year: hit.release_date ? parseInt(hit.release_date.split('-')[0]) : (p.year || null),
          posterPath: hit.poster_path ? `https://image.tmdb.org/t/p/w500${hit.poster_path}` : null
        };
      } catch { return null; }
    })
  );

  // Dedupe by tmdbId, keep order.
  const seen = new Set();
  return resolved.filter((m) => m && !seen.has(m.tmdbId) && seen.add(m.tmdbId));
};
```

> **Env:** add `GEMINI_API_KEY` (and optional `GEMINI_MODEL`) to `backend/.env`. Document it in `CLAUDE.md`'s backend env list and `.env.example` if one exists.

- [ ] **Step 2: Add curate routes**

In `backend/src/routes/marathons.js`, add the import:

```js
import * as curator from '../services/curator.js';
```

Add both routes (availability check + curation). Curation requires auth (it costs an API call):

```js
// GET /api/marathons/curate — is the "describe a vibe" path available?
router.get('/curate', validateGuildId, optionalAuth, (req, res) => {
  res.json({ available: curator.isCurationAvailable() });
});

// POST /api/marathons/curate — body: { prompt } → resolved TMDB preview lineup for review.
router.post('/curate', validateGuildId, authenticateToken, async (req, res) => {
  const { prompt } = req.body;
  if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
    return res.status(400).json({ error: 'A prompt is required' });
  }
  if (!curator.isCurationAvailable()) {
    return res.status(503).json({ error: 'AI curation is not configured' });
  }
  try {
    const items = await curator.curateLineup(prompt.trim().slice(0, 300));
    if (items.length === 0) return res.status(502).json({ error: 'No films could be resolved — try rephrasing' });
    res.json(items);
  } catch (err) {
    console.error('Error curating marathon:', err);
    res.status(err.status || 500).json({ error: 'Failed to curate' });
  }
});
```

> **Route ordering:** `/curate` is a static segment; register these **above** the `/:id` GET route so `curate` is never captured as an `:id`. In practice Express ranks static over param, but placing them first removes all doubt.

- [ ] **Step 3: Verify**

Run: `cd backend && node -e "import('./src/services/curator.js').then(m=>console.log(typeof m.curateLineup, m.isCurationAvailable()))"` → `function false` (false locally without the key — that's the graceful-degradation path).
Run: `cd backend && node -e "import('./src/routes/marathons.js').then(()=>console.log('OK'))"` → `OK`.
On Railway (with `GEMINI_API_KEY` set): `GET /api/marathons/curate?guild_id=...` → `{"available":true}`; `POST /api/marathons/curate` with `{"prompt":"cozy rainy-day sci-fi"}` → an array of resolved films.

- [ ] **Step 4: Commit**

```bash
git add backend/src/services/curator.js backend/src/routes/marathons.js
git commit -m "feat(marathons): Gemini curator service + curate routes (graceful degrade)"
```

---

## Task 4: Frontend API client methods

**Files:**
- Modify: `frontend/src/api/client.js`

- [ ] **Step 1: Add the methods**

Append to the `// ── Marathons ──` block in `frontend/src/api/client.js`:

```js
export const bulkAddMarathonItems = (id, tmdbIds) =>
  fetchAPI(`/api/marathons/${id}/items/bulk?guild_id=${GUILD_ID}`, {
    method: 'POST',
    body: JSON.stringify({ tmdb_ids: tmdbIds })
  });

export const getCurateStatus = () =>
  fetchAPI(`/api/marathons/curate?guild_id=${GUILD_ID}`);

export const curateMarathon = (prompt) =>
  fetchAPI(`/api/marathons/curate?guild_id=${GUILD_ID}`, {
    method: 'POST',
    body: JSON.stringify({ prompt })
  });
```

And with the other TMDB methods (near `getTMDBMovie`):

```js
export const searchTMDBPerson = (query) =>
  fetchAPI(`/api/tmdb/person?query=${encodeURIComponent(query)}`);

export const getPersonMovies = (personId, role = 'acting') =>
  fetchAPI(`/api/tmdb/person/${personId}/movies?role=${role}`);

export const getMovieCollection = (tmdbId) =>
  fetchAPI(`/api/tmdb/${tmdbId}/collection`);
```

- [ ] **Step 2: Verify + commit**

Run: `cd frontend && node --check src/api/client.js` → no output (pass).

```bash
git add frontend/src/api/client.js
git commit -m "feat(marathons): client methods for sources (person, collection, curate, bulk-add)"
```

---

## Task 5: Wizard Source-step rework (enable person / franchise / vibe)

**Files:**
- Modify: `frontend/src/pages/MarathonWizardPage.jsx`
- Modify: `frontend/src/pages/MarathonsPage.css`

**Reference mockup (source of truth):** `docs/superpowers/mockups/movie-marathons/02-wizard-source.html` — name field + 2×2 source grid; the selected non-manual card reveals an inline panel below the grid. The **vibe** panel shows a textarea + "Generate" button + example chips + a shield-check guardrail line ("Every suggestion is matched to a real TMDB film … hallucinated titles get dropped"). Person/franchise use the same inline-panel pattern with a search box + results + a preview list.

- [ ] **Step 1: Replace the SOURCES list + add source-panel state**

In `MarathonWizardPage.jsx`, replace the `SOURCES` constant so person/franchise/vibe are enabled (vibe only when curation is available — see Step 2):

```jsx
const SOURCES = [
  { key: 'manual',    icon: 'search',   title: 'Pick movies yourself',  desc: 'Search TMDB and add films one by one. Full control over order.', tag: 'Manual' },
  { key: 'person',    icon: 'user',     title: 'By actor, actress, or director',  desc: 'Search a person → pull their films straight from TMDB. Zero guesswork.', tag: 'TMDB credits' },
  { key: 'franchise', icon: 'layers',   title: 'From a franchise',      desc: 'Grab a whole collection in order — trilogies, sagas.', tag: 'Collections' },
  { key: 'vibe',      icon: 'sparkles', title: 'Describe a vibe',       desc: 'Describe a mood or theme and get a lineup you review before it schedules.', tag: 'AI · Gemini' },
];
```

Add state near the other `useState` hooks:

```jsx
  const [curateAvailable, setCurateAvailable] = useState(false);
  // person
  const [personQuery, setPersonQuery] = useState('');
  const [people, setPeople] = useState([]);
  const [personRole, setPersonRole] = useState('acting');
  // franchise
  const [franchiseQuery, setFranchiseQuery] = useState('');
  const [franchiseHits, setFranchiseHits] = useState([]);
  // vibe
  const [vibe, setVibe] = useState('');
  // shared preview of a source-built lineup (before we create the draft)
  const [preview, setPreview] = useState([]);     // [{tmdbId,title,year,posterPath}]
  const [sourceBusy, setSourceBusy] = useState(false);
```

- [ ] **Step 2: Check curation availability on mount**

Add an effect (import `useEffect` from React at the top — update the existing `import { useState } from 'react';` to `import { useState, useEffect } from 'react';`):

```jsx
  useEffect(() => {
    api.getCurateStatus().then((r) => setCurateAvailable(!!r.available)).catch(() => setCurateAvailable(false));
  }, []);
```

- [ ] **Step 3: Add the source-panel handlers**

Add these inside the component:

```jsx
  const EX_CHIPS = ['Feel-good heist movies', '90s cult classics', 'Movies set in space', 'A24 horror'];

  const searchPerson = async (e) => {
    e.preventDefault();
    if (!personQuery.trim()) return;
    setSourceBusy(true);
    try { setPeople(await api.searchTMDBPerson(personQuery.trim())); }
    catch (err) { showError(err.message); } finally { setSourceBusy(false); }
  };

  const pickPerson = async (person) => {
    setSourceBusy(true);
    try {
      const movies = await api.getPersonMovies(person.id, personRole);
      setPreview(movies); setPeople([]); setPersonQuery(person.name);
      if (!name.trim()) setName(`${person.name} Marathon`);
    } catch (err) { showError(err.message); } finally { setSourceBusy(false); }
  };

  const searchFranchise = async (e) => {
    e.preventDefault();
    if (!franchiseQuery.trim()) return;
    setSourceBusy(true);
    try { setFranchiseHits(await api.searchTMDB(franchiseQuery.trim())); }
    catch (err) { showError(err.message); } finally { setSourceBusy(false); }
  };

  const pickFranchise = async (movie) => {
    setSourceBusy(true);
    try {
      const { name: cName, parts } = await api.getMovieCollection(movie.id);
      if (!parts.length) { showError('That film isn’t part of a franchise on TMDB — try another.'); return; }
      setPreview(parts); setFranchiseHits([]); setFranchiseQuery(cName || movie.title);
      if (!name.trim() && cName) setName(cName);
    } catch (err) { showError(err.message); } finally { setSourceBusy(false); }
  };

  const generateVibe = async () => {
    if (!vibe.trim()) return showError('Describe the vibe first');
    setSourceBusy(true);
    try { setPreview(await api.curateMarathon(vibe.trim())); }
    catch (err) { showError(err.message); } finally { setSourceBusy(false); }
  };
```

- [ ] **Step 4: Replace `startBuild` to bulk-add for non-manual sources**

Replace the existing `startBuild` with a source-aware version. Manual behaves exactly as before (empty lineup, search on the Build step); the other sources require a resolved `preview` and bulk-add it after creating the draft:

```jsx
  const startBuild = async () => {
    if (!name.trim()) return showError('Give the marathon a name');
    if (source !== 'manual' && preview.length === 0) {
      return showError('Build a lineup from your chosen source first');
    }
    setBusy(true);
    try {
      const m = await api.createMarathon(name.trim());
      setMarathonId(m.id);
      if (source !== 'manual') {
        const added = await api.bulkAddMarathonItems(m.id, preview.map((p) => p.tmdbId));
        setItems(added);
      }
      setPhase('build');
    } catch (err) { showError(err.message); } finally { setBusy(false); }
  };
```

- [ ] **Step 5: Render the source panels under the grid**

In the `phase === 'source'` block, (a) filter the vibe card out when curation is unavailable, and (b) render an inline panel when a non-manual card is selected. Replace the source-grid `<button>` map so it uses the filtered list and clears `preview` on source change:

```jsx
          <div className="mara-srcgrid">
            {SOURCES.filter((s) => s.key !== 'vibe' || curateAvailable).map((s) => (
              <button key={s.key} type="button"
                className={`mara-src ${source === s.key ? 'sel' : ''}`}
                onClick={() => { setSource(s.key); setPreview([]); }}>
                {source === s.key && <span className="check"><Icon name="check-circle" size={18} /></span>}
                <div className="ic"><Icon name={s.icon} size={20} /></div>
                <h3>{s.title}</h3>
                <p>{s.desc}</p>
                <span className="tag">{s.tag}</span>
              </button>
            ))}
          </div>
```

Immediately after the grid, add the panels (matches mockup 02's inline expansion):

```jsx
          {source === 'person' && (
            <div className="mara-srcpanel">
              <div className="mara-seg" style={{ maxWidth: 260, marginBottom: 14 }}>
                {['acting', 'directing'].map((r) => (
                  <button key={r} type="button" className={personRole === r ? 'on' : ''}
                    onClick={() => setPersonRole(r)}>{r === 'acting' ? 'As actor/actress' : 'As director'}</button>
                ))}
              </div>
              <form className="mara-searchrow" onSubmit={searchPerson}>
                <input value={personQuery} onChange={(e) => setPersonQuery(e.target.value)} placeholder="Search an actor or director…" />
                <button className="btn ghost" type="submit" disabled={sourceBusy}><Icon name="search" size={16} /></button>
              </form>
              {people.length > 0 && (
                <div className="mara-results">
                  {people.map((p) => (
                    <div key={p.id} className="mara-li result">
                      <div className="thumb" style={{ backgroundImage: p.profilePath ? `url(${p.profilePath})` : 'none' }} />
                      <div className="grow"><h4>{p.name}</h4><div className="sub">{p.department}{p.knownFor ? ` · ${p.knownFor}` : ''}</div></div>
                      <button className="btn ghost" onClick={() => pickPerson(p)} disabled={sourceBusy}>Use</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {source === 'franchise' && (
            <div className="mara-srcpanel">
              <form className="mara-searchrow" onSubmit={searchFranchise}>
                <input value={franchiseQuery} onChange={(e) => setFranchiseQuery(e.target.value)} placeholder="Search any film in the franchise…" />
                <button className="btn ghost" type="submit" disabled={sourceBusy}><Icon name="search" size={16} /></button>
              </form>
              {franchiseHits.length > 0 && (
                <div className="mara-results">
                  {franchiseHits.map((mv) => (
                    <div key={mv.id} className="mara-li result">
                      <div className="thumb" style={{ backgroundImage: mv.posterPath ? `url(${mv.posterPath})` : 'none' }} />
                      <div className="grow"><h4>{mv.title}</h4><div className="sub">{mv.year || '—'}</div></div>
                      <button className="btn ghost" onClick={() => pickFranchise(mv)} disabled={sourceBusy}>Use collection</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {source === 'vibe' && curateAvailable && (
            <div className="mara-srcpanel vibe">
              <div className="mara-searchrow">
                <textarea className="mara-vibe" value={vibe} onChange={(e) => setVibe(e.target.value)}
                  placeholder="e.g. cozy rainy-day sci-fi that isn’t too heavy" rows={2} />
                <button className="btn btn-primary" onClick={generateVibe} disabled={sourceBusy}>
                  <Icon name="sparkles" size={15} /> Generate
                </button>
              </div>
              <div className="mara-chips">
                {EX_CHIPS.map((c) => <button key={c} type="button" onClick={() => setVibe(c)}>{c}</button>)}
              </div>
              <div className="mara-guardrail"><Icon name="info" size={13} /> Every suggestion is matched to a real TMDB film and shown for your review — hallucinated titles are dropped before anything schedules.</div>
            </div>
          )}

          {source !== 'manual' && preview.length > 0 && (
            <div className="mara-srcpanel">
              <label className="mara-label">Preview · {preview.length} film{preview.length === 1 ? '' : 's'} — you can trim &amp; reorder next</label>
              {preview.map((p) => (
                <div key={p.tmdbId} className="mara-li">
                  <div className="thumb" style={{ backgroundImage: p.posterPath ? `url(${p.posterPath})` : 'none' }} />
                  <div className="grow"><h4>{p.title}</h4><div className="sub">{p.year || '—'}</div></div>
                </div>
              ))}
            </div>
          )}
```

Update the footer's Next button label to reflect the source (optional polish): keep "Next: build the lineup".

- [ ] **Step 6: Add the panel styles**

Append to `frontend/src/pages/MarathonsPage.css`:

```css
/* Wizard source panels (person / franchise / vibe) */
.mara-srcpanel { margin-top: 16px; background: var(--ink-2); border: 1px solid var(--rule);
  border-radius: var(--r-3); padding: 20px; }
.mara-srcpanel.vibe { border-color: var(--ember); }
.mara-vibe { flex: 1; background: var(--ink); border: 1px solid var(--rule-strong); border-radius: var(--r-2);
  color: var(--bone); font-family: var(--font-ui); font-size: 14px; padding: 12px 14px; resize: vertical; }
.mara-vibe:focus { outline: none; border-color: var(--ember); }
.mara-chips { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 14px; }
.mara-chips button { background: transparent; border: 1px solid var(--rule-strong); border-radius: var(--r-full);
  color: var(--bone-dim); font-size: 12px; padding: 5px 11px; cursor: pointer; }
.mara-chips button:hover { border-color: var(--ember); color: var(--bone); }
.mara-guardrail { display: flex; align-items: center; gap: 7px; margin-top: 14px; font-size: 12px; color: var(--bone-mute); }
.mara-guardrail svg { color: var(--ember); flex-shrink: 0; }
```

- [ ] **Step 7: Verify (build + mockup fidelity)**

Run: `cd frontend && npm run build` → exits 0, emits a `MarathonWizardPage` chunk.
Then **open `docs/superpowers/mockups/movie-marathons/02-wizard-source.html` side-by-side** and confirm: the 2×2 source grid matches; selecting **Describe a vibe** reveals the textarea + Generate + example chips + guardrail line; person/franchise reveal a search + results; a resolved lineup shows as a preview list; the vibe card is hidden when `GEMINI_API_KEY` is unset. Render the page (dev server) — build passing ≠ visually correct.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/pages/MarathonWizardPage.jsx frontend/src/pages/MarathonsPage.css
git commit -m "feat(marathons): enable person/franchise/vibe sources in the create wizard"
```

---

## Final verification (on Railway)

- [ ] Set `GEMINI_API_KEY` (and optionally `GEMINI_MODEL`) in the backend Railway service; deploy.
- [ ] Wizard → **By actor or director**: search a director, toggle "As director", Use → preview of their films → Next → Build shows the lineup with full metadata (runtime shows) → schedule + launch.
- [ ] Wizard → **From a franchise**: search "Alien" → Use collection → the saga appears in release order.
- [ ] Wizard → **Describe a vibe**: "cozy rainy-day sci-fi" → Generate → resolved TMDB films → Next → Build.
- [ ] Unset `GEMINI_API_KEY` on a preview deploy → the vibe card disappears (graceful degradation), person/franchise still work.
- [ ] Confirm a source-built, launched marathon rolls out via `marathonProcessor` exactly like a manual one (Plan 1 pipeline unchanged).

---

## Self-Review

**Spec coverage (Plan 2 scope, spec §2/§5/§7):**
- Sources: manual (Plan 1) + **by actor/director** (Task 1 person endpoints + Task 5 panel) + **franchise** (Task 1 collection + Task 5 panel) + **vibe/Gemini** (Task 3 + Task 5 panel) ✓
- Hybrid curation model — person/franchise via TMDB directly, Gemini only for fuzzy prompts, every AI pick resolved against TMDB + shown for review before scheduling (Task 3 `curateLineup` resolves + Task 5 preview) ✓
- Graceful degradation without `GEMINI_API_KEY` (Task 3 `isCurationAvailable`, Task 5 hides the card) ✓
- All four sources converge on the same Lineup+Schedule step (Task 5 `startBuild` → `phase='build'`) ✓
- Isolated behind `services/curator.js`; only invoked on the vibe path (Task 3) ✓

**Deferred by design:** binge cadence (Plan 3 — Back-to-back mode stays disabled), home calendar/scheduler (Plan 4). No home-page changes here.

**Placeholder scan:** none — all code is concrete. Env setup (`GEMINI_API_KEY`) is an operational step, noted with its default behavior.

**Type/name consistency:** source endpoints return preview items keyed `{tmdbId, title, year, posterPath}`; `bulkAddMarathonItems` sends `preview.map(p => p.tmdbId)`; the bulk route enriches via `tmdb.getMovieDetail` → `detailToItem` (camelCase matching `addMarathonItem`/`addMarathonItemsBulk`). `curateMarathon(prompt)` (client) → `POST /curate {prompt}` (route) → `curateLineup(vibe)` (service). `getCurateStatus()` → `GET /curate` → `{available}` ↔ `curateAvailable` state. Consistent.
