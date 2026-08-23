# Bot command refresh + web-only commands + hub — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring `/history`, `/stats`, `/myratings` and `/top10` up to the visual standard `/next` and the screening cards already set; add `/board`, `/wishlist` and `/marathon` so the web-only features are reachable from chat; and put a `/movienight` hub over all of it, replacing `/help`.

**Design source:** `docs/superpowers/mockups/bot-commands/01-command-refresh.html` — **the mockup wins** wherever this plan and it disagree.

**Architecture:** Every command becomes a **renderer** — a pure-ish async function `(ctx) => { embeds, components }` taking a plain context object (guild id, user id, page, sort, target user). The command's `execute` calls its renderer and replies; a single button/select router calls the same renderer and `interaction.update()`s in place. That contract is what makes the hub nearly free: it is a select menu that picks which renderer to call.

All interaction state rides in the `customId` under one namespace — `mn:<view>:<arg>:<arg>` — so nothing lives in memory, and buttons keep working after a restart. `/next`'s existing `next_view:` ids migrate into it (safe: `/next` has never been deployed to Discord, so no live message carries the old ids).

**Tech Stack:** discord.js v14, ESM, raw parameterized SQL via `pg`. No ORM.

---

## Before you start

**The bot has tests; the rest of the repo does not.** `bot/package.json` runs `node --test "src/**/*.test.js"` and there are 101 passing tests over the embed builders (`announcementEmbed.test.js`, `screeningCard.test.js`, `nextEmbeds.test.js`). Every embed builder in this plan is a pure function and **must** land with tests. That is the main verification loop here — run `cd bot && npm test` after each task.

For everything else:

- `node --check <file>` for syntax
- `cd frontend && npm run build` for anything the frontend imports
- reading each query back against the schema in `backend/src/config/migrate.js`

**Local Postgres is normally not running on this machine.** No task here should assume a live database; behavioural verification happens on Railway at the end (Task 13).

**Commit after every task.** Branch:

```bash
git checkout -b feat/bot-command-refresh
```

**Deploy is manual and outward-facing.** `cd bot && npm run deploy` registers the commands with Discord. Do not run it — it is the user's call.

---

## File structure

| File | Change | Responsibility |
|---|---|---|
| `bot/src/models/index.js` | Modify | ~12 new queries (paged history, ranged stats, watch time, paged ratings, board read/write, wishlist, marathon detail) |
| `bot/src/utils/nextEmbeds.js` | Modify | Rename to shared helpers; `progressMeter`, `monthGrid` etc. stay |
| `bot/src/utils/commandEmbeds.js` | **Create** | The four refreshed builders + their shared row/meter helpers |
| `bot/src/utils/commandEmbeds.test.js` | **Create** | Tests for the above |
| `bot/src/utils/featureEmbeds.js` | **Create** | `/board`, `/wishlist`, `/marathon` builders |
| `bot/src/utils/featureEmbeds.test.js` | **Create** | Tests for the above |
| `bot/src/utils/hubEmbed.js` | **Create** | `/movienight` landing embed + the jump select |
| `bot/src/utils/hubEmbed.test.js` | **Create** | Tests for the above |
| `bot/src/utils/customId.js` | **Create** | Build/parse the `mn:` namespace, one place |
| `bot/src/utils/customId.test.js` | **Create** | Round-trip and malformed-input tests |
| `bot/src/handlers/views/*.js` | **Create** | One renderer per view + the router |
| `bot/src/handlers/next/*` | Modify | Fold `renderNextView` into `handlers/views/`, migrate its ids |
| `bot/src/commands/{history,stats,myratings,top10}.js` | Modify | Call renderers instead of building embeds inline |
| `bot/src/commands/{board,wishlist,marathon,movienight}.js` | **Create** | New commands |
| `bot/src/commands/help.js` | Modify | Becomes a thin alias of the hub |
| `bot/src/events/interactionCreate.js` | Modify | Route `mn:` buttons **and** select menus |
| `frontend/src/pages/Commands.jsx` | Modify | List the new commands |

---

## Task 1: The `mn:` customId namespace

**Files:** Create `bot/src/utils/customId.js`, `bot/src/utils/customId.test.js`

Discord caps a customId at **100 characters** — the parser must not assume it is well-formed, because a truncated or stale id from an older deploy will arrive eventually.

- [ ] **Step 1: Write the tests first**

```js
test('builds and parses a round trip', () => {
  assert.equal(buildId('history', 2), 'mn:history:2');
  assert.deepEqual(parseId('mn:history:2'), { view: 'history', args: ['2'] });
});
test('rejects anything outside the namespace', () => {
  assert.equal(parseId('rsvp_14'), null);
});
test('rejects an unknown view rather than guessing', () => {
  assert.equal(parseId('mn:nonsense:1'), null);
});
test('refuses to build an id Discord would truncate', () => {
  assert.throws(() => buildId('board', 'x'.repeat(120)));
});
```

- [ ] **Step 2: Implement.** Export `VIEWS` (the allow-list), `buildId(view, ...args)`, `parseId(customId)`. `parseId` returns `null` — never throws — for anything unrecognised, so the router can ignore foreign buttons.

- [ ] **Step 3:** `cd bot && npm test`

---

## Task 2: Paged history query

**Files:** Modify `bot/src/models/index.js`

- [ ] **Step 1:** Add `getMovieNightsPaged(guildId, limit, offset)` returning rows plus a window-function total, so one round-trip answers both "this page" and "how many pages":

```sql
SELECT mn.id, mn.title, mn.release_year, mn.image_url, mn.scheduled_at, mn.runtime,
       ROUND(AVG(r.score), 1) AS avg_rating,
       COUNT(DISTINCT r.id)::int AS rating_count,
       (SELECT COUNT(*) FROM movie_attendance ma WHERE ma.movie_night_id = mn.id)::int AS attendee_count,
       COUNT(*) OVER()::int AS total_count
FROM movie_nights mn
LEFT JOIN ratings r ON r.movie_night_id = mn.id
WHERE mn.guild_id = $1 AND mn.started_at IS NOT NULL
GROUP BY mn.id
ORDER BY mn.scheduled_at DESC
LIMIT $2 OFFSET $3
```

Mark it `// PARALLEL to backend/src/models/movies.js (getMovieNights)` and state the difference: the web collapses re-screenings by `tmdb_id`, the bot does not.

- [ ] **Step 2:** `node --check bot/src/models/index.js`

---

## Task 3: Refreshed `/history`

**Files:** Create `bot/src/utils/commandEmbeds.js` + test; modify `bot/src/commands/history.js`; create `bot/src/handlers/views/history.js`

Per the mockup: `🎭 Movie Night History`, `Page N of M · X nights · server average Y`, one row per night carrying meter + score + votes + attendance + date, poster thumbnail from the top row, watch-time footer, Newer/Older buttons with the boundary one disabled.

- [ ] **Step 1: Tests first** — row composition, page maths (page 1 disables Newer; last page disables Older), a night with no ratings reading as "not rated yet" rather than `0.0`, and the empty state.
- [ ] **Step 2:** Implement `buildHistoryEmbed(rows, { page, pageCount })` and `buildPagerButtons(view, page, pageCount, extra)`.
- [ ] **Step 3:** `renderHistoryView({ guildId, page })` in `handlers/views/history.js`.
- [ ] **Step 4:** `history.js` calls the renderer. Keep the `count` option — it now sets page size.
- [ ] **Step 5:** `cd bot && npm test`

---

## Task 4: Stats queries — watch time, attendance, date ranges

**Files:** Modify `bot/src/models/index.js`

- [ ] **Step 1:** `getGuildWatchTime(guildId, since)` — `SUM(COALESCE(runtime, 90))` over started nights, returned as minutes.
- [ ] **Step 2:** `getRegularCount(guildId, since)` — distinct users with attendance.
- [ ] **Step 3:** Give `getGuildStats`, `getTopRatedMovies` and `getMostActiveRaters` an optional `since` parameter. **These three carry `// PARALLEL` comments** citing their backend twins — update those comments to note the new parameter is bot-only. Default `since = null` must produce byte-identical SQL behaviour to today.
- [ ] **Step 4:** Add attendance count to `getMostActiveRaters`.
- [ ] **Step 5:** `node --check`

---

## Task 5: Refreshed `/stats`

**Files:** Modify `commandEmbeds.js` + test; modify `bot/src/commands/stats.js`; create `handlers/views/stats.js`

- [ ] **Step 1: Tests** — the five-stat band, medal rows, watch time formatted as `82h` (and `1h 20m` under a day), the range label ("All time · since …" vs "This month"), and an empty guild not dividing by zero.
- [ ] **Step 2:** `buildStatsEmbed({ stats, topMovies, topRaters, watchMinutes, regulars, range })`, backdrop via `setImage` from the top film when it has one.
- [ ] **Step 3:** `renderStatsView({ guildId, range })` where range ∈ `all | month | year`.
- [ ] **Step 4:** Three range buttons; the active one disabled. "My stats" jumps to the `myratings` view.
- [ ] **Step 5:** `cd bot && npm test`

---

## Task 6: Paged ratings query

**Files:** Modify `bot/src/models/index.js`

- [ ] **Step 1:** `getUserRatingsPaged(discordId, { limit, offset, sort })` — `sort` ∈ `recent | score`, whitelisted through a lookup object, **never interpolated**. Include the community average per film and `COUNT(*) OVER()`.
- [ ] **Step 2:** `node --check`

---

## Task 7: `/myratings` — fix the overflow

**Files:** Modify `commandEmbeds.js` + test; modify `bot/src/commands/myratings.js`; create `handlers/views/myratings.js`

**This is the bug fix.** Today every rating is concatenated into one description with no cap; Discord rejects a description over **4096 characters**, so the command throws outright for anyone with roughly 40+ rated films.

- [ ] **Step 1: Write a failing test first** — build the embed from 200 ratings with long comments and assert `description.length <= 4096`. Confirm it fails against the current `createMyRatingsEmbed` before writing the fix.
- [ ] **Step 2:** Implement `buildMyRatingsEmbed(rows, { page, pageCount, sort, username })` with a page size of 8 **and** a defensive character budget — if rows on one page still exceed the budget (a pathological comment), truncate and say so. Page size alone is not a guarantee.
- [ ] **Step 3:** Sort select + pager buttons, both carrying page and sort in the id.
- [ ] **Step 4:** `renderMyRatingsView({ guildId, discordId, page, sort })`.
- [ ] **Step 5:** `cd bot && npm test`

---

## Task 8: `/top10` — target another member

**Files:** Modify `commandEmbeds.js` + test; modify `bot/src/commands/top10.js`; modify `bot/src/models/index.js`

- [ ] **Step 1:** `getUserTopRatedMovies` already returns `community_avg`. Add the delta and a "biggest hot take" derivation **in the builder, not SQL**.
- [ ] **Step 2: Tests** — delta sign and formatting, ties, a user with fewer than ten ratings, a user with none, and a target who has never rated anything.
- [ ] **Step 3:** Add the `user` option to the command. Resolve via `findOrCreateUser` on the mentioned member; if they have no ratings, say so plainly rather than rendering an empty medal list.
- [ ] **Step 4:** `cd bot && npm test`

---

## Task 9: `/board`

**Files:** Create `bot/src/utils/featureEmbeds.js` + test, `bot/src/commands/board.js`, `handlers/views/board.js`; modify `bot/src/models/index.js`

- [ ] **Step 1:** Queries: `getBoardSuggestions(guildId, viewerUserId)` (upvote count + whether the viewer has voted + suggester name) and `toggleBoardUpvote(suggestionId, userId)` — guarded by the `UNIQUE(suggestion_id, user_id)` constraint already on `board_upvotes`, so a double-click is idempotent rather than an error.
- [ ] **Step 2: Tests** for the embed: ranked rows, the "you haven't voted" count, your own suggestions marked, and the empty board.
- [ ] **Step 3:** `/board` view + a **string select** listing up to 25 films to upvote. Selecting re-renders in place.
- [ ] **Step 4:** `/board suggest title:<autocomplete>` as a subcommand reusing `/announce`'s TMDB autocomplete — Discord modals cannot autocomplete, which is why this is a subcommand and not a popup.
- [ ] **Step 5:** Admin-only "Schedule top" button, gated by the same `isAdmin` helper the admin commands use. **This is a write path that posts publicly — it must confirm before scheduling.**
- [ ] **Step 6:** `cd bot && npm test`

---

## Task 10: `/wishlist`

**Files:** Modify `featureEmbeds.js` + test, `bot/src/models/index.js`; create `bot/src/commands/wishlist.js`, `handlers/views/wishlist.js`

- [ ] **Step 1:** Queries: `getUserWishlist(discordId, guildId)`, `getServerWishlist(guildId)` (grouped, with who wants each film), and an overlap flag for "also on someone else's list".
- [ ] **Step 2: Tests** — star rendering for priority 1–5, the overlap marker, personal vs server modes, empty states.
- [ ] **Step 3:** "Pick one for me" — weighted by priority, replying **ephemerally** so repeated spins don't spam the channel. Weighting lives in a pure exported function so it can be tested with a seeded index rather than real randomness.
- [ ] **Step 4:** `cd bot && npm test`

---

## Task 11: `/marathon`

**Files:** Modify `featureEmbeds.js` + test; create `bot/src/commands/marathon.js`, `handlers/views/marathon.js`

- [ ] **Step 1:** Reuse `getGuildActiveMarathons` and `getMarathonItemsByMarathon`. Add per-item rating lookup for watched films.
- [ ] **Step 2: Tests** — the four item states (watched / scheduled / undated / airing), progress meter, cadence label, running average, and the **4096-character guard for a long marathon** (same failure mode as `/myratings` — a 30-film marathon must truncate, not throw).
- [ ] **Step 3:** Cycle button between active marathons; "I'm in" reusing `toggleMarathonAttendance`.
- [ ] **Step 4:** `cd bot && npm test`

---

## Task 12: `/movienight` — the hub, and `/help` folded into it

**Files:** Create `bot/src/utils/hubEmbed.js` + test, `bot/src/commands/movienight.js`, `handlers/views/hub.js`; modify `bot/src/commands/help.js`

Built last on purpose: it is a menu over the renderers Tasks 3–11 create. Built first, they would be written twice.

- [ ] **Step 1: Tests** — the summary lines degrade one at a time (nothing scheduled, empty board, no marathons) and the menu always renders.
- [ ] **Step 2:** `buildHubEmbed({ nextUp, topSuggestion, stats })` plus the jump select.
- [ ] **Step 3:** `/movienight` replies **ephemerally**. Selecting a destination calls that view's renderer and updates in place.
- [ ] **Step 4:** `/help` becomes a thin alias — same renderer, same output. Both stay registered because people type `/help` by reflex; there is no aliasing in Discord, so this is two commands over one renderer.
- [ ] **Step 5:** Update `frontend/src/pages/Commands.jsx` with `/board`, `/wishlist`, `/marathon`, `/movienight`.
- [ ] **Step 6:** `cd bot && npm test` and `cd frontend && npm run build`

---

## Task 13: Verify on Railway

- [ ] **Step 1:** Merge, deploy, then **the user runs** `cd bot && npm run deploy`.
- [ ] **Step 2:** In Discord, walk each command; confirm buttons still work after a bot restart (the whole point of the stateless ids).
- [ ] **Step 3:** Confirm `/myratings` renders for the account with the most ratings — the case that used to throw.

---

## Notes

- **Ephemeral vs shared is deliberate.** `/next` and `/board` are shared boards — pressing a button changes them for everyone, which is the intent. `/movienight`, `/myratings` and the wishlist picker are personal and reply ephemerally.
- **The 4096-character limit bites twice** — `/myratings` and `/marathon`. Both need a budget, not just a page size.
- **`sort` and any other user-supplied SQL fragment goes through a lookup object.** Never interpolated.
