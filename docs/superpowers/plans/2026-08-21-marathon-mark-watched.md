# Marathon "Already watched" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a marathon owner log a queued film as already watched on a given date — optionally tied to the movie night that already exists for it — so a marathon that fell out of sync can be repaired instead of deleted.

**Architecture:** A new `'watched'` value on `marathon_items.status`. Marking a film watched sets that status, moves `scheduled_at` to the date it actually played, and optionally attaches an existing `movie_nights` row. The bot needs no changes — `marathonProcessor` only ever picks up `status = 'pending'`, so a watched film is silently skipped and the marathon completes itself once the last one is logged. Alongside it, the marathon item-date and launch routes start rejecting past dates, matching the three announce routes, so "Already watched" becomes the only way to put a film behind you.

**Tech Stack:** Express + raw parameterized SQL (pg, no ORM), React 18 + Vite, plain CSS with design tokens. ESM throughout.

**Spec:** `docs/superpowers/specs/2026-08-21-marathon-mark-watched-design.md`

---

## Before you start

**This repo has no test framework, no linter and no CI** — that is a deliberate project fact, not an omission (see `CLAUDE.md`). Do not add one as part of this work. Each task's verification step is therefore one of:

- `node --check <file>` for backend/bot files (catches syntax and, being ESM, nothing more)
- `cd frontend && npm run build` for anything the frontend imports
- reading the query back against the spec

Behavioural verification is real but manual, and it happens **on Railway** at the end (Task 11). Local Postgres is normally not running on this machine, so do not plan on hitting a local database.

**Commit after every task.** The repo is on `master`; create a branch first:

```bash
git checkout -b feat/marathon-mark-watched
```

## File structure

| File | Change | Responsibility |
|---|---|---|
| `backend/src/models/movies.js` | Modify | Adds `findPastNightsForFilm`; teaches `getCalendar` about the new status |
| `backend/src/models/marathons.js` | Modify | Adds `getMarathonItemById`, `markMarathonItemWatched`, `unmarkMarathonItemWatched`; fixes the three derived subqueries in `getMarathons` |
| `backend/src/routes/marathons.js` | Modify | Three new routes; past-date guards on the item-date and launch routes |
| `frontend/src/api/client.js` | Modify | Three client methods |
| `frontend/src/components/ui/Icon.jsx` | Modify | Registers `undo` |
| `frontend/src/components/marathons/MarkWatchedPanel.jsx` | **Create** | The whole panel: loads candidate nights, renders the choice, submits |
| `frontend/src/components/marathons/MarathonDetail.jsx` | Modify | Entry points, undo, panel placement, explicit watched state |
| `frontend/src/pages/MarathonsPage.css` | Modify | Panel styling |

`backend/src/models/index.js` re-exports each model file with `export *`, so new model functions need no barrel edit. **The bot is not touched by this plan.**

---

## Task 1: Find past screenings of a film

**Files:**
- Modify: `backend/src/models/movies.js` (append to the end of the file)

- [ ] **Step 1: Add the query**

Announced titles carry the year (`insertMarathonPendingAnnouncement` builds `"Title (2012)"`, `bot/src/models/index.js:893`), while `marathon_items.title` does not. So the title fallback is a prefix match, not an equality test. It is only ever a fallback — `tmdb_id` is the reliable key, and the user picks from the resulting list anyway.

```js
// Past screenings of a given film in this guild — the candidates offered when
// someone logs a marathon film as already watched. tmdb_id is the reliable key;
// the title fallback is a prefix match because announced titles carry the year
// ("The Hunger Games (2012)") and marathon_items.title does not. Test nights are
// not history.
export const findPastNightsForFilm = async (guildId, tmdbId, title) => {
  const result = await pool.query(
    `SELECT mn.id, mn.title, mn.scheduled_at, mn.started_at,
            u.username AS announced_by_name
     FROM movie_nights mn
     LEFT JOIN users u ON mn.announced_by = u.id
     WHERE mn.guild_id = $1
       AND mn.scheduled_at < NOW()
       AND (mn.is_test = false OR mn.is_test IS NULL)
       AND CASE WHEN $2::int IS NULL
                THEN LOWER(mn.title) LIKE LOWER($3) || '%'
                ELSE mn.tmdb_id = $2::int END
     ORDER BY mn.scheduled_at DESC
     LIMIT 5`,
    [guildId, tmdbId ?? null, title ?? '']
  );
  return result.rows;
};
```

- [ ] **Step 2: Verify it parses**

Run: `node --check backend/src/models/movies.js`
Expected: no output (success).

- [ ] **Step 3: Commit**

```bash
git add backend/src/models/movies.js
git commit -m "feat(backend): find past screenings of a film for marathon back-fill"
```

---

## Task 2: Model functions for marking watched

**Files:**
- Modify: `backend/src/models/marathons.js` (append to the end of the file)

- [ ] **Step 1: Add the three functions**

`markMarathonItemWatched` sets `scheduled_movie_night_id` unconditionally (to `null` when no night was chosen). That is safe because the route refuses to mark a film that is already linked — see Task 4 — so this can never wipe a link the bot made.

```js
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
```

- [ ] **Step 2: Verify it parses**

Run: `node --check backend/src/models/marathons.js`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add backend/src/models/marathons.js
git commit -m "feat(backend): mark and unmark a marathon film as already watched"
```

---

## Task 3: Teach the derived reads about `'watched'`

Without this, a film marked watched **just now** is misreported: `watched_count` tests `scheduled_at + runtime < NOW()`, which a film logged 30 minutes ago with a 2-hour runtime fails, and `airing_item` would announce it as "on screen right now".

**Files:**
- Modify: `backend/src/models/marathons.js:22-41` (the three subqueries inside `getMarathons`)
- Modify: `backend/src/models/movies.js:265-269` (the marathon half of `getCalendar`)

- [ ] **Step 1: Replace the three subqueries in `getMarathons`**

Find this block in `backend/src/models/marathons.js` (starts at line 22) and replace it wholesale:

```sql
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
```

(`next_item` gets the same guard so a film logged at this exact minute cannot momentarily read as next up.)

- [ ] **Step 2: Add the calendar exclusion**

In `backend/src/models/movies.js`, in the second half of the `getCalendar` UNION, the marathon-items `WHERE` clause becomes:

```sql
       WHERE m.guild_id = $1 AND m.status = 'active'
         AND mi.status <> 'watched'
         AND mi.scheduled_movie_night_id IS NULL
         AND mi.scheduled_at >= $2 AND mi.scheduled_at < $3
```

The existing `scheduled_movie_night_id IS NULL` filter already hides a film that was attached to a night; this covers the unattached one, so a film logged earlier today does not sit on today's agenda as upcoming.

- [ ] **Step 3: Verify both parse**

Run: `node --check backend/src/models/marathons.js && node --check backend/src/models/movies.js`
Expected: no output.

- [ ] **Step 4: Re-read against the spec**

Confirm all four edits are present: `watched_count` has the `status = 'watched' OR` arm, `airing_item` and `next_item` both have `status <> 'watched'`, and `getCalendar` has it too.

- [ ] **Step 5: Commit**

```bash
git add backend/src/models/marathons.js backend/src/models/movies.js
git commit -m "fix(backend): count hand-logged marathon films as watched, not airing"
```

---

## Task 4: The three routes

**Files:**
- Modify: `backend/src/routes/marathons.js` — insert after the existing `PUT /:id/items/:itemId` handler, which ends at line 249

These paths have four segments (`:id/items/:itemId/watched`), the existing item routes have three, so Express cannot confuse them and registration order does not matter here.

- [ ] **Step 1: Add the matches route**

```js
// GET /api/marathons/:id/items/:itemId/matches — past screenings of this film,
// offered when logging it as already watched.
router.get('/:id/items/:itemId/matches', validateGuildId, validateIntParams('id', 'itemId'), authenticateToken, async (req, res) => {
  try {
    const marathon = await loadManageable(req, res);
    if (!marathon) return;
    const item = await db.getMarathonItemById(marathon.id, parseInt(req.params.itemId));
    if (!item) return res.status(404).json({ error: 'Film not found in this marathon' });
    res.json(await db.findPastNightsForFilm(marathon.guild_id, item.tmdb_id, item.title));
  } catch (err) {
    console.error('Error finding past screenings for marathon item:', err);
    res.status(500).json({ error: 'Failed to look up past screenings' });
  }
});
```

- [ ] **Step 2: Add the mark-watched route**

The chosen night is validated by looking for it in the same candidate list the panel was offered. That one check covers guild ownership, the film matching, and the night being in the past — no separate lookup, and nothing the client sends is trusted.

```js
// POST /api/marathons/:id/items/:itemId/watched — body: { watched_at, movie_night_id? }
// Logs a film the group watched outside the roll-out: it stops being announced,
// counts towards progress, and points at the real screening when we found one.
router.post('/:id/items/:itemId/watched', validateGuildId, validateIntParams('id', 'itemId'), authenticateToken, async (req, res) => {
  const { watched_at, movie_night_id } = req.body;
  const when = new Date(watched_at);
  if (!watched_at || isNaN(when.getTime())) {
    return res.status(400).json({ error: 'watched_at must be a valid date' });
  }
  if (when > new Date()) {
    return res.status(400).json({ error: 'That date is in the future — a film can only be marked watched after it played.' });
  }
  try {
    const marathon = await loadManageable(req, res);
    if (!marathon) return;
    const item = await db.getMarathonItemById(marathon.id, parseInt(req.params.itemId));
    if (!item) return res.status(404).json({ error: 'Film not found in this marathon' });
    // A film the bot has already taken is off limits, and 'scheduled' is the whole
    // test. enqueueMarathonItemAtomic marks the item 'scheduled' when it queues the
    // announcement and linkMarathonItemMovieNight only back-links later, so the
    // status covers the entire period the bot owns the film. Don't also refuse on
    // scheduled_movie_night_id: this feature sets that field too, so it would tell
    // someone re-logging their own film that Discord had posted it.
    if (item.status === 'scheduled') {
      return res.status(409).json({ error: 'The bot has already posted this film to Discord — the marathon is tracking it.' });
    }
    let nightId = null;
    if (movie_night_id !== undefined && movie_night_id !== null && movie_night_id !== '') {
      const wanted = Number(movie_night_id);
      if (!Number.isInteger(wanted)) {
        return res.status(400).json({ error: 'movie_night_id must be a whole number' });
      }
      // Validated by membership in the same candidate list the panel offered, which
      // pins down guild, film and pastness in one query — and we store the row's own
      // id, never the client's value.
      const candidates = await db.findPastNightsForFilm(marathon.guild_id, item.tmdb_id, item.title);
      const match = candidates.find((n) => n.id === wanted);
      if (!match) {
        return res.status(400).json({ error: 'That movie night is not a past screening of this film.' });
      }
      nightId = match.id;
    }
    const updated = await db.markMarathonItemWatched(marathon.id, item.id, when, nightId);
    if (!updated) {
      // The statement carries the same invariant this route checked, so an empty
      // result means the film changed underneath us. Tell "gone" apart from
      // "claimed" — answering 409 for a deleted film would be a plain lie.
      const still = await db.getMarathonItemById(marathon.id, item.id);
      if (!still) return res.status(404).json({ error: 'Film not found in this marathon' });
      return res.status(409).json({ error: 'That film changed while you were logging it — reload the marathon and try again.' });
    }
    res.json(updated);
  } catch (err) {
    console.error('Error marking marathon item watched:', err);
    res.status(500).json({ error: 'Failed to mark the film watched' });
  }
});
```

- [ ] **Step 3: Add the undo route**

A completed marathon has to go back to active or the bot never picks the film up again — `getActiveMarathons` filters on status. This mirrors `reviveIfCompleted`, which the add-films routes already use.

```js
// DELETE /api/marathons/:id/items/:itemId/watched — undo, putting the film back
// in the queue as TBD.
router.delete('/:id/items/:itemId/watched', validateGuildId, validateIntParams('id', 'itemId'), authenticateToken, async (req, res) => {
  try {
    const marathon = await loadManageable(req, res);
    if (!marathon) return;
    const itemId = parseInt(req.params.itemId);
    const item = await db.unmarkMarathonItemWatched(marathon.id, itemId);
    // Marking the last film watched completes a marathon, so undoing has to revive
    // it or the bot will never look at this film again (getActiveMarathons filters
    // on status). Runs before the branch below so a repeat undo can still repair a
    // marathon the bot completed in between, and it is SQL-guarded rather than
    // reading marathon.status — that read predates the write above.
    await db.reviveCompletedMarathon(marathon.id);
    if (!item) {
      // The model guards on status = 'watched', so an empty result means either
      // "no such film here" or "already not watched". Tell those apart: a
      // double-clicked undo should not read as an error.
      const existing = await db.getMarathonItemById(marathon.id, itemId);
      if (!existing) return res.status(404).json({ error: 'Film not found in this marathon' });
      return res.json(existing);
    }
    res.json(item);
  } catch (err) {
    console.error('Error undoing marathon watched mark:', err);
    res.status(500).json({ error: 'Failed to undo' });
  }
});
```

- [ ] **Step 4: Verify it parses**

Run: `node --check backend/src/routes/marathons.js`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/marathons.js
git commit -m "feat(backend): routes to mark a marathon film watched and undo it"
```

---

## Task 5: Reject past dates on marathon scheduling

A past date makes `marathonProcessor` treat the item as due immediately (`bot/src/jobs/marathonProcessor.js:47`), so it announces at once and `movieStarter` airs it. The three announce routes already refuse past dates; the marathon routes did not.

**Files:**
- Modify: `backend/src/routes/marathons.js:232-249` (item date) and `:252-280` (launch)

- [ ] **Step 1: Guard the item-date route**

In `PUT /:id/items/:itemId`, after the existing validity check, add:

```js
  if (hasDate && new Date(scheduled_at) <= new Date()) {
    return res.status(400).json({
      error: 'That date has passed — use “Already watched” to log a film you’ve already seen.'
    });
  }
```

Then, inside the `try` block, after `loadManageable` and before calling `db.updateMarathonItemDate`, refuse to re-date a film that is logged as watched — moving its date without clearing its status would leave a watched film dated in the future:

```js
    const current = await db.getMarathonItemById(marathon.id, parseInt(req.params.itemId));
    if (current?.status === 'watched') {
      return res.status(409).json({ error: 'That film is logged as already watched — undo that first to give it a new date.' });
    }
```

- [ ] **Step 2: Guard the launch route**

The launch guard names the offending film, because a draft assembled over several days can easily have its first date fall behind. That needs the items, so the check moves inside the `try` block, after `loadManageable`. Replace the body of the handler from `for (const it of items) {` through `res.json(updated);` with:

```js
  for (const it of items) {
    // A film may launch with no date (TBD) — only require an id, and validate any
    // date that IS provided. Undated films just won't roll out until dated.
    if (!it.id) {
      return res.status(400).json({ error: 'Each item needs an id' });
    }
    if (it.scheduled_at && isNaN(new Date(it.scheduled_at).getTime())) {
      return res.status(400).json({ error: 'scheduled_at must be a valid date or null' });
    }
  }
  try {
    const marathon = await loadManageable(req, res);
    if (!marathon) return;
    const normalized = items.map((it) => ({ id: it.id, scheduled_at: it.scheduled_at ? new Date(it.scheduled_at) : null }));
    // A past date isn't a schedule — the processor would see the film as due and
    // announce it the moment the marathon launches. Name the film, since a draft
    // put together over several days can easily have its first date fall behind.
    const now = new Date();
    const stale = normalized.find((it) => it.scheduled_at && it.scheduled_at <= now);
    if (stale) {
      const existing = await db.getMarathonItems(marathon.id);
      const film = existing.find((it) => it.id === stale.id);
      return res.status(400).json({
        error: `${film ? `“${film.title}”` : 'One film'} is dated in the past — pick a future date, or launch it as TBD.`
      });
    }
    const updated = await db.launchMarathon(marathon.id, cadence_type, normalized);
    res.json(updated);
```

- [ ] **Step 3: Verify it parses**

Run: `node --check backend/src/routes/marathons.js`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add backend/src/routes/marathons.js
git commit -m "fix(backend): refuse past dates on marathon item dates and launch"
```

---

## Task 5b: Keep hand-logged films out of a binge kickoff

The one place the bot *does* need to change. A back-to-back marathon posts its whole evening in one embed and creates one `movie_night` per film. `processBingeAnnouncement` reads the entire lineup, so a film logged as watched before the kickoff fires would be announced again **and** have its link to the real screening overwritten at `announcementProcessor.js:238`.

`markAllMarathonItemsScheduled` (`bot/src/models/index.js:997`) is already safe — it only touches `status = 'pending'` — so a watched item is never flipped to `scheduled`. Only the lineup reads need the filter.

**Files:**
- Modify: `bot/src/jobs/announcementProcessor.js:199`
- Modify: `bot/src/jobs/marathonProcessor.js:28`

- [ ] **Step 1: Filter the kickoff lineup**

In `processBingeAnnouncement`, replace line 199:

```js
  // A film logged as already watched is history: it must not join the evening's
  // lineup, or it would be announced a second time and its link to the real
  // screening overwritten by linkMarathonItemMovieNight below.
  const items = (await getMarathonItemsByMarathon(announcement.marathon_id))
    .filter((it) => it.status !== 'watched');
```

The existing `if (items.length === 0)` guard directly below now also covers "every film was logged by hand", which correctly marks the announcement `failed` rather than posting an empty embed.

- [ ] **Step 2: Filter the trigger's view of the lineup**

In `marathonProcessor.js`, the binge fork reads the same list and passes `items.length` as the marathon total. Replace line 28:

```js
          // Same reasoning as the processor: a hand-logged film is not part of
          // the evening, so it must not be counted in the total either.
          const items = (await getMarathonItemsByMarathon(marathon.id))
            .filter((it) => it.status !== 'watched');
```

Everything below it (`pending`, `doors`, `enqueueBingeMarathonAtomic(pending[0], marathon, items.length)`) is unchanged.

- [ ] **Step 3: Verify both parse**

Run: `node --check bot/src/jobs/announcementProcessor.js && node --check bot/src/jobs/marathonProcessor.js`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add bot/src/jobs/announcementProcessor.js bot/src/jobs/marathonProcessor.js
git commit -m "fix(bot): keep hand-logged films out of a binge kickoff"
```

---

## Task 6: API client methods

**Files:**
- Modify: `frontend/src/api/client.js` — after `updateMarathonItemDate`, which ends at line 565

- [ ] **Step 1: Add the three methods**

```js
// Past screenings of a marathon film — the choices in the "Already watched" panel.
export const getMarathonItemMatches = (id, itemId) =>
  fetchAPI(`/api/marathons/${id}/items/${itemId}/matches?guild_id=${GUILD_ID}`);

export const markMarathonItemWatched = (id, itemId, watchedAt, movieNightId = null) =>
  fetchAPI(`/api/marathons/${id}/items/${itemId}/watched?guild_id=${GUILD_ID}`, {
    method: 'POST',
    body: JSON.stringify({ watched_at: watchedAt, movie_night_id: movieNightId })
  });

export const unmarkMarathonItemWatched = (id, itemId) =>
  fetchAPI(`/api/marathons/${id}/items/${itemId}/watched?guild_id=${GUILD_ID}`, { method: 'DELETE' });
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/api/client.js
git commit -m "feat(web): api client methods for marking a marathon film watched"
```

---

## Task 7: Register the undo icon

**Files:**
- Modify: `frontend/src/components/ui/Icon.jsx`

- [ ] **Step 1: Import the glyph**

Add `RotateCcw,` to the `lucide-react` import list, next to the other imports (the list around line 35 is alphabetical-ish; put it with its neighbours).

- [ ] **Step 2: Register it**

Add to the registry map, next to `'check-circle': CheckCircle2,` (line 101):

```js
  undo:      RotateCcw,
```

- [ ] **Step 3: Verify the build still passes**

Run: `cd frontend && npm run build`
Expected: `✓ built in …` with no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/ui/Icon.jsx
git commit -m "chore(web): register undo icon"
```

---

## Task 8: The MarkWatchedPanel component

Its own file so `MarathonDetail.jsx` (already ~240 lines carrying the hero, the lineup, drag-reorder and two inline confirms) does not absorb another self-contained flow.

**Files:**
- Create: `frontend/src/components/marathons/MarkWatchedPanel.jsx`

- [ ] **Step 1: Write the component**

```jsx
import { useEffect, useState } from 'react';
import * as api from '../../api/client';
import { Icon } from '../ui';

const pad = (n) => String(n).padStart(2, '0');
const toLocalInput = (d) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

const fmtNight = (n) =>
  new Date(n.scheduled_at).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

// Logs a film the group already watched outside the roll-out. Offers whatever past
// movie nights we can find for it, so the marathon ends up pointing at the real
// screening — and its ratings — rather than a date somebody typed. Falls back to a
// plain date for a film that was watched but never announced.
export default function MarkWatchedPanel({ marathonId, item, onDone, onCancel, onError }) {
  const [nights, setNights] = useState(null);    // null = still loading
  const [choice, setChoice] = useState('date');  // 'date', or a night id as a string
  const [when, setWhen] = useState(() => toLocalInput(new Date()));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let live = true;
    api.getMarathonItemMatches(marathonId, item.id)
      .then((rows) => {
        if (!live) return;
        setNights(rows);
        // One obvious candidate is almost always the right one.
        if (rows.length === 1) setChoice(String(rows[0].id));
      })
      // A lookup failure shouldn't block logging the film by hand.
      .catch(() => { if (live) setNights([]); });
    return () => { live = false; };
  }, [marathonId, item.id]);

  const submit = async () => {
    const night = nights?.find((n) => String(n.id) === choice);
    const watchedAt = night ? new Date(night.scheduled_at) : new Date(when);
    if (isNaN(watchedAt.getTime())) { onError('Pick a date first.'); return; }
    if (watchedAt > new Date()) {
      onError('That date is in the future — pick when you actually watched it.');
      return;
    }
    setSaving(true);
    try {
      await api.markMarathonItemWatched(marathonId, item.id, watchedAt.toISOString(), night ? night.id : null);
      onDone();
    } catch (err) {
      onError(err.message);
      setSaving(false);
    }
  };

  return (
    <div className="mara-watched">
      <div className="k">When did you watch “{item.title}”?</div>
      {nights === null ? (
        <p className="muted">Looking for past screenings…</p>
      ) : (
        <>
          {nights.map((n) => (
            <label key={n.id} className="wopt">
              <input type="radio" name={`watched-${item.id}`} checked={choice === String(n.id)}
                onChange={() => setChoice(String(n.id))} />
              <span>{fmtNight(n)}{n.announced_by_name ? ` — announced by ${n.announced_by_name}` : ''}</span>
            </label>
          ))}
          <label className="wopt">
            <input type="radio" name={`watched-${item.id}`} checked={choice === 'date'}
              onChange={() => setChoice('date')} />
            <span>{nights.length ? 'Another date' : 'Date watched'}</span>
            <input className="li-date" type="datetime-local" value={when} max={toLocalInput(new Date())}
              disabled={choice !== 'date'} onChange={(e) => setWhen(e.target.value)} />
          </label>
        </>
      )}
      <div className="wact">
        <button className="btn" disabled={saving || nights === null} onClick={submit}>
          <Icon name="check-circle" size={15} /> Mark watched
        </button>
        <button className="btn ghost" disabled={saving} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify the build passes**

Run: `cd frontend && npm run build`
Expected: `✓ built in …`. (The component is not imported yet, so this only proves it compiles — Task 9 wires it in.)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/marathons/MarkWatchedPanel.jsx
git commit -m "feat(web): panel for logging a marathon film as already watched"
```

---

## Task 9: Wire the panel into the detail page

**Files:**
- Modify: `frontend/src/components/marathons/MarathonDetail.jsx`

- [ ] **Step 1: Import the panel**

Add below the existing `Icon` import (line 5):

```jsx
import MarkWatchedPanel from './MarkWatchedPanel';
```

- [ ] **Step 2: Make the watched state explicit**

Replace `itemState` (lines 20-23):

```jsx
const itemState = (it) => {
  // A film logged by hand is watched outright — its date may be minutes old, so
  // the date comparison alone would still call it upcoming right after logging.
  if (it.status === 'watched') return 'watched';
  if (!it.scheduled_at) return 'wait';
  return new Date(it.scheduled_at) < new Date() ? 'watched' : 'upcoming';
};
```

- [ ] **Step 3: Add the panel state and the undo handler**

Add after `const [confirmRemove, setConfirmRemove] = useState(null);` (line 37):

```jsx
  // Which row has the "Already watched" panel open: an item id, or 'hero' for the
  // next-up card. A string can never collide with an id, so one piece of state
  // covers both entry points without ever rendering the panel twice.
  const [markWatched, setMarkWatched] = useState(null);
```

Add after the `removeItem` handler (which ends at line 87):

```jsx
  const undoWatched = async (item) => {
    try {
      await api.unmarkMarathonItemWatched(m.id, item.id);
      showSuccess(`“${item.title}” is back in the queue — give it a date when you know it`);
      load();
    } catch (err) { showError(err.message); }
  };

  // A film the bot has already taken is not ours to log — 'scheduled' means the
  // announcement is queued or posted, and the marathon is tracking it either way.
  // The link alone isn't enough: it isn't written until the processor posts.
  const canMarkWatched = (it) =>
    m?.is_owner && itemState(it) !== 'watched' && it.status !== 'scheduled' && !it.scheduled_movie_night_id;
```

- [ ] **Step 4: Add the hero entry point**

In the next-up hero, inside the `<div className="row">`, the `m.is_owner &&` fragment currently holds `Change date` and `Make TBD` (lines 164-169). Add a third button to that fragment, after `Make TBD`:

```jsx
                    {canMarkWatched(nextItem) && (
                      <button className="btn ghost" onClick={() => setMarkWatched(markWatched === 'hero' ? null : 'hero')}>
                        <Icon name="check-circle" size={15} /> Already watched
                      </button>
                    )}
```

Then, directly after the closing `</div>` of that `row` div and before the closing `</div>` of `nb`, render the panel:

```jsx
            {markWatched === 'hero' && (
              <MarkWatchedPanel marathonId={m.id} item={nextItem}
                onDone={() => { setMarkWatched(null); showSuccess(`“${nextItem.title}” logged as watched`); load(); }}
                onCancel={() => setMarkWatched(null)}
                onError={showError} />
            )}
```

- [ ] **Step 5: Rework the lineup row controls**

Replace the `{editable && (…)}` block (lines 211-224) with:

```jsx
            {st === 'watched' ? (
              m.is_owner && (
                <button className="mara-iconbtn" title={`Put “${it.title}” back in the queue`}
                  onClick={() => undoWatched(it)}><Icon name="undo" size={15} /></button>
              )
            ) : (
              <>
                {canMarkWatched(it) && (
                  <button className="mara-iconbtn" title={`Mark “${it.title}” as already watched`}
                    onClick={() => setMarkWatched(markWatched === it.id ? null : it.id)}>
                    <Icon name="check-circle" size={15} /></button>
                )}
                {editable && (confirming ? (
                  <span className="li-confirm" ref={confirmRef}>
                    <button className="btn destructive sm" onClick={() => removeItem(it)}>Remove</button>
                    <button className="btn ghost sm" onClick={() => setConfirmRemove(null)}>Cancel</button>
                  </span>
                ) : (
                  <>
                    <span className="grip"><Icon name="grip" size={15} /></span>
                    <button className="mara-iconbtn danger" title={`Remove ${it.title}`}
                      onClick={() => setConfirmRemove(it.id)}><Icon name="close" size={15} /></button>
                  </>
                ))}
              </>
            )}
```

- [ ] **Step 6: Give each row somewhere to put the panel**

`.mara-li2` is a flex row, so the panel cannot live inside it. Wrap the row in a plain div. Change the `return (` inside `items.map` (line 190) so the `key` moves to a wrapper and the row div loses it:

```jsx
        return (
          <div key={it.id}>
            <div
              className={`mara-li2 ${st === 'watched' ? 'past' : ''} ${dragIndex === idx ? 'dragging' : ''} ${dragOver === idx ? 'dragover' : ''} ${confirming ? 'confirming' : ''}`}
              draggable={editable && !confirming}
              onDragStart={() => editable && !confirming && setDragIndex(idx)}
              onDragOver={(e) => { if (dragIndex !== null) { e.preventDefault(); setDragOver(idx); } }}
              onDragLeave={() => setDragOver((o) => (o === idx ? null : o))}
              onDrop={() => onDrop(items, idx)}
              onDragEnd={() => { setDragIndex(null); setDragOver(null); }}>
```

Everything currently inside the row stays as it is. Then close the row div and add the panel before the wrapper's closing tag — replacing the row's old closing `</div>` (line 225) with:

```jsx
            </div>
            {markWatched === it.id && (
              <MarkWatchedPanel marathonId={m.id} item={it}
                onDone={() => { setMarkWatched(null); showSuccess(`“${it.title}” logged as watched`); load(); }}
                onCancel={() => setMarkWatched(null)}
                onError={showError} />
            )}
          </div>
        );
```

- [ ] **Step 7: Stop the date editor offering the past**

There is exactly one `datetime-local` in this file — the next-up hero's date editor at line 159; lineup rows only display their date. It now targets a route that refuses past dates, so catch it before the round trip. Add one attribute to that input:

```jsx
                <input className="li-date" type="datetime-local" autoFocus
                  min={toLocalInput(new Date())}
                  defaultValue={nextItem.scheduled_at ? toLocalInput(nextItem.scheduled_at) : ''}
                  onBlur={(e) => changeDate(nextItem, e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') changeDate(nextItem, e.target.value); }} />
```

- [ ] **Step 8: Verify the build passes**

Run: `cd frontend && npm run build`
Expected: `✓ built in …` with no errors.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/components/marathons/MarathonDetail.jsx
git commit -m "feat(web): mark a marathon film as already watched, with undo"
```

---

## Task 10: Panel styling

**Files:**
- Modify: `frontend/src/pages/MarathonsPage.css` — after the `.mara-li2 .li-confirm` rule (line 388)

- [ ] **Step 1: Add the styles**

Tokens only, no hardcoded colour. Surrounding rules in this file use raw px for spacing, so these match rather than switching to `--s-*` mid-file.

```css
/* "Already watched" — logs a film the group watched outside the roll-out. Sits
   under its row (or under the next-up card), never inside the flex row itself. */
.mara-watched { background: var(--ink-2); border: 1px solid var(--rule-strong);
  border-radius: var(--r-2); padding: 14px 16px; margin: 0 0 8px; display: flex;
  flex-direction: column; gap: 8px; }
.mara-nextcard .mara-watched { margin-top: 12px; }
.mara-watched .k { font-family: var(--font-mono); font-size: 10px; letter-spacing: .28em;
  text-transform: uppercase; color: var(--bone-mute); }
.mara-watched .wopt { display: flex; align-items: center; gap: 10px; font-size: 13px;
  color: var(--bone-dim); cursor: pointer; }
.mara-watched .wopt input[type="radio"] { accent-color: var(--ember); }
.mara-watched .wopt .li-date { background: var(--ink); border: 1px solid var(--rule-strong);
  border-radius: var(--r-2); color: var(--bone); font-family: var(--font-ui);
  font-size: 12px; padding: 6px 8px; }
.mara-watched .wopt .li-date:focus { outline: none; border-color: var(--ember); }
.mara-watched .wopt .li-date:disabled { opacity: .45; }
.mara-watched .wact { display: flex; gap: 8px; margin-top: 4px; }
```

- [ ] **Step 2: Verify the build passes**

Run: `cd frontend && npm run build`
Expected: `✓ built in …`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/MarathonsPage.css
git commit -m "style(web): already-watched panel"
```

---

## Task 11: Verification on Railway

Local Postgres is normally not running here, and this feature is mostly database behaviour and a bot cron that has to *not* fire. Both need the deployed environment.

- [ ] **Step 1: Local pre-flight**

```bash
node --check backend/src/models/marathons.js
node --check backend/src/models/movies.js
node --check backend/src/routes/marathons.js
cd frontend && npm run build
```

Expected: no output from the three checks, `✓ built in …` from the build.

- [ ] **Step 2: Push and deploy**

```bash
git push -u origin feat/marathon-mark-watched
```

Then let Railway deploy the branch (or merge first, per the project's usual flow). **No migration is needed** — `status` is already `VARCHAR(20)`.

- [ ] **Step 3: Walk the checklist on the deployed site**

1. Open an active marathon with a queued film that has a past screening in this guild. Click **Already watched** → the panel lists that night, pre-selected if it is the only one.
2. Confirm → the row reads `Watched <day>`, the progress band advances, and the item's `scheduled_movie_night_id` points at that night.
3. On a film with no past screening: the panel opens on the date field. Pick a past date, confirm → same result, unlinked.
4. Wait one `marathonProcessor` pass (5 minutes) → the watched film is **not** announced to Discord, and the next pending film is still the correct one.
5. Undo a watched film → it returns to the queue as TBD, and the following pass still does not announce it (no date).
6. Mark the last remaining film watched → the marathon flips to `completed` on the next pass.
7. Undo a film on that completed marathon → it goes back to `active`.
8. Try to set a queued film's date to yesterday → refused, with the message pointing at "Already watched".
9. Try to launch a draft whose first film is dated in the past → refused, naming the film.
10. Check the home page "On the calendar" agenda → the watched film is not listed as upcoming.

- [ ] **Step 4: Look at it**

Render the marathon detail page and check the panel visually — spacing, the radio list, the disabled date input, and the undo button on a watched row. A passing build says nothing about how it looks.

- [ ] **Step 5: Finish the branch**

Use the `superpowers:finishing-a-development-branch` skill to merge and clean up.
