# Homepage Highlights — Design Spec

**Created:** 2026-07-22
**Status:** Approved design, pending implementation plan
**Scope:** Feature A of a three-part "make MovieNight more fun" effort.
Features B (new achievements batch) and C (MovieNight Wrapped) get their own specs later.

---

## Goal

Make the homepage (`frontend/src/pages/Home.jsx`) feel alive and rewarding at a glance,
without adding new pages or fighting the **Editorial Cinephile** design system. Three
additive elements, all homepage-only:

1. **"By the numbers" counter band** — animated count-up of the club's headline figures.
2. **"On This Day" banner** — nostalgia hook resurfacing a movie watched on today's date in a past year.
3. **Seasonal accents** — playful, date-triggered theming that stays dormant on normal days.

Non-goals: no changes to the Stats page, no new routes beyond the one On This Day query,
no theming on any page other than Home.

---

## 1. "By the numbers" counter band

### Placement & style
- Full-width strip inserted **directly after the hero `<section className="hero-split">`, before the Reviews carousel**.
- **Quiet editorial band**: a rule-bordered strip using the existing `Stat` UI primitive
  (`frontend/src/components/ui`) with mono figures. No display-size numbers, no color splash.
  Matches the restrained house style.

### Metrics (all already returned by `GET /stats`)
| Label | Source field | Formatting |
|-------|-------------|------------|
| Movies watched | `total_movies` | integer |
| Hours watched | `total_runtime` (minutes) | `Math.round(total_runtime / 60)` |
| Average rating | `overall_avg_rating` | one decimal, e.g. `7.4/10` |

### Data flow
- Add a `getStats()` call to the existing `Promise.all` in `Home.jsx`'s `fetchData` (with `.catch(() => null)`).
- Confirm/add a `getStats()` method in `frontend/src/api/client.js` hitting `GET /stats?guild_id=…`.
- **Zero backend work** — the endpoint already returns all three fields.
- If the stats fetch fails, the band does not render; the rest of the page is unaffected.

### `<CountUp>` component (reusable)
- New component `frontend/src/components/common/CountUp.jsx` (or `ui/`), so Feature C (Wrapped) can reuse it.
- Props: `value` (number), `duration` (default 800ms), `format` (fn, default identity), `decimals`.
- `requestAnimationFrame` count from 0 → `value`, ease-out.
- **Respects `prefers-reduced-motion`**: renders the final value immediately, no animation.
- Animation runs once on mount / when it scrolls into view (mount is sufficient given placement high on the page).

---

## 2. "On This Day" banner

### Behavior
- A slim card rendered **directly below the hero** (above the counter band) — **only when** a
  movie was watched on today's month/day in a prior year.
- Copy: *"On this day, 2 years ago — you watched **Blade Runner** · rated 8.1."* The title links to `/movie/:id`.
- When multiple past years match, feature the **highest-rated** one (best nostalgia hook).
- When nothing matches today (the common case), the component **renders nothing** — no empty slot.

### Backend
- New model fn `getOnThisDay(guildId)` in `backend/src/models/stats.js`:
  - `WHERE mn.guild_id = $1`
  - `AND (mn.is_test = false OR mn.is_test IS NULL)` (per backend rules)
  - `AND EXTRACT(MONTH FROM mn.scheduled_at) = EXTRACT(MONTH FROM CURRENT_DATE)`
  - `AND EXTRACT(DAY FROM mn.scheduled_at) = EXTRACT(DAY FROM CURRENT_DATE)`
  - `AND EXTRACT(YEAR FROM mn.scheduled_at) < EXTRACT(YEAR FROM CURRENT_DATE)`
  - `AND mn.scheduled_at <= NOW()` (only movies actually watched)
  - Join `ratings` for `AVG(score)` and count; order by avg rating desc; `LIMIT 1`.
  - Returns `{ movie_night_id, title, image_url, watched_year, years_ago, avg_rating, rating_count }` or nothing.
- New route `GET /stats/on-this-day` (uses `validateGuildId`), returns the row or `null`.
- New client method `getOnThisDay()` in `client.js`.
- Timezone: uses server date (`CURRENT_DATE`). Acceptable approximation — the club is single-timezone in practice.

### Data flow
- Add `getOnThisDay().catch(() => null)` to the homepage `Promise.all`; store in state; render conditionally.

---

## 3. Seasonal accents

**Playful decorative** intensity, **homepage only**, dormant on all normal days.

### Config-driven
- New util `frontend/src/utils/seasonalTheme.js` exporting `getSeasonalTheme(date)`:
  - Returns `null` on ordinary days, or a theme object `{ key, className, eyebrow, decoration }`.
  - Date windows are defined in a small config map so they're easy to tweak.
- Home applies the theme by adding a class to the root `.home` element (e.g. `home--halloween`)
  and optionally mounting a `<SeasonalDecoration theme={key} />` overlay.
- **Dev override:** honor a `?season=halloween|christmas|newyear|aprilfools` query param so the
  theme can be previewed off-season during testing.
- All animated layers **respect `prefers-reduced-motion`** (render static or omit the animation).

### The four themes
| Key | Window | Treatment |
|-----|--------|-----------|
| `halloween` | Oct 24–31 | Accent → blood-orange; eyebrow copy tweak ("Tonight's haunt"); subtle floating bats/moon SVG motif over the hero. |
| `christmas` | Dec 20–26 | Wintry accent; animated falling-snow layer over the hero backdrop; festive eyebrow ("Season's screenings"). |
| `newyear` | Dec 31 – Jan 1 | "Year in review" framing on the counter band; a confetti burst on load; teaser link to Wrapped once Feature C ships. |
| `aprilfools` | Apr 1 | One-day harmless gag: counter band flashes absurd numbers ("11/10", "∞ hours") then settles to the real values via `<CountUp>`; clearly a joke, auto-corrects. |

- Motifs are SVG/Lucide-based, not emoji (design rule). Seasonal is the one place we allow the
  playful decorative layer to bend the "no animated chrome" guideline — but only within the dated window.

---

## Error handling
- Counter band and On This Day are each wrapped in `.catch()` in the homepage fetch; on failure
  they simply don't render. No error surfaced to the user; the rest of the page is unaffected.
- Seasonal theming is pure client-side date logic — no fetch, no failure path.

## Testing
- **Manual render verification on the deployed site** (Railway; local Postgres usually isn't running).
- Counters: confirm the three figures match the Stats page; animation runs once; reduced-motion shows
  final values instantly.
- On This Day: verify it appears for a date with a known past screening and hides on a barren date.
- Seasonal: use the `?season=` dev override to preview each of the four themes; verify reduced-motion behavior.

## Files touched (anticipated)
- `frontend/src/pages/Home.jsx` — add fetches, counter band, On This Day banner, seasonal class/overlay.
- `frontend/src/components/common/CountUp.jsx` — new reusable component.
- `frontend/src/components/home/OnThisDay.jsx` — new banner component (or inline).
- `frontend/src/components/home/SeasonalDecoration.jsx` — new decorative overlay.
- `frontend/src/utils/seasonalTheme.js` — new date→theme util + config.
- `frontend/src/api/client.js` — `getStats()` (confirm), `getOnThisDay()`.
- `frontend/src/pages/Home.css` — counter band, On This Day, seasonal styles.
- `backend/src/models/stats.js` — `getOnThisDay()`.
- `backend/src/routes/stats.js` — `GET /stats/on-this-day`.
