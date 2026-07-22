# Movie Marathons — Design Spec

**Date:** 2026-07-22
**Status:** Approved design, pending implementation plan
**Feature:** Schedule ordered sets of movies ("marathons") that fan out into individual movie nights, plus a shared calendar view of the schedule.

---

## 1. Overview

Users can create a **marathon**: a named, ordered set of films with a schedule that
materialises into individual movie nights **one at a time**. The list of films can be
built four ways (manual, by actor/director, from a franchise, or AI-curated), but all four
produce the same artifact — an ordered list of TMDB movies — so everything downstream
(scheduling, Discord posting, ratings) is identical regardless of source.

Two supporting pieces ship alongside it:
- An **"On the calendar" agenda** on the home page merging one-off movies and marathon films into one date-ordered list.
- An **inline month-calendar scheduler** on the home page (replacing the date popup) so users can see booked vs. open nights and schedule directly.

### Goals
- Create/schedule a marathon in a few steps, from any of the four sources.
- Reuse the existing `pending_announcements → announcementProcessor → movie_nights` pipeline unchanged; marathons only *feed* it.
- Keep the schedule legible now that many nights are booked ahead.

### Non-goals (v1)
- No collision detection/prevention — multiple movies per night is explicitly allowed.
- No per-user "private" marathons vs. public distinction beyond what lists already do (guild-scoped, visible to the guild).
- No cross-guild marathons.

---

## 2. Decisions (locked)

| Topic | Decision |
|---|---|
| Sources | All four: **Manual**, **By actor/director** (TMDB credits), **From a franchise** (TMDB collection), **Describe a vibe** (Gemini). |
| Curation model | **Google Gemini** (user has an API key). Hybrid: person/franchise use TMDB directly (no LLM); Gemini handles only fuzzy/thematic prompts. Every AI suggestion is resolved against TMDB and shown for review before scheduling. |
| Fan-out | **Roll out one at a time** — only the next film is queued to Discord; a daily bot cron advances the marathon. |
| Cadence | A **template** that auto-fills a date onto each film: **Daily / Weekly / Custom interval**, or **Back-to-back binge** (spaced by runtime). Every date is **individually hand-editable** after auto-fill. |
| Permissions | **Any logged-in user** can create + launch (matches current single-movie scheduling). |
| Collisions | **None handled.** Multiple movies on one night is fine — no warnings, no shifting. |
| Discord | Two embed shapes: weekly = one embed per film with marathon ribbon + progress dots; binge = one kickoff embed listing the full runtime-computed lineup. Each embed still creates a real `movie_night`. |
| Calendar view | Home-page **"On the calendar"** agenda (replaces the "Last screenings" card row when upcoming nights exist). |
| Inline scheduler | Home-page **inline month calendar** for picking a date (no popup), showing booked vs. open nights. |
| Nav | New **"Marathons"** item in the **primary** nav. |

---

## 3. Data model

Two new tables. Follow existing conventions: `guild_id` on everything, parameterized SQL,
column-existence checks in `migrate.js`, store TMDB metadata as columns (mirroring
`board_suggestions` / `movie_nights`) so scheduling needs no re-fetch.

### `marathons`
| Column | Type | Notes |
|---|---|---|
| id | SERIAL PK | |
| guild_id | VARCHAR(20) NOT NULL | multi-guild filter |
| created_by | INTEGER REFERENCES users(id) | |
| name | VARCHAR(255) NOT NULL | |
| description | TEXT | optional |
| status | VARCHAR(20) DEFAULT 'draft' | `draft` / `active` / `paused` / `completed` |
| cadence_type | VARCHAR(20) | `interval` / `binge` (used only to seed dates; not needed after launch) |
| current_position | INTEGER DEFAULT 0 | index of next item to queue |
| created_at / updated_at | TIMESTAMP | |

> Cadence *parameters* (daily/weekly/interval N, start date/time, break minutes) are a
> client-side convenience used to compute `marathon_items.scheduled_at`. Only `cadence_type`
> is persisted on the marathon, for display ("Weekly · Sundays 7pm" vs "Back-to-back").
> We may persist a small `cadence_meta JSONB` for re-editing convenience (see Open Items).

### `marathon_items`
| Column | Type | Notes |
|---|---|---|
| id | SERIAL PK | |
| marathon_id | INTEGER REFERENCES marathons(id) ON DELETE CASCADE | |
| position | INTEGER NOT NULL | order within the marathon |
| status | VARCHAR(20) DEFAULT 'pending' | `pending` / `scheduled` / `watched` |
| scheduled_at | TIMESTAMP | the film's own date — hand-editable; seeded by cadence |
| scheduled_movie_night_id | INTEGER REFERENCES movie_nights(id) ON DELETE SET NULL | set when queued |
| tmdb_id, title, image_url, backdrop_url, description, genres, runtime, release_year, tagline, imdb_id, original_language, trailer_url, tmdb_rating | (same shape as `board_suggestions`) | full metadata captured at add-time |

Indexes: `marathon_items(marathon_id)`, `marathons(guild_id)`, `marathon_items(status, scheduled_at)` for the cron.

---

## 4. Scheduling mechanics

1. **Build** the lineup (any source) → `marathon_items` rows with `position` + captured TMDB metadata, `status='pending'`.
2. **Set cadence** (client): choose Daily/Weekly/Custom/Binge + start date/time → auto-fill each item's `scheduled_at`. User may then hand-edit any single item's date. Back-to-back computes each start = previous start + previous runtime + `break_minutes`.
3. **Launch** (draft → active): persist the item dates, set `status='active'`.
4. **Roll-out** — a new bot cron **`marathonProcessor`** (daily; can also react to the existing NOTIFY wake) does, per active marathon:
   - Find the next `pending` item at/after `current_position`.
   - If its `scheduled_at` is within an announce lead window (e.g. same day / configurable), call the **existing** `createPendingAnnouncement()` with the item's stored metadata → existing `announcementProcessor` posts the embed and creates the `movie_night`.
   - Back-link `scheduled_movie_night_id`, set item `status='scheduled'`, bump `current_position`.
   - When all items are past/watched → marathon `status='completed'`.
   - `paused` marathons are skipped.
5. **Binge** exception: because all films are the same evening, the whole lineup is queued at launch (or when the date nears) rather than one-at-a-time; a single kickoff embed is posted (see §6).

**Editing the tail:** items after `current_position` are freely reorder/add/remove/redate until they become the next-up item. Pausing stops the roll-out.

---

## 5. Curation (Gemini)

- New backend service `backend/src/services/curator.js` wrapping the Google Generative AI API. New env var **`GEMINI_API_KEY`** (backend/.env).
- **Only** used for the "Describe a vibe" path. Prompt returns strict JSON `[{title, year}]` (~6–12 items). Each is resolved via the existing TMDB search; unmatched titles are dropped; the resolved lineup is returned to the client for **review/edit before scheduling**.
- Person ("Jessica Chastain marathon") and franchise ("Alien saga") paths do **not** use the LLM — they use TMDB person credits / collection endpoints directly (deterministic, no hallucination).
- **Cost:** ~500 tokens in / ~500 out per curation → ~$0.0015 (Gemini 2.5 Flash) or ~$0.0003 (2.0 Flash) per call; Google's free tier likely covers the whole guild. Negligible.
- Requires a **TMDB person search** endpoint if not already present (search person → credits). Add to `routes/tmdb.js` if missing.

---

## 6. Discord announcements

Reuses the pipeline; only the embed gains marathon context. Each announcement still creates a real `movie_night` (ratings/attendance/stats unchanged).

- **Weekly:** one embed per film as its night arrives. Adds an author ribbon (marathon name), progress dots + "Film N of M", and an "Up next" teaser. Normal poster / when / runtime / attend button.
- **Back-to-back:** one kickoff embed listing the full evening (each film's computed start time from runtimes) + a single "Count me in" action. N `movie_night` rows are still created behind it so each film is ratable.

Implementation touches `bot/src/jobs/announcementProcessor.js` embed builder (marathon-aware fields) and the new `marathonProcessor.js` job. A pending-announcement needs to carry marathon context (marathon id/name, position, total) — extend `pending_announcements` with nullable marathon columns, or pass through and look up by `scheduled_movie_night_id`. (Decide in plan; extending `pending_announcements` with `marathon_id`, `marathon_position`, `marathon_total` is simplest.)

---

## 7. Frontend

### New: Marathons area
- Route `/marathons` (+ `/marathons/:id`), lazy-loaded in `App.jsx`. New **primary** nav item in `Header.jsx`.
- **`MarathonsPage`** — browse view: "Your marathons" rows (poster fan, status chip, cadence, progress bar, next-up line, quick actions) + "Start from a set" suggestions (franchise / person / vibe entry points).
- **Create wizard** (4 steps: Source → Lineup → Schedule → Review):
  - *Source*: name + pick one of four build methods; the "vibe" method expands to a Gemini prompt box with example chips and the TMDB-verification guardrail note.
  - *Lineup + Schedule*: reorderable lineup with a **hand-editable date per film**; right-side cadence panel = template (Daily / Weekly / Custom segmented control, or Back-to-back mode) + "Auto-fill dates".
  - *Review*: confirm lineup + dates → Launch (or Save draft).
- **Detail view** (`/marathons/:id`): header + status + cadence, progress band, highlighted **"Up next"** card (Attend / Change date / Post now), full lineup showing watched (with group rating), next-up, and the reorderable waiting tail. Pause/resume, edit, add/drop films.

### Home page changes
- **"On the calendar" agenda** replaces the "Last screenings" compact-card row when upcoming nights exist (the section already toggles its title today — see `Home.jsx` ~line 337). Day-by-day list merging one-off + marathon films in date order; ember "Marathon" tag distinguishes them; binge shown as one "N films back-to-back" entry. Falls back to recent screenings when nothing's upcoming.
- **Inline scheduling calendar** replaces the date **popup**: the "Schedule" action opens a month grid inline showing booked (ember = marathon, grey = one-off) vs. open nights; selecting a day reveals an **inline compose row** (movie via wishlist/search + time + Schedule) — no modal.

### API client
- Add methods to `frontend/src/api/client.js` (JWT auto-attached, `guild_id` as query param): CRUD marathons + items, reorder, launch, pause/resume, curate. New calendar/occupancy fetch for the scheduler (upcoming movie_nights + marathon items in a date range).

---

## 8. Backend surface

- `backend/src/models/marathons.js` — all marathon DB ops (create, get list/by-id, add/remove/reorder items, set dates, launch, pause/resume, advance). Barrel-export via `models/index.js`.
- `backend/src/routes/marathons.js` — CRUD + `POST /marathons/:id/launch`, `/pause`, `/resume`, `POST /marathons/curate` (Gemini), reorder. `authenticateToken`, `guild_id` filtering, `validateIntParams`.
- `backend/src/services/curator.js` — Gemini wrapper.
- Migration additions in `backend/src/config/migrate.js` (two tables + optional `pending_announcements` marathon columns).
- A calendar/occupancy endpoint (movie_nights + upcoming marathon items within a date range) for the home scheduler.

---

## 9. Bot surface

- `bot/src/jobs/marathonProcessor.js` — new cron advancing active marathons (roll-out §4). Registered like the other jobs.
- `bot/src/jobs/announcementProcessor.js` / embed builder — marathon-aware fields (ribbon, progress, up-next; binge lineup embed).
- `bot/src/models/index.js` — marathon read/advance helpers as needed (bot reads DB directly).

---

## 10. Testing / verification

No test framework in the repo → **manual verification on Railway** (local Postgres usually isn't running). Suggested path:
1. In **test mode**, create a 2-film marathon, Weekly, 1-day interval, near-future start.
2. Confirm `marathonProcessor` queues film #1 → `announcementProcessor` posts embed + creates `movie_night` → item back-linked, `current_position` bumped.
3. Advance day → film #2 queues. Verify pause stops roll-out and resume restarts it.
4. Verify a binge marathon posts one kickoff embed + N movie_nights.
5. Verify the home "On the calendar" agenda and inline scheduler reflect the booked nights.

---

## 11. Open items (settle in the plan, sensible defaults noted)

- **Announce lead window** for the daily cron (default: queue the morning of the scheduled date; make it a small constant).
- **`pending_announcements` marathon columns** vs. lookup by `scheduled_movie_night_id` (default: add nullable `marathon_id` / `marathon_position` / `marathon_total`).
- **`cadence_meta JSONB`** on `marathons` to remember the template for later re-edits (default: store it; harmless and convenient).
- **Binge announcement**: one kickoff embed + N silent `movie_night` rows — confirm the bot can create a `movie_night` without its own per-film announcement (default: yes, direct insert for films 2..N).
- **Draft visibility**: drafts are guild-visible like lists (default) vs. creator-only.

---

## 12. Rollout notes

- Migration is additive and idempotent (new tables + nullable columns) — safe on the live DB.
- No changes to existing single-movie scheduling behavior; the inline calendar is a UI replacement for the date picker that calls the same `announceMovie` path.
- Gemini is isolated behind `services/curator.js` and only invoked on the vibe path; absence of `GEMINI_API_KEY` degrades gracefully (hide the vibe option).
