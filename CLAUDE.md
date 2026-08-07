# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MovieNight is a full-stack Discord bot + web application for organizing movie nights. Users can schedule movies, vote for what to watch, manage wishlists, rate films, and track statistics.

**Tech Stack:** React 18 + Vite | Express.js | Discord.js v14 | PostgreSQL | TMDB API

## Commands

```bash
# Development (run each in separate terminal)
cd backend && npm run dev     # Express API on port 3001 (uses node --watch)
cd bot && npm run dev         # Discord bot (uses node --watch)
cd frontend && npm run dev    # Vite dev server on port 5173

# Database migrations
cd backend && npm run db:migrate

# Deploy Discord slash commands (required after adding/changing commands)
cd bot && npm run deploy

# Production
cd backend && npm start       # auto-runs migrations before starting
cd frontend && npm run build  # Vite production build
```

No test framework, linter, or CI/CD is configured.

## Architecture

Three independent services sharing one PostgreSQL database:

```
frontend/   React SPA — calls backend REST API
backend/    Express REST API — auth, data operations, TMDB proxy
bot/        Discord.js bot — slash commands, cron jobs
```

### Cross-Service Data Flow

The bot and backend don't communicate via HTTP — they share the database directly.

**Web-to-Discord announcement flow:**
1. User creates announcement on web → backend inserts into `pending_announcements` (status='pending')
2. Bot cron job (`announcementProcessor`) polls every 5 min → posts Discord embed → creates `movie_night` record → marks as 'processed'

This pending_announcements table acts as a simple message queue.

**Ratings flow both ways:** Users can rate via the web UI (POST to backend) or via Discord `/rate` command (bot writes directly to DB). Both write to the same `ratings` table.

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

### Auth Flow

Discord OAuth2 with a two-step code exchange:
1. Frontend redirects to backend `/auth/discord` → Discord OAuth → callback
2. Backend generates a short-lived auth code (30s TTL, stored in memory) and redirects to frontend `/auth/callback?code=...`
3. Frontend exchanges auth code for JWT via `/auth/exchange`
4. JWT stored in localStorage, sent as `Authorization: Bearer` header

**Admin status:** Determined by `ADMIN_IDS` env var (comma-separated Discord user IDs). Checked server-side via `requireAdmin` middleware and client-side via `useAuth().isAdmin`.

### Backend (`backend/src/`)

- `routes/` — Modular Express routers. Each route uses `authenticateToken` or `optionalAuth` middleware.
- `models/index.js` — **All database operations in one file.** Raw SQL with parameterized queries (pg library). No ORM.
- `middleware/auth.js` — JWT auth. `optionalAuth` sets `req.user` if token valid but doesn't reject.
- `middleware/validation.js` — `validateIntParams()` for route param validation.
- `config/migrate.js` — Schema migrations (see Database section).

### Bot (`bot/src/`)

- `commands/` — Each file exports `data` (SlashCommandBuilder) and `execute(interaction)`. Auto-loaded by index.js via filesystem scan.
- `events/` — Discord event handlers, auto-loaded. Handles slash commands, buttons, modals, select menus.
- `jobs/` — Cron tasks using node-cron: `announcementProcessor` (every 5 min), `movieStarter`, `ratingNotifier`, `channelSync`.

### Frontend (`frontend/src/`)

- `pages/` — Lazy-loaded route components wrapped in Suspense + ErrorBoundary.
- `api/client.js` — Centralized fetch wrapper (50+ methods). Auto-attaches JWT, handles 401 logout.
- `context/` — AuthContext (user state, login/logout), ThemeContext, NotificationContext.
- Routes defined in `App.jsx` using React Router v6.

## Database

### Migration Pattern

No migration framework. `backend/src/config/migrate.js` runs as a single script:
- Uses `CREATE TABLE IF NOT EXISTS` for idempotency
- Adds new columns via `ALTER TABLE` with column-existence checks against `information_schema.columns`
- Wrapped in a transaction (BEGIN/COMMIT/ROLLBACK)
- Runs automatically on `npm start` (production) or manually via `npm run db:migrate`

### Multi-Guild Isolation

Almost every query filters by `guild_id`. This is a required query parameter on most API endpoints. Always include guild_id when adding new queries or routes.

### Test Mode

Admin can create test movie nights (`is_test = true`). Production queries filter these out: `AND (mn.is_test = false OR mn.is_test IS NULL)`.

### Key Tables

- `movie_nights` — Scheduled events with TMDB metadata (genres, runtime, description stored as columns)
- `ratings` — 1-10 scale, 0.5 increments, with optional comments. Upsert pattern (one rating per user per movie).
- `voting_sessions` / `movie_suggestions` / `votes` — Voting system. Sessions have status ('open'/'closed').
- `pending_announcements` — Queue for bot processing (status: 'pending'/'processed'/'failed')
- `wishlists` — Per-user movie lists with 1-5 star priority
- `movie_attendance` — RSVP tracking

## Environment Variables

**backend/.env**: DATABASE_URL, DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, JWT_SECRET, FRONTEND_URL, TMDB_API_KEY, PORT, ADMIN_IDS, GEMINI_API_KEY (optional — enables marathon "describe a vibe" AI curation; absent = the vibe source is hidden), GEMINI_MODEL (optional, default `gemini-2.0-flash`)

**bot/.env**: DISCORD_TOKEN, DISCORD_CLIENT_ID, DATABASE_URL, GUILD_ID, TMDB_API_KEY, ANNOUNCEMENT_CHANNEL_ID, ADMIN_IDS

**frontend/.env**: VITE_API_URL, VITE_DISCORD_CLIENT_ID, VITE_GUILD_ID

## Deployment

Railway with separate services per directory. See `railway.json` in each directory.
