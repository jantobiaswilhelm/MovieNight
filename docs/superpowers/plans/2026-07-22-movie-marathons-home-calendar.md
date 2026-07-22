# Movie Marathons — Home Calendar (Plan 4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the schedule onto the home page — (1) an **"On the calendar" agenda** that merges one-off movie nights *and* marathon films into one date-ordered list (replacing the "Last screenings" card row when nights are upcoming), and (2) an **inline month-calendar scheduler** that replaces the date/time popup in the announce flow, showing booked vs. open nights and letting you schedule on the spot.

**Architecture:** One new backend read endpoint — `GET /api/movies/calendar` — returns everything scheduled in a date range by `UNION`-ing upcoming `movie_nights` with upcoming `marathon_items` that haven't yet spawned a movie night, tagged `one-off` vs `marathon`. The home agenda and the inline scheduler both read it. The agenda is a presentational component fed that data; the scheduler is a month grid that shows the same occupancy and, on day-click, reveals an **inline compose row** (not a modal) that calls the **existing** `announceMovie` path with the chosen date — no new scheduling logic.

**Tech Stack:** Express + `pg` (raw parameterized SQL, `UNION`), React 18 + Vite (plain CSS, home components), shared PostgreSQL. No bot changes.

> **Design source of truth — MOCKUPS.** Per the user: **the mockups ARE the design source of truth; always check them.** This plan: `docs/superpowers/mockups/movie-marathons/06-home-calendar.html` (the "On the calendar" day-by-day agenda; ember "Marathon" tag distinguishes marathon films; falls back to recent screenings when nothing's upcoming) and `07-inline-scheduler.html` (month grid — ember = marathon, grey = one-off, open nights invite a click; picking a day opens an **inline** compose row with movie + time + "Schedule it" — explicitly **no popup**). Match structure + flow, not just colors. Mockup wins over this plan — flag conflicts before building.

> **Testing note (repo reality):** No test framework/linter/CI (see `CLAUDE.md`). Verify via `node --check`/module-load, `npm run build`, and **Railway** for the live DB (local Postgres usually isn't running). Verify UI by rendering.

---

## Scope

**In this plan (Plan 4 — the last marathon plan):** the `GET /api/movies/calendar` occupancy endpoint, the client method, the home **"On the calendar" agenda** (merged one-off + marathon, date-grouped, marathon-tagged, with the existing recent-screenings fallback), and the **inline month-calendar scheduler** replacing the `AnnounceFlow` date popup.

**Non-goals (per spec §2):** no collision detection — multiple movies per night is allowed; the calendar only *shows* occupancy, it never blocks. No changes to the actual announce/movie_night creation path — the scheduler reuses `announceMovie`. No bot changes.

---

## File Structure

**Backend**
- Modify `backend/src/models/movies.js` — add `getCalendar(guildId, startISO, endISO)` (UNION of upcoming `movie_nights` + upcoming, not-yet-posted `marathon_items`).
- Modify `backend/src/routes/movies.js` — add `GET /calendar` (registered **before** `/:id`).

**Frontend**
- Modify `frontend/src/api/client.js` — add `getCalendar(start, end)`.
- Create `frontend/src/components/home/OnTheCalendar.jsx` — the date-grouped agenda (one-off + marathon), with the recent-screenings fallback.
- Create `frontend/src/components/home/OnTheCalendar.css` — agenda styles (from mockup 06).
- Modify `frontend/src/components/home/index.js` — export the new component (and the scheduler).
- Modify `frontend/src/pages/Home.jsx` — fetch the calendar; render `OnTheCalendar` in the existing "On the calendar" slot.
- Create `frontend/src/components/home/InlineScheduler.jsx` — month grid + inline compose row.
- Create `frontend/src/components/home/InlineScheduler.css` — scheduler styles (from mockup 07).
- Modify `frontend/src/components/home/AnnounceFlow.jsx` — swap the `date`/`time` inputs for the `InlineScheduler` (keep the movie-pick + `announceMovie` submit).

---

## Task 1: Backend calendar/occupancy endpoint

**Files:**
- Modify: `backend/src/models/movies.js`
- Modify: `backend/src/routes/movies.js`

- [ ] **Step 1: Add the model query**

Append to `backend/src/models/movies.js`. It merges two sources in a date range: upcoming **movie_nights** (tagged `one-off`) and upcoming **marathon_items** that haven't yet been turned into a movie night (`scheduled_movie_night_id IS NULL`, tagged `marathon`, carrying the marathon name). Mirrors the existing guild + `is_test` conventions:

```js
// Everything scheduled in [start, end): upcoming one-off movie_nights UNIONed
// with upcoming marathon films not yet posted to Discord. Tagged by kind so the
// UI can show the ember "Marathon" ribbon. No collision logic — pure read.
export const getCalendar = async (guildId, startISO, endISO) => {
  const result = await pool.query(
    `SELECT * FROM (
       SELECT mn.id::text AS id, 'one-off' AS kind, mn.title, mn.scheduled_at,
              mn.image_url, mn.runtime, mn.release_year,
              NULL::int AS marathon_id, NULL::text AS marathon_name,
              NULL::int AS marathon_position, NULL::int AS marathon_total,
              NULL::varchar AS cadence_type
       FROM movie_nights mn
       WHERE mn.guild_id = $1 AND mn.started_at IS NULL
         AND mn.scheduled_at >= $2 AND mn.scheduled_at < $3
         AND (mn.is_test = false OR mn.is_test IS NULL)

       UNION ALL

       SELECT 'mi-' || mi.id::text AS id, 'marathon' AS kind, mi.title, mi.scheduled_at,
              mi.image_url, mi.runtime, mi.release_year,
              m.id AS marathon_id, m.name AS marathon_name,
              mi.position + 1 AS marathon_position,
              (SELECT COUNT(*)::int FROM marathon_items x WHERE x.marathon_id = m.id) AS marathon_total,
              m.cadence_type
       FROM marathon_items mi
       JOIN marathons m ON mi.marathon_id = m.id
       WHERE m.guild_id = $1 AND m.status = 'active'
         AND mi.scheduled_movie_night_id IS NULL
         AND mi.scheduled_at >= $2 AND mi.scheduled_at < $3
     ) cal
     ORDER BY cal.scheduled_at ASC`,
    [guildId, startISO, endISO]
  );
  return result.rows;
};
```

> `scheduled_movie_night_id IS NULL` avoids double-counting: once a marathon film is posted it becomes a real `movie_night` (already in the first half of the UNION), so we only add marathon items still waiting.

- [ ] **Step 2: Add the route (before `/:id`)**

In `backend/src/routes/movies.js`, add near the other `GET` list routes that precede `/:id` (like `/upcoming/with-attendees`). `start`/`end` are ISO strings; default to a ~90-day window from now if absent:

```js
// GET /api/movies/calendar?start=ISO&end=ISO — occupancy for the home calendar.
router.get('/calendar', validateGuildId, optionalAuth, async (req, res) => {
  try {
    const now = new Date();
    const start = req.query.start && !isNaN(new Date(req.query.start)) ? new Date(req.query.start) : now;
    const end = req.query.end && !isNaN(new Date(req.query.end))
      ? new Date(req.query.end)
      : new Date(now.getTime() + 90 * 864e5);
    const items = await db.getCalendar(req.guildId, start.toISOString(), end.toISOString());
    res.json(items);
  } catch (err) {
    console.error('Error fetching calendar:', err);
    res.status(500).json({ error: 'Failed to fetch calendar' });
  }
});
```

> **Ordering:** `/calendar` is a static segment and MUST be registered above the `GET /:id` route (Express matches by registration order — same gotcha we hit with `/person` and `/curate`). Place it beside `/upcoming/with-attendees`.

- [ ] **Step 3: Verify**

Run: `cd backend && node -e "import('./src/models/index.js').then(m=>console.log(typeof m.getCalendar))"` → `function`.
Run: `cd backend && node -e "import('./src/routes/movies.js').then(()=>console.log('OK'))"` → `OK`.
On Railway: `GET /api/movies/calendar?guild_id=…` returns a date-ordered array; launch a marathon and confirm its not-yet-posted films appear with `kind:"marathon"` + `marathon_name`.

- [ ] **Step 4: Commit**

```bash
git add backend/src/models/movies.js backend/src/routes/movies.js
git commit -m "feat(marathons): calendar/occupancy endpoint (one-off + marathon films)"
```

---

## Task 2: Client method

**Files:**
- Modify: `frontend/src/api/client.js`

- [ ] **Step 1: Add the method**

Add near the other movie GETs (mirrors `getUpcomingMoviesWithAttendees` style):

```js
export const getCalendar = (start, end) => {
  const params = new URLSearchParams({ guild_id: GUILD_ID });
  if (start) params.append('start', start);
  if (end) params.append('end', end);
  return fetchAPI(`/api/movies/calendar?${params}`);
};
```

- [ ] **Step 2: Verify + commit**

Run: `cd frontend && node --check src/api/client.js` → pass.

```bash
git add frontend/src/api/client.js
git commit -m "feat(marathons): getCalendar client method"
```

---

## Task 3: "On the calendar" agenda component

**Files:**
- Create: `frontend/src/components/home/OnTheCalendar.jsx`
- Create: `frontend/src/components/home/OnTheCalendar.css`
- Modify: `frontend/src/components/home/index.js`

**Reference mockup:** `06-home-calendar.html` — a bordered list; each **day row** = a left day-column (`Fri / 1 / Aug`, today in ember) + stacked events; each event = poster thumb + title + a meta line (one-off shows "by <user>"; marathon shows an ember `Marathon N/M` tag) + time on the right. Falls back to recent screenings when nothing's upcoming.

- [ ] **Step 1: Write the component**

Create `frontend/src/components/home/OnTheCalendar.jsx`. Takes `items` (from `getCalendar`) and a `fallback` node (the existing recent-screenings grid) to render when there's nothing upcoming:

```jsx
import { Icon } from '../ui';
import './OnTheCalendar.css';

const dayKey = (d) => {
  const dt = new Date(d);
  return `${dt.getFullYear()}-${dt.getMonth()}-${dt.getDate()}`;
};
const isToday = (d) => dayKey(d) === dayKey(new Date());
const fmtDow = (d) => new Date(d).toLocaleDateString(undefined, { weekday: 'short' });
const fmtNum = (d) => new Date(d).getDate();
const fmtMon = (d) => new Date(d).toLocaleDateString(undefined, { month: 'short' });
const fmtTime = (d) => new Date(d).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

export default function OnTheCalendar({ items = [], fallback = null }) {
  if (!items.length) return fallback;

  // Group by calendar day, preserving date order.
  const days = [];
  const byKey = {};
  for (const it of items) {
    const k = dayKey(it.scheduled_at);
    if (!byKey[k]) { byKey[k] = { key: k, date: it.scheduled_at, events: [] }; days.push(byKey[k]); }
    byKey[k].events.push(it);
  }

  return (
    <div className="otc">
      {days.map((day) => (
        <div className="otc-day" key={day.key}>
          <div className={`otc-daycol ${isToday(day.date) ? 'today' : ''}`}>
            <div className="dow">{fmtDow(day.date)}</div>
            <div className="dnum">{fmtNum(day.date)}</div>
            <div className="mon">{fmtMon(day.date)}</div>
          </div>
          <div className="otc-slots">
            {day.events.map((ev) => (
              <div className="otc-ev" key={ev.id}>
                <div className="otc-poster" style={{ backgroundImage: ev.image_url ? `url(${ev.image_url})` : 'none' }} />
                <div className="otc-info">
                  <h4>{ev.title}</h4>
                  <div className="otc-meta">
                    {ev.kind === 'marathon' ? (
                      <span className="otc-tag mara">
                        <Icon name={ev.cadence_type === 'binge' ? 'film' : 'layers'} size={11} />
                        {ev.cadence_type === 'binge' ? 'Marathon' : `Marathon ${ev.marathon_position}/${ev.marathon_total}`}
                      </span>
                    ) : (
                      <span className="otc-tag">One-off</span>
                    )}
                    <span className="otc-sub">{ev.marathon_name || ''}</span>
                  </div>
                </div>
                <div className="otc-time">{fmtTime(ev.scheduled_at)}</div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Add the styles**

Create `frontend/src/components/home/OnTheCalendar.css` (design tokens from `index.css`; translated from mockup 06):

```css
.otc { border: 1px solid var(--rule); border-radius: var(--r-3); overflow: hidden; }
.otc-day { display: flex; gap: 20px; padding: 16px 22px; border-top: 1px solid var(--rule); }
.otc-day:first-child { border-top: none; }
.otc-daycol { width: 72px; flex-shrink: 0; text-align: right; padding-top: 4px; }
.otc-daycol .dow { font-family: var(--font-mono); font-size: 10px; letter-spacing: .14em; text-transform: uppercase; color: var(--bone-mute); }
.otc-daycol .dnum { font-family: var(--font-display); font-style: italic; font-size: 30px; color: var(--bone); line-height: 1; margin-top: 1px; }
.otc-daycol .mon { font-family: var(--font-mono); font-size: 9px; letter-spacing: .14em; text-transform: uppercase; color: var(--bone-mute); margin-top: 3px; }
.otc-daycol.today .dnum, .otc-daycol.today .dow { color: var(--ember); }
.otc-slots { flex: 1; display: flex; flex-direction: column; gap: 9px; min-width: 0; }
.otc-ev { display: flex; align-items: center; gap: 13px; }
.otc-poster { width: 34px; height: 51px; border-radius: 4px; background: var(--ink-3) center/cover no-repeat; flex-shrink: 0; }
.otc-info { flex: 1; min-width: 0; }
.otc-info h4 { font-size: 15px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.otc-meta { display: flex; align-items: center; gap: 9px; margin-top: 3px; font-size: 12px; color: var(--bone-mute); }
.otc-tag { font-family: var(--font-mono); font-size: 9px; letter-spacing: .12em; text-transform: uppercase; padding: 3px 8px; border-radius: var(--r-full); border: 1px solid var(--rule-strong); color: var(--bone-mute); display: inline-flex; align-items: center; gap: 5px; }
.otc-tag.mara { color: var(--ember); border-color: var(--ember-dim); background: var(--ember-soft); }
.otc-time { font-family: var(--font-mono); font-size: 12px; color: var(--bone-dim); white-space: nowrap; }
```

- [ ] **Step 3: Export it**

In `frontend/src/components/home/index.js`, add:

```js
export { default as OnTheCalendar } from './OnTheCalendar';
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/home/OnTheCalendar.jsx frontend/src/components/home/OnTheCalendar.css frontend/src/components/home/index.js
git commit -m "feat(marathons): On the calendar agenda component"
```

---

## Task 4: Wire the agenda into Home

**Files:**
- Modify: `frontend/src/pages/Home.jsx`

- [ ] **Step 1: Fetch the calendar**

In `Home.jsx`, import the component + client method (add to the existing imports):

```js
import { getCalendar } from '../api/client';
```
```js
import { AdminSettingsPanel, UsersSection, AnnounceFlow, SuggestionBoard, HomeStatsBand, OnThisDay, SeasonalDecoration, ReviewsFeature, OnTheCalendar } from '../components/home';
```

Add calendar state with the others:

```js
  const [calendar, setCalendar] = useState([]);
```

Add `getCalendar()` to the `Promise.all` in `fetchData` and set it (mirrors the other `.catch` fallbacks):

```js
    const [moviesData, nextMovieData, upcomingData, reviewsData, statsData, onThisDayData, calendarData] = await Promise.all([
      getMovies(100, 0),
      getNextMovieWithAttendees().catch(() => null),
      getUpcomingMoviesWithAttendees(5).catch(() => []),
      getRandomComments(12).catch(() => []),
      getStats().catch(() => null),
      getOnThisDay().catch(() => null),
      getCalendar().catch(() => [])
    ]);
    setCalendar(calendarData);
```

- [ ] **Step 2: Render the agenda in the existing slot**

Replace the body of the "On the calendar" `<section className="home-block">` (the `hasUpcomingExtras ? … : lastScreenings … : EmptyState` block) so the agenda drives it, keeping the recent-screenings grid as the fallback. The section title stays driven by whether the calendar has entries:

```jsx
        <section className="home-block">
          <SectionHead
            num="03"
            title={calendar.length > 0 ? 'On the calendar' : 'Last screenings'}
            meta={<Link to="/movies" className="btn text">Archive →</Link>}
          />
          {loading ? (
            <div className="upcoming-grid">
              <MovieCardSkeleton />
              <MovieCardSkeleton />
              <MovieCardSkeleton />
            </div>
          ) : (
            <OnTheCalendar
              items={calendar}
              fallback={
                lastScreenings.length > 0 ? (
                  <div className="upcoming-grid">
                    {lastScreenings.map((movie) => (
                      <MovieCard key={movie.id} movie={movie} variant="compact" />
                    ))}
                  </div>
                ) : (
                  <EmptyState title="Nothing queued." body="Announce a movie to start the next screening." />
                )
              }
            />
          )}
        </section>
```

> Leaves `hasUpcomingExtras`/`upcomingWithAttendees` in place for the hero logic; only this section's body changes. The calendar merges one-offs + marathon films, which the old `upcomingWithAttendees.slice(1,4)` could not.

- [ ] **Step 3: Verify + commit**

Run: `cd frontend && npm run build` → exits 0. Render the home page and confirm the agenda lists upcoming nights grouped by day, with an ember "Marathon N/M" tag on marathon films; with nothing upcoming, it falls back to recent screenings. **Check against mockup 06.**

```bash
git add frontend/src/pages/Home.jsx
git commit -m "feat(marathons): render On the calendar agenda on home"
```

---

## Task 5: Inline month-calendar scheduler component

**Files:**
- Create: `frontend/src/components/home/InlineScheduler.jsx`
- Create: `frontend/src/components/home/InlineScheduler.css`
- Modify: `frontend/src/components/home/index.js`

**Reference mockup:** `07-inline-scheduler.html` — a month grid (Sun–Sat), prev/next month arrows, a legend (Marathon / One-off / Open). Occupied days show their event chip (ember = marathon, grey = one-off); past days are dimmed and non-clickable; clicking an open/future day selects it (ember outline) and reveals an **inline compose row** below the grid. **No modal.**

- [ ] **Step 1: Write the component**

Create `frontend/src/components/home/InlineScheduler.jsx`. It's a controlled date picker: parent passes `occupancy` (from `getCalendar`) and `value`/`onChange` (the selected `Date`), plus optional `renderCompose(day)` for the inline row. This keeps `announceMovie` in the parent (`AnnounceFlow`):

```jsx
import { useState } from 'react';
import { Icon } from '../ui';
import './InlineScheduler.css';

const dayKey = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

export default function InlineScheduler({ occupancy = [], value, onChange, renderCompose }) {
  const today = startOfDay(new Date());
  const [view, setView] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));

  // Map day → events for quick lookup.
  const byDay = {};
  for (const ev of occupancy) {
    const d = new Date(ev.scheduled_at);
    const k = dayKey(d);
    (byDay[k] = byDay[k] || []).push(ev);
  }

  const year = view.getFullYear(), month = view.getMonth();
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));

  const monthLabel = view.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const step = (delta) => setView(new Date(year, month + delta, 1));

  return (
    <div className="isch">
      <div className="isch-head">
        <div className="isch-title">{monthLabel}
          <span className="isch-nav">
            <button type="button" onClick={() => step(-1)} aria-label="Previous month"><Icon name="chevron-left" size={16} /></button>
            <button type="button" onClick={() => step(1)} aria-label="Next month"><Icon name="chevron-right" size={16} /></button>
          </span>
        </div>
        <div className="isch-legend">
          <span className="mara"><i /> Marathon</span>
          <span className="oneoff"><i /> One-off</span>
          <span className="free"><i /> Open</span>
        </div>
      </div>

      <div className="isch-dow">{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => <span key={d}>{d}</span>)}</div>
      <div className="isch-grid">
        {cells.map((cell, i) => {
          if (!cell) return <div className="isch-cell empty" key={`e${i}`} />;
          const past = cell < today;
          const evs = byDay[dayKey(cell)] || [];
          const selected = value && dayKey(startOfDay(value)) === dayKey(cell);
          const isToday = dayKey(cell) === dayKey(today);
          return (
            <button type="button" key={dayKey(cell)}
              className={`isch-cell ${past ? 'past' : ''} ${selected ? 'sel' : ''} ${isToday ? 'today' : ''}`}
              disabled={past}
              onClick={() => !past && onChange && onChange(cell)}>
              <span className="dn">{cell.getDate()}</span>
              {evs.slice(0, 2).map((ev) => (
                <span key={ev.id} className={`isch-evt ${ev.kind === 'marathon' ? 'mara' : 'oneoff'}`}>
                  <Icon name={ev.kind === 'marathon' ? 'layers' : 'film'} size={9} /> {ev.title}
                </span>
              ))}
              {evs.length === 0 && !past && <span className="isch-free">+ schedule</span>}
            </button>
          );
        })}
      </div>

      {value && renderCompose && (
        <div className="isch-compose">{renderCompose(value)}</div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add the styles**

Create `frontend/src/components/home/InlineScheduler.css` (translated from mockup 07):

```css
.isch { }
.isch-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
.isch-title { font-family: var(--font-display); font-style: italic; font-size: 20px; display: flex; align-items: center; gap: 14px; }
.isch-nav button { width: 30px; height: 30px; border-radius: var(--r-2); border: 1px solid var(--rule-strong); background: transparent; color: var(--bone-dim); cursor: pointer; display: inline-grid; place-items: center; }
.isch-nav button:hover { color: var(--ember); border-color: var(--ember); }
.isch-legend { display: flex; gap: 14px; font-size: 12px; color: var(--bone-dim); align-items: center; }
.isch-legend span { display: inline-flex; align-items: center; }
.isch-legend i { width: 9px; height: 9px; border-radius: 3px; display: inline-block; margin-right: 6px; }
.isch-legend .mara i { background: var(--ember); }
.isch-legend .oneoff i { background: var(--bone-mute); }
.isch-legend .free i { background: var(--ink-4); }
.isch-dow { display: grid; grid-template-columns: repeat(7, 1fr); gap: 8px; margin-bottom: 8px; }
.isch-dow span { font-family: var(--font-mono); font-size: 10px; letter-spacing: .12em; text-transform: uppercase; color: var(--bone-mute); padding-left: 4px; }
.isch-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 8px; }
.isch-cell { min-height: 92px; border: 1px solid var(--rule); border-radius: var(--r-2); background: var(--ink); padding: 8px 9px; cursor: pointer; display: flex; flex-direction: column; gap: 5px; text-align: left; font-family: inherit; transition: border-color var(--dur-1), background var(--dur-1); }
.isch-cell:hover:not(.past) { border-color: var(--rule-strong); background: var(--ink-3); }
.isch-cell.empty { background: transparent; border-color: transparent; cursor: default; }
.isch-cell.past { opacity: .4; cursor: default; }
.isch-cell.today { border-color: var(--ember-dim); }
.isch-cell.sel { border-color: var(--ember); background: var(--ember-soft); }
.isch-cell .dn { font-family: var(--font-mono); font-size: 12px; color: var(--bone-dim); }
.isch-cell.today .dn { color: var(--ember); font-weight: 600; }
.isch-evt { font-size: 10.5px; line-height: 1.25; border-radius: 4px; padding: 4px 6px; display: flex; align-items: center; gap: 5px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.isch-evt.oneoff { background: var(--ink-3); color: var(--bone-dim); }
.isch-evt.mara { background: var(--ember-soft); color: var(--ember); border: 1px solid var(--ember-dim); }
.isch-evt svg { flex-shrink: 0; }
.isch-free { margin-top: auto; font-family: var(--font-mono); font-size: 9px; letter-spacing: .08em; text-transform: uppercase; color: var(--bone-mute); opacity: 0; }
.isch-cell:hover:not(.past) .isch-free { opacity: 1; }
.isch-compose { margin-top: 18px; border: 1px solid var(--ember); border-radius: var(--r-3); background: var(--ink); padding: 18px 20px; }
```

- [ ] **Step 3: Export it**

In `frontend/src/components/home/index.js`:

```js
export { default as InlineScheduler } from './InlineScheduler';
```

- [ ] **Step 4: Verify + commit**

Run: `cd frontend && npm run build` → exits 0.

```bash
git add frontend/src/components/home/InlineScheduler.jsx frontend/src/components/home/InlineScheduler.css frontend/src/components/home/index.js
git commit -m "feat(marathons): inline month-calendar scheduler component"
```

---

## Task 6: Swap the date popup for the inline scheduler in AnnounceFlow

**Files:**
- Modify: `frontend/src/components/home/AnnounceFlow.jsx`

**Reference mockup:** `07-inline-scheduler.html` — the compose row: a movie "pick" (poster + title + "Change movie"), a time input, and a "Schedule it" button. It appears **inline** under the selected day, not as a popup.

- [ ] **Step 1: Import the scheduler + calendar data**

At the top of `AnnounceFlow.jsx`, add:

```js
import { InlineScheduler } from './index';
import { getCalendar } from '../../api/client';
```

> If importing `InlineScheduler` from `./index` risks a circular import (AnnounceFlow is itself exported there), import directly instead: `import InlineScheduler from './InlineScheduler';`.

- [ ] **Step 2: Load occupancy + hold a selected Date**

Add state near the existing `date`/`time` state and fetch occupancy on mount (`useState`/`useEffect` are already imported in this file — confirm and add if missing):

```js
  const [occupancy, setOccupancy] = useState([]);
  const [selectedDay, setSelectedDay] = useState(null);   // Date of the chosen night

  useEffect(() => {
    getCalendar().then(setOccupancy).catch(() => setOccupancy([]));
  }, []);
```

- [ ] **Step 3: Replace the date/time inputs with the scheduler**

Replace the `<div className="af-when">…</div>` block (the two `type="date"` / `type="time"` inputs) with the inline scheduler. The day comes from the grid; keep a `time` input inside the inline compose row. The `time` state stays as-is (default `'20:30'`):

```jsx
        <InlineScheduler
          occupancy={occupancy}
          value={selectedDay}
          onChange={setSelectedDay}
          renderCompose={(day) => (
            <div className="af-compose">
              <div className="af-compose-when">
                Scheduling for <b>{day.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}</b>
              </div>
              <label className="af-field">
                <span>Time</span>
                <input type="time" value={time} onChange={(e) => setTime(e.target.value)} required />
              </label>
            </div>
          )}
        />
```

- [ ] **Step 4: Build `scheduled_at` from the picked day + time in submit**

Update `handleSubmit` to derive the ISO datetime from `selectedDay` + `time` (replacing the old `` `${date}T${time}` ``):

```js
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedMovie || !selectedDay || !time) {
      setError('Pick a day and time.');
      return;
    }
    const [hh, mm] = time.split(':').map(Number);
    const scheduledAt = new Date(selectedDay.getFullYear(), selectedDay.getMonth(), selectedDay.getDate(), hh, mm);
    if (scheduledAt <= new Date()) {
      setError('The time must be in the future.');
      return;
    }
    setAnnouncing(true);
    setError(null);
    try {
      await announceMovie(selectedMovie, scheduledAt.toISOString());
      setAnnouncedTitle(selectedMovie.title);
      setStep('success');
      if (onAnnounced) setTimeout(() => onAnnounced(), 1200);
      setTimeout(reset, 4500);
    } catch (err) {
      setError(err.message || 'Failed to announce movie');
    } finally {
      setAnnouncing(false);
    }
  };
```

> Remove the now-unused `date` state and `localDateStr` default if nothing else references them (grep first — `localDateStr` may be used for the `min` attr elsewhere; if so, leave it). The **"Schedule it"** button is the form's existing submit button — keep it; it now lives logically with the compose row.

- [ ] **Step 5: Add minimal compose-row styles**

Append to the AnnounceFlow stylesheet (find its CSS import at the top of `AnnounceFlow.jsx`; add there):

```css
.af-compose { display: flex; align-items: flex-end; gap: 16px; flex-wrap: wrap; }
.af-compose-when { font-size: 13px; color: var(--bone-dim); }
.af-compose-when b { color: var(--bone); }
```

- [ ] **Step 6: Verify + commit**

Run: `cd frontend && npm run build` → exits 0. Render the announce flow: pick a movie → the month grid shows booked (ember=marathon, grey=one-off) vs open nights → click an open day → the inline compose row appears with a time + "Schedule it" → scheduling posts via `announceMovie` (no popup). **Check against mockup 07.**

```bash
git add frontend/src/components/home/AnnounceFlow.jsx
git commit -m "feat(marathons): inline calendar scheduler replaces the date popup in announce flow"
```

---

## Final verification (on Railway)

- [ ] Deploy. `GET /api/movies/calendar?guild_id=…` returns date-ordered one-off + marathon entries.
- [ ] Home "On the calendar" shows a day-grouped agenda merging one-offs and an active marathon's upcoming films (ember "Marathon N/M" tag); with nothing upcoming it falls back to recent screenings.
- [ ] Announce flow: the month grid shows booked vs open nights; clicking a day opens the inline compose row (no popup); scheduling creates the movie night via the existing path and it appears on the calendar.
- [ ] A launched marathon's films show on the grid as ember chips; a one-off shows grey.

---

## Self-Review

**Spec coverage (spec §7 "Home page changes", §11):**
- "On the calendar" agenda replaces "Last screenings" when upcoming nights exist; merges one-off + marathon films date-ordered; ember Marathon tag; binge shown as one entry; falls back to recent screenings → Tasks 3–4 ✓
- Inline month-calendar scheduler replaces the date popup; booked (ember=marathon, grey=one-off) vs open; select a day → inline compose (movie + time + Schedule); no modal → Tasks 5–6 ✓
- New calendar/occupancy endpoint (movie_nights + upcoming marathon items in a date range) → Task 1 ✓
- Reuses `announceMovie` (no new scheduling logic) → Task 6 ✓
- No collision logic (calendar only shows occupancy) → Task 1 (pure read) ✓

**Deferred by design:** none — this is the final marathon plan. (Binge chips render via the same `kind:'marathon'` path.)

**Placeholder scan:** none — all steps carry concrete code. Two guarded notes (circular-import fallback for `InlineScheduler`; `localDateStr` removal only if unused) are conditional instructions with explicit checks, not missing content.

**Type/name consistency:** `getCalendar(guildId, startISO, endISO)` (model) → `GET /calendar` (route) → `getCalendar(start, end)` (client) → `items`/`occupancy` props. Rows carry `id`, `kind` ('one-off'|'marathon'), `title`, `scheduled_at`, `image_url`, `marathon_name`, `marathon_position`, `marathon_total`, `cadence_type` — consumed identically by `OnTheCalendar` (agenda) and `InlineScheduler` (grid). `announceMovie(selectedMovie, iso)` unchanged. `selectedDay` (Date) + `time` ('HH:MM') → `scheduled_at` ISO in `handleSubmit`.
