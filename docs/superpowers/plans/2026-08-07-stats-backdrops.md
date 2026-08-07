# Stats Page Backdrops Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the faint film-backdrop treatment (the home page's `.rf-bg` effect) behind the champion hero, the Films module, and every Club-lore card on the stats page.

**Architecture:** Backend queries gain `backdrop_url`/`image_url` columns (and two small representative-image lookups for the genre and cadence cards); the frontend adds a reusable `<Backdrop>` layer and a `.st-has-bg` wrapper class, dropped into existing components with no layout changes.

**Tech Stack:** Express + `pg` (raw parameterized SQL) · React 18 + Vite · plain CSS with Editorial Cinephile tokens.

**Testing note:** No test framework; local Postgres usually down (verify on deployed Railway). Verification uses `node --check`, `cd frontend && npm run build`, rendering in the dev server, and a deployed check. Reference: `docs/superpowers/mockups/stats-backdrops-preview.html`. Spec: `docs/superpowers/specs/2026-08-07-stats-backdrops-design.md`.

---

## File Structure

**Backend** — additive only, no route changes (fields ride on existing `GET /stats` keys):
- `backend/src/models/stats.js` — add `backdrop_url` to champion/divisive/extremes/attendance; representative-image lookups in signature & cadence (Tasks 1–2).
- `backend/src/models/ratings.js` — add `backdrop_url` to the two period queries (Task 1).

**Frontend** — `frontend/src/components/stats/`:
- `Backdrop.jsx` + `Backdrop.css` — the reusable layer (Task 3).
- `shared.css` — add the `.st-has-bg` helper (Task 3).
- `index.js` — export `Backdrop` (Task 3).
- `ChampionHero.jsx`, `FilmsLeaderboard.jsx` — wrap + backdrop (Task 4).
- `ClubLore.jsx` — wrap + backdrop the six cards (Task 5).

**Design-token note:** the `.st-bg` CSS uses `#000`/`transparent` inside a `mask-image` — this is an **alpha stencil**, not a UI color, and mirrors the existing `.rf-bg` in `Home.css` exactly. It is NOT a hardcoded theme color and must not be "tokenised". All actual colors continue to use tokens.

---

### Task 1: Backend — add backdrop columns to existing film queries

**Files:**
- Modify: `backend/src/models/stats.js` (`getReigningChampion`, `getMostDivisiveFilm`, `getFilmExtremes`, `getAttendanceStats`)
- Modify: `backend/src/models/ratings.js` (`getTopRatedMoviesByPeriod`, `getWorstRatedMoviesByPeriod`)

- [ ] **Step 1: Champion — add `backdrop_url`**

In `getReigningChampion` (stats.js), replace:

```javascript
    `SELECT mn.id, mn.title, mn.image_url, mn.release_year, mn.genres,
```
with:
```javascript
    `SELECT mn.id, mn.title, mn.image_url, mn.backdrop_url, mn.release_year, mn.genres,
```

- [ ] **Step 2: Divisive — add `backdrop_url`**

In `getMostDivisiveFilm` (stats.js), replace:

```javascript
    `SELECT mn.id, mn.title, mn.image_url,
            AVG(r.score) AS avg,
```
with:
```javascript
    `SELECT mn.id, mn.title, mn.image_url, mn.backdrop_url,
            AVG(r.score) AS avg,
```

- [ ] **Step 3: Film extremes — add `image_url, backdrop_url`**

In `getFilmExtremes` (stats.js), replace:

```javascript
      `SELECT id, title, runtime, release_year
```
with:
```javascript
      `SELECT id, title, image_url, backdrop_url, runtime, release_year
```

- [ ] **Step 4: Attendance — add `backdrop_url`**

In `getAttendanceStats` (stats.js), replace:

```javascript
    `SELECT mn.id, mn.title, mn.image_url, COUNT(ma.id)::integer AS attendee_count
```
with:
```javascript
    `SELECT mn.id, mn.title, mn.image_url, mn.backdrop_url, COUNT(ma.id)::integer AS attendee_count
```

- [ ] **Step 5: Period queries — add `backdrop_url` (two occurrences)**

In `backend/src/models/ratings.js`, this exact SELECT prefix appears in BOTH `getTopRatedMoviesByPeriod` and `getWorstRatedMoviesByPeriod`. Replace **both** occurrences of:

```javascript
    `SELECT mn.id, mn.title, mn.scheduled_at, mn.image_url,
```
with:
```javascript
    `SELECT mn.id, mn.title, mn.scheduled_at, mn.image_url, mn.backdrop_url,
```

- [ ] **Step 6: Verify syntax**

Run: `node --check backend/src/models/stats.js` and `node --check backend/src/models/ratings.js`
Expected: both exit 0.

- [ ] **Step 7: Commit**

```bash
git add backend/src/models/stats.js backend/src/models/ratings.js
git commit -m "feat(stats): add backdrop_url to champion, divisive, extremes, attendance, period queries"
```

---

### Task 2: Backend — representative-image lookups for signature & cadence

**Files:**
- Modify: `backend/src/models/stats.js` (`getSignatureGenreAndDecade`, `getCadence`)

- [ ] **Step 1: Signature — attach a representative genre film image**

In `getSignatureGenreAndDecade` (stats.js), replace the final return block:

```javascript
  return {
    top_genre: genreResult.rows[0] || null,
    top_decade: decadeResult.rows[0] || null
  };
};
```
with:
```javascript
  const topGenre = genreResult.rows[0] || null;
  if (topGenre) {
    const imgResult = await pool.query(
      `SELECT mn.image_url, mn.backdrop_url
       FROM movie_nights mn
       LEFT JOIN ratings r ON r.movie_night_id = mn.id
       WHERE mn.guild_id = $1 AND (mn.is_test = false OR mn.is_test IS NULL)
         AND mn.genres ILIKE '%' || $2 || '%'
       GROUP BY mn.id
       ORDER BY AVG(r.score) DESC NULLS LAST, mn.id
       LIMIT 1`,
      [guildId, topGenre.genre]
    );
    if (imgResult.rows[0]) {
      topGenre.image_url = imgResult.rows[0].image_url;
      topGenre.backdrop_url = imgResult.rows[0].backdrop_url;
    }
  }
  return {
    top_genre: topGenre,
    top_decade: decadeResult.rows[0] || null
  };
};
```

- [ ] **Step 2: Cadence — attach the busiest month's film image**

In `getCadence` (stats.js), replace the final return block:

```javascript
  return {
    avg_per_month: monthCount > 0 ? totalNights / monthCount : 0,
    busiest_month: rows.length > 0 ? rows[0].month : null,
    busiest_count: rows.length > 0 ? rows[0].count : 0
  };
};
```
with:
```javascript
  const busiestMonth = rows.length > 0 ? rows[0].month : null;
  let busiestImage = null;
  if (busiestMonth) {
    const imgResult = await pool.query(
      `SELECT mn.image_url, mn.backdrop_url
       FROM movie_nights mn
       LEFT JOIN ratings r ON r.movie_night_id = mn.id
       WHERE mn.guild_id = $1 AND (mn.is_test = false OR mn.is_test IS NULL)
         AND TO_CHAR(mn.scheduled_at, 'YYYY-MM') = $2
       GROUP BY mn.id
       ORDER BY AVG(r.score) DESC NULLS LAST, mn.scheduled_at DESC, mn.id
       LIMIT 1`,
      [guildId, busiestMonth]
    );
    busiestImage = imgResult.rows[0] || null;
  }
  return {
    avg_per_month: monthCount > 0 ? totalNights / monthCount : 0,
    busiest_month: busiestMonth,
    busiest_count: rows.length > 0 ? rows[0].count : 0,
    busiest_image_url: busiestImage ? busiestImage.image_url : null,
    busiest_backdrop_url: busiestImage ? busiestImage.backdrop_url : null
  };
};
```

- [ ] **Step 3: Verify syntax + barrel resolution**

Run: `node --check backend/src/models/stats.js`
Expected: exit 0.

Run: `node -e "import('./backend/src/models/index.js').then(m => console.log('ok:', typeof m.getSignatureGenreAndDecade, typeof m.getCadence))"`
Expected: `ok: function function`.

- [ ] **Step 4: Commit**

```bash
git add backend/src/models/stats.js
git commit -m "feat(stats): representative film image for signature genre & busiest month"
```

---

### Task 3: Frontend — Backdrop component + has-bg helper

**Files:**
- Create: `frontend/src/components/stats/Backdrop.jsx`
- Create: `frontend/src/components/stats/Backdrop.css`
- Modify: `frontend/src/components/stats/shared.css` (append)
- Modify: `frontend/src/components/stats/index.js` (append export)

- [ ] **Step 1: Create `Backdrop.jsx`**

```jsx
import { sanitizeImageUrl } from '../../utils/sanitizeUrl';
import './Backdrop.css';

// A faint, feathered film backdrop layer — mirrors the home page's .rf-bg.
// Renders nothing when there is no usable image. Place as the first child of a
// container that has the `st-has-bg` class.
export default function Backdrop({ image }) {
  const src = sanitizeImageUrl(image);
  if (!src) return null;
  return <div className="st-bg" style={{ backgroundImage: `url(${src})` }} aria-hidden="true" />;
}
```

- [ ] **Step 2: Create `Backdrop.css`**

```css
/* Alpha stencil (#000/transparent in mask-image) is not a UI color — it mirrors .rf-bg. */
.st-bg {
  position: absolute;
  inset: 0;
  z-index: 0;
  background-size: cover;
  background-position: center;
  opacity: .14;
  pointer-events: none;
  -webkit-mask-image: radial-gradient(ellipse 78% 78% at center, #000 20%, transparent 82%);
          mask-image: radial-gradient(ellipse 78% 78% at center, #000 20%, transparent 82%);
}
```

- [ ] **Step 3: Append the `.st-has-bg` helper to `shared.css`**

Add at the end of `frontend/src/components/stats/shared.css`:

```css
/* Host for a <Backdrop>: clip the faint image to the container's radius and
   keep real content above it. */
.st-has-bg { position: relative; overflow: hidden; }
.st-has-bg > *:not(.st-bg) { position: relative; z-index: 1; }
```

- [ ] **Step 4: Export `Backdrop` from the barrel**

Append to `frontend/src/components/stats/index.js`:

```javascript
export { default as Backdrop } from './Backdrop';
```

- [ ] **Step 5: Verify build**

Run: `cd frontend && npm run build`
Expected: build succeeds.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/stats/Backdrop.jsx frontend/src/components/stats/Backdrop.css frontend/src/components/stats/shared.css frontend/src/components/stats/index.js
git commit -m "feat(stats): reusable Backdrop layer + has-bg helper"
```

---

### Task 4: Frontend — backdrop the champion hero and Films module

**Files:**
- Modify: `frontend/src/components/stats/ChampionHero.jsx`
- Modify: `frontend/src/components/stats/FilmsLeaderboard.jsx`

- [ ] **Step 1: ChampionHero — import Backdrop**

In `ChampionHero.jsx`, add below the existing `import { Link }` line:

```jsx
import Backdrop from './Backdrop';
```

- [ ] **Step 2: ChampionHero — wrap + backdrop**

Replace the opening of the returned `Link` and its first child. Change:

```jsx
    <Link to={`/movie/${champion.id}`} className="champ">
      {champion.image_url
        ? <img className="champ-poster" src={champion.image_url} alt="" loading="lazy" />
        : <span className="champ-poster champ-poster-empty" aria-hidden="true" />}
```
to:
```jsx
    <Link to={`/movie/${champion.id}`} className="champ st-has-bg">
      <Backdrop image={champion.backdrop_url || champion.image_url} />
      {champion.image_url
        ? <img className="champ-poster" src={champion.image_url} alt="" loading="lazy" />
        : <span className="champ-poster champ-poster-empty" aria-hidden="true" />}
```

- [ ] **Step 3: FilmsLeaderboard — import Backdrop**

In `FilmsLeaderboard.jsx`, add below the `import SegmentedControl` line:

```jsx
import Backdrop from './Backdrop';
```

- [ ] **Step 4: FilmsLeaderboard — wrap + backdrop the module**

Change:

```jsx
    <div className="st-module">
      <div className="st-module-head">
```
to:
```jsx
    <div className="st-module st-has-bg">
      {movies[0] && <Backdrop image={movies[0].backdrop_url || movies[0].image_url} />}
      <div className="st-module-head">
```

- [ ] **Step 5: Verify build**

Run: `cd frontend && npm run build`
Expected: build succeeds.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/stats/ChampionHero.jsx frontend/src/components/stats/FilmsLeaderboard.jsx
git commit -m "feat(stats): backdrops on champion hero and Films module"
```

---

### Task 5: Frontend — backdrop the six Club-lore cards

**Files:**
- Modify: `frontend/src/components/stats/ClubLore.jsx`

- [ ] **Step 1: Import Backdrop**

In `ClubLore.jsx`, add below the `import RatingHistogram` line:

```jsx
import Backdrop from './Backdrop';
```

- [ ] **Step 2: Signature card**

Change:
```jsx
          <div className="lore-card">
            <span className="lore-k">Signature</span>
```
to:
```jsx
          <div className="lore-card st-has-bg">
            <Backdrop image={sig.top_genre.backdrop_url || sig.top_genre.image_url} />
            <span className="lore-k">Signature</span>
```

- [ ] **Step 3: Most-divisive card**

Change:
```jsx
          <div className="lore-card">
            <span className="lore-k">Most divisive</span>
```
to:
```jsx
          <div className="lore-card st-has-bg">
            <Backdrop image={div.backdrop_url || div.image_url} />
            <span className="lore-k">Most divisive</span>
```

- [ ] **Step 4: Cadence card**

Change:
```jsx
          <div className="lore-card">
            <span className="lore-k">Cadence</span>
```
to:
```jsx
          <div className="lore-card st-has-bg">
            <Backdrop image={cad.busiest_backdrop_url || cad.busiest_image_url} />
            <span className="lore-k">Cadence</span>
```

- [ ] **Step 5: Attendance card**

Change:
```jsx
          <div className="lore-card">
            <span className="lore-k">Attendance</span>
```
to:
```jsx
          <div className="lore-card st-has-bg">
            <Backdrop image={att.best.backdrop_url || att.best.image_url} />
            <span className="lore-k">Attendance</span>
```

- [ ] **Step 6: Runtime-extremes card**

Change:
```jsx
          <div className="lore-card lore-span2">
            <span className="lore-k">Runtime extremes</span>
```
to:
```jsx
          <div className="lore-card lore-span2 st-has-bg">
            <Backdrop image={(ext.longest || ext.shortest)?.backdrop_url || (ext.longest || ext.shortest)?.image_url} />
            <span className="lore-k">Runtime extremes</span>
```

- [ ] **Step 7: Era-range card**

Change:
```jsx
          <div className="lore-card lore-span2">
            <span className="lore-k">Era range</span>
```
to:
```jsx
          <div className="lore-card lore-span2 st-has-bg">
            <Backdrop image={(ext.oldest || ext.newest)?.backdrop_url || (ext.oldest || ext.newest)?.image_url} />
            <span className="lore-k">Era range</span>
```

Note: the wide rating-distribution card (`lore-span`) is intentionally left without a backdrop — a photo behind the histogram bars would clash.

- [ ] **Step 8: Verify build**

Run: `cd frontend && npm run build`
Expected: build succeeds.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/components/stats/ClubLore.jsx
git commit -m "feat(stats): backdrops on the six club-lore cards"
```

---

### Task 6: Verification (dev render + deployed)

**Files:** none.

- [ ] **Step 1: Render check (dev)**

Run `cd frontend && npm run dev`, open `/stats`. Expected: faint backdrops behind the champion hero, the Films module, and each of the six lore cards; content stays fully legible; corners are clipped (no image bleeding past rounded borders). With no local DB, empty states show no backdrop — acceptable. Compare against `docs/superpowers/mockups/stats-backdrops-preview.html`.

- [ ] **Step 2: Push and deploy**

```bash
git push -u origin feat/stats-backdrops
```
Wait for Railway to redeploy.

- [ ] **Step 3: Verify on the deployed site**

`GET {backend-url}/stats?guildId=<VITE_GUILD_ID>` — confirm `reigning_champion.backdrop_url`, period arrays carry `backdrop_url`, `most_divisive.most_divisive.backdrop_url`, `film_extremes.*.image_url/backdrop_url`, `attendance.best.backdrop_url`, `signature.top_genre.image_url/backdrop_url`, and `cadence.busiest_image_url/busiest_backdrop_url` are present (values may be null where TMDB had no backdrop).

On the deployed `/stats`: backdrops render on all eight surfaces where an image exists; the Films backdrop changes when you toggle Top/Worst/period; the Signature card shows a genre-appropriate film; the People module and stat band remain image-free.

- [ ] **Step 4: Token / rule compliance**

Confirm no new hardcoded theme colors (the `#000` in `.st-bg`'s mask is an alpha stencil, allowed); the treatment is a photo overlay (permitted); content contrast is unaffected at opacity .14.

---

## Notes for the executor
- Backend changes are additive columns + two small lookups; the `GET /stats` route needs NO change (fields ride on existing keys).
- `<Backdrop>` returns null on a missing/invalid image, so every surface degrades to its current look when no image exists.
- Always keep `guild_id` + `(is_test = false OR is_test IS NULL)` in the new lookups.
- Do not tokenise the `#000`/`transparent` in the mask — it is an alpha stencil copied from `.rf-bg`, not a UI color.
