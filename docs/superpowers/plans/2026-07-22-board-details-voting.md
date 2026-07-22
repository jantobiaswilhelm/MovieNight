# Board Details Modal + Up/Down Voting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users click a board suggestion to see its full details in a read-only modal, and downvote as well as upvote (separate ▲/▼ tallies, board sorted by net score).

**Architecture:** Extend `board_upvotes` with a signed `vote` column (+1/-1, default +1 so existing upvotes survive). The board model/route/client swap upvote-only for a set/clear-vote API. The `SuggestionBoard` card shows ▲/▼ buttons; a new read-only details modal renders fields already returned by `getBoard()` (which selects `bs.*`), so it needs no new backend.

**Tech Stack:** Express + `pg` (raw parameterized SQL, domain-split models), React + Vite (plain CSS, `sb-*` board styles live in `Home.css`). No test framework — verify via `node --check`/import checks + `vite build` + a manual pass on the deployed Railway site.

**Reference spec:** `docs/superpowers/specs/2026-07-22-board-details-voting-design.md`

---

## File Structure
- `backend/src/config/migrate.js` — add `vote` column to `board_upvotes`.
- `backend/src/models/board.js` — `setVote`/`clearVote`; extend `getBoardSuggestions` + `getUpvotersForBoard`.
- `backend/src/routes/board.js` — replace `/upvote` endpoints with `/vote` (POST + DELETE).
- `frontend/src/api/client.js` — `setSuggestionVote` / `clearSuggestionVote`.
- `frontend/src/components/home/SuggestionBoard.jsx` — ▲/▼ buttons + details modal.
- `frontend/src/pages/Home.css` — vote-button + details-modal styles.

---

## Task 1: Migration — add the `vote` column

**Files:**
- Modify: `backend/src/config/migrate.js`

- [ ] **Step 1: Add the column via the existing column-existence pattern**

In `backend/src/config/migrate.js`, immediately after the `CREATE TABLE IF NOT EXISTS board_upvotes (...)` block (which ends around line 168, before the `// Wishlists table` comment), add:

```js
    // board_upvotes now stores a signed vote (+1 up / -1 down). Existing rows
    // default to +1 (they were upvotes). The table keeps its name.
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'board_upvotes' AND column_name = 'vote') THEN
          ALTER TABLE board_upvotes ADD COLUMN vote SMALLINT NOT NULL DEFAULT 1;
          ALTER TABLE board_upvotes ADD CONSTRAINT board_upvotes_vote_check CHECK (vote IN (1, -1));
        END IF;
      END $$;
    `);
```

- [ ] **Step 2: Verify the file parses**

Run:
```bash
node --check backend/src/config/migrate.js
```
Expected: no output, exit 0. (Runs against the live DB on `npm start` / `npm run db:migrate`.)

- [ ] **Step 3: Commit**
```bash
git add backend/src/config/migrate.js
git commit -m "db(board): add signed vote column to board_upvotes"
```

---

## Task 2: Model — set/clear vote + aggregates

**Files:**
- Modify: `backend/src/models/board.js`

- [ ] **Step 1: Replace `addUpvote`/`removeUpvote` with `setVote`/`clearVote`**

In `backend/src/models/board.js`, delete the existing `addUpvote` and `removeUpvote` exports and add:

```js
export const setVote = async (suggestionId, userId, vote) => {
  const result = await pool.query(
    `INSERT INTO board_upvotes (suggestion_id, user_id, vote)
     VALUES ($1, $2, $3)
     ON CONFLICT (suggestion_id, user_id) DO UPDATE SET vote = EXCLUDED.vote
     RETURNING *`,
    [suggestionId, userId, vote]
  );
  return result.rows[0];
};

export const clearVote = async (suggestionId, userId) => {
  const result = await pool.query(
    `DELETE FROM board_upvotes WHERE suggestion_id = $1 AND user_id = $2 RETURNING *`,
    [suggestionId, userId]
  );
  return result.rows[0];
};
```

- [ ] **Step 2: Extend `getBoardSuggestions` aggregates + ordering**

Replace the `getBoardSuggestions` function body's SQL with this (adds up/down counts, net score, and the caller's own vote; orders by net score):

```js
export const getBoardSuggestions = async (guildId, userId = null) => {
  const result = await pool.query(
    `SELECT bs.*,
            u.username  AS suggested_by_name,
            u.discord_id AS suggested_by_discord_id,
            u.avatar    AS suggested_by_avatar,
            (COUNT(*) FILTER (WHERE bu.vote = 1))::integer  AS upvote_count,
            (COUNT(*) FILTER (WHERE bu.vote = -1))::integer AS downvote_count,
            COALESCE(SUM(bu.vote), 0)::integer AS score,
            COALESCE(MAX(bu.vote) FILTER (WHERE bu.user_id = $2), 0)::integer AS user_vote
     FROM board_suggestions bs
     LEFT JOIN users u ON bs.suggested_by = u.id
     LEFT JOIN board_upvotes bu ON bs.id = bu.suggestion_id
     WHERE bs.guild_id = $1
       AND (bs.status = 'open' OR (bs.status = 'scheduled' AND bs.scheduled_at >= NOW()))
     GROUP BY bs.id, u.username, u.discord_id, u.avatar
     ORDER BY score DESC, bs.created_at DESC`,
    [guildId, userId]
  );
  return result.rows;
};
```

- [ ] **Step 3: Restrict the fan avatar list to upvoters**

In `getUpvotersForBoard`, add `AND bu.vote = 1` to the WHERE clause so the avatar stack shows upvoters only:

```js
export const getUpvotersForBoard = async (guildId) => {
  const result = await pool.query(
    `SELECT bu.suggestion_id, u.discord_id, u.username, u.avatar
     FROM board_upvotes bu
     JOIN users u ON bu.user_id = u.id
     JOIN board_suggestions bs ON bu.suggestion_id = bs.id
     WHERE bs.guild_id = $1 AND bu.vote = 1
     ORDER BY bu.created_at ASC`,
    [guildId]
  );
  return result.rows;
};
```

- [ ] **Step 4: Verify the module imports cleanly**
```bash
cd backend && node -e "import('./src/models/index.js').then(m => console.log('setVote:', typeof m.setVote, 'clearVote:', typeof m.clearVote, 'addUpvote:', typeof m.addUpvote)).catch(e => { console.error(e); process.exit(1); })"
```
Expected: `setVote: function clearVote: function addUpvote: undefined`.

- [ ] **Step 5: Commit**
```bash
git add backend/src/models/board.js
git commit -m "feat(board): setVote/clearVote model + up/down aggregates"
```

---

## Task 3: Routes — replace `/upvote` with `/vote`

**Files:**
- Modify: `backend/src/routes/board.js`

- [ ] **Step 1: Replace the two `/upvote` endpoints with `/vote` endpoints**

In `backend/src/routes/board.js`, delete the existing `POST /suggestions/:id/upvote` and `DELETE /suggestions/:id/upvote` routes and put these in their place:

```js
// POST /api/board/suggestions/:id/vote — set caller's vote (+1 up / -1 down).
router.post('/suggestions/:id/vote', validateGuildId, validateIntParams('id'), authenticateToken, async (req, res) => {
  const { vote } = req.body;
  if (vote !== 1 && vote !== -1) {
    return res.status(400).json({ error: 'vote must be 1 or -1' });
  }
  try {
    const suggestion = await db.getBoardSuggestionById(parseInt(req.params.id));
    if (!suggestion || suggestion.guild_id !== req.guildId) {
      return res.status(404).json({ error: 'Suggestion not found' });
    }
    await db.setVote(parseInt(req.params.id), req.user.id, vote);
    res.json({ success: true });
  } catch (err) {
    console.error('Error setting vote:', err);
    res.status(500).json({ error: 'Failed to vote' });
  }
});

// DELETE /api/board/suggestions/:id/vote — clear caller's vote.
router.delete('/suggestions/:id/vote', validateGuildId, validateIntParams('id'), authenticateToken, async (req, res) => {
  try {
    const suggestion = await db.getBoardSuggestionById(parseInt(req.params.id));
    if (!suggestion || suggestion.guild_id !== req.guildId) {
      return res.status(404).json({ error: 'Suggestion not found' });
    }
    await db.clearVote(parseInt(req.params.id), req.user.id);
    res.json({ success: true });
  } catch (err) {
    console.error('Error clearing vote:', err);
    res.status(500).json({ error: 'Failed to clear vote' });
  }
});
```

- [ ] **Step 2: Verify the module imports cleanly**
```bash
cd backend && node -e "import('./src/routes/board.js').then(() => console.log('board route ok')).catch(e => { console.error(e); process.exit(1); })"
```
Expected: `board route ok`.

- [ ] **Step 3: Commit**
```bash
git add backend/src/routes/board.js
git commit -m "feat(board): replace upvote endpoints with set/clear vote"
```

---

## Task 4: API client — set/clear vote

**Files:**
- Modify: `frontend/src/api/client.js` (the `upvoteSuggestion`/`removeUpvote` exports, ~lines 145-153)

- [ ] **Step 1: Replace the two exports**

Delete `upvoteSuggestion` and `removeUpvote` and add:

```js
export const setSuggestionVote = (suggestionId, vote) =>
  fetchAPI(`/api/board/suggestions/${suggestionId}/vote?guild_id=${GUILD_ID}`, {
    method: 'POST',
    body: JSON.stringify({ vote })
  });

export const clearSuggestionVote = (suggestionId) =>
  fetchAPI(`/api/board/suggestions/${suggestionId}/vote?guild_id=${GUILD_ID}`, {
    method: 'DELETE'
  });
```

(`fetchAPI` already sets the JSON content-type when a `body` is present — the existing `addSuggestion`/`announceSuggestion` use the same shape.)

- [ ] **Step 2: Verify the build (catches import errors)**
```bash
cd frontend && npx vite build
```
Expected: build fails IF anything still imports `upvoteSuggestion`/`removeUpvote` — that's expected until Task 5 updates `SuggestionBoard.jsx`. So instead just confirm the file parses:
```bash
node --check frontend/src/api/client.js
```
Expected: exit 0. (The full build is verified in Task 5 after the component is updated.)

- [ ] **Step 3: Commit**
```bash
git add frontend/src/api/client.js
git commit -m "feat(board): setSuggestionVote/clearSuggestionVote client methods"
```

---

## Task 5: Board card — ▲/▼ vote buttons

**Files:**
- Modify: `frontend/src/components/home/SuggestionBoard.jsx`
- Modify: `frontend/src/pages/Home.css`

- [ ] **Step 1: Update imports and the vote handler**

In `SuggestionBoard.jsx`, change the client import line (currently importing `upvoteSuggestion, removeUpvote`):

```js
import {
  getBoard, addSuggestion, setSuggestionVote, clearSuggestionVote,
  announceSuggestion, deleteSuggestion, searchTMDB, getTMDBMovie
} from '../../api/client';
```

Replace the `handleToggleUpvote` function with:

```js
  const handleVote = async (s, dir) => {
    if (!isAuthenticated || busyId) return;
    setBusyId(s.id);
    try {
      if (s.user_vote === dir) await clearSuggestionVote(s.id);
      else await setSuggestionVote(s.id, dir);
      await refresh();
    } catch (err) {
      showError('Failed to vote');
    } finally {
      setBusyId(null);
    }
  };
```

- [ ] **Step 2: Replace the heart button with ▲/▼ buttons**

In the card's `<div className="sb-actions">`, replace the single `<button className="sb-heart">…</button>` with:

```jsx
                  <div className="sb-vote">
                    <button
                      className={`sb-vote-btn up ${s.user_vote === 1 ? 'on' : ''}`}
                      onClick={() => handleVote(s, 1)}
                      disabled={!isAuthenticated || busyId !== null || scheduled}
                      title={isAuthenticated ? 'Upvote' : 'Log in to vote'}
                    >
                      <Icon name="chevron-up" size={14} />
                      <span>{parseInt(s.upvote_count) || 0}</span>
                    </button>
                    <button
                      className={`sb-vote-btn down ${s.user_vote === -1 ? 'on' : ''}`}
                      onClick={() => handleVote(s, -1)}
                      disabled={!isAuthenticated || busyId !== null || scheduled}
                      title={isAuthenticated ? 'Downvote' : 'Log in to vote'}
                    >
                      <Icon name="chevron-down" size={14} />
                      <span>{parseInt(s.downvote_count) || 0}</span>
                    </button>
                  </div>
```

Leave the existing `const count = parseInt(s.upvote_count) || 0;` line as-is (still used by the upvoter "+N" avatar overflow). Also update the two "Log in to upvote" copy strings (the empty-state `<small>` and the bottom login button) to "Log in to vote".

- [ ] **Step 3: Add vote-button styles**

Append to `frontend/src/pages/Home.css`:

```css
/* ── Board up/down vote buttons ─────────────────────────────────────────── */
.sb-vote{ display: flex; flex-direction: column; gap: 3px; }
.sb-vote-btn{
  display: inline-flex; align-items: center; gap: 4px;
  min-width: 46px;
  background: transparent;
  border: 1px solid var(--rule);
  border-radius: var(--r-1);
  color: var(--bone-dim);
  padding: 3px 7px;
  font-family: var(--font-mono);
  font-size: var(--fs-11);
  cursor: pointer;
  transition: border-color var(--dur-1) var(--ease-out), color var(--dur-1) var(--ease-out);
}
.sb-vote-btn:hover:not(:disabled){ border-color: var(--rule-strong); color: var(--bone); }
.sb-vote-btn:disabled{ opacity: .5; cursor: default; }
.sb-vote-btn.up.on{ border-color: var(--ember); color: var(--ember); }
.sb-vote-btn.down.on{ border-color: var(--bone-dim); color: var(--bone); }
```

- [ ] **Step 4: Verify the build**
```bash
cd frontend && npx vite build
```
Expected: build succeeds (no remaining references to the removed client methods).

- [ ] **Step 5: Commit**
```bash
git add frontend/src/components/home/SuggestionBoard.jsx frontend/src/pages/Home.css
git commit -m "feat(board): up/down vote buttons on suggestions"
```

---

## Task 6: Details modal (read-only)

**Files:**
- Modify: `frontend/src/components/home/SuggestionBoard.jsx`
- Modify: `frontend/src/pages/Home.css`

- [ ] **Step 1: Add imports and state**

In `SuggestionBoard.jsx`, extend the helpers import and add the sanitizer import (below the existing `getAvatarUrl` import at line 5):

```js
import { getAvatarUrl, formatRuntime } from '../../utils/helpers';
import { sanitizeUrl, sanitizeImdbId, sanitizeImageUrl } from '../../utils/sanitizeUrl';
```

Add state near the other `useState` calls:

```js
  const [detailsFor, setDetailsFor] = useState(null);
```

- [ ] **Step 2: Make the poster and title open the details modal**

In the card, change the poster `<img>` and the no-poster `<div>` to open details on click, and turn the title into a button. Replace the poster block:

```jsx
                {s.image_url ? (
                  <img
                    src={s.image_url}
                    alt=""
                    className="sb-poster sb-poster-open"
                    loading="lazy"
                    onClick={() => setDetailsFor(s)}
                  />
                ) : (
                  <div className="sb-poster no-poster sb-poster-open" onClick={() => setDetailsFor(s)}>
                    <Icon name="film" size={16} />
                  </div>
                )}
```

And change the title from a span to a button:

```jsx
                  <button type="button" className="sb-item-title" onClick={() => setDetailsFor(s)}>{s.title}</button>
```

- [ ] **Step 3: Add the details modal markup**

Add this modal block just before the closing `</div>` of the component's root (after the Announce modal block, before `);`):

```jsx
      {/* Details modal (read-only) */}
      {detailsFor && (
        <div className="sb-modal-overlay" onClick={() => setDetailsFor(null)}>
          <div className="sb-modal sb-modal--wide" onClick={(e) => e.stopPropagation()}>
            <div className="sb-modal-head">
              <h2>{detailsFor.title}{detailsFor.release_year ? ` (${detailsFor.release_year})` : ''}</h2>
              <button className="sb-modal-close" aria-label="Close" onClick={() => setDetailsFor(null)}>
                <Icon name="close" size={16} />
              </button>
            </div>
            {(sanitizeImageUrl(detailsFor.backdrop_url) || sanitizeImageUrl(detailsFor.image_url)) && (
              <div
                className="sb-details-backdrop"
                style={{ backgroundImage: `url(${sanitizeImageUrl(detailsFor.backdrop_url) || sanitizeImageUrl(detailsFor.image_url)})` }}
                aria-hidden="true"
              />
            )}
            <div className="sb-details-meta">
              {detailsFor.runtime > 0 && <span>{formatRuntime(detailsFor.runtime)}</span>}
              {detailsFor.genres && <span>{detailsFor.genres}</span>}
              {detailsFor.tmdb_rating > 0 && <span>TMDB {parseFloat(detailsFor.tmdb_rating).toFixed(1)}</span>}
            </div>
            {detailsFor.tagline && <p className="sb-details-tagline">{detailsFor.tagline}</p>}
            {detailsFor.description && <p className="sb-details-desc">{detailsFor.description}</p>}
            <div className="sb-details-links">
              {detailsFor.trailer_url && (
                <a href={sanitizeUrl(detailsFor.trailer_url)} target="_blank" rel="noopener noreferrer" className="btn sm">
                  <Icon name="play" size={14} /> <span>Trailer</span>
                </a>
              )}
              {sanitizeImdbId(detailsFor.imdb_id) && (
                <a href={`https://www.imdb.com/title/${sanitizeImdbId(detailsFor.imdb_id)}`} target="_blank" rel="noopener noreferrer" className="btn text">
                  IMDb →
                </a>
              )}
            </div>
            {detailsFor.suggested_by_name && (
              <div className="sb-details-by">
                <img
                  src={getAvatarUrl(detailsFor.suggested_by_discord_id, detailsFor.suggested_by_avatar)}
                  alt=""
                  className="sb-by-avatar"
                  loading="lazy"
                />
                Suggested by {detailsFor.suggested_by_name}
              </div>
            )}
          </div>
        </div>
      )}
```

- [ ] **Step 4: Add details-modal styles**

Append to `frontend/src/pages/Home.css`:

```css
/* ── Board details modal ────────────────────────────────────────────────── */
.sb-poster-open{ cursor: pointer; }
.sb-item-title{ background: none; border: none; padding: 0; text-align: left; cursor: pointer; }
.sb-item-title:hover{ color: var(--ember); }

.sb-modal--wide{ max-width: 560px; }
.sb-details-backdrop{
  width: 100%;
  height: 150px;
  background-size: cover;
  background-position: center;
  border-radius: var(--r-2);
  margin-bottom: var(--s-4);
}
.sb-details-meta{
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-3);
  font-family: var(--font-mono);
  font-size: var(--fs-11);
  letter-spacing: .1em;
  text-transform: uppercase;
  color: var(--bone-dim);
  margin-bottom: var(--s-3);
}
.sb-details-tagline{
  font-family: var(--font-display);
  font-style: italic;
  color: var(--bone-dim);
  margin: 0 0 var(--s-3);
}
.sb-details-desc{
  color: var(--bone-dim);
  font-size: var(--fs-14);
  line-height: 1.6;
  margin: 0 0 var(--s-4);
}
.sb-details-links{
  display: flex;
  align-items: center;
  gap: var(--s-3);
  margin-bottom: var(--s-4);
}
.sb-details-by{
  display: flex;
  align-items: center;
  gap: var(--s-2);
  font-size: var(--fs-13);
  color: var(--bone-mute);
  border-top: 1px solid var(--rule);
  padding-top: var(--s-3);
}
```

Note: `.sb-item-title` keeps its existing font styling (that rule is elsewhere in `Home.css`); this only strips the button chrome and adds a hover accent. Text colors use `--bone*` (light) — never `--ink*` — because the theme is dark.

- [ ] **Step 5: Verify the build**
```bash
cd frontend && npx vite build
```
Expected: build succeeds.

- [ ] **Step 6: Commit**
```bash
git add frontend/src/components/home/SuggestionBoard.jsx frontend/src/pages/Home.css
git commit -m "feat(board): read-only details modal on suggestion click"
```

---

## Final verification (after all tasks)
- [ ] Deploy to Railway (migration runs on start). On the board: upvote a suggestion, then downvote it (vote switches, never both), then click the same arrow to clear — the ▲/▼ counts and the net-score ordering update correctly.
- [ ] Click a suggestion's poster or title → the details modal shows the correct backdrop, synopsis, genres, runtime, TMDB rating, and Trailer/IMDb links, and closes via overlay click and the ✕.
- [ ] Scheduled suggestions open for details but their vote buttons are disabled; logged-out users can view details but not vote.
- [ ] Existing upvotes (pre-migration) still show as upvotes with the correct count.
