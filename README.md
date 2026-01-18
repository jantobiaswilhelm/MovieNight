# Movie Night Tracker

A Discord bot + web app for organizing movie nights with your server. Schedule movies, vote for what to watch next, manage wishlists, rate films, and track statistics.

## Features

### Web App

**Home Page**
- Featured "Up Next" movie with backdrop, poster, and all details
- Quick announce button to schedule new movie nights directly
- Active voting section with real-time vote counts and progress bars
- Attendance tracking - mark yourself as attending and see who else is coming
- Upcoming movies list and best-rated movies of the month

**Movie Voting**
- Start voting sessions with a scheduled date/time
- Search and add movies from TMDB database
- Vote for your favorites with visual progress bars
- See who voted for what with avatar display
- Admin controls to end voting or cancel sessions
- Winner announcement with automatic movie scheduling

**Wishlist**
- Personal wishlist and combined server wishlist
- Search movies via TMDB with posters, ratings, and descriptions
- Set priority levels (1-5 stars) for movies you want to watch
- Group by user view for server wishlist
- Random movie picker - spin the wheel when you can't decide
- Schedule movies directly from wishlist items

**Movie Details**
- Full movie information from TMDB (poster, backdrop, description, runtime, genres)
- Watch trailers directly (YouTube integration)
- IMDb links for more info
- Similar movie recommendations
- Attendance list with avatars
- Rating system after movie night starts (1-10 with 0.5 increments)
- All ratings visible with user avatars

**Movies Archive**
- Browse all past and upcoming movie nights
- Calendar view for scheduled movies
- Filter and sort options
- Quick access to movie details

**Stats & Leaderboards**
- Average ratings per movie
- Most active raters
- Rating distribution charts
- Monthly breakdowns
- Personal rating history

**User Features**
- Discord OAuth login
- Personal profile with your ratings and stats
- Dark theme with modern streaming-style UI

### Discord Bot

**Commands**
- `/announce` - Announce movie nights with countdown timer
- `/rate` - Rate movies (1-10 with 0.5 increments)
- `/history` - View past movie nights
- `/stats` - Server statistics
- `/myratings` - Your personal ratings
- `/commands` - List all available commands

**Automatic Features**
- Posts movie announcements with rich embeds
- Rating buttons on announcements for quick ratings
- Processes scheduled announcements from the website (checks every 5 minutes)
- Voting session announcements and results

## Tech Stack

- **Frontend:** React + Vite, modern CSS with glass morphism effects
- **Backend:** Express.js REST API
- **Bot:** Discord.js v14
- **Database:** PostgreSQL
- **External API:** TMDB for movie data

## Project Structure

```
MovieNight/
├── backend/    # Express.js API server
├── bot/        # Discord.js bot
└── frontend/   # React web application
```

## Setup

### Prerequisites

- Node.js 18+
- PostgreSQL database
- Discord application (bot + OAuth2)
- TMDB API key (free at themoviedb.org)

### 1. Discord Application Setup

1. Go to https://discord.com/developers/applications
2. Create a new application
3. **Bot tab:**
   - Add Bot
   - Enable "Message Content Intent"
   - Enable "Server Members Intent"
   - Copy the bot token
4. **OAuth2 tab:**
   - Copy Client ID and Client Secret
   - Add redirect URLs:
     - `http://localhost:3001/auth/callback` (dev)
     - `https://your-backend.railway.app/auth/callback` (prod)
5. **Invite bot to server:**
   - OAuth2 → URL Generator
   - Scopes: `bot`, `applications.commands`
   - Bot Permissions: `Send Messages`, `Embed Links`
   - Use generated URL to invite

### 2. Database Setup

Create a PostgreSQL database. If using Railway, create a new PostgreSQL service.

### 3. Environment Variables

Copy `.env.example` to `.env` in each directory:

**backend/.env**
```
DATABASE_URL=postgresql://user:password@host:5432/movienight
DISCORD_CLIENT_ID=your_client_id
DISCORD_CLIENT_SECRET=your_client_secret
JWT_SECRET=random_secure_string_here
FRONTEND_URL=http://localhost:5173
TMDB_API_KEY=your_tmdb_api_key
PORT=3001
```

**bot/.env**
```
DISCORD_TOKEN=your_bot_token
DISCORD_CLIENT_ID=your_client_id
DATABASE_URL=postgresql://user:password@host:5432/movienight
GUILD_ID=your_dev_server_id
ANNOUNCEMENT_CHANNEL_ID=your_announcement_channel_id
```

**frontend/.env**
```
VITE_API_URL=http://localhost:3001
VITE_DISCORD_CLIENT_ID=your_client_id
VITE_GUILD_ID=your_server_id
```

### 4. Install Dependencies

```bash
cd backend && npm install
cd ../bot && npm install
cd ../frontend && npm install
```

### 5. Run Database Migrations

```bash
cd backend
npm run db:migrate
```

### 6. Deploy Bot Commands

```bash
cd bot
npm run deploy
```

### 7. Start Services

**Development (3 terminals):**

```bash
# Terminal 1 - Backend
cd backend && npm run dev

# Terminal 2 - Bot
cd bot && npm run dev

# Terminal 3 - Frontend
cd frontend && npm run dev
```

Open http://localhost:5173

## Railway Deployment

### Backend Service

1. Create new service from GitHub repo
2. Set root directory: `backend`
3. Add environment variables
4. Build command: `npm install`
5. Start command: `npm start`

### Bot Service

1. Create new service from GitHub repo
2. Set root directory: `bot`
3. Add environment variables
4. Build command: `npm install && npm run deploy`
5. Start command: `npm start`

### Frontend Service

1. Create new service from GitHub repo
2. Set root directory: `frontend`
3. Add environment variables
4. Build command: `npm install && npm run build`
5. Start command: `npm run preview -- --host --port $PORT`

Or deploy frontend to Vercel/Netlify for better static hosting.

## Usage

### Quick Start
1. Log in to the website with Discord
2. Click "Announce New Movie Night" to schedule a movie
3. Or start a vote to let everyone pick together
4. Mark your attendance on upcoming movies
5. Rate movies after watching (ratings unlock when movie night starts)

### Scheduling Movies
- **From website:** Click "Announce New Movie Night", search for a movie, pick date/time
- **From wishlist:** Add movies to your wishlist, then schedule directly from there
- **From voting:** Start a vote, let everyone add suggestions and vote, end vote to schedule winner
- **From Discord:** Use `/announce "Movie Title" "2024-01-20 20:00"`

**Note:** Announcements scheduled from the website can take up to 5 minutes to appear in Discord and on the site (bot checks for pending announcements every 5 minutes).

### Rating Movies
- Click rating buttons on Discord announcements
- Use `/rate` command for precise half-point ratings
- Rate on the website movie detail page
- Ratings are only available after the movie night has started

## License

MIT
