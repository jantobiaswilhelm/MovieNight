# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MovieNight is a full-stack Discord bot + web application for organizing movie nights. Users can schedule movies, vote for what to watch, manage wishlists, rate films, and track statistics.

**Tech Stack:**
- Frontend: React 18 + Vite + React Router
- Backend: Express.js (Node.js)
- Bot: Discord.js v14
- Database: PostgreSQL
- External API: TMDB (The Movie Database)

## Common Commands

### Development

```bash
# Backend (runs on port 3001)
cd backend && npm run dev

# Discord Bot
cd bot && npm run dev

# Frontend (runs on port 5173)
cd frontend && npm run dev
```

### Production

```bash
# Backend (auto-runs migrations)
cd backend && npm start

# Bot
cd bot && npm start

# Frontend build
cd frontend && npm run build
```

### Database & Bot Setup

```bash
# Run database migrations
cd backend && npm run db:migrate

# Deploy Discord slash commands
cd bot && npm run deploy
```

## Architecture

### Three-Service Architecture

```
frontend/     React SPA - user interface
backend/      Express REST API - data operations, auth, TMDB proxy
bot/          Discord.js bot - slash commands, scheduled jobs
```

All three services connect to the same PostgreSQL database. The bot and backend share the same database schema.

### Backend Structure (`backend/src/`)

- `routes/` - Express route handlers (auth, movies, ratings, stats, voting, wishlists, tmdb, admin)
- `models/index.js` - All database operations with raw SQL queries
- `middleware/auth.js` - JWT authentication with optional auth support
- `config/database.js` - PostgreSQL connection pool
- `config/migrate.js` - Database schema migrations

### Bot Structure (`bot/src/`)

- `commands/` - Discord slash commands (announce, rate, startvote, suggest, etc.)
- `events/` - Discord event handlers (interactionCreate, ready)
- `jobs/` - Scheduled tasks (announcementProcessor runs every 5 min, movieStarter)
- `deploy-commands.js` - Script to register slash commands with Discord

### Frontend Structure (`frontend/src/`)

- `pages/` - Route pages (Home, Movie, MoviesPage, WishlistPage, Profile, StatsPage, Calendar)
- `components/` - Reusable UI components
- `context/` - React context (AuthContext, ThemeContext)
- `api/client.js` - Centralized API client with all endpoint methods

### Key Database Tables

- `movie_nights` - Scheduled movie events with TMDB metadata
- `ratings` - User ratings (1-10, 0.5 increments)
- `voting_sessions` / `movie_suggestions` / `votes` - Voting system
- `wishlists` - Personal movie wishlists with 1-5 star priority
- `pending_announcements` - Queue for bot to post announcements
- `movie_attendance` - Track who's attending each movie

## Key Patterns

### Backend API Pattern
Routes use try-catch with JSON responses. Database operations use parameterized queries via the pg library. Auth middleware provides `optionalAuth` for public endpoints that can show extra data for logged-in users.

### Bot Command Pattern
Each command exports `data` (SlashCommandBuilder) and `execute(interaction)`. Commands are auto-loaded from the commands directory.

### Frontend API Pattern
All API calls go through `api/client.js` which handles auth tokens and base URL configuration. Components use React hooks and Context API for state.

## Environment Variables

Each service needs its own `.env` file:

**backend/.env**: DATABASE_URL, DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, JWT_SECRET, FRONTEND_URL, TMDB_API_KEY, PORT

**bot/.env**: DISCORD_TOKEN, DISCORD_CLIENT_ID, DATABASE_URL, GUILD_ID, TMDB_API_KEY, ANNOUNCEMENT_CHANNEL_ID

**frontend/.env**: VITE_API_URL, VITE_DISCORD_CLIENT_ID, VITE_GUILD_ID

## Deployment

Configured for Railway deployment with separate services for backend, bot, and frontend. See `railway.json` in each directory for build configuration.
