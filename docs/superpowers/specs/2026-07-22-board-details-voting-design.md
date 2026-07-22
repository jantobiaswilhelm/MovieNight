# Board Details Modal + Up/Down Voting — Design Spec

**Created:** 2026-07-22
**Status:** Approved design, pending implementation plan

---

## Goal

Two additions to the home suggestion board (`SuggestionBoard`):

1. **Details modal** — click a suggested movie to see its full details (synopsis, genres, runtime,
   rating, trailer), so people can decide how to vote without already knowing the film.
2. **Downvoting** — extend the current upvote-only board so a movie can also be voted *down*.
   Show separate ▲/▼ tallies; sort the board by net score.

Non-goals: no auto-hiding of heavily-downvoted suggestions; the details modal is read-only (no
voting/announcing from inside it); no changes to the post-watch 1–10 rating system.

---

## 1. Vote data model

Votes currently live in `board_upvotes (id, suggestion_id, user_id, created_at, UNIQUE(suggestion_id, user_id))`
— upvote-only. Extend to signed votes:

- **Migration** (`backend/src/config/migrate.js`, column-existence check pattern):
  `ALTER TABLE board_upvotes ADD COLUMN vote SMALLINT NOT NULL DEFAULT 1` plus a check that it's `1` or `-1`.
  Existing rows default to `1` (upvotes), so nothing breaks. The `UNIQUE(suggestion_id, user_id)` constraint
  stays, so each user holds **exactly one** vote per suggestion — up (`1`) *or* down (`-1`), never both.
  (The table keeps its `board_upvotes` name to avoid a churny rename; a comment notes it now stores signed votes.)

- **`getBoardSuggestions`** (`backend/src/models/board.js`) — replace the current `upvote_count` / `user_upvoted`
  aggregates with:
  - `upvote_count`   = `COUNT(*) FILTER (WHERE bu.vote = 1)`
  - `downvote_count` = `COUNT(*) FILTER (WHERE bu.vote = -1)`
  - `score`          = `COALESCE(SUM(bu.vote), 0)`  (net)
  - `user_vote`      = `COALESCE(MAX(bu.vote) FILTER (WHERE bu.user_id = $2), 0)`  (caller's 1 / -1 / 0)
  Order by `score DESC, bs.created_at DESC`.

- **`getUpvotersForBoard`** — add `AND bu.vote = 1` so the fan avatar stack shows upvoters only.

## 2. Vote API

Replace the two `/upvote` endpoints in `backend/src/routes/board.js` with:

- `POST /api/board/suggestions/:id/vote` — body `{ vote: 1 | -1 }`. Validates `vote` is exactly `1` or `-1`
  (400 otherwise), checks the suggestion exists and belongs to `req.guildId` (404 otherwise, same as today),
  then upserts. Auth required.
- `DELETE /api/board/suggestions/:id/vote` — clears the caller's vote (whichever direction). Auth required.

Model functions (`backend/src/models/board.js`):
- `setVote(suggestionId, userId, vote)` — `INSERT INTO board_upvotes (suggestion_id, user_id, vote) VALUES ($1,$2,$3)
  ON CONFLICT (suggestion_id, user_id) DO UPDATE SET vote = EXCLUDED.vote RETURNING *`.
- `clearVote(suggestionId, userId)` — rename the existing `removeUpvote` to `clearVote` (its query is already
  `DELETE FROM board_upvotes WHERE suggestion_id = $1 AND user_id = $2 RETURNING *`).
- Remove the old `addUpvote` (INSERT … DO NOTHING) — it's superseded by `setVote`.

## 3. API client

`frontend/src/api/client.js` — replace `upvoteSuggestion` / `removeUpvote` with:
- `setSuggestionVote(id, vote)` → `POST /api/board/suggestions/:id/vote` with `{ vote }` + `guild_id`.
- `clearSuggestionVote(id)` → `DELETE /api/board/suggestions/:id/vote` (+ `guild_id`).

## 4. Board card UI

`frontend/src/components/home/SuggestionBoard.jsx`:

- Replace the single heart button with **two vote buttons**: `▲` (upvote, shows `upvote_count`) and
  `▼` (downvote, shows `downvote_count`). Use existing `Icon` glyphs `chevron-up` / `chevron-down`
  (both are in the registry). The button matching `s.user_vote` gets an active/highlighted class.
- **Toggle logic** — `handleVote(s, dir)` where `dir` is `1` or `-1`: if `s.user_vote === dir` → `clearSuggestionVote(s.id)`;
  else → `setSuggestionVote(s.id, dir)`. Then `refresh()`. Guard on `isAuthenticated`, `busyId`, and `scheduled`
  exactly like the current heart. On error, show a toast (the current handler swallows errors — keep parity,
  optionally add a toast).
- Keep the "by <suggester>" line and the fan (upvoter) avatar stack.
- Ordering comes from the server (`score DESC`); no client-side sort needed.

## 5. Details modal (info only)

- New state `detailsFor` (a suggestion object). Clicking the poster or the title (`sb-item-title`) sets it.
  Add `role="button"` / keyboard affordance to those elements for accessibility.
- Modal reuses the existing `.sb-modal-overlay` / `.sb-modal` structure (a `sb-modal--wide` variant for
  the roomier details layout). It renders, from fields already on the suggestion object:
  - Backdrop header (`backdrop_url`) with the poster (`image_url`) overlaid, title + `release_year`.
  - Meta line: `runtime` (formatted via `formatRuntime`), `genres`, and `tmdb_rating` (e.g. "TMDB 7.8").
  - `tagline` (italic, if present), then `description` (synopsis).
  - Links: **Trailer** (`trailer_url`, if present) and **IMDb** (`imdb_id` → `https://www.imdb.com/title/<id>`),
    using `sanitizeUrl` / `sanitizeImdbId` as elsewhere in the app.
  - "Suggested by <name>" with avatar.
  - Close via the overlay click, the ✕ button, and Escape (match the other board modals).
- No data fetch — every field is already returned by `getBoard()` (which selects `bs.*`). Works for both
  open and scheduled suggestions.

## Error handling
- Vote endpoints validate `vote ∈ {1,-1}` and guild ownership; failures return JSON errors and the client
  shows a toast, then re-fetches (no optimistic drift). The details modal is pure display and cannot fail.

## Testing
Manual verification on the deployed Railway site (local Postgres usually off):
- Vote up, then down, then switch, then clear — counts and the net-score ordering update correctly, and a
  user never holds both an up and a down.
- The details modal opens from poster and title, shows correct synopsis/genres/runtime/rating/links, and
  closes via overlay / ✕ / Escape.
- Scheduled suggestions can be opened for details but are not votable; logged-out users can view details but
  see disabled vote buttons.

## Files touched (anticipated)
- `backend/src/config/migrate.js` — add `vote` column to `board_upvotes`.
- `backend/src/models/board.js` — `setVote`/`clearVote`; extend `getBoardSuggestions` + `getUpvotersForBoard`.
- `backend/src/routes/board.js` — replace `/upvote` endpoints with `/vote` (POST/DELETE).
- `frontend/src/api/client.js` — `setSuggestionVote` / `clearSuggestionVote`.
- `frontend/src/components/home/SuggestionBoard.jsx` — up/down buttons + details modal.
- `frontend/src/pages/Home.css` — the `sb-*` board styles live here; add vote-button + details-modal styles.
