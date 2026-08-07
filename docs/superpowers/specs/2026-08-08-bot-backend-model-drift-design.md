# Bot/Backend Model Drift — Reconcile & Guard — Design

**Date:** 2026-08-08
**Status:** Approved (design), pending implementation plan

## Problem

The bot (`bot/src/models/index.js`) and backend (`backend/src/models/*.js`) each maintain their
own data-access layer against the same PostgreSQL database. An investigation found this is **not**
a wholesale duplicated layer: of ~193 total functions, only **18 overlap**; the other 175 are
single-consumer (41 bot-only, 134 backend-only). Of the 18 overlaps: 4 are identical, 5 are minor
cosmetic diffs, and 9 are genuinely divergent by design (web vs Discord needs). The real risk is
**silent drift**: someone edits an overlapping function on one side, unaware a differently-behaving
twin exists on the other.

A full shared package / monorepo was rejected: `backend/`, `bot/`, `frontend/` are independent npm
packages that Railway builds from their own directories (no root `package.json`; backend has its
own `railway.json`). Introducing npm workspaces changes how Railway builds both services and cannot
be verified from the dev environment — too much deploy risk for a ~4–9 function physical dedup.

## Approach: reconcile-and-guard (no deploy-structure change)

1. **Reconcile** the two genuinely-buggy/mechanism-divergent functions (code change).
2. **Guard against future drift** with cross-reference comments on all 18 overlapping functions in
   both files, plus a CLAUDE.md section documenting them.

No shared package, no monorepo, no reworking of bot Discord-embed formatting.

### Scope guardrail (applies to every item)
Before any code alignment, **verify the call-sites on both sides**. If a reconciliation would change
Discord output, or a behavior a caller depends on, **default to "document as intentional, do not
change."** The net code change should be tiny (~2 functions); the bulk is comments + docs.

## The 18 overlapping functions and their disposition

**Identical → keep identical (comment only):**
`getUserByDiscordId`, `upsertRating`, `getMoviesToStart`, `rescheduleMovieNight`.
Mark both copies `// SHARED: keep identical with <path>`.

**Reconcile in code:**
- **`deleteMovieNight` (bot side)** — the backend was already simplified to a single cascade delete
  (the FK `ON DELETE CASCADE` on `ratings`, `movie_attendance`, `movie_credits`,
  `movie_night_voice_presence` was verified). Simplify the bot's version (currently a manual
  `DELETE FROM ratings` then delete) to the same single cascade delete so the two match. Verify no
  bot caller relies on the two-statement behavior.
- **`startMovieNight` (backend side)** — add the bot's `AND started_at IS NULL` idempotency guard so
  a double-start can't occur, matching the safer bot version. **Only if** a call-site check confirms
  the web flow doesn't depend on unconditional re-start (if it does, leave as-is and document).

**Document as intentional (comment only, no code change):** these differ for real reasons; forcing
them together would break one side:
- `getMovieNights` — web collapses re-screenings by `tmdb_id` + paginates; bot returns flat rows.
- `getUserRatings`, `getUserRating`, `getUserTopRatedMovies` — bot keys on `discord_id` (single
  guild); web keys on internal `user_id` and is guild-scoped + test-filtered.
- `getRecentMovieNightsForRating` — bot targets actually-started movies (`started_at NOT NULL`);
  web targets scheduled movies (`scheduled_at <= NOW()`).
- `createMovieNight` — bot signature carries `imageUrl, tmdbData, isTest`; backend inserts base
  columns only.
- `findOrCreateUser` — backend has a 4th `discordAccessToken` param (web OAuth); bot is the 3-arg
  upsert.
- `getMovieNightById`, `getGuildStats`, `getTopRatedMovies`, `getMostActiveRaters`,
  `getRatingsForMovie` — backend selects extra display columns and adds the `is_test` filter for the
  web UI; bot wraps aggregates in `ROUND(...)` for Discord embeds. Cosmetic/presentation divergence.

## The guard mechanism

**Cross-reference comment format** — one line directly above each of the 18 functions, in both
files:
- Identical: `// SHARED: keep identical with backend/src/models/<file>.js (<fn>)`
- Intentional divergence: `// PARALLEL to bot <fn> — intentionally differs: <one-line reason>`
  (and the mirror comment on the other side).

**CLAUDE.md** — add a short "Shared model functions (bot ↔ backend)" subsection under the existing
"Cross-Service Data Flow" area: a table listing the 18 functions, each tagged `identical` or
`intentional-diff: <reason>`, plus the rule: *"These functions exist in both `bot/src/models/` and
`backend/src/models/`. When you change one, check its twin — mirror identical ones, and preserve
documented intentional differences."*

## Verification
- `node --check` on every modified `.js` file.
- No behavior change on documented functions (comments only).
- For the two reconciled functions: confirm the bot `deleteMovieNight` still deletes the night (and
  children cascade), and the backend `startMovieNight` still starts an un-started movie and now
  no-ops a re-start.
- Since local Postgres is usually down, deep runtime checks happen on the deployed site; the change
  is low-risk (comments + two small SQL simplifications/guards).

## Out of scope
- No shared/`packages/db` module, no npm workspaces, no Railway reconfiguration.
- No changes to bot Discord-embed formatting or the intentionally-divergent query behavior.
- No changes to the 175 single-consumer functions.
