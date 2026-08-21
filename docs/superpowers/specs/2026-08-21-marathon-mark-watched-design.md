# Marathon: mark a film as already watched

**Date:** 2026-08-21
**Status:** Approved, ready for planning

## The problem

From user feedback:

> Another feature that would be cool is when you make a marathon and you announce how you
> usually do, it either updates the marathon or you get an option in the marathon to add
> that it was already watched on x date. Because I made one for Hunger Games and I kind of
> forgot, so I was just announcing how I usually do and just deleted the marathon because
> I couldn't update it.

A marathon and the ordinary announce flow are two separate ways to put a film on the
calendar, and they don't know about each other. Announce a marathon's film through the
normal flow and the marathon is left claiming that film is still coming. Today there is no
way to tell it otherwise: you can re-date a film, remove it, or delete the whole marathon.
The reporter chose delete, losing the marathon and its history.

A second, related defect surfaced in the same conversation: **marathon dates in the past
are accepted.** The three announce routes reject them (`movies.js:94`, `board.js:111`,
`wishlists.js:133`), but the marathon item-date route (`marathons.js:232`) and launch
(`marathons.js:252`) accept any valid date. A past date makes `marathonProcessor` treat the
item as due immediately, so it announces at once and `movieStarter` airs it. That is exactly
the trap a naive "just set the date to last Tuesday" implementation would fall into, so it
is fixed here.

## Scope

**In:** a marathon-side control that logs a queued film as already watched on a given date,
optionally attached to the movie night that already exists for it; an undo; the past-date
guard.

**Out:** announce-time detection (the announce flow noticing the film belongs to a
marathon), bulk catch-up across several films, and any re-flow of the remaining schedule.
Each was considered and deliberately declined — see Decisions.

## Decisions

| Decision | Chosen | Why |
|---|---|---|
| Entry point | Marathon-side control only | Self-contained; no coupling to the announce flow; it is the thing that would have saved the reporter's marathon |
| Link to a real night | Offer matching past nights, fall back to a plain date | Keeps ratings, attendance and the real date connected; still allows "we watched it and never announced it" |
| Remaining films | Dates left untouched | Nothing moves that the user didn't move; the cadence is never persisted, so any re-flow would be guesswork |
| Past-date bug | Fixed here | Same story: a date behind you means history, not a screening |
| Bulk repair | One film at a time | Matches the existing per-row Remove and Change date controls; smallest surface |
| Storage | New `'watched'` value on `marathon_items.status` | Every derived read already keys on `scheduled_at`, so progress, next-up and the row label stay correct for free |

### Storage: why `status`, not a new column

Considered and rejected:

- **A `watched_at` column, leaving `scheduled_at` as the plan.** Lossless — you could show
  "planned Friday, watched Saturday" — but `watched_count`, `airing_item`, `next_item`,
  `getCalendar` and the frontend's `itemState` all read `scheduled_at`. Every one would need
  to learn about the new column, and missing one leaves a film showing as upcoming forever.
  Large blast radius for a distinction nobody asked to see.
- **Link-only, deriving watched-ness from the joined movie night.** Cannot express a film
  watched but never announced, and adds a join to each of those five read paths.

The chosen approach overwrites the item's originally-planned date, so undo cannot restore
it. Undo therefore returns the film to TBD (`scheduled_at = NULL`, `status = 'pending'`) — a
state the UI already renders.

## UX

No mockup exists for this screen (`docs/superpowers/mockups/movie-marathons/` 09 and 10
cover add-films). The design follows the detail page's own established patterns rather than
introducing a new surface.

### Entry points

Both on `MarathonDetail.jsx`:

1. **Next-up hero** — an `Already watched` button beside `Change date` / `Make TBD`
   (`MarathonDetail.jsx:157-173`). The forgotten film is almost always the one that's next,
   so this is the primary path.
2. **Each queued lineup row** — a small `check-circle` icon button beside the remove `×`.

Today `editable` (`:187`) excludes the next-up row, because that film may already be posted
to Discord. Mark-watched must be available there regardless, so it takes its own gate:
owner-or-admin, and the film is not already watched, and the film is not already linked to a
movie night (see Edge cases).

### The panel

Expands inline, matching the row's existing Remove/Cancel confirm and the inline
`datetime-local` date editor. No modal is introduced.

```
When did you watch it?
  ( ) Fri, Aug 8  — announced by Jan
  ( ) Sat, Jul 25 — announced by Jan
  ( ) Another date  →  [ datetime-local ]
  [ Mark watched ]  [ Cancel ]
```

- The radio options are past movie nights in this guild for the same film.
- Exactly one match → pre-selected.
- No matches → the panel opens straight on the date field, defaulted to now.
- The date field rejects the future.

### Undo

A watched row reads `Watched Sat, Aug 8` and, for owners, carries a small undo button that
returns the film to TBD and `pending`. Being stuck with no way back is what made the
reporter delete their marathon; every state this feature creates has an exit.

`Icon.jsx` has no undo glyph — register `RotateCcw` as `undo`.

## Backend

### Schema

**No migration.** `marathon_items.status` is already `VARCHAR(20)`; `'watched'` joins the
existing `'pending'` and `'scheduled'`.

### Model functions

In `backend/src/models/marathons.js`:

- `markMarathonItemWatched(marathonId, itemId, watchedAt, movieNightId)` — sets
  `status = 'watched'`, `scheduled_at = watchedAt`, and `scheduled_movie_night_id` when a
  night was picked. Its `WHERE` clause carries the invariant rather than trusting the
  caller: `AND status <> 'scheduled' AND (scheduled_movie_night_id IS NULL OR
  scheduled_movie_night_id = $4)`. A film the bot has taken can never be logged by hand, and
  an existing link can never be nulled — while re-marking with the same night, to correct a
  date, still works.
- `unmarkMarathonItemWatched(marathonId, itemId)` — sets `status = 'pending'`,
  `scheduled_at = NULL`, and clears `scheduled_movie_night_id`. Clearing is unconditional
  and safe: the control is hidden whenever a link already exists (see Edge cases), so any
  link on a `'watched'` item was attached by this feature and never by the bot. The
  function guards on `status = 'watched'` so it can only ever undo its own work.

In `backend/src/models/movies.js`:

- `findPastNightsForFilm(guildId, tmdbId, title)` — past, non-test movie nights matching
  `tmdb_id`, falling back to an exact title match when the item has no `tmdb_id`. Newest
  first, limit 5.

### Routes

All in `backend/src/routes/marathons.js`, behind the existing `loadManageable`
owner-or-admin guard:

- `GET /:id/items/:itemId/matches` → candidate nights for the panel.
- `POST /:id/items/:itemId/watched` — body `{ watched_at, movie_night_id? }`. Rejects a
  future `watched_at`. Validates that `movie_night_id`, when supplied, belongs to this guild
  before trusting it.
- `DELETE /:id/items/:itemId/watched` → undo.

Client methods for all three go in `frontend/src/api/client.js`.

### Queries that must learn about the new status

Marking a film watched *just now* misreports it unless these change:

- `watched_count` (`models/marathons.js:28`) counts `scheduled_at + runtime < NOW()`. A film
  marked watched 30 minutes ago with a 2-hour runtime fails that test. Becomes
  `status = 'watched' OR (elapsed…)`.
- `airing_item` (`models/marathons.js:30`) would call that same film "on screen right now".
  Excludes `status = 'watched'`.
- `getCalendar` (`models/movies.js:259-269`) gains `AND mi.status <> 'watched'`, so a film
  marked watched earlier today doesn't sit on today's agenda as upcoming. (The existing
  `scheduled_movie_night_id IS NULL` filter already covers the linked case; this covers the
  unlinked one.)
- Frontend `itemState` (`MarathonDetail.jsx:20`) gains an explicit `status === 'watched'`
  check ahead of the date comparison, rather than inferring watched-ness from the date.

### Past-date guard

- `PUT /:id/items/:itemId` (`marathons.js:232`) and `POST /:id/launch` (`:252`) reject dates
  in the past, matching the announce routes. A `null` date (TBD) stays allowed.
- The error names the way out: *"That date has passed — use 'Already watched' to log a film
  you've already seen."*
- The launch guard reports **which** film offends; a draft assembled over several days can
  easily have its first date fall behind.
- Frontend: the inline `datetime-local` inputs get `min` set to now, catching it before the
  round trip.

## Edge cases

**A film the bot has already taken is not offered the action.** The test is
`status = 'scheduled' OR scheduled_movie_night_id IS NOT NULL`, and the status half is the
load-bearing one: `enqueueMarathonItemAtomic` marks an item `scheduled` when it *queues* the
announcement, but `linkMarathonItemMovieNight` doesn't run until the processor actually
posts. Checking the link alone would wave a film through in that window — the bot would post
it regardless, leaving a `watched` film pointing at a night still in the future. The
condition is enforced twice: in the route, for a good error message, and in
`markMarathonItemWatched`'s own `WHERE` clause, so it holds for any future caller.

After a binge kickoff every item is `scheduled`, so the control is hidden. **Before** kickoff
every item is `pending` and markable, and that case does need handling: `processBingeAnnouncement`
reads the whole lineup, so a hand-logged film would be announced a second time as part of the
evening and its link to the real screening overwritten. Both binge lineup reads
(`announcementProcessor.js:199`, `marathonProcessor.js:28`) filter `status !== 'watched'`.
This is the only bot change in the feature. `markAllMarathonItemsScheduled` needs nothing —
it already only touches `status = 'pending'`.

**Nothing renumbers.** Marking watched never deletes a row, so positions stay contiguous and
the "Film 4 of 5 / Film 6 of 5" hazard from the remove-film work does not arise.
`getNextPendingMarathonItem` (`bot/src/models/index.js:866`) skips the watched film by
status and the remaining films keep their order.

**The bot never announces a watched film.** It only picks up `status = 'pending'`.

**The marathon completes itself.** A watched item is neither `pending` nor future-dated, so
`completeMarathonIfDone` starts passing once the last film is marked. In the reported case,
marking all four Hunger Games films moves the marathon to `completed` — the same end state
the reporter reached by deleting it, except the history survives.

**Test data.** The match search filters `is_test`, as user-facing queries must.

## The invariant this feature broke

Worth stating plainly, because it caused most of what the reviews caught:

> **`marathon_items.scheduled_movie_night_id` no longer means "a night this marathon
> created."** For a hand-logged film it points at a pre-existing, historical screening.

Every reader of that column had to learn it, not only the ones on the announce path:

- `getMarathonItemsByMarathon` (`bot/src/models/index.js`) — the binge evening's lineup. Now
  filters `status IS DISTINCT FROM 'watched'` **in the query**, because it has three callers
  and the third (`handlers/attendance/handleRsvpButton.js`, which rebuilds the same embed on
  every RSVP click) was missed when the filter lived at the call sites.
- `toggleMarathonAttendance` and `getMarathonAttendees` — a binge RSVP toggles attendance
  across every film. Without the exclusion, `movieNightIds[0]` could be the *historical*
  night: someone who attended the original screening clicks "I'm in" on tonight's kickoff and
  has their RSVP **deleted** across the evening, while everyone else's is written onto a
  screening from weeks ago.
- `launchMarathon` — reset every item to `'pending'` unconditionally, silently un-watching a
  hand-logged film. Now guarded.

Two more that came out of the same review:

- **Undo is refused once a binge kickoff has posted.** Returning a film to `'pending'` then
  would make the processor queue a *second* kickoff for the same evening. Reuses the same
  helper the add routes use, with the closing clause naming what it actually refused.
- **The past-date guard broke "add films to a finished marathon."** `rhythm.nextDateFor`
  proposes dates by stepping forward from the last dated film, which is in the past for a
  marathon that has already run — so every proposal was one the API now rejects, and the add
  failed *after* the films had been appended. `inferRhythm` now clamps its first slot to the
  future, stepping by whole cadence steps so the weekday and time of day survive.

## Lapsed films

`itemState` calls anything past its date `'watched'`, which predates this feature and is what
the progress counts key on. That is fine for a film the bot aired, and wrong for a `'pending'`
film whose date merely slipped — every film in a paused marathon, for instance. The row now
tells those apart: a lapsed film reads `Was due <day>` with a clock, is not dimmed as history,
and keeps its grip and remove button, because it is still a queued film. The aggregate counts
deliberately still treat it as watched — changing that would diverge the detail page from the
browse cards, and it is a product decision rather than a bug.

## Verification

No test framework is configured. Locally: frontend build, backend and bot syntax checks.

On Railway (local Postgres is normally not running):

1. Mark a queued film watched, picking a matching night → row reads `Watched <day>`, the
   progress band advances, and the film links to that night.
2. Mark a film watched with no match, using a typed past date → same, unlinked.
3. Wait one `marathonProcessor` pass (5 min) → the watched film is **not** announced, and
   the next pending film is still the correct one.
4. Undo a watched film → returns to TBD, still not announced.
5. Mark the last remaining film watched → the marathon flips to `completed` on the next pass.
6. Try to set a queued film's date to yesterday → refused, with the message pointing at
   "Already watched".
7. Try to launch a marathon whose first film is dated in the past → refused, naming the film.
8. Add films to a marathon that has already finished → the proposed dates land in the future
   and the add succeeds. (This is the case the past-date guard first broke.)
9. Open a paused marathon whose dates have slipped → its films read `Was due <day>`, are not
   dimmed, and still offer mark-watched, reorder and remove.
10. Render the detail page and check the panel visually — a passing build says nothing about
    how it looks. The un-dimmed lapsed row is a look nobody has seen yet.

## References

- Prior marathon work: `docs/superpowers/specs/2026-07-22-movie-marathons-design.md`,
  and the add/remove-films work in commits `7ae9932`, `7c8751e`.
- Mockups: `docs/superpowers/mockups/movie-marathons/04-detail.html` governs the row and
  hero styling this panel sits inside.
