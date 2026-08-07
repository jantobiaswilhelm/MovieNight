# Bot/Backend Model Drift — Reconcile & Guard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate silent drift between the bot and backend data-access layers by reconciling two divergent functions and adding cross-reference guards to the 18 overlapping functions + CLAUDE.md.

**Architecture:** No shared package (Railway builds each service from its own dir). Instead: two small code reconciliations, plus `// SHARED`/`// PARALLEL` cross-reference comments on the 18 overlapping functions in both `bot/src/models/index.js` and `backend/src/models/*.js`, plus a CLAUDE.md table so future edits stay in sync.

**Tech Stack:** Node ESM, raw `pg`. No test framework (verify via `node --check` + call-site review; deep runtime checks happen on deployed Railway).

**Spec:** `docs/superpowers/specs/2026-08-08-bot-backend-model-drift-design.md`

**The 18 overlapping functions** (for reference): `getUserByDiscordId`, `upsertRating`, `getMoviesToStart`, `rescheduleMovieNight` (identical); `getMovieNightById`, `getGuildStats`, `getTopRatedMovies`, `getMostActiveRaters`, `getUserTopRatedMovies` (minor diff); `findOrCreateUser`, `createMovieNight`, `getMovieNights`, `getRecentMovieNightsForRating`, `deleteMovieNight`, `getUserRatings`, `getUserRating`, `getRatingsForMovie`, `startMovieNight` (divergent).

---

### Task 1: Reconcile the two divergent functions (with call-site verification)

**Files:**
- Modify: `bot/src/models/index.js` (`deleteMovieNight`)
- Modify: `backend/src/models/movies.js` (`startMovieNight`)

- [ ] **Step 1: Verify FK cascade before touching bot `deleteMovieNight`**

Read `backend/src/config/migrate.js` and confirm these FKs to `movie_nights(id)` are `ON DELETE CASCADE`: `ratings`, `movie_attendance`, `movie_credits`, `movie_night_voice_presence`. (This was confirmed in prior work; re-confirm.) If any is NOT cascade, STOP and report — do not simplify the bot delete.

- [ ] **Step 2: Simplify bot `deleteMovieNight` to a single cascade delete**

In `bot/src/models/index.js`, locate `deleteMovieNight`. It currently does a manual `DELETE FROM ratings WHERE movie_night_id = $1` followed by `DELETE FROM movie_nights WHERE id = $1`. Replace the body so it performs only the single cascade delete, matching the backend (`backend/src/models/movies.js` `deleteMovieNight`):

```javascript
export const deleteMovieNight = async (id) => {
  // Child rows (ratings, movie_attendance, movie_credits, movie_night_voice_presence)
  // are removed by ON DELETE CASCADE. SET NULL refs (voting_sessions, user_favorite_movies,
  // marathon_items) are preserved. Single statement = atomic.
  const result = await pool.query(
    'DELETE FROM movie_nights WHERE id = $1 RETURNING *',
    [id]
  );
  return result.rows[0];
};
```
Preserve whatever the original returned if a caller depends on it (grep for `deleteMovieNight(` in `bot/`). If the original returned nothing and a caller ignores the return, the `RETURNING *` is harmless.

- [ ] **Step 3: Verify `startMovieNight` call-sites, then add the idempotency guard (backend)**

Grep for `startMovieNight(` across `backend/`. Read `backend/src/models/movies.js` `startMovieNight`. If NO backend caller depends on unconditionally re-starting an already-started movie (the normal case — it's used to mark a movie started), add the bot's guard to the UPDATE's WHERE clause so a re-start no-ops:

Change the WHERE clause of the `UPDATE movie_nights SET started_at = ... WHERE id = $1` to also require `AND started_at IS NULL`, i.e. `WHERE id = $1 AND started_at IS NULL`, and keep the `RETURNING *`. This makes it return the row on first start and `undefined` on a re-start (matching bot `startMovieNight`).

If a backend caller DOES rely on unconditional restart, DO NOT change it — instead leave it and note the intentional difference (it will still get a cross-reference comment in Task 2).

- [ ] **Step 4: Verify syntax**

Run: `node --check bot/src/models/index.js` and `node --check backend/src/models/movies.js`
Expected: both exit 0.

- [ ] **Step 5: Commit**

```bash
git add bot/src/models/index.js backend/src/models/movies.js
git commit -m "refactor(models): align bot deleteMovieNight to cascade + backend startMovieNight guard"
```

---

### Task 2: Add cross-reference comments to all 18 overlapping functions

**Files:**
- Modify: `bot/src/models/index.js`
- Modify: `backend/src/models/{users,movies,ratings,stats}.js`

For each function below, add ONE comment line directly above the `export const <fn> = ...`
declaration in BOTH the bot file and the backend file. Use the exact text in the table (adjust the
cited path to point at the *other* file). Do not change any function body in this task.

- [ ] **Step 1: Identical functions — mark "keep identical"**

Above each of these in both files, add:
`// SHARED: keep identical with <other-file> (<fn>)`

| Function | backend file |
|---|---|
| `getUserByDiscordId` | `backend/src/models/users.js` |
| `upsertRating` | `backend/src/models/ratings.js` |
| `getMoviesToStart` | `backend/src/models/movies.js` |
| `rescheduleMovieNight` | `backend/src/models/movies.js` |

Example (in `bot/src/models/index.js`, above `getUserByDiscordId`):
`// SHARED: keep identical with backend/src/models/users.js (getUserByDiscordId)`
and the mirror in `backend/src/models/users.js`:
`// SHARED: keep identical with bot/src/models/index.js (getUserByDiscordId)`

- [ ] **Step 2: Divergent/minor functions — mark the intentional difference**

Above each of these in both files, add `// PARALLEL to <other> (<fn>) — intentionally differs: <reason>` using the reason text below:

| Function | backend file | Reason text |
|---|---|---|
| `getMovieNightById` | `movies.js` | backend selects extra display columns for the web UI |
| `getGuildStats` | `stats.js` | backend adds is_test filter; bot ROUNDs aggregates for Discord embeds |
| `getTopRatedMovies` | `ratings.js` | backend adds image_url + is_test filter; bot ROUNDs for embeds |
| `getMostActiveRaters` | `stats.js` | backend adds id/avatar + is_test filter; bot ROUNDs for embeds |
| `getUserTopRatedMovies` | `ratings.js` | bot keys on discord_id + JOINs users; backend keys on user_id |
| `findOrCreateUser` | `users.js` | backend has a 4th discordAccessToken param for web OAuth |
| `createMovieNight` | `movies.js` | bot signature carries imageUrl/tmdbData/isTest; backend inserts base columns only |
| `getMovieNights` | `movies.js` | web collapses re-screenings by tmdb_id + paginates; bot returns flat rows |
| `getRecentMovieNightsForRating` | `movies.js` | bot targets started movies; web targets scheduled movies |
| `getUserRatings` | `ratings.js` | bot keys on discord_id (single guild); web is guild-scoped + test-filtered |
| `getUserRating` | `ratings.js` | bot keys on discord_id; backend keys on user_id |
| `getRatingsForMovie` | `ratings.js` | backend adds avatar + attended column for the web UI |
| `deleteMovieNight` | `movies.js` | now aligned — both do a single cascade delete (keep identical) |
| `startMovieNight` | `movies.js` | now aligned — both guard `started_at IS NULL` (keep identical) |

Note: for `deleteMovieNight` and `startMovieNight`, after Task 1 they are aligned — use the
`// SHARED: keep identical with ...` form (like Step 1) instead of the PARALLEL form. If Task 1
left `startMovieNight` unchanged (caller required unconditional restart), use the PARALLEL form with
reason "bot guards started_at IS NULL for cron idempotency; backend restarts unconditionally".

- [ ] **Step 3: Verify syntax**

Run: `node --check bot/src/models/index.js` and `node --check backend/src/models/users.js backend/src/models/movies.js backend/src/models/ratings.js backend/src/models/stats.js`
Expected: all exit 0. (Comments can't break parsing, but this confirms nothing else was disturbed.)

- [ ] **Step 4: Confirm all 18 are marked**

Run a grep for the markers and confirm 18 in the bot file and 18 across the backend model files:
`grep -c "SHARED:\|PARALLEL to" bot/src/models/index.js` (expect 18)
and grep the four backend files (expect 18 total).

- [ ] **Step 5: Commit**

```bash
git add bot/src/models/index.js backend/src/models/users.js backend/src/models/movies.js backend/src/models/ratings.js backend/src/models/stats.js
git commit -m "docs(models): cross-reference comments on the 18 bot/backend shared functions"
```

---

### Task 3: Document the shared functions in CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add a "Shared model functions" subsection**

In `CLAUDE.md`, under the "Cross-Service Data Flow" area (the section that explains the bot and
backend share the DB directly), add this subsection:

```markdown
### Shared model functions (bot ↔ backend)

The bot (`bot/src/models/index.js`) and backend (`backend/src/models/*.js`) each have their own
data-access layer. **18 functions exist in both** — when you change one, check its twin (each is
marked with a `// SHARED` or `// PARALLEL` comment citing the other file).

- **Keep identical:** `getUserByDiscordId`, `upsertRating`, `getMoviesToStart`,
  `rescheduleMovieNight`, `deleteMovieNight`, `startMovieNight`.
- **Intentionally different** (do not "fix" the difference): `getMovieNightById`, `getGuildStats`,
  `getTopRatedMovies`, `getMostActiveRaters`, `getUserTopRatedMovies`, `findOrCreateUser`,
  `createMovieNight`, `getMovieNights`, `getRecentMovieNightsForRating`, `getUserRatings`,
  `getUserRating`, `getRatingsForMovie` — the web keys on internal `user_id`, is guild-scoped, and
  filters test data; the bot keys on `discord_id` (single guild) and ROUNDs aggregates for Discord
  embeds. The `// PARALLEL` comment on each states the specific reason.

The other ~175 model functions are single-consumer (bot-only or backend-only) and are not duplicated.
```

If Task 1 left `startMovieNight` unaligned, move it from the "Keep identical" list to the
"Intentionally different" list.

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: document the 18 shared bot/backend model functions in CLAUDE.md"
```

---

## Self-check for the executor
- Task 1 is the only behavior change; everything else is comments/docs.
- If either reconciliation in Task 1 turns out unsafe (missing cascade, or a caller needing the old
  behavior), skip that reconciliation and document the function as an intentional difference instead
  — the guard comments (Task 2) and CLAUDE.md (Task 3) still apply.
- No shared package, no deploy-structure change, no edits to the 175 single-consumer functions.
