# Homepage Highlights Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three additive, homepage-only delight elements — an animated stat counter band, an "On This Day" nostalgia banner, and playful date-triggered seasonal accents.

**Architecture:** One new backend query + route (On This Day); everything else is frontend. The homepage fetches two more endpoints inside its existing `Promise.all`, renders a counter band (reusable `<CountUp>` + existing `Stat` primitive) and a conditional banner, and applies a date-driven seasonal theme class + decorative overlay. All new fetches fail-soft (`.catch`), so a failure just hides that element.

**Tech Stack:** React 18 + Vite (ESM, plain CSS, `Editorial Cinephile` design system), Express + `pg` (raw parameterized SQL, domain-split models with barrel export).

**Testing note:** This repo has **no test framework** (per `CLAUDE.md`) and local Postgres is usually not running (verify on the deployed Railway site). Per the user's standing preference, UI is verified by rendering. Automated assertions are used only where they run with zero new dependencies: the pure-logic `seasonalTheme` util gets a runnable `node` test; backend gets an import/syntax check plus a manual endpoint check after deploy.

**Reference spec:** `docs/superpowers/specs/2026-07-22-homepage-highlights-design.md`

---

## File Structure

**Create:**
- `frontend/src/components/common/CountUp.jsx` — reusable animated count-up number (also used by future Wrapped feature).
- `frontend/src/components/home/HomeStatsBand.jsx` — the counter band; owns the April Fools reveal gag.
- `frontend/src/components/home/OnThisDay.jsx` — conditional nostalgia banner.
- `frontend/src/components/home/SeasonalDecoration.jsx` — animated particle overlay (snow/bats/confetti).
- `frontend/src/utils/seasonalTheme.js` — date → theme config + resolver.
- `frontend/src/utils/seasonalTheme.test.mjs` — runnable node assertions for the resolver.

**Modify:**
- `backend/src/models/stats.js` — add `getOnThisDay(guildId)`.
- `backend/src/routes/stats.js` — add `GET /on-this-day`.
- `frontend/src/api/client.js` — add `getOnThisDay()`.
- `frontend/src/components/common/index.js` — export `CountUp`.
- `frontend/src/components/home/index.js` — export `HomeStatsBand`, `OnThisDay`, `SeasonalDecoration`.
- `frontend/src/pages/Home.jsx` — fetch stats + on-this-day, render band + banner, apply seasonal theme.
- `frontend/src/pages/Home.css` — styles for band, banner, seasonal particles.

---

## Task 1: Backend — "On This Day" query, route, and client method

**Files:**
- Modify: `backend/src/models/stats.js`
- Modify: `backend/src/routes/stats.js`
- Modify: `frontend/src/api/client.js`

- [ ] **Step 1: Add the model function**

In `backend/src/models/stats.js`, append this export (it re-exports automatically via the `models/index.js` barrel):

```js
export const getOnThisDay = async (guildId) => {
  const result = await pool.query(
    `SELECT
       mn.id AS movie_night_id,
       mn.title,
       mn.image_url,
       EXTRACT(YEAR FROM mn.scheduled_at)::integer AS watched_year,
       (EXTRACT(YEAR FROM CURRENT_DATE) - EXTRACT(YEAR FROM mn.scheduled_at))::integer AS years_ago,
       COALESCE(AVG(r.score), 0) AS avg_rating,
       COUNT(r.id)::integer AS rating_count
     FROM movie_nights mn
     LEFT JOIN ratings r ON mn.id = r.movie_night_id
     WHERE mn.guild_id = $1
       AND (mn.is_test = false OR mn.is_test IS NULL)
       AND mn.scheduled_at <= NOW()
       AND EXTRACT(MONTH FROM mn.scheduled_at) = EXTRACT(MONTH FROM CURRENT_DATE)
       AND EXTRACT(DAY   FROM mn.scheduled_at) = EXTRACT(DAY   FROM CURRENT_DATE)
       AND EXTRACT(YEAR  FROM mn.scheduled_at) < EXTRACT(YEAR  FROM CURRENT_DATE)
     GROUP BY mn.id, mn.title, mn.image_url, mn.scheduled_at
     ORDER BY avg_rating DESC, mn.scheduled_at DESC
     LIMIT 1`,
    [guildId]
  );
  return result.rows[0] || null;
};
```

- [ ] **Step 2: Add the route**

In `backend/src/routes/stats.js`, add this route immediately after the `GET /comments/random` route (both are `validateGuildId` public reads):

```js
// Get the highest-rated movie watched on today's date in a prior year (nostalgia banner)
router.get('/on-this-day', validateGuildId, async (req, res) => {
  try {
    const movie = await db.getOnThisDay(req.guildId);
    res.json(movie);
  } catch (err) {
    console.error('Error fetching on this day:', err);
    res.status(500).json({ error: 'Failed to fetch on this day' });
  }
});
```

- [ ] **Step 3: Add the client method**

In `frontend/src/api/client.js`, add directly below the `getStats` definition (around line 126):

```js
export const getOnThisDay = () =>
  fetchAPI(`/api/stats/on-this-day?guild_id=${GUILD_ID}`);
```

- [ ] **Step 4: Verify the backend files import cleanly (no DB needed)**

Run from the repo root:

```bash
cd backend && node -e "import('./src/models/index.js').then(m => console.log('getOnThisDay:', typeof m.getOnThisDay)).catch(e => { console.error(e); process.exit(1); })"
```

Expected: `getOnThisDay: function` (the `pg` Pool is created lazily, so this does not require a live database).

- [ ] **Step 5: Commit**

```bash
git add backend/src/models/stats.js backend/src/routes/stats.js frontend/src/api/client.js
git commit -m "feat(stats): add On This Day endpoint and client method"
```

- [ ] **Step 6: Post-deploy manual check (after merge/deploy to Railway)**

Hit `GET /api/stats/on-this-day?guild_id=<GUILD_ID>` on the deployed backend. Expected: `null` on a barren date, or a JSON object `{ movie_night_id, title, image_url, watched_year, years_ago, avg_rating, rating_count }` on a date with a past screening.

---

## Task 2: `<CountUp>` reusable component

**Files:**
- Create: `frontend/src/components/common/CountUp.jsx`
- Modify: `frontend/src/components/common/index.js`

- [ ] **Step 1: Create the component**

`frontend/src/components/common/CountUp.jsx`:

```jsx
import { useEffect, useRef, useState } from 'react';

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Animates from 0 up to `value` on mount. Honors prefers-reduced-motion by
// rendering the final value immediately. `format` receives the formatted string.
export default function CountUp({ value, duration = 800, decimals = 0, format }) {
  const target = Number(value) || 0;
  const [display, setDisplay] = useState(() => (prefersReducedMotion() ? target : 0));
  const rafRef = useRef(null);

  useEffect(() => {
    if (prefersReducedMotion()) {
      setDisplay(target);
      return undefined;
    }
    let start = null;
    const easeOut = (t) => 1 - Math.pow(1 - t, 3);
    const tick = (now) => {
      if (start === null) start = now;
      const progress = Math.min((now - start) / duration, 1);
      setDisplay(target * easeOut(progress));
      if (progress < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, duration]);

  const text = decimals > 0 ? display.toFixed(decimals) : String(Math.round(display));
  return <>{format ? format(text) : text}</>;
}
```

- [ ] **Step 2: Export it from the barrel**

In `frontend/src/components/common/index.js`, add:

```js
export { default as CountUp } from './CountUp';
```

- [ ] **Step 3: Verify it builds**

Run:

```bash
cd frontend && npx vite build
```

Expected: build completes with no errors referencing `CountUp`.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/common/CountUp.jsx frontend/src/components/common/index.js
git commit -m "feat(ui): add reusable CountUp component"
```

---

## Task 3: Counter band component + wire into homepage

**Files:**
- Create: `frontend/src/components/home/HomeStatsBand.jsx`
- Modify: `frontend/src/components/home/index.js`
- Modify: `frontend/src/pages/Home.jsx`
- Modify: `frontend/src/pages/Home.css`

- [ ] **Step 1: Create the band component**

`frontend/src/components/home/HomeStatsBand.jsx`. It accepts an optional `seasonalKey`; when it equals `'aprilfools'` (and motion is allowed) it briefly shows absurd values, then reveals the real ones via `<CountUp>`:

```jsx
import { useEffect, useState } from 'react';
import { Stat } from '../ui';
import { CountUp } from '../common';

const reducedMotion = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const FAKE = { movies: '∞', hours: '999,999', rating: '11.0' };

export default function HomeStatsBand({ stats, seasonalKey = null }) {
  const prank = seasonalKey === 'aprilfools' && !reducedMotion();
  const [revealed, setRevealed] = useState(!prank);

  useEffect(() => {
    if (!prank) { setRevealed(true); return undefined; }
    const t = setTimeout(() => setRevealed(true), 1400);
    return () => clearTimeout(t);
  }, [prank]);

  if (!stats) return null;

  const hours = Math.round((stats.total_runtime || 0) / 60);
  const avg = Number(stats.overall_avg_rating) || 0;

  return (
    <section className="home-stats-band" aria-label="Club statistics">
      <Stat
        label="Movies watched"
        value={revealed ? <CountUp value={stats.total_movies} /> : FAKE.movies}
      />
      <Stat
        label="Hours watched"
        value={revealed ? <CountUp value={hours} /> : FAKE.hours}
      />
      <Stat
        label="Average rating"
        value={revealed ? <CountUp value={avg} decimals={1} /> : FAKE.rating}
        unit={revealed ? '/10' : '/11'}
      />
    </section>
  );
}
```

- [ ] **Step 2: Export it from the home barrel**

In `frontend/src/components/home/index.js`, add:

```js
export { default as HomeStatsBand } from './HomeStatsBand';
```

- [ ] **Step 3: Fetch stats in Home.jsx**

In `frontend/src/pages/Home.jsx`:

Add `getStats` to the client import (line ~6-12 block) alongside the existing imports:

```js
import {
  getMovies,
  getNextMovieWithAttendees,
  getUpcomingMoviesWithAttendees,
  getRandomComments,
  toggleAttendance,
  getStats
} from '../api/client';
```

Add `HomeStatsBand` to the home-components import (line ~14):

```js
import { AdminSettingsPanel, UsersSection, AnnounceFlow, SuggestionBoard, HomeStatsBand } from '../components/home';
```

Add state near the other `useState` calls (line ~20-26):

```js
  const [stats, setStats] = useState(null);
```

In `fetchData`, extend the `Promise.all` and set state:

```js
      const [moviesData, nextMovieData, upcomingData, reviewsData, statsData] = await Promise.all([
        getMovies(100, 0),
        getNextMovieWithAttendees().catch(() => null),
        getUpcomingMoviesWithAttendees(5).catch(() => []),
        getRandomComments(12).catch(() => []),
        getStats().catch(() => null)
      ]);
      setMovies(moviesData);
      setNextMovieWithAttendees(nextMovieData);
      setUpcomingWithAttendees(upcomingData);
      setReviews(reviewsData);
      setStats(statsData);
```

- [ ] **Step 4: Render the band after the hero**

In `Home.jsx`, immediately after the closing `</section>` of `hero-split` (line ~295) and before the Reviews carousel comment, add:

```jsx
      {stats && <HomeStatsBand stats={stats} />}
```

- [ ] **Step 5: Add band styles**

Append to `frontend/src/pages/Home.css`:

```css
/* ═══ Homepage stat counter band ═══ */
.home-stats-band {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--s-7);
  margin: var(--s-7) 0;
}
@media (max-width: 640px) {
  .home-stats-band {
    grid-template-columns: 1fr;
    gap: 0;
  }
}
```

- [ ] **Step 6: Verify by rendering**

Run `cd frontend && npm run dev`, open the homepage. Expected: a three-figure band (Movies watched · Hours watched · Average rating) appears below the hero, each number counting up once on load. Confirm the values match the Stats page. With OS "reduce motion" enabled, the numbers appear at their final values with no animation.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/home/HomeStatsBand.jsx frontend/src/components/home/index.js frontend/src/pages/Home.jsx frontend/src/pages/Home.css
git commit -m "feat(home): add animated stat counter band"
```

---

## Task 4: "On This Day" banner

**Files:**
- Create: `frontend/src/components/home/OnThisDay.jsx`
- Modify: `frontend/src/components/home/index.js`
- Modify: `frontend/src/pages/Home.jsx`
- Modify: `frontend/src/pages/Home.css`

- [ ] **Step 1: Create the banner component**

`frontend/src/components/home/OnThisDay.jsx`:

```jsx
import { Link } from 'react-router-dom';
import { Icon } from '../ui';

export default function OnThisDay({ movie }) {
  if (!movie) return null;

  const years = Number(movie.years_ago);
  const yearsLabel = years === 1 ? '1 year ago' : `${years} years ago`;
  const avg = parseFloat(movie.avg_rating);

  return (
    <aside className="on-this-day">
      <span className="otd-eyebrow">
        <Icon name="calendar" size={14} stroke={1.5} />
        On this day &middot; {yearsLabel}
      </span>
      <p className="otd-body">
        You watched{' '}
        <Link to={`/movie/${movie.movie_night_id}`} className="otd-title">
          {movie.title}
        </Link>
        {movie.rating_count > 0 && avg > 0 && (
          <> &middot; rated <strong>{avg.toFixed(1)}</strong></>
        )}
      </p>
    </aside>
  );
}
```

- [ ] **Step 2: Export it from the home barrel**

In `frontend/src/components/home/index.js`, add:

```js
export { default as OnThisDay } from './OnThisDay';
```

- [ ] **Step 3: Fetch and render in Home.jsx**

Add `getOnThisDay` to the client import block:

```js
  getStats,
  getOnThisDay
```

Add `OnThisDay` to the home-components import:

```js
import { AdminSettingsPanel, UsersSection, AnnounceFlow, SuggestionBoard, HomeStatsBand, OnThisDay } from '../components/home';
```

Add state:

```js
  const [onThisDay, setOnThisDay] = useState(null);
```

Extend the `fetchData` `Promise.all` and set state (append to the array + destructure + setter):

```js
      const [moviesData, nextMovieData, upcomingData, reviewsData, statsData, onThisDayData] = await Promise.all([
        getMovies(100, 0),
        getNextMovieWithAttendees().catch(() => null),
        getUpcomingMoviesWithAttendees(5).catch(() => []),
        getRandomComments(12).catch(() => []),
        getStats().catch(() => null),
        getOnThisDay().catch(() => null)
      ]);
      setMovies(moviesData);
      setNextMovieWithAttendees(nextMovieData);
      setUpcomingWithAttendees(upcomingData);
      setReviews(reviewsData);
      setStats(statsData);
      setOnThisDay(onThisDayData);
```

Render it directly after the hero `</section>`, **above** the stats band:

```jsx
      {onThisDay && <OnThisDay movie={onThisDay} />}
      {stats && <HomeStatsBand stats={stats} />}
```

- [ ] **Step 4: Add banner styles**

Append to `frontend/src/pages/Home.css`:

```css
/* ═══ On This Day banner ═══ */
.on-this-day {
  border: 1px solid var(--rule);
  border-left: 2px solid var(--ember);
  padding: var(--s-4) var(--s-5);
  margin: var(--s-6) 0 0;
}
.on-this-day .otd-eyebrow {
  display: inline-flex;
  align-items: center;
  gap: var(--s-2);
  font-family: var(--font-mono);
  font-size: var(--fs-11);
  letter-spacing: .28em;
  text-transform: uppercase;
  color: var(--bone-dim);
}
.on-this-day .otd-body {
  margin: var(--s-2) 0 0;
  font-family: var(--font-ui);
  color: var(--ink-2);
}
.on-this-day .otd-title {
  font-family: var(--font-display);
  font-style: italic;
  color: var(--ink);
}
.on-this-day .otd-title:hover {
  color: var(--ember);
}
```

- [ ] **Step 5: Verify by rendering**

Because the trigger is date-based, verify against a date you know has a past screening. In dev you can temporarily hardcode `setOnThisDay({ movie_night_id: <id>, title: 'Test Movie', years_ago: 2, avg_rating: 8.1, rating_count: 5 })` to confirm layout, then revert. Expected: a slim ember-edged banner reading "On this day · 2 years ago — You watched *Test Movie* · rated 8.1", with the title linking to the movie. When `onThisDay` is null the banner is absent (no empty gap).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/home/OnThisDay.jsx frontend/src/components/home/index.js frontend/src/pages/Home.jsx frontend/src/pages/Home.css
git commit -m "feat(home): add On This Day nostalgia banner"
```

---

## Task 5: Seasonal theme resolver (pure logic + node test)

**Files:**
- Create: `frontend/src/utils/seasonalTheme.js`
- Create: `frontend/src/utils/seasonalTheme.test.mjs`

- [ ] **Step 1: Write the runnable test first**

`frontend/src/utils/seasonalTheme.test.mjs` (month arg to `new Date` is 0-based):

```js
import assert from 'node:assert/strict';
import { getSeasonalTheme } from './seasonalTheme.js';

// Halloween window (October = month index 9)
assert.equal(getSeasonalTheme(new Date(2026, 9, 24)).key, 'halloween');
assert.equal(getSeasonalTheme(new Date(2026, 9, 31)).key, 'halloween');
assert.equal(getSeasonalTheme(new Date(2026, 9, 23)), null);

// Christmas window (December = 11)
assert.equal(getSeasonalTheme(new Date(2026, 11, 20)).key, 'christmas');
assert.equal(getSeasonalTheme(new Date(2026, 11, 26)).key, 'christmas');

// New Year (Dec 31 / Jan 1)
assert.equal(getSeasonalTheme(new Date(2026, 11, 31)).key, 'newyear');
assert.equal(getSeasonalTheme(new Date(2026, 0, 1)).key, 'newyear');

// April Fools (April = 3)
assert.equal(getSeasonalTheme(new Date(2026, 3, 1)).key, 'aprilfools');
assert.equal(getSeasonalTheme(new Date(2026, 3, 2)), null);

// Ordinary day
assert.equal(getSeasonalTheme(new Date(2026, 6, 22)), null);

// Override wins regardless of date; unknown override yields null
assert.equal(getSeasonalTheme(new Date(2026, 6, 22), 'christmas').key, 'christmas');
assert.equal(getSeasonalTheme(new Date(2026, 6, 22), 'bogus'), null);

console.log('seasonalTheme: all assertions passed');
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
node frontend/src/utils/seasonalTheme.test.mjs
```

Expected: FAIL — `Cannot find module` / `does not provide an export named 'getSeasonalTheme'` (the util doesn't exist yet).

- [ ] **Step 3: Implement the resolver**

`frontend/src/utils/seasonalTheme.js`:

```js
// Date-driven homepage seasonal themes. Returns null on ordinary days.
// Windows are intentionally short so the site stays plain almost all year.
const THEMES = [
  { key: 'halloween',  className: 'home--halloween',  eyebrow: "Tonight’s haunt",     inWindow: (m, d) => m === 10 && d >= 24 && d <= 31 },
  { key: 'christmas',  className: 'home--christmas',  eyebrow: "Season’s screenings", inWindow: (m, d) => m === 12 && d >= 20 && d <= 26 },
  { key: 'newyear',    className: 'home--newyear',    eyebrow: 'Year in review',           inWindow: (m, d) => (m === 12 && d === 31) || (m === 1 && d === 1) },
  { key: 'aprilfools', className: 'home--aprilfools', eyebrow: 'Now showing',              inWindow: (m, d) => m === 4 && d === 1 },
];

// `override` (e.g. from a ?season= query param) forces a theme for previewing.
export const getSeasonalTheme = (date = new Date(), override = null) => {
  if (override) {
    return THEMES.find((t) => t.key === override) || null;
  }
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return THEMES.find((t) => t.inWindow(month, day)) || null;
};

export const SEASONAL_KEYS = THEMES.map((t) => t.key);
```

- [ ] **Step 4: Run the test to verify it passes**

Run:

```bash
node frontend/src/utils/seasonalTheme.test.mjs
```

Expected: `seasonalTheme: all assertions passed` (exit code 0).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/seasonalTheme.js frontend/src/utils/seasonalTheme.test.mjs
git commit -m "feat(home): add seasonal theme resolver with tests"
```

---

## Task 6: Seasonal decoration overlay + apply theme on homepage

**Files:**
- Create: `frontend/src/components/home/SeasonalDecoration.jsx`
- Modify: `frontend/src/components/home/index.js`
- Modify: `frontend/src/pages/Home.jsx`
- Modify: `frontend/src/pages/Home.css`

- [ ] **Step 1: Create the decoration overlay**

`frontend/src/components/home/SeasonalDecoration.jsx`. Renders nothing under reduced-motion or for themes with no particles (April Fools uses the counter-band gag instead):

```jsx
const PARTICLE_COUNT = 24;
const PARTICLE_THEMES = ['halloween', 'christmas', 'newyear'];

const reducedMotion = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export default function SeasonalDecoration({ theme }) {
  if (!theme || !PARTICLE_THEMES.includes(theme) || reducedMotion()) return null;

  const particles = Array.from({ length: PARTICLE_COUNT }, (_, i) => (
    <span
      key={i}
      className={`season-particle season-particle--${theme}`}
      style={{
        left: `${(i * 97) % 100}%`,
        animationDelay: `${(i % 8) * 0.7}s`,
        animationDuration: `${6 + (i % 5)}s`,
      }}
      aria-hidden="true"
    />
  ));

  return <div className="seasonal-decoration" aria-hidden="true">{particles}</div>;
}
```

- [ ] **Step 2: Export it from the home barrel**

In `frontend/src/components/home/index.js`, add:

```js
export { default as SeasonalDecoration } from './SeasonalDecoration';
```

- [ ] **Step 3: Wire the theme into Home.jsx**

Add the util import near the top of `frontend/src/pages/Home.jsx`:

```js
import { getSeasonalTheme } from '../utils/seasonalTheme';
```

Add `SeasonalDecoration` to the home-components import:

```js
import { AdminSettingsPanel, UsersSection, AnnounceFlow, SuggestionBoard, HomeStatsBand, OnThisDay, SeasonalDecoration } from '../components/home';
```

Compute the theme in the component body, after the `if (error)` guard (line ~87), reading an optional `?season=` override:

```js
  const seasonOverride =
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('season')
      : null;
  const seasonal = getSeasonalTheme(new Date(), seasonOverride);
```

Apply the theme class to the root element and pass the key into the band + mount the overlay. Change the opening wrapper:

```jsx
    <div className={`home ${seasonal ? seasonal.className : ''}`.trim()}>
      {seasonal && <SeasonalDecoration theme={seasonal.key} />}
      {isAdmin && <AdminSettingsPanel onDataRefresh={handleDataRefresh} />}
```

And update the band render to pass the seasonal key (so April Fools triggers the gag):

```jsx
      {stats && <HomeStatsBand stats={stats} seasonalKey={seasonal?.key || null} />}
```

- [ ] **Step 4: Apply the seasonal eyebrow copy in the hero**

In the hero's eyebrow span (line ~148), swap in the seasonal copy when a theme is active and the hero isn't a past screening:

```jsx
            <span className="eyebrow">
              {seasonal && !isHeroPast
                ? seasonal.eyebrow
                : (isHeroPast ? 'Last screening' : 'Tonight’s feature')}
            </span>
```

- [ ] **Step 5: Add seasonal styles**

Append to `frontend/src/pages/Home.css`:

```css
/* ═══ Seasonal accents ═══ */
/* Homepage-scoped accent swap. Reassigning the --ember token (rather than
   hardcoding hex in properties) keeps the single-accent rule intact. */
.home--halloween { --ember: #c2410c; }  /* blood-orange */
.home--christmas { --ember: #2f6b3f; }  /* evergreen */
.home--newyear   { --ember: var(--gold); }

/* ═══ Seasonal decoration ═══ */
.seasonal-decoration {
  position: fixed;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
  z-index: 5;
}
.season-particle {
  position: absolute;
  top: -5%;
  width: 8px;
  height: 8px;
  border-radius: var(--r-full);
  opacity: .8;
  animation-name: season-fall;
  animation-timing-function: linear;
  animation-iteration-count: infinite;
}
.season-particle--christmas { background: var(--bone); }
.season-particle--halloween {
  background: var(--ember);
  border-radius: 2px;
  opacity: .7;
}
.season-particle--newyear {
  width: 6px;
  height: 10px;
  border-radius: 1px;
  background: var(--gold);
  opacity: .9;
}
@keyframes season-fall {
  0%   { transform: translateY(-10vh) rotate(0deg); }
  100% { transform: translateY(110vh) rotate(220deg); }
}
@media (prefers-reduced-motion: reduce) {
  .seasonal-decoration { display: none; }
}
```

- [ ] **Step 6: Verify each theme with the dev override**

Run `cd frontend && npm run dev`, then load the homepage with each override and confirm behavior:

- `/?season=christmas` — white particles fall; root gets `home--christmas`.
- `/?season=halloween` — ember square particles drift.
- `/?season=newyear` — gold confetti falls.
- `/?season=aprilfools` — no particles, but the counter band first shows `∞ / 999,999 / 11.0` then counts to the real values after ~1.4s.
- No param on an ordinary day — the page is plain, no overlay.
- With OS reduce-motion on — no particles for any theme, and April Fools shows real values immediately.

- [ ] **Step 7: Confirm the build passes**

Run:

```bash
cd frontend && npx vite build
```

Expected: build succeeds with no errors.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/home/SeasonalDecoration.jsx frontend/src/components/home/index.js frontend/src/pages/Home.jsx frontend/src/pages/Home.css
git commit -m "feat(home): add seasonal decorations and theme wiring"
```

---

## Final verification (after all tasks)

- [ ] Deploy to Railway and load the homepage. Confirm: counter band matches the Stats page, animation runs once, On This Day shows/hides correctly for the current date, and the `?season=` override renders each of the four themes.
- [ ] Confirm nothing regressed on the homepage for a logged-out visitor (band/banner still render; they use public endpoints).
