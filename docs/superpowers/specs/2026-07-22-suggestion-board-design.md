# Suggestion Board — Design Spec

**Date:** 2026-07-22
**Status:** Approved for planning
**Replaces:** The session-based voting feature (`VotingSection` + `voting_sessions` / `movie_suggestions` / `votes` + bot voting command/handlers)

## Problem

The current voting feature is session-based: an admin starts a vote with a fixed date, users
suggest movies, everyone casts exactly **one** vote, a winner is picked, and the session ends.
It is heavily underused and does not work properly on the website. The interaction model is
too heavyweight for how the group actually decides what to watch.

## Goal

Replace voting with an always-on **Suggestion Board** on the Home page:

- Any signed-in user suggests a movie (via TMDB search).
- Everyone upvotes as many suggestions as they like — one heart per person per movie.
- Any signed-in user can promote a suggestion to a real movie night by picking a date/time.
- Announced suggestions show a "Scheduled" badge and drop off the board once the event passes.

## Decisions (locked)

| Decision | Choice |
|----------|--------|
| Relationship to voting | **Replace voting entirely.** Drop the old tables, routes, UI, and bot handlers. |
| Upvote model | **Upvote many, one each** — a like/heart toggle, unique per (suggestion, user). |
| Who announces + date | **Any authenticated user** announces and picks the date/time. |
| Post-announce lifecycle | Card is **marked `Scheduled for <date>`**, then **auto-clears** from the active board after the movie night's date passes. |
| Discord scope | **Web-first, Discord announce only.** Announcing reuses the existing `pending_announcements` → `announcementProcessor` pipeline. No new slash commands or Discord-side upvoting. |
| Dedupe guardrail | **Yes.** The same movie (by `tmdb_id`) cannot be an open suggestion twice in the same guild. |

## Architecture

Follows existing patterns: guild-scoped queries, raw parameterized SQL in `models/`, modular
Express routers with `authenticateToken` / `optionalAuth`, React section on the Home page,
and the existing announcement queue for Discord.

### Data model

Two new tables. The old `voting_sessions`, `movie_suggestions`, and `votes` tables are dropped.

**`board_suggestions`** — one row per suggested movie, guild-scoped, no session concept.

```sql
CREATE TABLE board_suggestions (
  id SERIAL PRIMARY KEY,
  guild_id VARCHAR(20) NOT NULL,
  suggested_by INTEGER REFERENCES users(id),
  status VARCHAR(20) DEFAULT 'open',          -- 'open' | 'scheduled'
  scheduled_at TIMESTAMP,                      -- set when announced
  scheduled_movie_night_id INTEGER,            -- FK to movie_nights once processed (nullable)
  -- TMDB metadata (mirrors movie_suggestions):
  title VARCHAR(255) NOT NULL,
  image_url VARCHAR(500),
  backdrop_url VARCHAR(500),
  description TEXT,
  tmdb_id INTEGER,
  tmdb_rating DECIMAL(3,1),
  genres VARCHAR(255),
  runtime INTEGER,
  release_year INTEGER,
  tagline VARCHAR(500),
  imdb_id VARCHAR(20),
  original_language VARCHAR(10),
  collection_name VARCHAR(255),
  trailer_url VARCHAR(500),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_board_suggestions_guild ON board_suggestions(guild_id);
```

**`board_upvotes`** — one heart per user per suggestion. The unique constraint *is* the
"upvote many, one each" rule.

```sql
CREATE TABLE board_upvotes (
  id SERIAL PRIMARY KEY,
  suggestion_id INTEGER REFERENCES board_suggestions(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(suggestion_id, user_id)
);
CREATE INDEX idx_board_upvotes_suggestion ON board_upvotes(suggestion_id);
```

**Migration notes** (`backend/src/config/migrate.js`):
- Add the two `CREATE TABLE IF NOT EXISTS` blocks following the existing idempotent pattern.
- Drop the retired tables: `DROP TABLE IF EXISTS votes, movie_suggestions, voting_sessions CASCADE;`
  Voting is underused; no data migration is required.

### Backend

**New model file** `backend/src/models/board.js` (mirrors the structure of the current
`models/voting.js`), exporting:

- `createSuggestion(guildId, suggestedBy, tmdbData)`
- `getBoardSuggestions(guildId, userId)` — returns open suggestions **plus** scheduled ones whose
  `scheduled_at` is still in the future; each row includes aggregated `upvote_count` and, when
  `userId` is provided, a `user_upvoted` boolean. Sorted by `upvote_count DESC, created_at DESC`.
  Auto-clear is expressed directly in this query: `WHERE guild_id = $1 AND (status = 'open' OR
  (status = 'scheduled' AND scheduled_at >= NOW()))`. No cron needed.
- `getSuggestionById(id)`
- `findOpenSuggestionByTmdb(guildId, tmdbId)` — for the dedupe guardrail.
- `addUpvote(suggestionId, userId)` — `ON CONFLICT DO NOTHING`.
- `removeUpvote(suggestionId, userId)`
- `markScheduled(suggestionId, scheduledAt, movieNightId?)`
- `deleteSuggestion(suggestionId)`
- `getUpvotersForSuggestion(suggestionId)` — for avatar display (parity with current voter avatars).

**New route file** `backend/src/routes/board.js`, mounted at `/api/board` (replacing the
`/api/voting` mount in the app entrypoint):

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/board` | optionalAuth | Board suggestions + caller's upvote state (guild_id query param). |
| POST | `/api/board/suggestions` | auth | Add a suggestion. Rejects with 409 if `findOpenSuggestionByTmdb` matches (dedupe). Stores full TMDB metadata. |
| POST | `/api/board/suggestions/:id/upvote` | auth | Add caller's heart. |
| DELETE | `/api/board/suggestions/:id/upvote` | auth | Remove caller's heart. |
| POST | `/api/board/suggestions/:id/announce` | auth | Any user. Body: `{ scheduledAt }`. Rejects with 409 if already `scheduled`. Calls existing `createPendingAnnouncement()` with the suggestion's TMDB data + `scheduledAt`, then `markScheduled()`. Fires the `NOTIFY movie_announcement` signal as the current voting close does. |
| DELETE | `/api/board/suggestions/:id` | auth | Suggester removes own; admin removes any (`403` otherwise). |

Uses `validateIntParams()` on `:id` routes, matching existing conventions.

**Announcement reuse:** The announce endpoint constructs the same payload shape
`createPendingAnnouncement()` already accepts (title + TMDB columns + `scheduled_at` + `guild_id`
+ `user_id`). `channel_id` is left null — the board has no Discord channel context, and the
existing `announcementProcessor` already falls back to the default/first writable channel when
`channel_id` is absent. The bot's `announcementProcessor` then posts the Discord embed and
inserts the `movie_nights` row unchanged. Optionally, `announcementProcessor` sets
`board_suggestions.scheduled_movie_night_id` when it creates the movie night; if that coupling is
undesirable, the link can be left null and the card still auto-clears by date.

### Frontend

- **Remove** `frontend/src/components/home/VotingSection.jsx` and its usage in `Home.jsx`.
- **Add** `frontend/src/components/home/SuggestionBoard.jsx` in the same Home slot. Renders:
  - A header with an **"+ Suggest a movie"** button opening the existing TMDB search modal
    (reuse `useTMDBSearch` + the current search-and-select UI from the voting flow).
  - A list/grid of **suggestion cards** sorted by upvotes: poster, title, year, upvote heart +
    count, upvoter avatars (limit 5, +N overflow), an **"Announce"** button, and a
    **"Scheduled for <date>"** badge when `status === 'scheduled'` (Announce hidden in that state).
  - A small **date/time picker modal** triggered by "Announce".
  - A **remove (×)** affordance shown to the suggester and to admins.
  - Empty state prompting the first suggestion.
- **API client** (`frontend/src/api/client.js`): replace the `*Voting*` methods with
  `getBoard()`, `submitSuggestion()`, `upvoteSuggestion()`, `removeUpvote()`,
  `announceSuggestion(id, scheduledAt)`, `deleteSuggestion(id)`. Handle the 409 dedupe response
  with a friendly "already suggested" notification.

### Bot

- **Remove** the `startvote` command, the `bot/src/handlers/voting/` handlers, and
  `buildVotingEmbed` usage tied to sessions.
- **No new bot code.** The announcement path (`announcementProcessor`, `createAnnouncementEmbed`,
  `createMovieNight`) is untouched and does the Discord posting.

## Data flow

**Suggest → upvote → announce:**
1. User searches TMDB in the board modal → selects a movie → `POST /api/board/suggestions`
   (dedupe-checked) → card appears at the bottom of the board.
2. Users toggle hearts → `POST/DELETE …/upvote` → cards re-sort by count.
3. Any user clicks **Announce**, picks a date → `POST …/announce` → row goes `scheduled`,
   `createPendingAnnouncement()` queues it, `NOTIFY` fires.
4. Bot `announcementProcessor` posts the Discord embed and creates the `movie_nights` row.
5. Card shows **"Scheduled for <date>"**; after that date passes, the board query stops
   returning it (auto-clear).

## Error handling

- **Dedupe:** `POST /suggestions` returns `409` when an open suggestion with the same `tmdb_id`
  exists in the guild; frontend shows a friendly notice and (optionally) scrolls to the existing card.
- **Double announce:** `POST …/announce` returns `409` if `status = 'scheduled'`.
- **Delete permission:** `DELETE …/:id` returns `403` for non-owner non-admins.
- **Upvote idempotency:** duplicate upvote is a no-op via `ON CONFLICT DO NOTHING`; removing a
  non-existent upvote is a no-op.
- **Auth:** all mutating endpoints require `authenticateToken`; `GET /api/board` uses
  `optionalAuth` so anonymous visitors see the board without upvote state.

## Testing

No test framework is configured in this repo (per CLAUDE.md). Verification is manual on the
deployed site (local Postgres is usually not running):
- Suggest a movie → appears on board; suggesting the same TMDB movie again → 409 notice.
- Upvote/un-upvote → count and heart state update; refresh persists.
- Announce with a future date → card shows Scheduled badge; Discord embed posts; a `movie_nights`
  row is created.
- Announce a past-then-passed date (or fast-forward) → card no longer appears on the board.
- Non-owner tries to delete another user's suggestion → blocked; admin can delete any.

## Out of scope (YAGNI)

- Discord-side suggesting/upvoting or new slash commands.
- Vote budgets / thresholds / "ready to schedule" gating.
- Migrating historical voting data.
- Notifications when a suggestion you upvoted gets scheduled.
