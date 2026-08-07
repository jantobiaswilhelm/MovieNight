# Stats Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add hosts/critics leaderboards and club-wide fun-fact stats to the stats page, plus a "Hall of Fame" podium teaser on the homepage — all from existing data, no migrations.

**Architecture:** Seven new aggregate query functions in `backend/src/models/stats.js` are folded into the existing `GET /stats` aggregate response. The homepage reuses that same `getStats()` call (no extra request) to render a new `HomeHallOfFame` component under the existing stats band. The stats page gains two new sections built from the same payload.

**Tech Stack:** Express + `pg` (raw parameterized SQL, no ORM) · React 18 + Vite · plain CSS with Editorial Cinephile design tokens.

**Testing note:** This repo has **no test framework** (per CLAUDE.md) and local Postgres is often not running (verify against the deployed Railway DB when needed). Verification in this plan therefore uses `node --check` for syntax, a runnable ad-hoc query script, `npm run build`, and rendering the UI in the Vite dev server — not a unit-test harness. Reference render: `docs/superpowers/mockups/stats-expansion-preview.html`.

**Design spec:** `docs/superpowers/specs/2026-08-07-stats-expansion-design.md`

---

## File Structure

- **Modify** `backend/src/models/stats.js` — add 7 exported query functions (Tasks 1–2).
- **Modify** `backend/src/routes/stats.js` — extend the `GET /` aggregate (Task 3).
- **Create** `backend/src/scripts/check-stats.js` — runnable manual verification of the new functions (Task 4).
- **Create** `frontend/src/components/home/HomeHallOfFame.jsx` — homepage podium trio (Task 5).
- **Modify** `frontend/src/components/home/index.js` — barrel export (Task 5).
- **Modify** `frontend/src/pages/Home.jsx` — render the trio (Task 5).
- **Modify** `frontend/src/pages/Home.css` — Hall of Fame styles (Task 5).
- **Modify** `frontend/src/pages/StatsPage.jsx` — "The people" + "Club lore" sections (Tasks 6–7).
- **Modify** `frontend/src/pages/StatsPage.css` — styles for both new sections (Tasks 6–7).

`backend/src/models/index.js` re-exports `stats.js` via `export *`, so new functions are available as `db.<name>` automatically — no barrel edit needed (Step verifies this).

---

### Task 1: Backend — host & critic leaderboard queries

**Files:**
- Modify: `backend/src/models/stats.js` (append new exports at end of file)

- [ ] **Step 1: Add `getTopHosts`**

Append to `backend/src/models/stats.js`:

```javascript
export const getTopHosts = async (guildId, limit = 5) => {
  const result = await pool.query(
    `SELECT u.id, u.username, u.discord_id, u.avatar,
            COUNT(DISTINCT mn.id)::integer AS night_count,
            COALESCE(AVG(r.score), 0) AS avg_pick_rating
     FROM users u
     JOIN movie_nights mn ON mn.announced_by = u.id
     LEFT JOIN ratings r ON r.movie_night_id = mn.id
     WHERE mn.guild_id = $1 AND (mn.is_test = false OR mn.is_test IS NULL)
     GROUP BY u.id
     ORDER BY night_count DESC, u.id
     LIMIT $2`,
    [guildId, limit]
  );
  return result.rows;
};
```

- [ ] **Step 2: Add `getBestTasteHosts`**

```javascript
export const getBestTasteHosts = async (guildId, limit = 5, minHosted = 3) => {
  const result = await pool.query(
    `SELECT u.id, u.username, u.discord_id, u.avatar,
            AVG(r.score) AS avg_rating,
            COUNT(DISTINCT mn.id)::integer AS nights_hosted
     FROM users u
     JOIN movie_nights mn ON mn.announced_by = u.id
     JOIN ratings r ON r.movie_night_id = mn.id
     WHERE mn.guild_id = $1 AND (mn.is_test = false OR mn.is_test IS NULL)
     GROUP BY u.id
     HAVING COUNT(DISTINCT mn.id) >= $3
     ORDER BY avg_rating DESC, nights_hosted DESC, u.id
     LIMIT $2`,
    [guildId, limit, minHosted]
  );
  return result.rows;
};
```

- [ ] **Step 3: Add `getRaterExtremes`**

Returns the single most-generous and harshest qualifying raters. One query, split in JS.

```javascript
export const getRaterExtremes = async (guildId, minRatings = 5) => {
  const result = await pool.query(
    `SELECT u.id, u.username, u.discord_id, u.avatar,
            AVG(r.score) AS avg_given,
            COUNT(*)::integer AS rating_count
     FROM users u
     JOIN ratings r ON r.user_id = u.id
     JOIN movie_nights mn ON mn.id = r.movie_night_id
     WHERE mn.guild_id = $1 AND (mn.is_test = false OR mn.is_test IS NULL)
     GROUP BY u.id
     HAVING COUNT(*) >= $2
     ORDER BY avg_given DESC, rating_count DESC, u.id`,
    [guildId, minRatings]
  );
  const rows = result.rows;
  return {
    most_generous: rows.length > 0 ? rows[0] : null,
    harshest: rows.length > 1 ? rows[rows.length - 1] : null
  };
};
```

- [ ] **Step 4: Add `getMostLoyalAttendees`**

```javascript
export const getMostLoyalAttendees = async (guildId, limit = 5) => {
  const result = await pool.query(
    `SELECT u.id, u.username, u.discord_id, u.avatar,
            COUNT(DISTINCT ma.movie_night_id)::integer AS attended_count
     FROM users u
     JOIN movie_attendance ma ON ma.user_id = u.id
     JOIN movie_nights mn ON mn.id = ma.movie_night_id
     WHERE mn.guild_id = $1 AND (mn.is_test = false OR mn.is_test IS NULL)
     GROUP BY u.id
     ORDER BY attended_count DESC, u.id
     LIMIT $2`,
    [guildId, limit]
  );
  return result.rows;
};
```

- [ ] **Step 5: Verify syntax**

Run: `node --check backend/src/models/stats.js`
Expected: no output (exit 0). Any parse error must be fixed before continuing.

- [ ] **Step 6: Commit**

```bash
git add backend/src/models/stats.js
git commit -m "feat(stats): host & critic leaderboard queries"
```

---

### Task 2: Backend — fun-fact queries

**Files:**
- Modify: `backend/src/models/stats.js` (append)

- [ ] **Step 1: Add `getMostDivisiveFilm`**

One query; most-divisive (highest spread) and most-agreed (lowest spread) split in JS.

```javascript
export const getMostDivisiveFilm = async (guildId, minVotes = 3) => {
  const result = await pool.query(
    `SELECT mn.id, mn.title, mn.image_url,
            AVG(r.score) AS avg,
            MAX(r.score) AS high,
            MIN(r.score) AS low,
            STDDEV_POP(r.score) AS spread,
            COUNT(*)::integer AS rating_count
     FROM movie_nights mn
     JOIN ratings r ON r.movie_night_id = mn.id
     WHERE mn.guild_id = $1 AND (mn.is_test = false OR mn.is_test IS NULL)
     GROUP BY mn.id
     HAVING COUNT(*) >= $2
     ORDER BY spread DESC, rating_count DESC, mn.id`,
    [guildId, minVotes]
  );
  const rows = result.rows;
  return {
    most_divisive: rows.length > 0 ? rows[0] : null,
    most_agreed: rows.length > 1 ? rows[rows.length - 1] : null
  };
};
```

- [ ] **Step 2: Add `getSignatureGenreAndDecade`**

Two small queries in one function.

```javascript
export const getSignatureGenreAndDecade = async (guildId) => {
  const genreResult = await pool.query(
    `SELECT genre, COUNT(*)::integer AS count
     FROM movie_nights mn
     CROSS JOIN LATERAL unnest(string_to_array(mn.genres, ', ')) AS genre
     WHERE mn.guild_id = $1 AND (mn.is_test = false OR mn.is_test IS NULL)
       AND mn.genres IS NOT NULL AND mn.genres != ''
     GROUP BY genre
     ORDER BY count DESC, genre
     LIMIT 1`,
    [guildId]
  );
  const decadeResult = await pool.query(
    `SELECT (FLOOR(mn.release_year / 10.0) * 10)::integer AS decade,
            COUNT(*)::integer AS count
     FROM movie_nights mn
     WHERE mn.guild_id = $1 AND (mn.is_test = false OR mn.is_test IS NULL)
       AND mn.release_year IS NOT NULL
     GROUP BY decade
     ORDER BY count DESC, decade DESC
     LIMIT 1`,
    [guildId]
  );
  return {
    top_genre: genreResult.rows[0] || null,
    top_decade: decadeResult.rows[0] || null
  };
};
```

- [ ] **Step 3: Add `getCadence`**

```javascript
export const getCadence = async (guildId) => {
  const result = await pool.query(
    `SELECT TO_CHAR(scheduled_at, 'YYYY-MM') AS month, COUNT(*)::integer AS count
     FROM movie_nights
     WHERE guild_id = $1 AND scheduled_at IS NOT NULL
       AND (is_test = false OR is_test IS NULL)
     GROUP BY month
     ORDER BY count DESC, month DESC`,
    [guildId]
  );
  const rows = result.rows;
  const totalNights = rows.reduce((sum, r) => sum + r.count, 0);
  const monthCount = rows.length;
  return {
    avg_per_month: monthCount > 0 ? totalNights / monthCount : 0,
    busiest_month: rows.length > 0 ? rows[0].month : null,
    busiest_count: rows.length > 0 ? rows[0].count : 0
  };
};
```

- [ ] **Step 4: Verify syntax**

Run: `node --check backend/src/models/stats.js`
Expected: no output (exit 0).

- [ ] **Step 5: Commit**

```bash
git add backend/src/models/stats.js
git commit -m "feat(stats): divisive-film, signature-genre/decade, cadence queries"
```

---

### Task 3: Backend — extend the `GET /stats` aggregate

**Files:**
- Modify: `backend/src/routes/stats.js:18-60` (the `Promise.all` block and response object in `router.get('/', ...)`)

- [ ] **Step 1: Add the seven calls to the `Promise.all` array**

In `backend/src/routes/stats.js`, the first route (`router.get('/', validateGuildId, ...)`) destructures a `Promise.all`. Add the new destructured names and calls. Replace the existing array (currently ending with `streakLeaderboard`) so it reads:

```javascript
    const [
      stats,
      topMovies,
      topRaters,
      topMonth,
      topYear,
      topAllTime,
      worstMonth,
      worstYear,
      worstAllTime,
      availableMonths,
      totalRuntime,
      streakLeaderboard,
      topHosts,
      bestTasteHosts,
      raterExtremes,
      mostLoyal,
      mostDivisive,
      signature,
      cadence
    ] = await Promise.all([
      db.getGuildStats(req.guildId),
      db.getTopRatedMovies(req.guildId, 5),
      db.getMostActiveRaters(req.guildId, 5),
      db.getTopRatedMoviesByPeriod(req.guildId, 'month', 5, 3, month || null),
      db.getTopRatedMoviesByPeriod(req.guildId, 'year', 5, 3),
      db.getTopRatedMoviesByPeriod(req.guildId, 'all', 5, 3),
      db.getWorstRatedMoviesByPeriod(req.guildId, 'month', 5, 3, month || null),
      db.getWorstRatedMoviesByPeriod(req.guildId, 'year', 5, 3),
      db.getWorstRatedMoviesByPeriod(req.guildId, 'all', 5, 3),
      db.getAvailableMonths(req.guildId),
      db.getGuildTotalRuntime(req.guildId),
      db.getStreakLeaderboard(req.guildId, 5),
      db.getTopHosts(req.guildId, 5),
      db.getBestTasteHosts(req.guildId, 5, 3),
      db.getRaterExtremes(req.guildId, 5),
      db.getMostLoyalAttendees(req.guildId, 5),
      db.getMostDivisiveFilm(req.guildId, 3),
      db.getSignatureGenreAndDecade(req.guildId),
      db.getCadence(req.guildId)
    ]);
```

- [ ] **Step 2: Add the new keys to the `res.json({...})` response**

Replace the existing `res.json({...})` in that same route so it includes the new keys:

```javascript
    res.json({
      ...stats,
      top_movies: topMovies,
      top_raters: topRaters,
      top_month: topMonth,
      top_year: topYear,
      top_all_time: topAllTime,
      worst_month: worstMonth,
      worst_year: worstYear,
      worst_all_time: worstAllTime,
      available_months: availableMonths,
      selected_month: month || null,
      total_runtime: totalRuntime.total_minutes,
      streak_leaderboard: streakLeaderboard,
      top_hosts: topHosts,
      best_taste_hosts: bestTasteHosts,
      rater_extremes: raterExtremes,
      most_loyal: mostLoyal,
      most_divisive: mostDivisive,
      signature,
      cadence
    });
```

- [ ] **Step 3: Verify syntax and barrel export**

Run: `node --check backend/src/routes/stats.js`
Expected: no output (exit 0).

Run: `node -e "import('./backend/src/models/index.js').then(m => console.log(['getTopHosts','getBestTasteHosts','getRaterExtremes','getMostLoyalAttendees','getMostDivisiveFilm','getSignatureGenreAndDecade','getCadence'].map(k => k + ':' + (typeof m[k])).join(' ')))"`
Expected: each name prints `:function`. If any print `:undefined`, open `backend/src/models/index.js` and confirm it re-exports stats.js (add `export * from './stats.js';` if missing), then re-run.

- [ ] **Step 4: Commit**

```bash
git add backend/src/routes/stats.js
git commit -m "feat(stats): surface people & fun-fact aggregates on GET /stats"
```

---

### Task 4: Backend — runnable verification script

**Files:**
- Create: `backend/src/scripts/check-stats.js`

- [ ] **Step 1: Write the script**

Create `backend/src/scripts/check-stats.js`:

```javascript
// Ad-hoc verification for the new stats queries.
// Usage: node backend/src/scripts/check-stats.js <guildId>
// Requires DATABASE_URL in the environment (use the Railway DB if local Postgres is down).
import 'dotenv/config';
import * as db from '../models/index.js';

const guildId = process.argv[2] || process.env.GUILD_ID;
if (!guildId) {
  console.error('Provide a guildId: node backend/src/scripts/check-stats.js <guildId>');
  process.exit(1);
}

const run = async () => {
  const [topHosts, bestTaste, extremes, loyal, divisive, signature, cadence] = await Promise.all([
    db.getTopHosts(guildId, 5),
    db.getBestTasteHosts(guildId, 5, 3),
    db.getRaterExtremes(guildId, 5),
    db.getMostLoyalAttendees(guildId, 5),
    db.getMostDivisiveFilm(guildId, 3),
    db.getSignatureGenreAndDecade(guildId),
    db.getCadence(guildId)
  ]);
  console.log(JSON.stringify(
    { topHosts, bestTaste, extremes, loyal, divisive, signature, cadence },
    null, 2
  ));
  process.exit(0);
};

run().catch((err) => { console.error(err); process.exit(1); });
```

- [ ] **Step 2: Verify syntax**

Run: `node --check backend/src/scripts/check-stats.js`
Expected: no output (exit 0).

- [ ] **Step 3 (optional, only if a database is reachable): Run it**

Run (PowerShell, against whichever DATABASE_URL is set): `node backend/src/scripts/check-stats.js <your-guild-id>`
Expected: a JSON dump with the seven keys and no thrown error. `avg_per_month` is a number; `most_generous`/`harshest` are objects or null. If local Postgres is down, skip this step and rely on the deployed-site verification in Task 8.

- [ ] **Step 4: Commit**

```bash
git add backend/src/scripts/check-stats.js
git commit -m "chore(stats): add ad-hoc verification script for new aggregates"
```

---

### Task 5: Frontend — homepage Hall of Fame trio

**Files:**
- Create: `frontend/src/components/home/HomeHallOfFame.jsx`
- Modify: `frontend/src/components/home/index.js`
- Modify: `frontend/src/pages/Home.jsx:18` (import) and `:350` (render)
- Modify: `frontend/src/pages/Home.css` (append styles)

- [ ] **Step 1: Create the component**

Create `frontend/src/components/home/HomeHallOfFame.jsx`:

```jsx
import { Link } from 'react-router-dom';
import { getAvatarUrl } from '../../utils/helpers';
import './HomeHallOfFame.css';

const num = (v) => (Number(v) || 0).toFixed(1);

// One podium card: #1 featured, #2/#3 as small runner rows.
const PodiumCard = ({ kicker, leader, runners, renderMetric, renderRunnerMetric, accent }) => (
  <div className="hof-card">
    <span className="hof-kicker">{kicker}</span>
    <Link to={`/user/${leader.id}`} className="hof-lead">
      <img className="hof-avatar" src={getAvatarUrl(leader.discord_id, leader.avatar)} alt="" loading="lazy" />
      <span className="hof-name">{leader.username}</span>
    </Link>
    <span className={`hof-metric${accent ? ` ${accent}` : ''}`}>{renderMetric(leader)}</span>
    {runners.length > 0 && (
      <div className="hof-runners">
        {runners.map((r, i) => (
          <Link key={r.id} to={`/user/${r.id}`} className="hof-run">
            <span className="hof-run-rank">{i + 2}</span>
            <img className="hof-run-av" src={getAvatarUrl(r.discord_id, r.avatar)} alt="" loading="lazy" />
            <span className="hof-run-name">{r.username}</span>
            <span className="hof-run-metric">{renderRunnerMetric(r)}</span>
          </Link>
        ))}
      </div>
    )}
  </div>
);

export default function HomeHallOfFame({ stats }) {
  if (!stats) return null;
  const hosts = stats.top_hosts || [];
  const critics = stats.top_raters || [];
  const taste = stats.best_taste_hosts || [];

  const topHost = hosts[0];
  const topCritic = critics[0];
  const bestTaste = taste[0];
  if (!topHost && !topCritic && !bestTaste) return null;

  return (
    <section className="home-hof" aria-label="Hall of fame">
      <div className="home-hof-head">
        <span className="t-eyebrow">Hall of fame</span>
        <Link to="/stats" className="btn text">Full stats →</Link>
      </div>
      <div className="home-hof-grid">
        {topHost && (
          <PodiumCard
            kicker="Top host"
            leader={topHost}
            runners={hosts.slice(1, 3)}
            accent="ember"
            renderMetric={(u) => <>{u.night_count} nights</>}
            renderRunnerMetric={(u) => u.night_count}
          />
        )}
        {topCritic && (
          <PodiumCard
            kicker="Top critic"
            leader={topCritic}
            runners={critics.slice(1, 3)}
            renderMetric={(u) => <>{u.rating_count} <small>ratings</small></>}
            renderRunnerMetric={(u) => u.rating_count}
          />
        )}
        {bestTaste && (
          <PodiumCard
            kicker="Best taste"
            leader={bestTaste}
            runners={taste.slice(1, 3)}
            accent="gold"
            renderMetric={(u) => <>{num(u.avg_rating)}<small>/10</small></>}
            renderRunnerMetric={(u) => num(u.avg_rating)}
          />
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Add the CSS**

Create `frontend/src/components/home/HomeHallOfFame.css`:

```css
.home-hof { margin-top: var(--s-6); }

.home-hof-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: var(--s-3);
}

.home-hof-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--s-3);
}

.hof-card {
  display: flex;
  flex-direction: column;
  gap: var(--s-2);
  padding: var(--s-4);
  background: var(--ink-2);
  border: 1px solid var(--rule);
  border-radius: var(--r-3);
}

.hof-kicker {
  font-family: var(--font-mono);
  font-size: var(--fs-11);
  letter-spacing: .28em;
  text-transform: uppercase;
  color: var(--ember);
}

.hof-lead {
  display: flex;
  align-items: center;
  gap: var(--s-3);
  color: var(--bone);
}
.hof-lead:hover { color: var(--ember); }

.hof-avatar {
  width: 52px;
  height: 52px;
  border-radius: var(--r-full);
  object-fit: cover;
  border: 1px solid var(--rule-strong);
  flex: none;
}

.hof-name {
  font-family: var(--font-display);
  font-size: var(--fs-22);
  line-height: 1.05;
}

.hof-metric {
  font-family: var(--font-display);
  font-size: var(--fs-20);
  color: var(--bone);
}
.hof-metric small { font-family: var(--font-mono); font-size: var(--fs-11); color: var(--bone-mute); }
.hof-metric.ember { color: var(--ember); }
.hof-metric.gold { color: var(--gold); }

.hof-runners {
  margin-top: auto;
  border-top: 1px solid var(--rule);
  padding-top: var(--s-2);
  display: flex;
  flex-direction: column;
  gap: var(--s-2);
}

.hof-run {
  display: flex;
  align-items: center;
  gap: var(--s-2);
  color: var(--bone-dim);
}
.hof-run:hover { color: var(--bone); }

.hof-run-rank {
  font-family: var(--font-mono);
  font-size: var(--fs-11);
  color: var(--bone-mute);
  width: 14px;
  flex: none;
}

.hof-run-av {
  width: 22px;
  height: 22px;
  border-radius: var(--r-full);
  object-fit: cover;
  border: 1px solid var(--rule);
  flex: none;
}

.hof-run-name {
  font-size: var(--fs-14);
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hof-run-metric {
  font-family: var(--font-mono);
  font-size: var(--fs-11);
  color: var(--bone-mute);
  flex: none;
}

@media (max-width: 720px) {
  .home-hof-grid { grid-template-columns: 1fr; }
}
```

Note: if any referenced token (`--r-3`, `--fs-22`, `--fs-20`, `--fs-14`, `--s-6`) is not defined in `frontend/src/index.css`, substitute the nearest existing token on the documented scale (radius 10 → the "10" step; font sizes → nearest `--fs-*` present) rather than hardcoding a literal. Confirm token names by searching `frontend/src/index.css` before finalizing.

- [ ] **Step 3: Barrel-export the component**

In `frontend/src/components/home/index.js`, add after the `HomeStatsBand` line:

```javascript
export { default as HomeHallOfFame } from './HomeHallOfFame';
```

- [ ] **Step 4: Render it in Home.jsx**

In `frontend/src/pages/Home.jsx`, add `HomeHallOfFame` to the existing import from `'../components/home'` (line 18 — add it to the destructured list alongside `HomeStatsBand`).

Then, at line 350, immediately after the `HomeStatsBand` line, add:

```jsx
      {stats && <HomeHallOfFame stats={stats} />}
```

So the two lines read:

```jsx
      {stats && <HomeStatsBand stats={stats} seasonalKey={seasonal?.key || null} />}
      {stats && <HomeHallOfFame stats={stats} />}
```

- [ ] **Step 5: Verify build**

Run: `cd frontend && npm run build`
Expected: build succeeds with no errors referencing `HomeHallOfFame`.

- [ ] **Step 6: Render check**

Run `cd frontend && npm run dev`, open the homepage. Expected: under the movies/hours/rating band, three podium cards (Top Host / Top Critic / Best Taste), each with #2 and #3 beneath. If the backend returns empty arrays (no data), the section is absent — that is correct. Compare against `docs/superpowers/mockups/stats-expansion-preview.html`.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/home/HomeHallOfFame.jsx frontend/src/components/home/HomeHallOfFame.css frontend/src/components/home/index.js frontend/src/pages/Home.jsx frontend/src/pages/Home.css
git commit -m "feat(home): Hall of Fame podium teaser under the stats band"
```

---

### Task 6: Frontend — stats page "The people" section

**Files:**
- Modify: `frontend/src/pages/StatsPage.jsx` (add section after the streak board section, before the closing `</div>`)
- Modify: `frontend/src/pages/StatsPage.css` (append)

- [ ] **Step 1: Add a shared people-row helper and the section**

In `frontend/src/pages/StatsPage.jsx`, above the `StatsPage` component (next to `RankList`), add a reusable ranked-people list:

```jsx
const PeopleList = ({ people, metric, emptyMessage }) => {
  if (!people || people.length === 0) {
    return <p className="sp-empty">{emptyMessage}</p>;
  }
  return (
    <ol className="sp-raters">
      {people.map((p, index) => (
        <li key={p.id}>
          <Link to={`/user/${p.id}`} className="sp-rater">
            <span className="sp-rater-rank">{String(index + 1).padStart(2, '0')}</span>
            <img
              src={getAvatarUrl(p.discord_id, p.avatar)}
              alt={p.username}
              className="sp-rater-avatar"
              loading="lazy"
            />
            <div className="sp-rater-body">
              <span className="sp-rater-name">{p.username}</span>
              {metric(p).sub && <span className="sp-rater-sub">{metric(p).sub}</span>}
            </div>
            <span className="sp-rater-badge">{metric(p).badge}</span>
          </Link>
        </li>
      ))}
    </ol>
  );
};
```

Then, inside the returned JSX of `StatsPage`, after the streak-board `section` block (the one guarded by `stats.streak_leaderboard?.length > 0`) and before the closing `</div>` of `.stats-page`, add:

```jsx
      {(stats.top_hosts?.length > 0 || stats.best_taste_hosts?.length > 0) && (
        <section>
          <SectionHead num="06" title="The people" meta="Hosts & critics" />
          <div className="sp-tri sp-people-cols">
            <div>
              <div className="sp-tri-head"><h3>Top hosts</h3></div>
              <PeopleList
                people={stats.top_hosts}
                emptyMessage="No hosts yet."
                metric={(p) => ({
                  sub: `avg pick ${parseFloat(p.avg_pick_rating).toFixed(1)}`,
                  badge: p.night_count
                })}
              />
            </div>
            <div>
              <div className="sp-tri-head"><h3>Best taste</h3></div>
              <PeopleList
                people={stats.best_taste_hosts}
                emptyMessage="Nobody has hosted 3+ nights yet."
                metric={(p) => ({
                  sub: `${p.nights_hosted} hosted`,
                  badge: parseFloat(p.avg_rating).toFixed(1)
                })}
              />
            </div>
          </div>

          {(stats.rater_extremes?.most_generous || stats.rater_extremes?.harshest) && (
            <div className="sp-verdicts">
              {stats.rater_extremes?.most_generous && (
                <div className="sp-verdict sp-verdict-gen">
                  <span className="sp-verdict-tag">Most generous</span>
                  <Link to={`/user/${stats.rater_extremes.most_generous.id}`} className="sp-verdict-body">
                    <img
                      src={getAvatarUrl(stats.rater_extremes.most_generous.discord_id, stats.rater_extremes.most_generous.avatar)}
                      alt={stats.rater_extremes.most_generous.username}
                      className="sp-rater-avatar"
                      loading="lazy"
                    />
                    <div className="sp-rater-body">
                      <span className="sp-rater-name">{stats.rater_extremes.most_generous.username}</span>
                      <span className="sp-rater-sub">{stats.rater_extremes.most_generous.rating_count} ratings</span>
                    </div>
                    <span className="sp-verdict-num sp-num-gold">
                      {parseFloat(stats.rater_extremes.most_generous.avg_given).toFixed(1)}
                    </span>
                  </Link>
                </div>
              )}
              {stats.rater_extremes?.harshest && (
                <div className="sp-verdict sp-verdict-harsh">
                  <span className="sp-verdict-tag">Harshest</span>
                  <Link to={`/user/${stats.rater_extremes.harshest.id}`} className="sp-verdict-body">
                    <img
                      src={getAvatarUrl(stats.rater_extremes.harshest.discord_id, stats.rater_extremes.harshest.avatar)}
                      alt={stats.rater_extremes.harshest.username}
                      className="sp-rater-avatar"
                      loading="lazy"
                    />
                    <div className="sp-rater-body">
                      <span className="sp-rater-name">{stats.rater_extremes.harshest.username}</span>
                      <span className="sp-rater-sub">{stats.rater_extremes.harshest.rating_count} ratings</span>
                    </div>
                    <span className="sp-verdict-num sp-num-ember">
                      {parseFloat(stats.rater_extremes.harshest.avg_given).toFixed(1)}
                    </span>
                  </Link>
                </div>
              )}
            </div>
          )}

          {stats.most_loyal?.length > 0 && (
            <div className="sp-loyal">
              <div className="sp-tri-head"><h3>Most loyal</h3></div>
              <PeopleList
                people={stats.most_loyal}
                emptyMessage="No attendance recorded yet."
                metric={(p) => ({ sub: 'nights attended', badge: p.attended_count })}
              />
            </div>
          )}
        </section>
      )}
```

- [ ] **Step 2: Add the CSS**

Append to `frontend/src/pages/StatsPage.css`:

```css
.sp-people-cols { margin-bottom: var(--s-6); }

.sp-verdicts {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--s-3);
  margin-bottom: var(--s-6);
}

.sp-verdict {
  padding: var(--s-4);
  background: var(--ink-2);
  border: 1px solid var(--rule);
  border-radius: var(--r-3);
}

.sp-verdict-tag {
  font-family: var(--font-mono);
  font-size: var(--fs-11);
  letter-spacing: .28em;
  text-transform: uppercase;
}
.sp-verdict-gen .sp-verdict-tag { color: var(--gold); }
.sp-verdict-harsh .sp-verdict-tag { color: var(--ember); }

.sp-verdict-body {
  display: flex;
  align-items: center;
  gap: var(--s-3);
  margin-top: var(--s-3);
  color: var(--bone);
}

.sp-verdict-num {
  font-family: var(--font-display);
  font-size: var(--fs-32, 2rem);
  margin-left: auto;
  line-height: 1;
}
.sp-num-gold { color: var(--gold); }
.sp-num-ember { color: var(--ember); }

.sp-loyal { max-width: 560px; }

@media (max-width: 720px) {
  .sp-verdicts { grid-template-columns: 1fr; }
}
```

Use existing `sp-tri`, `sp-raters`, `sp-rater*`, `sp-empty` classes already defined in `StatsPage.css` (from the current raters/streak sections) — do not redefine them. Confirm token names (`--s-6`, `--r-3`, `--fs-32`) exist in `index.css`; substitute the nearest scale value if not.

- [ ] **Step 3: Verify build**

Run: `cd frontend && npm run build`
Expected: build succeeds.

- [ ] **Step 4: Render check**

In the dev server, open `/stats`. Expected: a new "06 · The people" section with Top Hosts + Best Taste side by side, the Generous/Harshest verdict pair, and a Most Loyal list. Matches the stats-page portion of the mockup.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/StatsPage.jsx frontend/src/pages/StatsPage.css
git commit -m "feat(stats): 'The people' section — hosts, taste, generous/harsh, loyal"
```

---

### Task 7: Frontend — stats page "Club lore" section

**Files:**
- Modify: `frontend/src/pages/StatsPage.jsx` (add section after "The people")
- Modify: `frontend/src/pages/StatsPage.css` (append)

- [ ] **Step 1: Add a decade formatter and the section**

In `frontend/src/pages/StatsPage.jsx`, inside the `StatsPage` return, after the "The people" section and before the closing `</div>`, add:

```jsx
      {(stats.most_divisive?.most_divisive || stats.signature?.top_genre || stats.cadence?.busiest_month) && (
        <section>
          <SectionHead num="07" title="Club lore" meta="Fun facts" />
          <div className="sp-facts">
            {stats.most_divisive?.most_divisive && (
              <div className="sp-fact">
                <span className="sp-fact-kicker">Most divisive</span>
                <Link to={`/movie/${stats.most_divisive.most_divisive.id}`} className="sp-fact-big">
                  {stats.most_divisive.most_divisive.title}
                </Link>
                <div className="sp-fact-chips">
                  <span className="sp-chip sp-chip-love">loved {parseFloat(stats.most_divisive.most_divisive.high).toFixed(1)}</span>
                  <span className="sp-chip sp-chip-hate">hated {parseFloat(stats.most_divisive.most_divisive.low).toFixed(1)}</span>
                </div>
                <p className="sp-fact-note">
                  {stats.most_divisive.most_divisive.rating_count} votes · widest spread
                </p>
              </div>
            )}

            {stats.signature?.top_genre && (
              <div className="sp-fact">
                <span className="sp-fact-kicker">Signature</span>
                <span className="sp-fact-big">{stats.signature.top_genre.genre}</span>
                <p className="sp-fact-sub">most-watched genre · {stats.signature.top_genre.count} nights</p>
                {stats.signature.top_decade && (
                  <p className="sp-fact-note">
                    Favourite decade: <strong>{stats.signature.top_decade.decade}s</strong>
                  </p>
                )}
              </div>
            )}

            {stats.cadence?.busiest_month && (
              <div className="sp-fact">
                <span className="sp-fact-kicker">Cadence</span>
                <span className="sp-fact-big">
                  {parseFloat(stats.cadence.avg_per_month).toFixed(1)}<span className="sp-fact-unit"> /mo</span>
                </span>
                <p className="sp-fact-sub">average movies per month</p>
                <p className="sp-fact-note">
                  Busiest: <strong>{formatMonth(stats.cadence.busiest_month)}</strong>, {stats.cadence.busiest_count} nights
                </p>
              </div>
            )}
          </div>
        </section>
      )}
```

Note: `formatMonth` and `getAvatarUrl` are already imported at the top of `StatsPage.jsx`. `Link` is already imported. No new imports needed.

- [ ] **Step 2: Add the CSS**

Append to `frontend/src/pages/StatsPage.css`:

```css
.sp-facts {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--s-3);
}

.sp-fact {
  display: flex;
  flex-direction: column;
  gap: var(--s-2);
  padding: var(--s-5);
  background: var(--ink-2);
  border: 1px solid var(--rule);
  border-radius: var(--r-3);
  min-height: 150px;
}

.sp-fact-kicker {
  font-family: var(--font-mono);
  font-size: var(--fs-11);
  letter-spacing: .28em;
  text-transform: uppercase;
  color: var(--ember);
}

.sp-fact-big {
  font-family: var(--font-display);
  font-weight: 300;
  font-size: var(--fs-32, 2rem);
  line-height: 1.02;
  color: var(--bone);
}
a.sp-fact-big:hover { color: var(--ember); }

.sp-fact-unit { font-size: var(--fs-16); color: var(--bone-dim); }

.sp-fact-sub {
  font-family: var(--font-mono);
  font-size: var(--fs-11);
  letter-spacing: .05em;
  color: var(--bone-dim);
}

.sp-fact-note {
  font-size: var(--fs-14);
  color: var(--bone-dim);
  margin-top: auto;
}
.sp-fact-note strong { color: var(--bone); }

.sp-fact-chips { display: flex; gap: var(--s-2); }

.sp-chip {
  font-family: var(--font-mono);
  font-size: var(--fs-11);
  letter-spacing: .1em;
  padding: 3px 8px;
  border-radius: var(--r-full);
  border: 1px solid var(--rule-strong);
  color: var(--bone-dim);
}
.sp-chip-love { color: var(--gold); }
.sp-chip-hate { color: var(--ember); }

@media (max-width: 720px) {
  .sp-facts { grid-template-columns: 1fr; }
}
```

- [ ] **Step 3: Verify build**

Run: `cd frontend && npm run build`
Expected: build succeeds.

- [ ] **Step 4: Render check**

In the dev server, open `/stats`. Expected: a "07 · Club lore" section with three fact cards (Most Divisive with love/hate chips, Signature genre + decade, Cadence with busiest month). Matches the mockup.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/StatsPage.jsx frontend/src/pages/StatsPage.css
git commit -m "feat(stats): 'Club lore' fun-fact cards (divisive, signature, cadence)"
```

---

### Task 8: End-to-end verification on the deployed site

**Files:** none (verification only)

- [ ] **Step 1: Push the branch and let Railway deploy**

```bash
git push -u origin feat/stats-expansion
```

Wait for Railway to redeploy backend + frontend.

- [ ] **Step 2: Verify the API payload**

Hit the deployed stats endpoint (browser or curl) with a real guild id:
`GET {backend-url}/stats?guildId=<VITE_GUILD_ID>`
Expected: the JSON includes `top_hosts`, `best_taste_hosts`, `rater_extremes` (`{most_generous, harshest}`), `most_loyal`, `most_divisive` (`{most_divisive, most_agreed}`), `signature` (`{top_genre, top_decade}`), and `cadence` (`{avg_per_month, busiest_month, busiest_count}`).

- [ ] **Step 3: Verify both screens render on the deployed site**

- Homepage: the Hall of Fame trio appears under the stats band; avatars, names, metrics, and #2/#3 rows are populated; each card links correctly.
- `/stats`: sections 06 (The people) and 07 (Club lore) render with real data; empty states appear only where a leaderboard genuinely has no qualifiers.

- [ ] **Step 4: Confirm design-token compliance**

Spot-check that rating numbers are gold, host/count accents are ember, eyebrows are mono/uppercase, no hardcoded hex slipped in, and there are no gradients/glass on the new chrome.

---

## Notes for the executor
- Every new query filters by `guild_id` and excludes test rows — do not remove those clauses.
- The homepage makes no new request; it consumes the same `getStats()` payload the stats page uses.
- `most_agreed` (from `getMostDivisiveFilm`) is computed and returned but not yet shown in the UI — it is intentionally available for a future card, per the spec.
- If a design token referenced in CSS does not exist in `frontend/src/index.css`, substitute the nearest existing token on the documented scale; never hardcode a hex value.
