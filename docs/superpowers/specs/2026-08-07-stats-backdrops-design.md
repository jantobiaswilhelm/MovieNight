# Stats Page Backdrops — Design

**Date:** 2026-08-07
**Status:** Approved (design), pending implementation plan
**Mockup:** `docs/superpowers/mockups/stats-backdrops-preview.html`
**Builds on:** the four-zone stats page (`frontend/src/components/stats/`)

## Goal

Extend the faint film-backdrop treatment already used by the home page's "Recent dispatches"
(`ReviewsFeature` / `.rf-bg`) to the stats page, so key surfaces carry a quiet, relevant film
image behind their content. The effect is a photo layer at opacity `.14`, `background-size: cover`,
feathered with a radial-gradient mask, content stacked above at `z-index: 1`. This is a **photo
overlay**, which the design system explicitly permits (the "no gradients on UI chrome" rule
exempts photo overlays).

## Where it applies

- **Champion hero** — the champion film's own backdrop.
- **Films module** — the current top-of-list film's backdrop (updates as the Top/Worst/period
  toggles change the #1).
- **All six Club-lore cards** — each with a relevant film backdrop (see sources below).

The **People** module and the **Overview stat band** stay clean.

## Image source per surface

Every source reuses `sanitizeImageUrl` (from `frontend/src/utils/sanitizeUrl.js`) and falls back
`backdrop_url → image_url → (nothing → render no backdrop)`.

| Surface | Source film |
|---|---|
| Champion hero | the champion (already the reigning film) |
| Films module | `list[0]` of the current selection |
| Signature | top-rated film **in the top genre** (representative lookup) |
| Cadence | top film of the **busiest month** (representative lookup) |
| Most divisive | the divisive film |
| Attendance | the best-attended film |
| Runtime extremes | the longest film |
| Era range | the oldest film |

## Backend changes (`backend/src/models/stats.js` + `ratings.js`)

Additive columns / small lookups; all keep `guild_id` + test-exclusion. No new endpoints — the
existing `GET /stats` payload just carries more fields on existing keys.

- `getReigningChampion` — add `mn.backdrop_url` to the SELECT.
- `getTopRatedMoviesByPeriod` and `getWorstRatedMoviesByPeriod` (`ratings.js`) — add
  `mn.backdrop_url` to the SELECT. (Additive column; other consumers ignore it.)
- `getMostDivisiveFilm` — add `mn.backdrop_url` (already returns `image_url`).
- `getFilmExtremes` — add `image_url, backdrop_url` to each of the four rows' SELECT.
- `getAttendanceStats` — add `mn.backdrop_url` to the `best` SELECT (already returns `image_url`).
- `getSignatureGenreAndDecade` — after resolving the top genre, one extra lookup for a
  representative film: highest-average-rated film whose `genres ILIKE '%<genre>%'`, returning its
  `image_url`/`backdrop_url`. Fold onto `top_genre` → `{ genre, count, image_url, backdrop_url }`.
- `getCadence` — after resolving the busiest month, one extra lookup for that month's
  highest-average-rated film's `image_url`/`backdrop_url`. Return added fields
  `busiest_image_url`, `busiest_backdrop_url`.

Representative lookups order by `AVG(r.score) DESC NULLS LAST` (LEFT JOIN ratings so unrated
films still qualify), `LIMIT 1`, and return null when nothing matches.

## Frontend changes (`frontend/src/components/stats/`)

- New `Backdrop.jsx` + `Backdrop.css` — a reusable layer:
  ```jsx
  <Backdrop image={backdropOrPosterUrl} />
  ```
  It `sanitizeImageUrl`s the value, renders `null` if falsy, else an absolutely-positioned
  `.st-bg` div with the masked, low-opacity background. CSS mirrors `.rf-bg` exactly.
- `shared.css` — add a `.st-has-bg` helper (`position: relative; overflow: hidden;` and
  `.st-has-bg > *:not(.st-bg){ position: relative; z-index: 1; }`) so any container can host a
  backdrop without touching its inner layout. `overflow: hidden` clips the backdrop to the
  container's existing border-radius.
- Drop `<Backdrop>` + the `st-has-bg` class into: `ChampionHero` (the root `Link`),
  `FilmsLeaderboard` (the `.st-module`, image from `movies[0]`), and each of the six `ClubLore`
  cards (image from the mapped source above). No layout markup changes — only the wrapper class
  and one `<Backdrop>` child per surface.

## Edge cases
- No image on a surface → `Backdrop` renders nothing; the surface looks exactly as it does today.
- Films module with an empty list → no `movies[0]`, no backdrop.
- Representative lookups return null when the genre/month has no films → no backdrop on that card.
- Reduced motion: the layer is static (no animation), so nothing to gate.

## Out of scope
- No migrations, no new indexes, no bot changes, no new endpoints.
- No rotation/animation on the backdrops (unlike the rotating ReviewsFeature).
- People module and stat band remain image-free.
