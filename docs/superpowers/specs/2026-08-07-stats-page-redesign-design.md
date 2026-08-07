# Stats Page Redesign — Design

**Date:** 2026-08-07
**Status:** Approved (design), pending implementation plan
**Mockup:** `docs/superpowers/mockups/stats-redesign-preview.html` (Films & People toggles are live)
**Supersedes the layout of:** `frontend/src/pages/StatsPage.jsx` (the current 7-section page)

## Problem

The stats page grew to seven stacked, numbered sections containing **six near-identical ranked
lists** (top movies, bottom movies, prolific raters, streaks, hosts, taste, loyal) plus two
heavy 3-column blocks and an orphan runtime row. It reads as one long monotonous scroll with no
hierarchy and inconsistent card treatments. Goal: reorganise into a unified, breathing dashboard
without losing data.

## Approach

Collapse seven sections into **four zones**. The many parallel lists become **two switchable
modules** driven by client-side toggles over data the `getStats()` payload already returns.

1. **Overview** — a reigning-champion hero over a 5-up stat band.
2. **The Films** — one leaderboard with a **Top ⇄ Worst** toggle + **Month / Year / All-time** filter.
3. **The People** — one leaderboard with a **Ratings / Taste / Hosted / Streak / Loyal** toggle, plus a **Most generous ⇄ Harshest** highlight pair.
4. **Club lore** — a fun-facts grid: rating-distribution histogram + signature/decade/cadence/divisive + three new cards (runtime extremes, era range, attendance).

### What is removed / folded (no data lost except where noted)
- Standalone **Bottom-rated** section → the Worst toggle in Films.
- Separate **Prolific raters** and **Streak board** sections → metrics in the People toggle.
- **Simultaneous month/year/all triple-lists** → the Month/Year/All filter (one list at a time).
- **Orphan runtime row** → "Hours in the dark" in the stat band.
- Numbered `01–07` headings → named zones.
- **Removed feature (flagged):** the arbitrary **past-month dropdown** (which let you pick e.g.
  "November 2024"). Replaced by the Month/Year/All toggle, where "Month" = current month. The
  `available_months` API field and month param remain available for a future re-add, but the UI
  no longer exposes the picker.

## Data — what the payload already has vs. new backend work

The People and Films modules are **frontend-only** — every array already ships in `GET /stats`:
`top_month/top_year/top_all_time`, `worst_month/worst_year/worst_all_time`, `top_raters`,
`best_taste_hosts`, `top_hosts`, `streak_leaderboard`, `most_loyal`, `rater_extremes`.
Overview band reuses `total_movies`, `total_runtime`, `total_ratings`, `overall_avg_rating`,
`total_raters`.

**New backend queries** (append to `backend/src/models/stats.js`, guild-scoped + test-excluded,
wired into the `GET /` aggregate):

- `getReigningChampion(guildId, minVotes = 3)` — highest average all-time film **enriched** for the
  hero. Returns `{ id, title, image_url, avg_rating, rating_count, release_year, genres, host_name }`
  (join `movie_nights` → `ratings`, and `LEFT JOIN users` on `announced_by` for `host_name`;
  `HAVING COUNT(*) >= minVotes`; order by avg desc, limit 1). Null when nothing qualifies.
- `getClubRatingDistribution(guildId)` — histogram buckets. `generate_series(1,10,1)` left-joined to
  `ROUND(score)` counts, so all ten integer buckets return even when zero. Returns
  `[{ score, count }]` (length 10). The avg marker uses the existing `overall_avg_rating`.
- `getFilmExtremes(guildId)` — returns `{ longest, shortest, oldest, newest }`, each
  `{ id, title, runtime, release_year }`. `longest`/`shortest` order by `runtime` (where
  `runtime IS NOT NULL`); `oldest`/`newest` order by `release_year` (where `release_year IS NOT NULL`).
  Any member is null when no film qualifies.
- `getAttendanceStats(guildId)` — returns `{ avg_attendance, best }`. `avg_attendance` = average
  attendee count across nights that have **≥1** attendee (guards divide-by-zero → 0). `best` =
  `{ id, title, image_url, attendee_count }` for the single best-attended screening, or null.

New response keys on `GET /stats`: `reigning_champion`, `rating_distribution`, `film_extremes`,
`attendance`.

## Frontend architecture

The current `StatsPage.jsx` does everything inline. Refactor it into a thin composition over
focused components in a new `frontend/src/components/stats/` directory (co-located CSS), following
the repo's "smaller, focused files" guidance and reusing `ui` primitives.

- `StatsPage.jsx` — fetches `getStats()` once, renders `PageHeader` + the four zone components,
  handles loading/error. No list markup inline.
- `components/stats/ChampionHero.jsx` (+ css) — poster, kicker, title, meta line, big gold score.
  Renders null if `reigning_champion` is absent.
- `components/stats/OverviewBand.jsx` (+ css) — the 5-up band (Screenings, Hours in the dark,
  Ratings cast, Club average, Voters).
- `components/stats/FilmsLeaderboard.jsx` (+ css) — local state `{ mode: 'top'|'worst',
  period: 'month'|'year'|'all' }`; two segmented controls; renders the matching array
  (`{mode}_{period}` mapped to the payload keys) via a shared `RankRow`. Gold score for Top,
  bone for Worst. Empty-state line per selection.
- `components/stats/PeopleLeaderboard.jsx` (+ css) — the Most-generous/Harshest pair on top, then
  local state `metric ∈ {ratings, taste, hosted, streak, loyal}`, one segmented control, one list.
  Each metric maps a payload array + a `(row) → { sub, badge, gold }` formatter. Reuses avatar rows.
- `components/stats/ClubLore.jsx` (+ css) — the fun-facts grid, composing `RatingHistogram` (wide,
  spans the row) plus the signature / divisive / cadence / attendance / runtime-extremes / era-range
  cards. Each card guarded against missing data.
- `components/stats/RatingHistogram.jsx` (+ css) — ten bars from `rating_distribution`, heights
  scaled to the max bucket, with a dashed avg marker positioned from `overall_avg_rating`.
- `components/stats/SegmentedControl.jsx` (+ css) — a small reusable pill/segmented toggle
  (mono uppercase labels, active = ember fill; a `gold` variant) used by both leaderboards.

Shared row primitives (`RankRow` for films, an avatar `PersonRow` for people) live in the
`stats/` directory and are reused across modules so there is one consistent treatment. The
existing `RankList`/`PeopleList` helpers and the section markup are removed from `StatsPage.jsx`.

Design tokens only (Editorial Cinephile): gold = rating values, ember = accents/active toggle,
mono/uppercase eyebrows and control labels; no hardcoded hex, no gradients (poster overlays only),
no glass. `getStats` in `api/client.js` is unchanged; the page may drop the `month` param usage.

## Edge cases
- Brand-new guild: every module renders an empty-state line or hides; the champion hero and each
  lore card are individually guarded; nothing crashes.
- Histogram with all-zero buckets renders a flat axis (no divide-by-zero on max → guard to 1).
- Toggles always have a valid default (`top` / `all` for Films, `ratings` for People).
- pg returns AVG/score-derived values as strings → `parseFloat(...).toFixed(1)` before display;
  counts are `::integer`.

## Out of scope
- No migrations, no new indexes, no bot changes.
- No arbitrary-month picker (see removal note above).
- `most_agreed` remains computed but unused (from the prior stats-expansion work).
- No server-side caching; still one `GET /stats` request.
