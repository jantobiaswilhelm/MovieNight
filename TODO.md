# MovieNight — Open Tasks

**Consolidated:** 2026-03-16
**Sources:** IMPROVEMENTS.md, SECURITY.md, FUTURE_IDEAS.md

---

## Security

- [ ] **S-2: Guild authorization model** (Architectural) — API endpoints trust client-supplied `guild_id`. Full fix requires `guilds` OAuth scope + server-side membership validation. Frontend mitigates via hardcoded `VITE_GUILD_ID`. *Files: backend/src/routes/movies.js, stats.js, voting.js, wishlists.js*
- [ ] **NF-18: Missing guild-level authorization on API** (same as S-2) — Short-term: rate limit guild-scoped endpoints. Long-term: request `guilds` scope and validate membership.
- [ ] **#21: Admin action audit logging** (Low) — No audit trail for admin actions.

---

## Code Quality & Structure

- [x] **CQ-1: Split oversized files** (High) — DONE
  - `backend/src/models/index.js` (1,794 lines → 13 domain files + barrel export, 127 functions)
  - `frontend/src/pages/Home.jsx` (already refactored to 194 lines in prior session)
  - `bot/src/events/interactionCreate.js` (730 lines → 95-line dispatcher + 9 handler files in `bot/src/handlers/`)
- [x] **CQ-2: Extract shared bot date parsing** (High) — DONE. Created `bot/src/utils/dateTime.js`, updated 4 command files.
- [x] **CQ-3: Create frontend custom hooks** (High) — DONE. Created `useFetch`, `useSearch`, `useModal` in `frontend/src/hooks/`. Refactored 7 pages.
- [x] **CQ-5: Shared validation layer** (Medium) — DONE. Added `validateGuildId`, `parsePagination`, `validateDate` middleware to `backend/src/middleware/validate.js`. Applied across 9 route files (~31 inline blocks replaced).
- [x] **CQ-7: Centralized bot logging** (Medium) — DONE. Created `bot/src/utils/logger.js` with `createLogger(context)`. Updated 27 files, replaced all console.log/error/warn calls with structured logger. Supports LOG_LEVEL env var.

---

## Performance

- [x] **P-2: Memoize list item components** (Medium) — DONE. Wrapped 5 components with `React.memo`, added `useCallback` in 3 parent pages.
- [ ] **P-3: Virtual scrolling for large lists** (Medium) — MoviesPage can render 500+ movies without virtualization. Consider `react-window` or `react-virtuoso`.
- [ ] **P-5: Fix N+1 queries** (Medium) — Achievement checker runs 5 separate COUNT queries. Social routes make extra getUserById() calls. *Files: achievementChecker.js, social.js*
- [ ] **P-7: ON DELETE CASCADE** (Low) — `deleteMovieNight`, `deleteVotingSession`, `deleteSuggestion` do manual cascading deletes. Add CASCADE to foreign keys.
- [x] **P-8: Consistent pagination** (Medium) — DONE. Applied `parsePagination` to 11 endpoints across 5 route files. Added LIMIT/OFFSET to 11 model functions.

---

## Features — Bot

- [ ] **F-2: Auto-create discussion thread** (Medium) — Create Discord thread on announcement message when movie starts. Post rating buttons near end.
- [ ] **F-3: Wishlist bot commands** (Medium) — `/wishlist add`, `/wishlist view`, `/wishlist suggest`. Backend has full support, bot has zero commands.
- [ ] **F-4: Voting deadline warning** (Low) — Optional `closes_at` field on voting sessions. Warn 30 min before close, auto-close on deadline.
- [ ] **F-5: Attendance tracking via bot** (Low) — `movie_attendance` table exists but bot doesn't use it. Add "Going" button or `/attend` command.

---

## Features — Frontend

- [x] **F-6: Global movie search** (High) — DONE. Added client-side search/filter to MoviesPage with text search, genre dropdown, year dropdown, and active filter tags.
- [ ] **F-7: Role-based permissions UI** (Medium) — Beyond admin/non-admin binary. Configure who can announce, start votes, schedule from wishlist.
- [ ] **F-8: Notification preferences** (Medium) — Per-feature toggles and digest mode options.
- [ ] **F-9: Recommendation engine** (Low) — Collaborative filtering from group rating patterns.
- [ ] **F-10: Better Letterboxd import diagnostics** (Low) — Show which movies failed to match, allow manual TMDB matching.

---

## Features — General

- [ ] **F-11: Recurring movie nights** (Medium) — Set recurring schedule (e.g., every Friday 8pm). Auto-create voting sessions or announcements.
- [ ] **F-12: Moderation queue for suggestions** (Low) — Admin approval before suggestions appear in voting.
- [ ] **F-13: Activity filters** (Low) — Filter activity feed by type. Add comment/reply support on ratings.

---

## Features — From Ideas Backlog

- [ ] Own profile page (user profile with watch history, ratings, stats)
- [ ] Add old movies and rate them (log previously watched movies)
- [ ] Movies with the same main actor (instead of just similar movies)
- [ ] Import old movie nights from Discord chat history

---

## Testing & CI

- [ ] **T-1: Add testing foundation** (High) — Zero tests. Start with backend model unit tests, frontend component tests, bot utility tests.
- [ ] **T-2: Add CI pipeline** (High) — GitHub Actions: lint, test, npm audit, vite build check.
- [ ] **T-3: Add ESLint configuration** (Medium) — No linting in any of the 3 services.

---

## Accessibility

- [ ] **A-1: ARIA attributes** (Medium) — Header dropdowns missing `role="menu"`, `aria-expanded`. Modals missing focus traps, `aria-modal`.
- [ ] **A-2: Keyboard navigation** (Medium) — Header dropdowns require mouse hover. Modals don't trap focus.

---

## Observability

- [ ] **O-1: Structured error tracking** (Medium) — Add error IDs visible to users mapping to server-side logs. Consider Sentry.
- [ ] **O-2: Job monitoring dashboard** (Low) — Track success/failure rates for scheduled jobs.
