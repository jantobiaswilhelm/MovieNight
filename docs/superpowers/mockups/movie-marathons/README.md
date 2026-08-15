# Movie Marathons — UI Mockups

Static, self-contained HTML mockups produced during brainstorming (2026-07-22). Each renders
in the app's **Editorial Cinephile** theme (ink surfaces, bone text, ember accent, Fraunces
titles). Open any file directly in a browser — no server needed. These are **reference for
implementation**, not production code; the authoritative design is the spec.

- **Spec:** `../../specs/2026-07-22-movie-marathons-design.md`
- **Plan 1 (Core MVP):** `../../plans/2026-07-22-movie-marathons-core.md`

## Screens

| File | Screen | Plan |
|---|---|---|
| `01-browse.html` | Marathons tab — browse list (status, cadence, progress, next-up) + "Start from a set" | Plan 1 |
| `02-wizard-source.html` | Create wizard step 1 — pick source (manual / person / franchise / vibe) | Plan 1 (manual), Plan 2 (others) |
| `03-wizard-schedule.html` | Create wizard — lineup + cadence template (Daily/Weekly/Custom), hand-editable per-film dates | Plan 1 |
| `04-detail.html` | Marathon detail — progress, "Up next" card, full lineup, pause/resume | Plan 1 |
| `05-discord-announcements.html` | Discord embeds — weekly per-film (ribbon + progress) and back-to-back kickoff | Plan 1 (weekly), Plan 3 (binge) |
| `06-home-calendar.html` | Home "On the calendar" agenda (one-offs + marathon films, date-ordered) | Plan 4 |
| `07-inline-scheduler.html` | Inline month-calendar scheduler on the home page (replaces the date popup) | Plan 4 |
| `08-collision-scenario.html` | The double-booking scenario (design context — no collision logic ships; multiple movies per night is allowed) | — |
| `09-add-films.html` | Add films to a *running* marathon — detected through-line, suggestion rows, source picker as the fallback | Add-films |
| `10-add-films-dates.html` | Add films step 2 — dates continuing the marathon's inferred rhythm, TBD allowed | Add-films |

## Add-films (2026-08-16)

Screens 09–10 were designed after the original four plans, when removing a single film from a
running marathon landed and adding one turned out to be missing. Decisions behind them:

- **Detection is structural, not AI** — shared collection, shared director/cast via TMDB credits,
  then genre+decade for labelling only. Deterministic, identical on every deploy, no
  `GEMINI_API_KEY` dependency. The wizard's four sources stay as the escape hatch behind
  "That's not it".
- **Genre+decade can name a theme but can't source picks** — we have search / person / collection /
  similar / credits / popular, and no TMDB *discover*. Pooled `/similar` is the generic row.
- **Dates continue the marathon's own rhythm**, measured from the gaps between its dated films,
  because the cadence interval is never persisted (`marathons` stores only `cadence_type`).
- **Films roll out in lineup order, not date order** (`getNextPendingMarathonItem` sorts by
  `position`), so an added date that jumps the queue is flagged rather than silently reordered.
