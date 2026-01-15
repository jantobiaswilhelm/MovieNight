# Movie Night Tracker

A Discord bot + web app for tracking movie nights with your server. Rate movies, view history, and see stats.

## Features

- **Discord Bot**
  - `/announce` - Announce movie nights with countdown
  - `/rate` - Rate movies (1-10 with 0.5 increments)
  - `/history` - View past movie nights
  - `/stats` - Server statistics
  - `/myratings` - Your personal ratings
  - Rating buttons after announcements

- **Web App**
  - Login with Discord
  - View all movie nights
  - Submit/update ratings
  - Personal stats and history

## Project Structure

```
MovieNight/
├── backend/    # Express.js API
├── bot/        # Discord.js bot
└── frontend/   # React app
```

## Setup

### Prerequisites

- Node.js 18+
- PostgreSQL database
- Discord application (bot + OAuth2)

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
PORT=3001
```

**bot/.env**
```
DISCORD_TOKEN=your_bot_token
DISCORD_CLIENT_ID=your_client_id
DATABASE_URL=postgresql://user:password@host:5432/movienight
GUILD_ID=your_dev_server_id
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

1. Use `/announce "Movie Title" "2024-01-20 20:00"` in Discord
2. Rating buttons appear - click to rate
3. Use `/rate` for half-point ratings (7.5, 8.5, etc.)
4. View history and stats with `/history` and `/stats`
5. Visit the web app to see everything in one place

## License

MIT
