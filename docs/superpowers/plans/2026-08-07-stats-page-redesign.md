# Stats Page Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the stats page as a four-zone dashboard (Overview + champion hero, a toggled Films leaderboard, a toggled People leaderboard, and a Club-lore fun-facts grid) and add four new backend stats.

**Architecture:** Four new aggregate queries fold into the existing `GET /stats` response. The page is refactored from one large inline file into a thin `StatsPage.jsx` composing focused components in a new `frontend/src/components/stats/` directory. The Films and People modules toggle over arrays already in the payload (client-side state only); the champion hero, rating histogram, runtime/era extremes, and attendance come from the new queries.

**Tech Stack:** Express + `pg` (raw parameterized SQL) · React 18 + Vite · plain CSS with Editorial Cinephile tokens.

**Testing note:** No test framework in this repo; local Postgres is usually down (verify against deployed Railway DB). Verification uses `node --check`, barrel-resolution checks, `cd frontend && npm run build`, rendering in the Vite dev server, and a final deployed check. Visual reference: `docs/superpowers/mockups/stats-redesign-preview.html`. Spec: `docs/superpowers/specs/2026-08-07-stats-page-redesign-design.md`.

---

## File Structure

**Backend**
- Modify `backend/src/models/stats.js` — add 4 query functions (Task 1).
- Modify `backend/src/routes/stats.js` — extend the `GET /` aggregate (Task 2).

**Frontend — new `frontend/src/components/stats/` directory**
- `shared.css` — module/rank/person-row/hot-cold styles used by both leaderboards (Task 3).
- `SegmentedControl.jsx` + `SegmentedControl.css` — reusable toggle (Task 3).
- `ChampionHero.jsx` + `ChampionHero.css` (Task 4).
- `OverviewBand.jsx` + `OverviewBand.css` (Task 4).
- `FilmsLeaderboard.jsx` (Task 5).
- `PeopleLeaderboard.jsx` (Task 6).
- `RatingHistogram.jsx` + `RatingHistogram.css` (Task 7).
- `ClubLore.jsx` + `ClubLore.css` (Task 7).
- `index.js` — barrel (built up across Tasks 3–7).

**Frontend — rewrite**
- `frontend/src/pages/StatsPage.jsx` — thin composition (Task 8).
- `frontend/src/pages/StatsPage.css` — replaced with page/zone-level styles only (Task 8).

`backend/src/models/index.js` already re-exports `stats.js` via `export *` — no barrel edit needed.

**Design tokens:** Use tokens by name from `frontend/src/index.css`. The `--fs-*` scale present is 11/12/13/14/16/19/24/32/48/72/108; spacing `--s-1..--s-9` = 4/8/12/16/24/32/48/64/96; radius tokens include `--r-3` (10px) and `--r-full`. Colors: `--ink`, `--ink-2`, `--ink-3`, `--bone`, `--bone-dim`, `--bone-mute`, `--ember`, `--ember-soft`, `--gold`, `--rule`, `--rule-strong`. Fonts `--font-display`, `--font-ui`, `--font-mono`. If any referenced token is absent, substitute the nearest existing scale value — never hardcode hex. Fixed small pixel sizes for avatars/posters/thumbs are acceptable.

---

### Task 1: Backend — champion, distribution, extremes, attendance queries

**Files:**
- Modify: `backend/src/models/stats.js` (append at end)

- [ ] **Step 1: Add `getReigningChampion`**

```javascript
export const getReigningChampion = async (guildId, minVotes = 3) => {
  const result = await pool.query(
    `SELECT mn.id, mn.title, mn.image_url, mn.release_year, mn.genres,
            AVG(r.score) AS avg_rating,
            COUNT(r.id)::integer AS rating_count,
            u.username AS host_name
     FROM movie_nights mn
     JOIN ratings r ON r.movie_night_id = mn.id
     LEFT JOIN users u ON mn.announced_by = u.id
     WHERE mn.guild_id = $1 AND (mn.is_test = false OR mn.is_test IS NULL)
     GROUP BY mn.id, u.username
     HAVING COUNT(r.id) >= $2
     ORDER BY avg_rating DESC, rating_count DESC, mn.id
     LIMIT 1`,
    [guildId, minVotes]
  );
  return result.rows[0] || null;
};
```

- [ ] **Step 2: Add `getClubRatingDistribution`**

```javascript
export const getClubRatingDistribution = async (guildId) => {
  const result = await pool.query(
    `SELECT gs.score::integer AS score, COALESCE(counts.count, 0)::integer AS count
     FROM generate_series(1, 10, 1) AS gs(score)
     LEFT JOIN (
       SELECT ROUND(r.score)::integer AS bucket, COUNT(*)::integer AS count
       FROM ratings r
       JOIN movie_nights mn ON mn.id = r.movie_night_id
       WHERE mn.guild_id = $1 AND (mn.is_test = false OR mn.is_test IS NULL)
       GROUP BY bucket
     ) counts ON gs.score = counts.bucket
     ORDER BY gs.score`,
    [guildId]
  );
  return result.rows;
};
```

- [ ] **Step 3: Add `getFilmExtremes`**

```javascript
export const getFilmExtremes = async (guildId) => {
  const one = async (orderCol, dir, notNullCol) => {
    const res = await pool.query(
      `SELECT id, title, runtime, release_year
       FROM movie_nights
       WHERE guild_id = $1 AND (is_test = false OR is_test IS NULL)
         AND ${notNullCol} IS NOT NULL
       ORDER BY ${orderCol} ${dir}, id
       LIMIT 1`,
      [guildId]
    );
    return res.rows[0] || null;
  };
  const [longest, shortest, oldest, newest] = await Promise.all([
    one('runtime', 'DESC', 'runtime'),
    one('runtime', 'ASC', 'runtime'),
    one('release_year', 'ASC', 'release_year'),
    one('release_year', 'DESC', 'release_year')
  ]);
  return { longest, shortest, oldest, newest };
};
```

Note: `orderCol`/`notNullCol`/`dir` are hardcoded literals passed by this function only — never user input — so string interpolation here is safe (no injection surface).

- [ ] **Step 4: Add `getAttendanceStats`**

```javascript
export const getAttendanceStats = async (guildId) => {
  const bestResult = await pool.query(
    `SELECT mn.id, mn.title, mn.image_url, COUNT(ma.id)::integer AS attendee_count
     FROM movie_nights mn
     JOIN movie_attendance ma ON ma.movie_night_id = mn.id
     WHERE mn.guild_id = $1 AND (mn.is_test = false OR mn.is_test IS NULL)
     GROUP BY mn.id
     ORDER BY attendee_count DESC, mn.id
     LIMIT 1`,
    [guildId]
  );
  const avgResult = await pool.query(
    `SELECT COALESCE(AVG(cnt), 0) AS avg_attendance
     FROM (
       SELECT COUNT(ma.id)::integer AS cnt
       FROM movie_nights mn
       JOIN movie_attendance ma ON ma.movie_night_id = mn.id
       WHERE mn.guild_id = $1 AND (mn.is_test = false OR mn.is_test IS NULL)
       GROUP BY mn.id
     ) t`,
    [guildId]
  );
  return {
    avg_attendance: Number(avgResult.rows[0].avg_attendance) || 0,
    best: bestResult.rows[0] || null
  };
};
```

- [ ] **Step 5: Verify syntax**

Run: `node --check backend/src/models/stats.js`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add backend/src/models/stats.js
git commit -m "feat(stats): champion, rating distribution, film extremes, attendance queries"
```

---

### Task 2: Backend — wire the four new aggregates into `GET /stats`

**Files:**
- Modify: `backend/src/routes/stats.js` (the `router.get('/', ...)` handler)

- [ ] **Step 1: Add the four calls to the `Promise.all` destructure**

In `backend/src/routes/stats.js`, extend the existing `Promise.all` in the first route. After the existing `db.getCadence(req.guildId)` line, add four entries, and add the matching names to the destructured array:

```javascript
      cadence,
      reigningChampion,
      ratingDistribution,
      filmExtremes,
      attendance
    ] = await Promise.all([
```
…and at the end of the call array (after `db.getCadence(req.guildId)`):
```javascript
      db.getCadence(req.guildId),
      db.getReigningChampion(req.guildId, 3),
      db.getClubRatingDistribution(req.guildId),
      db.getFilmExtremes(req.guildId),
      db.getAttendanceStats(req.guildId)
    ]);
```

- [ ] **Step 2: Add the four keys to `res.json({...})`**

After the existing `cadence` key in the response object, add:

```javascript
      cadence,
      reigning_champion: reigningChampion,
      rating_distribution: ratingDistribution,
      film_extremes: filmExtremes,
      attendance
    });
```

- [ ] **Step 3: Verify syntax + barrel resolution**

Run: `node --check backend/src/routes/stats.js`
Expected: exit 0.

Run: `node -e "import('./backend/src/models/index.js').then(m => console.log(['getReigningChampion','getClubRatingDistribution','getFilmExtremes','getAttendanceStats'].map(k => k + ':' + (typeof m[k])).join(' ')))"`
Expected: each prints `:function`.

- [ ] **Step 4: Commit**

```bash
git add backend/src/routes/stats.js
git commit -m "feat(stats): surface champion, distribution, extremes, attendance on GET /stats"
```

---

### Task 3: Frontend — SegmentedControl + shared leaderboard styles + barrel

**Files:**
- Create: `frontend/src/components/stats/SegmentedControl.jsx`
- Create: `frontend/src/components/stats/SegmentedControl.css`
- Create: `frontend/src/components/stats/shared.css`
- Create: `frontend/src/components/stats/index.js`

- [ ] **Step 1: Create `SegmentedControl.jsx`**

```jsx
import './SegmentedControl.css';

export default function SegmentedControl({ options, value, onChange, variant }) {
  return (
    <div className={`seg${variant === 'gold' ? ' seg-gold' : ''}`} role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          className={value === o.value ? 'on' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Create `SegmentedControl.css`**

```css
.seg { display: inline-flex; border: 1px solid var(--rule-strong); border-radius: var(--r-full); overflow: hidden; }
.seg button {
  background: transparent; border: 0; color: var(--bone-mute);
  font-family: var(--font-mono); font-size: var(--fs-11); letter-spacing: .18em; text-transform: uppercase;
  padding: 7px 13px; cursor: pointer; transition: color .12s, background .12s;
}
.seg button + button { border-left: 1px solid var(--rule); }
.seg button:hover { color: var(--bone-dim); }
.seg button.on { background: var(--ember); color: var(--ink); }
.seg.seg-gold button.on { background: var(--gold); }
```

- [ ] **Step 3: Create `shared.css`** (module + rank + person-row + hot-cold, used by both leaderboards)

```css
.st-module { border: 1px solid var(--rule); border-radius: var(--r-3); background: var(--ink-2); }
.st-module-head {
  display: flex; align-items: center; gap: var(--s-3);
  padding: var(--s-3) var(--s-4); flex-wrap: wrap;
}
.st-mh-title { font-family: var(--font-mono); font-size: var(--fs-11); letter-spacing: .28em; text-transform: uppercase; color: var(--bone-dim); }
.st-controls { display: flex; flex-wrap: wrap; gap: var(--s-2); align-items: center; margin-left: auto; }

.st-ranks { list-style: none; margin: 0; padding: 0; }
.st-rank {
  display: flex; align-items: center; gap: var(--s-3);
  padding: var(--s-3) var(--s-4); border-top: 1px solid var(--rule);
  color: var(--bone); transition: background .12s;
}
.st-rank:hover { background: var(--ink-3); }
.st-rk { font-family: var(--font-mono); font-size: var(--fs-12); color: var(--bone-mute); width: 22px; flex: none; }
.st-thumb { width: 38px; height: 56px; border-radius: 4px; object-fit: cover; border: 1px solid var(--rule-strong); flex: none; background: var(--ink-3); }
.st-thumb-empty { display: inline-block; }
.st-avatar { width: 40px; height: 40px; border-radius: var(--r-full); object-fit: cover; border: 1px solid var(--rule-strong); flex: none; }
.st-rbody { display: flex; flex-direction: column; min-width: 0; flex: 1; }
.st-rname { font-size: var(--fs-16); font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.st-rsub { font-family: var(--font-mono); font-size: var(--fs-11); letter-spacing: .04em; color: var(--bone-dim); margin-top: 2px; }
.st-rmetric { font-family: var(--font-display); font-size: var(--fs-24); flex: none; }
.st-rmetric small { font-family: var(--font-mono); font-size: var(--fs-11); color: var(--bone-mute); }
.st-rmetric.gold { color: var(--gold); }
.st-rmetric.bone { color: var(--bone); }

.st-empty { padding: var(--s-4); color: var(--bone-mute); font-family: var(--font-mono); font-size: var(--fs-12); letter-spacing: .04em; }

.st-hotcold { display: grid; grid-template-columns: 1fr 1fr; gap: var(--s-2); padding: var(--s-3) var(--s-4) 0; }
.st-hc { display: flex; align-items: center; gap: var(--s-3); padding: var(--s-3); border: 1px solid var(--rule); border-radius: var(--r-3); background: var(--ink); color: var(--bone); text-decoration: none; }
.st-hc:hover { border-color: var(--rule-strong); }
.st-hc-tag { font-family: var(--font-mono); font-size: var(--fs-11); letter-spacing: .22em; text-transform: uppercase; }
.st-hc.gen .st-hc-tag { color: var(--gold); }
.st-hc.harsh .st-hc-tag { color: var(--ember); }
.st-hc .st-avatar { width: 34px; height: 34px; }
.st-hc-body { display: flex; flex-direction: column; min-width: 0; }
.st-hc-body .n { font-size: var(--fs-14); font-weight: 500; }
.st-hc-body .s { font-family: var(--font-mono); font-size: var(--fs-11); color: var(--bone-dim); letter-spacing: .04em; }
.st-hc-num { font-family: var(--font-display); font-size: var(--fs-24); margin-left: auto; line-height: 1; }
.st-hc.gen .st-hc-num { color: var(--gold); }
.st-hc.harsh .st-hc-num { color: var(--ember); }

@media (max-width: 720px) { .st-hotcold { grid-template-columns: 1fr; } }
```

- [ ] **Step 4: Create the barrel `index.js`** (components added as later tasks create them)

```javascript
export { default as SegmentedControl } from './SegmentedControl';
```

- [ ] **Step 5: Verify build**

Run: `cd frontend && npm run build`
Expected: build succeeds (new files compile; nothing imports them yet).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/stats/SegmentedControl.jsx frontend/src/components/stats/SegmentedControl.css frontend/src/components/stats/shared.css frontend/src/components/stats/index.js
git commit -m "feat(stats): SegmentedControl + shared leaderboard styles"
```

---

### Task 4: Frontend — ChampionHero + OverviewBand

**Files:**
- Create: `frontend/src/components/stats/ChampionHero.jsx`
- Create: `frontend/src/components/stats/ChampionHero.css`
- Create: `frontend/src/components/stats/OverviewBand.jsx`
- Create: `frontend/src/components/stats/OverviewBand.css`
- Modify: `frontend/src/components/stats/index.js`

- [ ] **Step 1: Create `ChampionHero.jsx`**

```jsx
import { Link } from 'react-router-dom';
import './ChampionHero.css';

export default function ChampionHero({ champion }) {
  if (!champion) return null;
  const genre = champion.genres ? champion.genres.split(',')[0].trim() : null;
  const meta = [
    champion.release_year,
    genre,
    `${champion.rating_count} vote${Number(champion.rating_count) !== 1 ? 's' : ''}`,
    champion.host_name ? `hosted by ${champion.host_name}` : null
  ].filter(Boolean).join(' · ');

  return (
    <Link to={`/movie/${champion.id}`} className="champ">
      {champion.image_url
        ? <img className="champ-poster" src={champion.image_url} alt="" loading="lazy" />
        : <span className="champ-poster champ-poster-empty" aria-hidden="true" />}
      <div className="champ-info">
        <span className="champ-kicker">Reigning champion · highest rated of all time</span>
        <div className="champ-title">{champion.title}</div>
        {meta && <div className="champ-sub">{meta}</div>}
      </div>
      <div className="champ-score">
        <div className="champ-score-num">{parseFloat(champion.avg_rating).toFixed(1)}</div>
        <div className="champ-score-unit">/ 10</div>
      </div>
    </Link>
  );
}
```

- [ ] **Step 2: Create `ChampionHero.css`**

```css
.champ {
  display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: var(--s-5);
  padding: var(--s-5); border: 1px solid var(--rule-strong); border-radius: var(--r-3);
  background: var(--ink-2); color: var(--bone); margin-bottom: var(--s-3);
}
.champ:hover { border-color: var(--ember); }
.champ-poster { width: 104px; height: 156px; border-radius: 6px; object-fit: cover; border: 1px solid var(--rule-strong); flex: none; background: var(--ink-3); }
.champ-poster-empty { display: block; }
.champ-info { min-width: 0; }
.champ-kicker { font-family: var(--font-mono); font-size: var(--fs-11); letter-spacing: .28em; text-transform: uppercase; color: var(--gold); display: block; margin-bottom: var(--s-2); }
.champ-title { font-family: var(--font-display); font-style: italic; font-weight: 300; font-size: clamp(30px, 4.5vw, 48px); line-height: 1; }
.champ-sub { color: var(--bone-dim); font-family: var(--font-mono); font-size: var(--fs-12); letter-spacing: .05em; margin-top: var(--s-3); }
.champ-score { text-align: right; flex: none; }
.champ-score-num { font-family: var(--font-display); font-weight: 300; font-size: clamp(52px, 9vw, 88px); line-height: .9; color: var(--gold); }
.champ-score-unit { font-family: var(--font-mono); font-size: var(--fs-12); color: var(--bone-mute); letter-spacing: .2em; }
@media (max-width: 720px) { .champ { grid-template-columns: 1fr; } .champ-score { text-align: left; } }
```

- [ ] **Step 3: Create `OverviewBand.jsx`**

```jsx
import './OverviewBand.css';

export default function OverviewBand({ stats }) {
  const hours = Math.round((stats.total_runtime || 0) / 60);
  const cells = [
    ['Screenings', Number(stats.total_movies).toLocaleString()],
    ['Hours in the dark', hours.toLocaleString()],
    ['Ratings cast', Number(stats.total_ratings).toLocaleString()],
    ['Club average', <>{parseFloat(stats.overall_avg_rating).toFixed(1)}<span className="ob-unit">/10</span></>],
    ['Voters', Number(stats.total_raters).toLocaleString()]
  ];
  return (
    <div className="ob-band">
      {cells.map(([label, value]) => (
        <div className="ob-cell" key={label}>
          <span className="ob-lbl">{label}</span>
          <span className="ob-val">{value}</span>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Create `OverviewBand.css`**

```css
.ob-band { display: grid; grid-template-columns: repeat(5, 1fr); border: 1px solid var(--rule); border-radius: var(--r-3); overflow: hidden; }
.ob-cell { padding: var(--s-3) var(--s-4); }
.ob-cell + .ob-cell { border-left: 1px solid var(--rule); }
.ob-lbl { font-family: var(--font-mono); font-size: var(--fs-11); letter-spacing: .24em; text-transform: uppercase; color: var(--bone-mute); display: block; margin-bottom: var(--s-2); }
.ob-val { font-family: var(--font-display); font-weight: 300; font-size: var(--fs-32); line-height: 1; letter-spacing: -.02em; }
.ob-unit { font-size: var(--fs-14); color: var(--bone-dim); margin-left: 2px; }
@media (max-width: 720px) { .ob-band { grid-template-columns: 1fr 1fr; } }
```

- [ ] **Step 5: Add exports to the barrel**

Append to `frontend/src/components/stats/index.js`:

```javascript
export { default as ChampionHero } from './ChampionHero';
export { default as OverviewBand } from './OverviewBand';
```

- [ ] **Step 6: Verify build**

Run: `cd frontend && npm run build`
Expected: build succeeds.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/stats/ChampionHero.jsx frontend/src/components/stats/ChampionHero.css frontend/src/components/stats/OverviewBand.jsx frontend/src/components/stats/OverviewBand.css frontend/src/components/stats/index.js
git commit -m "feat(stats): champion hero + overview stat band"
```

---

### Task 5: Frontend — FilmsLeaderboard

**Files:**
- Create: `frontend/src/components/stats/FilmsLeaderboard.jsx`
- Modify: `frontend/src/components/stats/index.js`

- [ ] **Step 1: Create `FilmsLeaderboard.jsx`**

```jsx
import { useState } from 'react';
import { Link } from 'react-router-dom';
import SegmentedControl from './SegmentedControl';
import './shared.css';

const PERIOD_LABEL = { month: 'this month', year: 'this year', all: 'all time' };
const PERIOD_KEY = { month: 'month', year: 'year', all: 'all_time' };

export default function FilmsLeaderboard({ stats }) {
  const [mode, setMode] = useState('top');
  const [period, setPeriod] = useState('all');

  const prefix = mode === 'top' ? 'top' : 'worst';
  const movies = stats[`${prefix}_${PERIOD_KEY[period]}`] || [];
  const gold = mode === 'top';

  return (
    <div className="st-module">
      <div className="st-module-head">
        <span className="st-mh-title">{mode === 'top' ? 'Top rated' : 'Worst rated'} · {PERIOD_LABEL[period]}</span>
        <div className="st-controls">
          <SegmentedControl
            value={mode}
            onChange={setMode}
            options={[{ value: 'top', label: 'Top' }, { value: 'worst', label: 'Worst' }]}
          />
          <SegmentedControl
            value={period}
            onChange={setPeriod}
            options={[{ value: 'month', label: 'Month' }, { value: 'year', label: 'Year' }, { value: 'all', label: 'All time' }]}
          />
        </div>
      </div>
      {movies.length === 0 ? (
        <p className="st-empty">Nothing with 3+ votes {PERIOD_LABEL[period]}.</p>
      ) : (
        <ol className="st-ranks">
          {movies.map((m, i) => (
            <li key={m.id}>
              <Link to={`/movie/${m.id}`} className="st-rank">
                <span className="st-rk">{String(i + 1).padStart(2, '0')}</span>
                {m.image_url
                  ? <img className="st-thumb" src={m.image_url} alt="" loading="lazy" />
                  : <span className="st-thumb st-thumb-empty" aria-hidden="true" />}
                <div className="st-rbody">
                  <span className="st-rname">{m.title}</span>
                  <span className="st-rsub">{m.rating_count} vote{Number(m.rating_count) !== 1 ? 's' : ''}</span>
                </div>
                <span className={`st-rmetric ${gold ? 'gold' : 'bone'}`}>
                  {parseFloat(m.avg_rating).toFixed(1)}<small>/10</small>
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add export to the barrel**

Append to `frontend/src/components/stats/index.js`:

```javascript
export { default as FilmsLeaderboard } from './FilmsLeaderboard';
```

- [ ] **Step 3: Verify build**

Run: `cd frontend && npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/stats/FilmsLeaderboard.jsx frontend/src/components/stats/index.js
git commit -m "feat(stats): Films leaderboard with Top/Worst + period toggles"
```

---

### Task 6: Frontend — PeopleLeaderboard

**Files:**
- Create: `frontend/src/components/stats/PeopleLeaderboard.jsx`
- Modify: `frontend/src/components/stats/index.js`

- [ ] **Step 1: Create `PeopleLeaderboard.jsx`**

```jsx
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { getAvatarUrl } from '../../utils/helpers';
import SegmentedControl from './SegmentedControl';
import './shared.css';

const f1 = (v) => parseFloat(v).toFixed(1);

const METRICS = {
  ratings: { label: 'Most ratings', key: 'top_raters', gold: false,
    row: (p) => ({ sub: `avg given ${f1(p.avg_rating)}`, badge: p.rating_count }) },
  taste: { label: 'Best taste', key: 'best_taste_hosts', gold: true,
    row: (p) => ({ sub: `${p.nights_hosted} hosted`, badge: f1(p.avg_rating) }) },
  hosted: { label: 'Most hosted', key: 'top_hosts', gold: false,
    row: (p) => ({ sub: `avg pick ${f1(p.avg_pick_rating)}`, badge: p.night_count }) },
  streak: { label: 'Longest streak', key: 'streak_leaderboard', gold: false,
    row: (p) => ({ sub: p.current_streak > 0 ? `${p.current_streak} current` : 'no active streak', badge: p.longest_streak }) },
  loyal: { label: 'Most loyal', key: 'most_loyal', gold: false,
    row: (p) => ({ sub: 'nights attended', badge: p.attended_count }) }
};
const ORDER = ['ratings', 'taste', 'hosted', 'streak', 'loyal'];

const HotCold = ({ tag, cls, person }) => (
  <Link to={`/user/${person.id}`} className={`st-hc ${cls}`}>
    <span className="st-hc-tag">{tag}</span>
    <img className="st-avatar" src={getAvatarUrl(person.discord_id, person.avatar)} alt="" loading="lazy" />
    <div className="st-hc-body">
      <span className="n">{person.username}</span>
      <span className="s">{person.rating_count} ratings</span>
    </div>
    <span className="st-hc-num">{f1(person.avg_given)}</span>
  </Link>
);

export default function PeopleLeaderboard({ stats }) {
  const available = ORDER.filter((m) => (stats[METRICS[m].key] || []).length > 0);
  const [metric, setMetric] = useState(available[0] || 'ratings');

  const extremes = stats.rater_extremes || {};
  const hasHotCold = extremes.most_generous || extremes.harshest;

  if (available.length === 0 && !hasHotCold) return null;

  const active = METRICS[metric] || METRICS.ratings;
  const list = stats[active.key] || [];

  return (
    <div className="st-module">
      {hasHotCold && (
        <div className="st-hotcold">
          {extremes.most_generous
            ? <HotCold tag="Most generous" cls="gen" person={extremes.most_generous} />
            : <span />}
          {extremes.harshest
            ? <HotCold tag="Harshest" cls="harsh" person={extremes.harshest} />
            : <span />}
        </div>
      )}
      <div className="st-module-head">
        <span className="st-mh-title">{active.label}</span>
        <div className="st-controls">
          <SegmentedControl
            value={metric}
            onChange={setMetric}
            options={available.map((m) => ({ value: m, label: METRICS[m].label.replace(/^(Most |Best |Longest )/, '') }))}
          />
        </div>
      </div>
      {list.length === 0 ? (
        <p className="st-empty">Nothing to show here yet.</p>
      ) : (
        <ol className="st-ranks">
          {list.map((p, i) => {
            const m = active.row(p);
            return (
              <li key={p.id}>
                <Link to={`/user/${p.id}`} className="st-rank">
                  <span className="st-rk">{String(i + 1).padStart(2, '0')}</span>
                  <img className="st-avatar" src={getAvatarUrl(p.discord_id, p.avatar)} alt="" loading="lazy" />
                  <div className="st-rbody">
                    <span className="st-rname">{p.username}</span>
                    <span className="st-rsub">{m.sub}</span>
                  </div>
                  <span className={`st-rmetric ${active.gold ? 'gold' : 'bone'}`}>
                    {m.badge}{active.gold ? <small>/10</small> : null}
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
```

Note on the segmented labels: the control shows short labels (`Ratings`, `Taste`, `Hosted`, `Streak`, `Loyal`) derived by stripping the leading qualifier from each metric's full label; the module title shows the full label (`Most ratings`, etc.).

- [ ] **Step 2: Add export to the barrel**

Append to `frontend/src/components/stats/index.js`:

```javascript
export { default as PeopleLeaderboard } from './PeopleLeaderboard';
```

- [ ] **Step 3: Verify build**

Run: `cd frontend && npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/stats/PeopleLeaderboard.jsx frontend/src/components/stats/index.js
git commit -m "feat(stats): People leaderboard with metric toggle + hot/cold pair"
```

---

### Task 7: Frontend — RatingHistogram + ClubLore

**Files:**
- Create: `frontend/src/components/stats/RatingHistogram.jsx`
- Create: `frontend/src/components/stats/RatingHistogram.css`
- Create: `frontend/src/components/stats/ClubLore.jsx`
- Create: `frontend/src/components/stats/ClubLore.css`
- Modify: `frontend/src/components/stats/index.js`

- [ ] **Step 1: Create `RatingHistogram.jsx`**

```jsx
import './RatingHistogram.css';

export default function RatingHistogram({ distribution, avg }) {
  if (!distribution || distribution.length === 0) return null;
  const max = Math.max(1, ...distribution.map((d) => d.count));
  const avgNum = parseFloat(avg);
  const avgPct = Number.isFinite(avgNum) ? ((avgNum - 0.5) / 10) * 100 : null;

  return (
    <div className="hist">
      {avgPct != null && (
        <>
          <span className="hist-avgline" style={{ left: `${avgPct}%` }} aria-hidden="true" />
          <span className="hist-avgtag" style={{ left: `${avgPct}%` }}>avg {avgNum.toFixed(1)}</span>
        </>
      )}
      {distribution.map((d) => (
        <div className="hist-bar" key={d.score}>
          <span className="hist-ct">{d.count}</span>
          <span className="hist-fill" style={{ height: `${Math.round((d.count / max) * 100)}%` }} />
          <span className="hist-bx">{d.score}</span>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Create `RatingHistogram.css`**

```css
.hist { display: flex; align-items: flex-end; gap: var(--s-2); height: 150px; margin-top: var(--s-3); padding-top: var(--s-2); position: relative; }
.hist-bar { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 6px; height: 100%; justify-content: flex-end; }
.hist-fill { width: 100%; background: var(--ember-soft); border-top: 2px solid var(--ember); border-radius: 2px 2px 0 0; min-height: 3px; }
.hist-bx { font-family: var(--font-mono); font-size: var(--fs-11); color: var(--bone-mute); }
.hist-ct { font-family: var(--font-mono); font-size: var(--fs-11); color: var(--bone-dim); }
.hist-avgline { position: absolute; top: 0; bottom: 22px; border-left: 1px dashed var(--gold); }
.hist-avgtag { position: absolute; top: -6px; transform: translateX(-50%); font-family: var(--font-mono); font-size: var(--fs-11); color: var(--gold); letter-spacing: .1em; white-space: nowrap; }
```

- [ ] **Step 3: Create `ClubLore.jsx`**

```jsx
import { Link } from 'react-router-dom';
import { formatMonth } from '../../utils/helpers';
import RatingHistogram from './RatingHistogram';
import './ClubLore.css';

const f1 = (v) => parseFloat(v).toFixed(1);

export default function ClubLore({ stats }) {
  const dist = stats.rating_distribution;
  const sig = stats.signature;
  const div = stats.most_divisive?.most_divisive;
  const cad = stats.cadence;
  const att = stats.attendance;
  const ext = stats.film_extremes;

  const hasDist = dist && dist.some((d) => d.count > 0);

  return (
    <div className="lore">
      {hasDist && (
        <div className="lore-card lore-span">
          <span className="lore-k">Rating distribution</span>
          <span className="lore-csub">every score the club has ever cast</span>
          <RatingHistogram distribution={dist} avg={stats.overall_avg_rating} />
        </div>
      )}

      <div className="lore-grid">
        {sig?.top_genre && (
          <div className="lore-card">
            <span className="lore-k">Signature</span>
            <span className="lore-big">{sig.top_genre.genre}</span>
            <p className="lore-csub">most-watched genre · {sig.top_genre.count} nights</p>
            {sig.top_decade && <p className="lore-note">Favourite decade: <strong>{sig.top_decade.decade}s</strong></p>}
          </div>
        )}

        {div && (
          <div className="lore-card">
            <span className="lore-k">Most divisive</span>
            <Link to={`/movie/${div.id}`} className="lore-big lore-link">{div.title}</Link>
            <div className="lore-chips">
              <span className="lore-chip love">loved {f1(div.high)}</span>
              <span className="lore-chip hate">hated {f1(div.low)}</span>
            </div>
            <p className="lore-note">{div.rating_count} votes · widest spread</p>
          </div>
        )}

        {cad?.busiest_month && (
          <div className="lore-card">
            <span className="lore-k">Cadence</span>
            <span className="lore-big">{f1(cad.avg_per_month)}<span className="lore-unit"> /mo</span></span>
            <p className="lore-csub">average movies per month</p>
            <p className="lore-note">Busiest: <strong>{formatMonth(cad.busiest_month)}</strong>, {cad.busiest_count} nights</p>
          </div>
        )}

        {att?.best && (
          <div className="lore-card">
            <span className="lore-k">Attendance</span>
            <span className="lore-big">{Math.round(att.avg_attendance)}<span className="lore-unit"> avg</span></span>
            <p className="lore-csub">people per screening</p>
            <p className="lore-note">Best turnout: <strong>{att.best.title}</strong>, {att.best.attendee_count} in</p>
          </div>
        )}

        {ext && (ext.longest || ext.shortest) && (
          <div className="lore-card lore-span2">
            <span className="lore-k">Runtime extremes</span>
            <div className="lore-two">
              {ext.longest && <div><span className="lore-two-k">Longest</span><div className="lore-two-v">{ext.longest.title}</div><div className="lore-two-s">{ext.longest.runtime} min</div></div>}
              {ext.shortest && <div><span className="lore-two-k">Shortest</span><div className="lore-two-v">{ext.shortest.title}</div><div className="lore-two-s">{ext.shortest.runtime} min</div></div>}
            </div>
          </div>
        )}

        {ext && (ext.oldest || ext.newest) && (
          <div className="lore-card lore-span2">
            <span className="lore-k">Era range</span>
            <div className="lore-two">
              {ext.oldest && <div><span className="lore-two-k">Oldest</span><div className="lore-two-v">{ext.oldest.title}</div><div className="lore-two-s">{ext.oldest.release_year}</div></div>}
              {ext.newest && <div><span className="lore-two-k">Newest</span><div className="lore-two-v">{ext.newest.title}</div><div className="lore-two-s">{ext.newest.release_year}</div></div>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create `ClubLore.css`**

```css
.lore-card { border: 1px solid var(--rule); border-radius: var(--r-3); background: var(--ink-2); padding: var(--s-4); display: flex; flex-direction: column; gap: 6px; min-height: 132px; }
.lore-span { margin-bottom: var(--s-3); }
.lore-k { font-family: var(--font-mono); font-size: var(--fs-11); letter-spacing: .26em; text-transform: uppercase; color: var(--ember); }
.lore-big { font-family: var(--font-display); font-weight: 300; font-size: var(--fs-32); line-height: 1.02; letter-spacing: -.01em; color: var(--bone); }
.lore-link:hover { color: var(--ember); }
.lore-unit { font-size: var(--fs-16); color: var(--bone-dim); }
.lore-csub { font-family: var(--font-mono); font-size: var(--fs-11); letter-spacing: .05em; color: var(--bone-dim); }
.lore-note { font-size: var(--fs-14); color: var(--bone-dim); margin-top: auto; }
.lore-note strong { color: var(--bone); }
.lore-chips { display: flex; gap: var(--s-2); }
.lore-chip { font-family: var(--font-mono); font-size: var(--fs-11); letter-spacing: .08em; padding: 3px 8px; border-radius: var(--r-full); border: 1px solid var(--rule-strong); color: var(--bone-dim); }
.lore-chip.love { color: var(--gold); }
.lore-chip.hate { color: var(--ember); }

.lore-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--s-3); }
.lore-span2 { grid-column: span 2; }
.lore-two { display: flex; gap: var(--s-4); margin-top: var(--s-2); }
.lore-two > div { flex: 1; }
.lore-two-k { font-family: var(--font-mono); font-size: var(--fs-11); letter-spacing: .2em; text-transform: uppercase; color: var(--bone-mute); display: block; margin-bottom: 4px; }
.lore-two-v { font-family: var(--font-display); font-size: var(--fs-19); }
.lore-two-s { font-size: var(--fs-12); color: var(--bone-dim); }

@media (max-width: 820px) {
  .lore-grid { grid-template-columns: 1fr 1fr; }
  .lore-span2 { grid-column: span 2; }
}
```

- [ ] **Step 5: Add exports to the barrel**

Append to `frontend/src/components/stats/index.js`:

```javascript
export { default as RatingHistogram } from './RatingHistogram';
export { default as ClubLore } from './ClubLore';
```

- [ ] **Step 6: Verify build**

Run: `cd frontend && npm run build`
Expected: build succeeds.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/stats/RatingHistogram.jsx frontend/src/components/stats/RatingHistogram.css frontend/src/components/stats/ClubLore.jsx frontend/src/components/stats/ClubLore.css frontend/src/components/stats/index.js
git commit -m "feat(stats): rating histogram + club lore fun-facts grid"
```

---

### Task 8: Frontend — rewrite StatsPage to compose the four zones

**Files:**
- Modify (replace body): `frontend/src/pages/StatsPage.jsx`
- Modify (replace): `frontend/src/pages/StatsPage.css`

- [ ] **Step 1: Replace `StatsPage.jsx` entirely**

```jsx
import { getStats } from '../api/client';
import { useFetch } from '../hooks';
import { PageHeader } from '../components/ui';
import {
  ChampionHero,
  OverviewBand,
  FilmsLeaderboard,
  PeopleLeaderboard,
  ClubLore
} from '../components/stats';
import './StatsPage.css';

const ZoneHead = ({ title, meta }) => (
  <div className="sp-zone-head">
    <h2 className="sp-zone-title">{title}</h2>
    {meta && <span className="sp-zone-meta">{meta}</span>}
  </div>
);

const StatsPage = () => {
  const { data: stats, loading, error } = useFetch(() => getStats(), []);

  if (loading && !stats) return <div className="loading">Loading…</div>;
  if (error) return <div className="error">Error: {error}</div>;

  return (
    <div className="stats-page">
      <PageHeader
        eyebrow="The ledger"
        title={<>By the <em>numbers.</em></>}
        meta={[`${stats.total_movies} screenings`, `${stats.total_ratings} ratings`]}
      />

      <section className="sp-zone">
        <ChampionHero champion={stats.reigning_champion} />
        <OverviewBand stats={stats} />
      </section>

      <section className="sp-zone">
        <ZoneHead title="The films" meta="Minimum 3 votes" />
        <FilmsLeaderboard stats={stats} />
      </section>

      <section className="sp-zone">
        <ZoneHead title="The people" meta="Club regulars" />
        <PeopleLeaderboard stats={stats} />
      </section>

      <section className="sp-zone">
        <ZoneHead title="Club lore" meta="Fun facts" />
        <ClubLore stats={stats} />
      </section>
    </div>
  );
};

export default StatsPage;
```

- [ ] **Step 2: Replace `StatsPage.css` entirely** (page/zone-level only; all old `sp-rank*`, `sp-rater*`, `sp-tri`, `sp-verdict*`, `sp-fact*`, `sp-runtime*`, `sp-people-cols`, `sp-loyal`, `sp-facts` rules are removed — they are superseded by the component CSS)

```css
.stats-page { max-width: 1100px; margin: 0 auto; }

.sp-zone { margin: var(--s-7) 0; }
.sp-zone:first-of-type { margin-top: var(--s-5); }

.sp-zone-head {
  display: flex; align-items: baseline; gap: var(--s-3);
  margin: 0 0 var(--s-4); padding-bottom: var(--s-3);
  border-bottom: 1px solid var(--rule-strong);
}
.sp-zone-title { font-family: var(--font-display); font-weight: 300; font-size: var(--fs-24); letter-spacing: -.01em; }
.sp-zone-meta { font-family: var(--font-mono); font-size: var(--fs-11); letter-spacing: .28em; text-transform: uppercase; color: var(--bone-mute); margin-left: auto; }
```

Note: if `--s-7` (48px) is not present, use the nearest existing spacing token. Confirm against `frontend/src/index.css`.

- [ ] **Step 3: Verify build**

Run: `cd frontend && npm run build`
Expected: build succeeds with no unused-import errors and no references to deleted helpers (`RankList`, `PeopleList`, `formatRuntime`, `Icon`, `Stat`, `EmptyState`, `Stats`, `useState`, `getAvatarUrl` are no longer imported in StatsPage.jsx).

- [ ] **Step 4: Render check**

Run `cd frontend && npm run dev`, open `/stats`. Expected: four zones — champion hero + stat band; Films leaderboard whose Top/Worst and Month/Year/All toggles switch the list; People leaderboard whose metric toggle switches the list with the generous/harsh pair pinned above; Club lore grid with the histogram and fact cards. Compare against `docs/superpowers/mockups/stats-redesign-preview.html`. (With no local DB the page may show empty states — that is acceptable; the deployed check in Task 9 exercises real data.)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/StatsPage.jsx frontend/src/pages/StatsPage.css
git commit -m "feat(stats): rebuild stats page as four-zone dashboard"
```

---

### Task 9: End-to-end verification on the deployed site

**Files:** none (verification only)

- [ ] **Step 1: Push the branch**

```bash
git push -u origin feat/stats-page-redesign
```

Wait for Railway to redeploy backend + frontend.

- [ ] **Step 2: Verify the API payload**

`GET {backend-url}/stats?guildId=<VITE_GUILD_ID>` — confirm the response now includes `reigning_champion` (object with `title`, `avg_rating`, `rating_count`, `release_year`, `genres`, `host_name`), `rating_distribution` (array of 10 `{score, count}`), `film_extremes` (`{longest, shortest, oldest, newest}`), and `attendance` (`{avg_attendance, best}`), alongside all pre-existing keys.

- [ ] **Step 3: Verify the page**

On the deployed `/stats`:
- Champion hero renders with poster + gold score; stat band shows five numbers.
- Films toggles switch Top/Worst and Month/Year/All; empty states appear only where a period genuinely has no 3+ vote films.
- People metric toggle switches Ratings/Taste/Hosted/Streak/Loyal (only metrics with data appear); generous/harsh pair populated.
- Club lore: histogram bars scaled with the avg marker; signature/divisive/cadence/attendance/runtime/era cards populated where data exists.

- [ ] **Step 4: Confirm design-token compliance**

Spot-check: rating values gold, ember accents/active toggles, mono uppercase eyebrows, no hardcoded hex, no gradients/glass on the new chrome.

---

## Notes for the executor
- Every new query filters by `guild_id` and excludes test rows — keep those clauses.
- The page makes exactly one `GET /stats` request; toggles are pure client state over already-fetched arrays.
- The arbitrary past-month picker is intentionally removed (see spec); "Month" means the current month.
- If a design token referenced in CSS does not exist in `frontend/src/index.css`, substitute the nearest existing token on the documented scale; never hardcode a hex value.
- Old `StatsPage.css` rules for the removed sections are deleted in Task 8 — do not leave dead CSS behind.
