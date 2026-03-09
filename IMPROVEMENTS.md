# Codebase Improvements & Feature Roadmap

**Created:** 2026-03-09

---

## Security & Correctness (Remaining)

### S-1: migrate.js uses `rejectUnauthorized: false` in production
**Status:** TODO
**Files:** `backend/src/config/migrate.js:7`

The migration script hardcodes `rejectUnauthorized: false` for production SSL, while the runtime database configs (`backend/src/config/database.js`, `bot/src/config/database.js`) were already hardened to support `DATABASE_CA_CERT`. The migration script should match.

### S-2: Guild authorization model — client-supplied `guild_id` trusted
**Status:** TODO (architectural)
**Files:** `backend/src/routes/movies.js`, `stats.js`, `voting.js`, `wishlists.js`

Guild-scoped API endpoints trust the `guild_id` query/body parameter from the client. Any authenticated user could pass a different guild's ID. Full fix requires adding `guilds` OAuth scope and validating membership server-side — significant architectural change. Frontend mitigates by hardcoding `VITE_GUILD_ID`.

### ~~S-3: Rate limiting behind proxy lacks `trust proxy`~~
**Status:** ALREADY FIXED (`backend/src/index.js:40`)

Codex flagged this but `app.set('trust proxy', 1)` is already present at line 40 before all rate limiters.

### ~~S-4: Bot `/start` and `/reschedule` lack guild check~~
**Status:** ALREADY FIXED

`start.js:46` has `if (!movie || movie.guild_id !== interaction.guildId)` check.
`reschedule.js:64` has `if (!movie || movie.guild_id !== interaction.guildId)` check.

### ~~S-5: Bot cross-guild button safety~~
**Status:** ALREADY FIXED

`handleVoteButton` at line 490-504 uses `getActiveVotingSession(interaction.guildId)` (guild-scoped) and then verifies `suggestion.session_id !== session.id`. The suggestion-to-session binding prevents cross-guild exploitation.

---

## Code Quality & Structure

### CQ-1: Split oversized files into modules
**Priority:** High
**Files:**
- `backend/src/models/index.js` (~1,700 lines, 122 functions) — split by domain: `models/users.js`, `models/movies.js`, `models/voting.js`, `models/social.js`, etc. with barrel export
- `frontend/src/pages/Home.jsx` (~1,135 lines, 34 useState calls) — extract VotingSection, AnnouncementFlow, MovieSearch into separate components
- `bot/src/events/interactionCreate.js` (~730 lines) — extract handlers into `handlers/rating.js`, `handlers/voting.js`, `handlers/suggest.js`

### CQ-2: Extract shared bot date parsing utility
**Priority:** High
**Files:** `bot/src/commands/announce.js:153`, `endvote.js:143`, `reschedule.js:96`, `startvote.js:105`

`parseDateTime()` is duplicated across 4 command files (~70 lines each). Extract to `bot/src/utils/dateTime.js`.

### CQ-3: Create frontend custom hooks
**Priority:** High

- `useFetch(fetchFn, deps)` — consolidate the loading/error/data triple used in 10+ pages
- `useSearch(searchFn)` — debounced search with results state (duplicated in 8+ files)
- `useModal()` — open/close/toggle state for modals

Would eliminate 500+ lines of duplicated boilerplate.

### CQ-4: Add Error Boundary component
**Priority:** High

No Error Boundary exists. If any component throws during render, the entire app goes blank with no recovery. Add a top-level `<ErrorBoundary>` wrapping routes in App.jsx with a fallback UI.

### CQ-5: Introduce shared validation layer
**Priority:** Medium

Consolidate input validation across backend routes. Currently date validation, guild_id checks, and pagination bounds are repeated in 8+ route files. Options:
- `zod` schemas per route
- Shared middleware functions for common patterns (date, guild_id, pagination)

### CQ-6: Deduplicate frontend helper functions
**Priority:** Medium

Extract to `frontend/src/utils/`:
- `formatRuntime(minutes)` — duplicated in Movie.jsx, WishlistDetailModal.jsx, StatsPage.jsx, Profile.jsx
- `formatDate(dateStr)` — duplicated in 5+ pages
- `getLanguageName(code)` — duplicated in Movie.jsx, WishlistDetailModal.jsx
- `getAvatarUrl(discordId, avatar)` — duplicated in Header.jsx, WishlistDetailModal.jsx

### CQ-7: Centralized bot logging
**Priority:** Medium

77 scattered `console.log`/`console.error` calls with no structured format. Create a logger utility with levels (info/warn/error) and consistent format. Enables future integration with error tracking (Sentry, etc.).

### CQ-8: Replace magic numbers with named constants
**Priority:** Low

- Rating delay: `runtime - 10` (minutes before movie ends)
- Throttle: `1000ms`
- TMDB timeout: `10000ms`
- Cron schedules: `*/5 * * * *`, `* * * * *`
- Auth code TTL: `30 * 1000`

---

## Performance

### P-1: Add React.lazy route-based code splitting
**Priority:** High

All 14 pages are eagerly imported in App.jsx. Use `React.lazy()` + `<Suspense>` for route-level code splitting. Heavy pages like Home (1,135 lines), MyMoviesPage (790 lines), and Movie (564 lines) would benefit most.

### P-2: Memoize list item components
**Priority:** Medium

Zero `React.memo` usage. MovieCard, WishlistCard, and rating list items re-render on every parent state change. Add `React.memo` to pure presentational components and `useCallback` for event handlers passed as props.

### P-3: Add virtual scrolling for large lists
**Priority:** Medium

MoviesPage can render 500+ movies without virtualization. Consider `react-window` or `react-virtuoso` for the movies grid and ratings lists.

### P-4: Image lazy loading
**Priority:** Low

Movie posters and backdrops loaded eagerly. Add `loading="lazy"` to `<img>` tags below the fold.

### P-5: Fix N+1 queries in backend
**Priority:** Medium
**Files:** `backend/src/services/achievementChecker.js`, `backend/src/routes/social.js`

- Achievement checker runs 5 separate COUNT queries — combine into single joined query
- Social routes make extra `getUserById()` calls after operations that already return user data

### P-6: Add missing database indexes
**Priority:** Medium

- `movie_nights.scheduled_at` — used in ORDER BY on every movie listing
- `movie_nights.announced_by` — used in JOIN for announcer name
- `notifications(user_id, is_read)` composite — used in unread count queries

### P-7: Use ON DELETE CASCADE instead of manual multi-query deletes
**Priority:** Low

`deleteMovieNight`, `deleteVotingSession`, `deleteSuggestion` do manual cascading deletes in multiple queries. Adding `ON DELETE CASCADE` to foreign keys would simplify code and ensure consistency.

### P-8: Consistent pagination across all list endpoints
**Priority:** Medium

Several endpoints return unbounded results:
- `getGuildWishlist()`, `getSharedWishlists()`, `getCollections()`
- `getFollowers()`, `getFollowing()`

Apply the existing `Math.min(Math.max(limit, 1), 100)` pattern to all list endpoints.

---

## Features — Bot

### F-1: Pre-movie reminder notification
**Priority:** High

Add a scheduled job that sends a reminder 30 minutes before a movie's `scheduled_at` time. Ping the movie night role. Track with a `reminder_sent_at` column to prevent duplicates.

### F-2: Auto-create discussion thread on movie start
**Priority:** Medium

When `movieStarter` job starts a movie, create a Discord thread on the announcement message for spoiler-free discussion during the movie. Post rating buttons in the thread near the end.

### F-3: Wishlist bot commands
**Priority:** Medium

Backend has full wishlist support but bot has zero commands for it. Add:
- `/wishlist add <movie>` — TMDB search + add to guild wishlist
- `/wishlist view` — show top wishlist items
- `/wishlist suggest` — suggest a wishlist item into active voting session

### F-4: Voting deadline warning
**Priority:** Low

Add optional `closes_at` field to voting sessions. Send a warning message 30 minutes before close. Auto-close when deadline hits.

### F-5: Attendance tracking via bot
**Priority:** Low

Database has `movie_attendance` table but bot doesn't use it. Add a "Going" button to announcement embeds or an `/attend` command.

---

## Features — Frontend

### F-6: Global movie search
**Priority:** High

No way to search across all watched movies in the guild. Add a search bar to MoviesPage that filters by title, genre, year. Backend already has the data — just needs a search endpoint or client-side filtering.

### F-7: Role-based permissions UI
**Priority:** Medium

Currently only admin/non-admin binary. Add a UI for configuring who can announce, start votes, schedule from wishlist. Would need backend support for permission levels per guild.

### F-8: Notification preferences
**Priority:** Medium

No way to configure which notifications a user receives. Add per-feature toggles (new movie announced, someone rated, achievement unlocked) and digest mode options.

### F-9: Recommendation engine from group ratings
**Priority:** Low

Go beyond TMDB "similar movies" — use group rating patterns to recommend movies. E.g., "people who rated X highly also rated Y highly." Would require a simple collaborative filtering implementation.

### F-10: Better Letterboxd import diagnostics
**Priority:** Low

Current import gives a count but no error details. Show which movies failed to match, allow manual TMDB matching for unresolved entries.

---

## Features — General

### F-11: Recurring movie nights + auto-schedule
**Priority:** Medium

Add ability to set a recurring schedule (e.g., every Friday at 8pm). Auto-create voting sessions or announcements on the recurring schedule.

### F-12: Moderation queue for suggestions
**Priority:** Low

Allow admins to require approval before suggestions appear in voting. Useful for larger guilds.

### F-13: Activity filters and social improvements
**Priority:** Low

Activity feed currently shows everything. Add filters by type (ratings, wishlists, follows). Add comment/reply support on ratings beyond emoji reactions.

---

## Testing & CI

### T-1: Add testing foundation
**Priority:** High

Zero test files in the entire project. Start with:
- Backend: unit tests for model functions + API integration tests for auth/authorization
- Frontend: component tests for key flows (rating, voting)
- Bot: unit tests for `parseDateTime`, `shouldThrottle`, vote logic

### T-2: Add CI pipeline
**Priority:** High

No GitHub Actions workflows exist. Set up:
- Lint (ESLint)
- Test suite
- `npm audit` for dependency vulnerabilities
- Frontend build check (`vite build`)
- Backend/bot syntax check

### T-3: Add ESLint configuration
**Priority:** Medium

No linting configured in any of the 3 services. Add shared ESLint config for consistent code style.

---

## Accessibility

### A-1: Add ARIA attributes to interactive elements
**Priority:** Medium

- Header dropdowns: missing `role="menu"`, `aria-expanded`
- Modals: missing focus traps, `aria-modal`, escape key handling
- Notification dropdown: missing `aria-live` for dynamic content

### A-2: Keyboard navigation
**Priority:** Medium

Header dropdowns require mouse hover — no keyboard support. Modals don't trap focus. Add keyboard handlers and proper tab ordering.

### A-3: Image alt text
**Priority:** Low

Most images have alt text but 4 instances use `alt=""`. Movie posters in list views should have descriptive alt text.

---

## Observability

### O-1: Structured error tracking
**Priority:** Medium

Generic "There was an error" messages make debugging hard. Add error IDs visible to users that map to server-side logs. Consider Sentry or similar for production error tracking.

### O-2: Job monitoring dashboard
**Priority:** Low

No visibility into scheduled job health. Track success/failure rates for movieStarter, announcementProcessor, ratingNotifier. Expose metrics endpoint or log structured job results.
