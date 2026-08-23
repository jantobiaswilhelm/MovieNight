<div align="center">

# 🎬 Movie Night

**A Discord bot and web app for running your server's movie nights.**

Schedule films, let the group suggest and upvote them, RSVP, rate what you watched,
run multi-film marathons, and keep the stats that settle arguments.

![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-5-646CFF?logo=vite&logoColor=white)
![Express](https://img.shields.io/badge/Express-4-000000?logo=express&logoColor=white)
![Discord.js](https://img.shields.io/badge/discord.js-v14-5865F2?logo=discord&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?logo=postgresql&logoColor=white)
![TMDB](https://img.shields.io/badge/TMDB-API-01B4E4?logo=themoviedatabase&logoColor=white)

</div>

---

## Contents

| | |
|---|---|
| [What it does](#what-it-does) | The feature tour, web and Discord |
| [Slash commands](#slash-commands) | Every command, at a glance |
| [How it fits together](#how-it-fits-together) | Architecture and the flows worth knowing |
| [Setup](#setup) | From zero to running locally |
| [Scripts](#scripts) | What each npm script does |
| [Deployment](#deployment) | Railway, three services |

---

## What it does

### 🍿 Getting a film on the calendar

There are four ways in, and they all end at the same `movie_nights` row:

- **The suggestion board** — anyone posts a film, everyone upvotes, an admin turns the
  top of the board into a scheduled night. This replaced the old voting-session feature.
- **Announce directly** — from the web (search TMDB, pick a date, done) or from Discord
  with `/announce`.
- **From a wishlist** — schedule straight out of your own list or the server's.
- **From a marathon** — a marathon rolls its films out one night at a time on its own.

Every scheduled night pulls its poster, backdrop, runtime, genres, tagline, trailer and
IMDb link from TMDB and stores them, so nothing needs re-fetching later.

### 🎞️ Marathons

A named, ordered run of films that schedules itself.

- Build the lineup in a wizard — search TMDB, or **describe a vibe in plain English** and
  let Gemini propose a lineup for you *(optional; needs `GEMINI_API_KEY`)*
- Two cadences: **interval**, which posts one night at a time as each date arrives, or
  **binge**, which posts the whole evening back-to-back in a single announcement
- Reorder, add and remove films while it runs
- Mark a film watched by hand if the group saw it off-schedule
- Progress, next-up and the whole running order visible on the web and via `/next`

### 📊 Ratings, stats and achievements

- Ratings run 1–10 in half-point steps, with optional comments, one per person per film
- Rate from Discord buttons, the `/rate` command, or the web — it's the same row either way
- Ratings unlock once the night starts, and a screening card posts to Discord when it does
- **39 achievements** across ratings, streaks, watch time, collections and hidden oddities
  (*Night Owl* for rating after midnight, *Hot Take* for landing 3+ off the average)
- Server stats, per-user profiles, rating distributions, top-rated boards, most active raters

### 👥 Social

- Discord OAuth login; follow other members and watch their activity land in a feed
- **Shared wishlists** with members, alongside your personal one and the server-wide view
- **Custom lists** — build your own, keep them private or make them public
- **Collections** — films grouped by their TMDB collection, with completion tracking
- **My Movies** — log films you watched outside movie night, including a
  **Letterboxd CSV import** that converts their 0.5–5 scale to this app's 1–10
- Notifications for the things you'd otherwise miss

### 🤖 On Discord

- Rich announcement embeds carrying RSVP and rating buttons
- **Automatic attendance** — the bot watches the voice channel during a screening and
  records who was actually there
- Screening cards when a film starts, updating live as ratings arrive
- Reminders to rate, plus notices when a night is rescheduled or cancelled

### 🔒 Admin

- Admins are set by the `ADMIN_IDS` env var, enforced server-side and reflected in the UI
- **Test mode** — create throwaway nights in a test channel; they're filtered out of every
  user-facing query and can be purged in one click
- Delete films or suggestions, reschedule nights, sync the channel list

---

## Slash commands

| Command | What it does |
|---|---|
| `/next [count]` | Upcoming films with runtime, RSVPs and marathon progress. Buttons switch the board to a **month calendar** or to the **running marathons**. |
| `/announce <title> <datetime>` | Schedule a night and post the announcement. Accepts `tomorrow 8pm` as readily as `2026-01-20 20:00`. |
| `/rate <movie> <score>` | Rate 1–10 with half-point precision — the scores the buttons can't reach. |
| `/history [count]` | Past movie nights with their averages. |
| `/stats` | Server statistics: totals, top-rated films, most active raters. |
| `/myratings` | Everything you've rated, and your average. |
| `/top10` | Your ten highest-rated films. |
| `/help` | All of the above, in Discord. |
| 🔒 `/start <movie>` | Start a night early, by hand. |
| 🔒 `/reschedule <movie> <datetime>` | Move a night that hasn't started. |
| 🔒 `/delete <movie>` | Delete a film and its ratings. |

> Commands are auto-discovered from `bot/src/commands/`. After adding or changing one, run
> `cd bot && npm run deploy` — Discord won't show it otherwise.

---

## How it fits together

Three independent services, one database. The bot and backend never call each other over
HTTP — they meet in PostgreSQL.

```mermaid
flowchart LR
    U([Discord member]) -->|slash commands<br/>buttons| BOT
    U -->|OAuth login| FE

    FE[["🖥️ frontend<br/>React + Vite"]] -->|REST + JWT| BE[["⚙️ backend<br/>Express"]]
    BOT[["🤖 bot<br/>discord.js v14"]]

    BE --> DB[("🐘 PostgreSQL")]
    BOT --> DB

    BE -->|posters, metadata| TMDB{{TMDB API}}
    BE -.->|vibe curation, optional| GEM{{Gemini}}
```

### The announcement queue

Scheduling from the web can't post to Discord directly — the web process isn't the bot. So
the backend leaves a note and the bot picks it up:

```mermaid
sequenceDiagram
    participant W as Web
    participant B as Backend
    participant D as pending_announcements
    participant Bot as Bot (cron, 5 min)
    participant Ch as Discord

    W->>B: schedule a film
    B->>D: INSERT status='pending'
    Bot->>D: claim one atomically → 'processing'
    Bot->>Ch: post the announcement embed
    Bot->>D: INSERT movie_night, mark 'processed'
```

The claim is a guarded `UPDATE … WHERE status = 'pending'`, so a second bot instance — or a
restart mid-run — gets no row back and skips it. No double posts, no duplicate nights.

**This is why a film scheduled on the site can take up to five minutes to reach Discord.**

### Repository layout

```
MovieNight/
├── backend/     Express REST API — auth, data, TMDB proxy, migrations
│   └── src/
│       ├── models/      one file per domain, raw parameterised SQL, no ORM
│       ├── routes/      one router per feature
│       └── config/      migrate.js — the whole schema
├── bot/         Discord bot
│   └── src/
│       ├── commands/    auto-loaded slash commands
│       ├── events/      interactions, voice state
│       ├── handlers/    button and modal logic
│       ├── jobs/        7 cron tasks
│       └── utils/       embed builders (+ their tests)
└── frontend/    React SPA
    └── src/
        ├── pages/       lazy-loaded routes
        ├── components/  grouped by feature area
        ├── context/     auth, theme, notifications
        └── api/client.js   every backend call, one wrapper
```

### Things worth knowing before you change something

- **Multi-guild.** Nearly every query filters on `guild_id`, and most endpoints require it.
  New queries should too.
- **Migrations have no framework.** `backend/src/config/migrate.js` is one idempotent
  script: `CREATE TABLE IF NOT EXISTS`, plus `ALTER TABLE` guarded by `information_schema`
  checks, all inside one transaction. It runs automatically on `npm start`.
- **Some model functions exist twice.** The bot and backend each have their own data layer,
  and 18 functions overlap. Each is marked `// SHARED` (keep identical) or `// PARALLEL`
  (differs on purpose, with the reason stated). Check the twin before you edit one.
- **Test data is filtered, not hidden.** User-facing queries carry
  `AND (mn.is_test = false OR mn.is_test IS NULL)`.

---

## Setup

### Prerequisites

- Node.js 18+
- A PostgreSQL database
- A Discord application (bot + OAuth2)
- A TMDB API key — free at [themoviedb.org](https://www.themoviedb.org/settings/api)

### 1. Discord application

1. Create an application at <https://discord.com/developers/applications>
2. **Bot tab** — add a bot, enable *Message Content Intent* and *Server Members Intent*,
   copy the token
3. **OAuth2 tab** — copy the client ID and secret, then add redirect URLs:
   - `http://localhost:3001/auth/callback` (dev)
   - `https://your-backend.railway.app/auth/callback` (prod)
4. **Invite it** — OAuth2 → URL Generator → scopes `bot` and `applications.commands`,
   permissions *Send Messages* and *Embed Links*

### 2. Environment

Create a `.env` in each directory:

<details open>
<summary><b>backend/.env</b></summary>

```ini
DATABASE_URL=postgresql://user:password@host:5432/movienight
DISCORD_CLIENT_ID=your_client_id
DISCORD_CLIENT_SECRET=your_client_secret
JWT_SECRET=a_long_random_string
FRONTEND_URL=http://localhost:5173
TMDB_API_KEY=your_tmdb_api_key
PORT=3001
ADMIN_IDS=discord_user_id,another_discord_user_id

# Optional — enables the marathon "describe a vibe" curation.
# Without it, that path is simply hidden in the UI.
GEMINI_API_KEY=your_gemini_key
GEMINI_MODEL=gemini-2.0-flash
```
</details>

<details open>
<summary><b>bot/.env</b></summary>

```ini
DISCORD_TOKEN=your_bot_token
DISCORD_CLIENT_ID=your_client_id
DATABASE_URL=postgresql://user:password@host:5432/movienight
GUILD_ID=your_server_id
TMDB_API_KEY=your_tmdb_api_key
ANNOUNCEMENT_CHANNEL_ID=your_announcement_channel_id
ADMIN_IDS=discord_user_id,another_discord_user_id

# Optional — adds a "view on the web" link button to embeds.
FRONTEND_URL=http://localhost:5173
```
</details>

<details open>
<summary><b>frontend/.env</b></summary>

```ini
VITE_API_URL=http://localhost:3001
VITE_DISCORD_CLIENT_ID=your_client_id
VITE_GUILD_ID=your_server_id
```
</details>

### 3. Install, migrate, register

```bash
cd backend  && npm install && npm run db:migrate
cd ../bot   && npm install && npm run deploy
cd ../frontend && npm install
```

### 4. Run it

Three terminals:

```bash
cd backend  && npm run dev     # http://localhost:3001
cd bot      && npm run dev
cd frontend && npm run dev     # http://localhost:5173
```

---

## Scripts

| Directory | Command | What it does |
|---|---|---|
| `backend` | `npm run dev` | API with `node --watch` |
| | `npm start` | Runs migrations, then starts — this is the production entry point |
| | `npm run db:migrate` | Applies the schema by hand |
| `bot` | `npm run dev` | Bot with `node --watch` |
| | `npm test` | Embed-builder tests via `node --test` |
| | `npm run deploy` | **Registers slash commands with Discord.** Required after adding or changing one. |
| `frontend` | `npm run dev` | Vite dev server |
| | `npm run build` | Production build |

No linter or CI is configured. The bot's embed builders are covered by `node --test`;
nothing else has tests.

---

## Deployment

Railway, one service per directory, each with its own `railway.json`.

| Service | Root | Build | Start |
|---|---|---|---|
| Backend | `backend` | `npm install` | `npm start` *(migrates first)* |
| Bot | `bot` | `npm install && npm run deploy` | `npm start` |
| Frontend | `frontend` | `npm install && npm run build` | `npm run preview -- --host --port $PORT` |

The frontend is a static build — Vercel or Netlify will serve it more cheaply than Railway.

---

## License

MIT
