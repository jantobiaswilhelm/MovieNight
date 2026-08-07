# Stats Expansion — Design

**Date:** 2026-08-07
**Status:** Approved (design), pending implementation plan
**Mockup:** `docs/superpowers/mockups/stats-expansion-preview.html`

## Goal

The stats page and homepage today only speak in terms of **movies and ratings**. Nothing
credits **people as hosts** or surfaces club-wide **fun facts**. This work fills that gap:

1. A new **"The people"** section on the stats page (hosts & critics leaderboards).
2. A new **"Club lore"** section on the stats page (fun-fact cards).
3. A **Hall of Fame** teaser on the homepage — three podium cards linking to the full stats page.

No database migrations are required. Every stat is derived from existing columns:
`movie_nights.announced_by` (indexed), `ratings.score`, `movie_attendance`,
`movie_nights.genres`, `movie_nights.release_year`.

All queries filter by `guild_id` and exclude test data
(`AND (mn.is_test = false OR mn.is_test IS NULL)`), matching the existing stats model.

## Scope

### People leaderboards
- **Top Hosts** — most movie nights announced (`announced_by`). Top 3 for the homepage podium, top 5 on the stats page.
- **Best Taste** — highest average rating on the movies a host announced. Minimum **3 hosted** nights to qualify.
- **The Generous & the Harsh** — highest and lowest average score *given* by a rater. Minimum **5 ratings** to qualify.
- **Most Loyal** — most nights attended (`movie_attendance`, a binary toggle).

### Fun facts
- **Most Divisive** — film with the largest rating spread (min 3 votes). Also compute **Most Agreed-on** (tightest spread) as a companion.
- **Signature** — most-watched genre and most-watched decade.
- **Cadence** — average movies per month and the busiest month ever.

### Homepage Hall of Fame trio
Three podium cards, each showing #1 large plus #2 and #3 as small rows:
- **Top Host** (from Top Hosts)
- **Top Critic** — most ratings cast (reuses the existing `top_raters` query)
- **Best Taste** (from Best Taste hosts)

Top Host and Best Taste may resolve to the same person — that is acceptable; each card
stands on its own top-3, so no de-duplication is needed.

## Backend

New functions in `backend/src/models/stats.js` (barrel-exported via `models/index.js`).
Every function takes `guildId` and returns user rows shaped like the existing
`getMostActiveRaters` (`id, username, discord_id, avatar, <metric>`).

- `getTopHosts(guildId, limit = 5)`
  Count `movie_nights` grouped by `announced_by` (non-null), test excluded. Also join
  `ratings` to compute each host's `avg_pick_rating` for the sub-label. Order by
  `night_count DESC`. Returns `{ id, username, discord_id, avatar, night_count, avg_pick_rating }`.

- `getBestTasteHosts(guildId, limit = 5, minHosted = 3)`
  Join `movie_nights (announced_by)` → `ratings`, group by host,
  `HAVING COUNT(DISTINCT mn.id) >= minHosted`, order by `avg_rating DESC`.
  Returns `{ id, username, discord_id, avatar, avg_rating, nights_hosted }`.

- `getRaterExtremes(guildId, minRatings = 5)`
  Average score given per rater (join through `movie_nights` for guild + test filter),
  `HAVING COUNT(*) >= minRatings`. Returns `{ most_generous, harshest }` — the top and
  bottom rows by `avg_given`, each `{ id, username, discord_id, avatar, avg_given, rating_count }`.
  Returns `null` fields when nobody qualifies.

- `getMostLoyalAttendees(guildId, limit = 5)`
  Count `movie_attendance` joined to non-test guild nights, grouped by user, order by
  `attended_count DESC`. Returns `{ id, username, discord_id, avatar, attended_count }`.

- `getMostDivisiveFilm(guildId, minVotes = 3)`
  Per movie: `STDDEV_POP(score)`, `MAX(score)`, `MIN(score)`, `AVG(score)`, `COUNT(*)`,
  `HAVING COUNT(*) >= minVotes`. Returns `{ most_divisive, most_agreed }` — highest and
  lowest stddev, each `{ id, title, image_url, avg, high, low, rating_count }`.

- `getSignatureGenreAndDecade(guildId)`
  Genre via `unnest(string_to_array(genres, ', '))` count; decade via
  `FLOOR(release_year / 10) * 10` count. Returns `{ top_genre: { genre, count }, top_decade: { decade, count } }`.

- `getCadence(guildId)`
  Over non-test nights with a `scheduled_at`: `avg_per_month` = total nights ÷ distinct
  `YYYY-MM` months (guard divide-by-zero → 0); `busiest_month` = the `YYYY-MM` with the
  most nights. Returns `{ avg_per_month, busiest_month, busiest_count }`.

### API

Extend the existing `GET /stats` response in `backend/src/routes/stats.js` (add to the
`Promise.all` and the response object). No new endpoint — the homepage already calls this
same aggregate, so the trio needs no extra request. New keys:

```
top_hosts, best_taste_hosts, rater_extremes, most_loyal,
most_divisive, signature, cadence
```

`top_raters` (existing) already feeds Top Critic — unchanged.

## Frontend

Plain CSS, Editorial Cinephile tokens, primitives from `components/ui`. No hardcoded hex.

### Homepage — new `HomeHallOfFame` component
`frontend/src/components/home/HomeHallOfFame.jsx` (+ `.css`). Receives the `stats` object
already fetched by `Home.jsx` via `getStats()`. Rendered directly under `HomeStatsBand`.
Three podium cards (Top Host / Top Critic / Best Taste); each card = kicker + #1 (avatar,
name, sub-label, metric) + a hairline-divided list of #2 and #3. A "Full stats →" link
sits above the trio. Renders nothing if the underlying arrays are empty.

Metric colors: **gold** for rating values, **ember** for host/count accents (per token rules).

### Stats page — two new sections in `StatsPage.jsx`
- **06 · The people** — Top Hosts and Best Taste as two side-by-side ranked lists (reuse the
  existing `sp-raters` row pattern), then the Generous/Harshest pair (two verdict cards),
  then Most Loyal as a single short ranked list.
- **07 · Club lore** — three fact cards (Most Divisive with love/hate chips, Signature
  genre + decade, Cadence with busiest month).

Repeated ranked-row markup should use a small shared presentational helper rather than
copy-pasting the existing `RankList`/`sp-rater` blocks. Each qualifying leaderboard degrades
to an empty-state line when it has no data (matching current section behavior).

`api/client.js` needs no change — same `getStats()` endpoint.

## Edge cases
- Hosts with `announced_by IS NULL` are excluded from host leaderboards.
- Best Taste / rater extremes hide anyone below the minimum threshold; sections show an
  empty state when nobody qualifies.
- Ties broken by a stable secondary sort (e.g. `rating_count DESC`, then `id`).
- Cadence guards divide-by-zero when there are no dated nights.
- Divisive/agreed require ≥3 votes; return `null` when no film qualifies.

## Out of scope
- No migrations, no new indexes (existing `idx_movie_nights_announced_by` suffices).
- No changes to the Discord bot.
- No caching layer — the aggregate stays a single request like today.
