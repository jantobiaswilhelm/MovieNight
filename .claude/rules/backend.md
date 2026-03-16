---
paths:
  - "backend/**"
---

# Backend Rules

- All DB queries use parameterized SQL ($1, $2...) via pg library — no ORM
- Database functions are split by domain in `backend/src/models/` (users, movies, ratings, voting, wishlists, stats, social, profiles, attendance, achievements, notifications, lists, guild) — add new functions to the appropriate domain file. Barrel export in `index.js` re-exports everything.
- New routes need `authenticateToken` (protected) or `optionalAuth` (public with optional user data)
- Always filter by `guild_id` in queries — this is a multi-guild app
- Filter out test data in user-facing queries: `AND (mn.is_test = false OR mn.is_test IS NULL)`
- New migrations go in `backend/src/config/migrate.js` — use column-existence checks for ALTER TABLE
- ESM modules throughout (`import`/`export`, `"type": "module"` in package.json)
