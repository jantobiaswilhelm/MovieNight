import 'dotenv/config';
import pg from 'pg';
const { Pool } = pg;

const sslConfig = (() => {
  if (process.env.NODE_ENV !== 'production') return false;
  if (process.env.DATABASE_CA_CERT) {
    return { rejectUnauthorized: true, ca: process.env.DATABASE_CA_CERT };
  }
  return { rejectUnauthorized: false };
})();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: sslConfig
});

const migrate = async () => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        discord_id VARCHAR(20) UNIQUE NOT NULL,
        username VARCHAR(100) NOT NULL,
        avatar VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Movie nights table
    await client.query(`
      CREATE TABLE IF NOT EXISTS movie_nights (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        image_url VARCHAR(500),
        backdrop_url VARCHAR(500),
        description TEXT,
        tagline VARCHAR(500),
        tmdb_id INTEGER,
        imdb_id VARCHAR(20),
        tmdb_rating DECIMAL(3,1),
        genres VARCHAR(255),
        runtime INTEGER,
        release_year INTEGER,
        original_language VARCHAR(10),
        collection_name VARCHAR(255),
        trailer_url VARCHAR(500),
        scheduled_at TIMESTAMP NOT NULL,
        started_at TIMESTAMP,
        announced_by INTEGER REFERENCES users(id),
        guild_id VARCHAR(20) NOT NULL,
        channel_id VARCHAR(20),
        message_id VARCHAR(20),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Add started_at column if it doesn't exist (for existing databases)
    const columnCheck = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'movie_nights' AND column_name = 'started_at'
    `);
    if (columnCheck.rows.length === 0) {
      await client.query(`ALTER TABLE movie_nights ADD COLUMN started_at TIMESTAMP`);
    }

    // Add rating_prompt_sent_at column if it doesn't exist
    const ratingPromptCheck = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'movie_nights' AND column_name = 'rating_prompt_sent_at'
    `);
    if (ratingPromptCheck.rows.length === 0) {
      await client.query(`ALTER TABLE movie_nights ADD COLUMN rating_prompt_sent_at TIMESTAMP`);
    }

    // Add TMDB columns to movie_nights if they don't exist
    const tmdbColumns = [
      { name: 'description', type: 'TEXT' },
      { name: 'tmdb_id', type: 'INTEGER' },
      { name: 'tmdb_rating', type: 'DECIMAL(3,1)' },
      { name: 'genres', type: 'VARCHAR(255)' },
      { name: 'runtime', type: 'INTEGER' },
      { name: 'release_year', type: 'INTEGER' },
      { name: 'backdrop_url', type: 'VARCHAR(500)' },
      { name: 'tagline', type: 'VARCHAR(500)' },
      { name: 'imdb_id', type: 'VARCHAR(20)' },
      { name: 'original_language', type: 'VARCHAR(10)' },
      { name: 'collection_name', type: 'VARCHAR(255)' },
      { name: 'trailer_url', type: 'VARCHAR(500)' }
    ];
    for (const col of tmdbColumns) {
      const check = await client.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'movie_nights' AND column_name = $1
      `, [col.name]);
      if (check.rows.length === 0) {
        await client.query(`ALTER TABLE movie_nights ADD COLUMN ${col.name} ${col.type}`);
      }
    }

    // Ratings table
    await client.query(`
      CREATE TABLE IF NOT EXISTS ratings (
        id SERIAL PRIMARY KEY,
        movie_night_id INTEGER REFERENCES movie_nights(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id),
        score DECIMAL(3,1) CHECK (score >= 1 AND score <= 10),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(movie_night_id, user_id)
      )
    `);

    // Voting sessions table
    await client.query(`
      CREATE TABLE IF NOT EXISTS voting_sessions (
        id SERIAL PRIMARY KEY,
        guild_id VARCHAR(20) NOT NULL,
        channel_id VARCHAR(20),
        message_id VARCHAR(20),
        scheduled_at TIMESTAMP NOT NULL,
        status VARCHAR(20) DEFAULT 'open',
        created_by INTEGER REFERENCES users(id),
        winner_id INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        closed_at TIMESTAMP
      )
    `);

    // Movie suggestions table
    await client.query(`
      CREATE TABLE IF NOT EXISTS movie_suggestions (
        id SERIAL PRIMARY KEY,
        voting_session_id INTEGER REFERENCES voting_sessions(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        image_url VARCHAR(500),
        backdrop_url VARCHAR(500),
        description TEXT,
        tagline VARCHAR(500),
        tmdb_id INTEGER,
        imdb_id VARCHAR(20),
        tmdb_rating DECIMAL(3,1),
        genres VARCHAR(255),
        runtime INTEGER,
        release_year INTEGER,
        original_language VARCHAR(10),
        collection_name VARCHAR(255),
        trailer_url VARCHAR(500),
        suggested_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Add TMDB columns to movie_suggestions if they don't exist
    const suggestionTmdbColumns = [
      { name: 'description', type: 'TEXT' },
      { name: 'tmdb_id', type: 'INTEGER' },
      { name: 'tmdb_rating', type: 'DECIMAL(3,1)' },
      { name: 'genres', type: 'VARCHAR(255)' },
      { name: 'runtime', type: 'INTEGER' },
      { name: 'release_year', type: 'INTEGER' },
      { name: 'backdrop_url', type: 'VARCHAR(500)' },
      { name: 'tagline', type: 'VARCHAR(500)' },
      { name: 'imdb_id', type: 'VARCHAR(20)' },
      { name: 'original_language', type: 'VARCHAR(10)' },
      { name: 'collection_name', type: 'VARCHAR(255)' },
      { name: 'trailer_url', type: 'VARCHAR(500)' }
    ];
    for (const col of suggestionTmdbColumns) {
      const check = await client.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'movie_suggestions' AND column_name = $1
      `, [col.name]);
      if (check.rows.length === 0) {
        await client.query(`ALTER TABLE movie_suggestions ADD COLUMN ${col.name} ${col.type}`);
      }
    }

    // Votes table
    await client.query(`
      CREATE TABLE IF NOT EXISTS votes (
        id SERIAL PRIMARY KEY,
        suggestion_id INTEGER REFERENCES movie_suggestions(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(suggestion_id, user_id)
      )
    `);

    // Wishlists table
    await client.query(`
      CREATE TABLE IF NOT EXISTS wishlists (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        guild_id VARCHAR(20) NOT NULL,
        title VARCHAR(255) NOT NULL,
        image_url VARCHAR(500),
        backdrop_url VARCHAR(500),
        description TEXT,
        tmdb_id INTEGER,
        imdb_id VARCHAR(20),
        tmdb_rating DECIMAL(3,1),
        genres VARCHAR(255),
        runtime INTEGER,
        release_year INTEGER,
        trailer_url VARCHAR(500),
        importance INTEGER CHECK (importance >= 1 AND importance <= 5) DEFAULT 3,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, tmdb_id, guild_id)
      )
    `);

    // Pending announcements table (for web-created announcements that bot will post)
    await client.query(`
      CREATE TABLE IF NOT EXISTS pending_announcements (
        id SERIAL PRIMARY KEY,
        guild_id VARCHAR(20) NOT NULL,
        channel_id VARCHAR(20),
        user_id INTEGER REFERENCES users(id),
        wishlist_id INTEGER REFERENCES wishlists(id) ON DELETE SET NULL,
        title VARCHAR(255) NOT NULL,
        image_url VARCHAR(500),
        backdrop_url VARCHAR(500),
        description TEXT,
        tmdb_id INTEGER,
        imdb_id VARCHAR(20),
        tmdb_rating DECIMAL(3,1),
        genres VARCHAR(255),
        runtime INTEGER,
        release_year INTEGER,
        trailer_url VARCHAR(500),
        scheduled_at TIMESTAMP NOT NULL,
        status VARCHAR(20) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        processed_at TIMESTAMP
      )
    `);

    // Add wishlist_id column if it doesn't exist (for existing databases)
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'pending_announcements' AND column_name = 'wishlist_id') THEN
          ALTER TABLE pending_announcements ADD COLUMN wishlist_id INTEGER REFERENCES wishlists(id) ON DELETE SET NULL;
        END IF;
      END $$;
    `);

    // Movie attendance table (who's attending a scheduled movie night)
    await client.query(`
      CREATE TABLE IF NOT EXISTS movie_attendance (
        id SERIAL PRIMARY KEY,
        movie_night_id INTEGER REFERENCES movie_nights(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(movie_night_id, user_id)
      )
    `);

    // User favorite movies table (user's top 5 picks)
    // Can reference either a movie_night_id (watched) or store TMDB data directly (any movie)
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_favorite_movies (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        movie_night_id INTEGER REFERENCES movie_nights(id) ON DELETE SET NULL,
        tmdb_id INTEGER,
        title VARCHAR(255),
        image_url VARCHAR(500),
        release_year INTEGER,
        position INTEGER CHECK (position >= 1 AND position <= 5),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, position)
      )
    `);

    // Add tmdb columns to user_favorite_movies if they don't exist (for existing databases)
    const favColumns = [
      { name: 'tmdb_id', type: 'INTEGER' },
      { name: 'title', type: 'VARCHAR(255)' },
      { name: 'image_url', type: 'VARCHAR(500)' },
      { name: 'release_year', type: 'INTEGER' }
    ];
    for (const col of favColumns) {
      const check = await client.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'user_favorite_movies' AND column_name = $1
      `, [col.name]);
      if (check.rows.length === 0) {
        await client.query(`ALTER TABLE user_favorite_movies ADD COLUMN ${col.name} ${col.type}`);
      }
    }

    // Make movie_night_id nullable if it isn't already
    await client.query(`
      ALTER TABLE user_favorite_movies ALTER COLUMN movie_night_id DROP NOT NULL
    `).catch(() => {});

    // Drop the old unique constraint on movie_night_id if it exists
    await client.query(`
      ALTER TABLE user_favorite_movies DROP CONSTRAINT IF EXISTS user_favorite_movies_user_id_movie_night_id_key
    `).catch(() => {});

    // Add comment column to ratings table if it doesn't exist
    const commentColumnCheck = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'ratings' AND column_name = 'comment'
    `);
    if (commentColumnCheck.rows.length === 0) {
      await client.query(`ALTER TABLE ratings ADD COLUMN comment TEXT`);
    }

    // Indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_attendance_movie ON movie_attendance(movie_night_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_attendance_user ON movie_attendance(user_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_ratings_movie ON ratings(movie_night_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_ratings_user ON ratings(user_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_movie_nights_guild ON movie_nights(guild_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_movie_nights_scheduled ON movie_nights(scheduled_at)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_movie_nights_announced_by ON movie_nights(announced_by)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_voting_sessions_guild ON voting_sessions(guild_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_suggestions_session ON movie_suggestions(voting_session_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_votes_suggestion ON votes(suggestion_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_wishlists_user ON wishlists(user_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_wishlists_guild ON wishlists(guild_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_pending_announcements_status ON pending_announcements(status)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_user_favorite_movies_user ON user_favorite_movies(user_id)
    `);

    // Add streak columns to users table
    const streakColumns = [
      { name: 'current_streak', type: 'INTEGER DEFAULT 0' },
      { name: 'longest_streak', type: 'INTEGER DEFAULT 0' },
      { name: 'last_rated_movie_night_id', type: 'INTEGER' }
    ];
    for (const col of streakColumns) {
      const check = await client.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = $1
      `, [col.name]);
      if (check.rows.length === 0) {
        await client.query(`ALTER TABLE users ADD COLUMN ${col.name} ${col.type}`);
      }
    }

    // Rating reactions table
    await client.query(`
      CREATE TABLE IF NOT EXISTS rating_reactions (
        id SERIAL PRIMARY KEY,
        rating_id INTEGER REFERENCES ratings(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        emoji VARCHAR(20) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(rating_id, user_id, emoji)
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_rating_reactions_rating ON rating_reactions(rating_id)
    `);

    // Movie credits table (directors, actors, etc.)
    await client.query(`
      CREATE TABLE IF NOT EXISTS movie_credits (
        id SERIAL PRIMARY KEY,
        movie_night_id INTEGER REFERENCES movie_nights(id) ON DELETE CASCADE,
        person_name VARCHAR(255) NOT NULL,
        person_tmdb_id INTEGER,
        role VARCHAR(20) NOT NULL,
        character_name VARCHAR(255),
        credit_order INTEGER,
        profile_path VARCHAR(255),
        UNIQUE(movie_night_id, person_tmdb_id, role)
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_credits_person ON movie_credits(person_tmdb_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_credits_movie ON movie_credits(movie_night_id)
    `);

    // Custom lists table
    await client.query(`
      CREATE TABLE IF NOT EXISTS custom_lists (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        guild_id VARCHAR(20) NOT NULL,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        is_public BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_custom_lists_user ON custom_lists(user_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_custom_lists_guild ON custom_lists(guild_id)
    `);

    // Custom list items table
    await client.query(`
      CREATE TABLE IF NOT EXISTS custom_list_items (
        id SERIAL PRIMARY KEY,
        list_id INTEGER REFERENCES custom_lists(id) ON DELETE CASCADE,
        tmdb_id INTEGER NOT NULL,
        title VARCHAR(255) NOT NULL,
        image_url VARCHAR(500),
        release_year INTEGER,
        position INTEGER,
        note TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(list_id, tmdb_id)
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_custom_list_items_list ON custom_list_items(list_id)
    `);

    // Achievements table
    await client.query(`
      CREATE TABLE IF NOT EXISTS achievements (
        id SERIAL PRIMARY KEY,
        code VARCHAR(50) UNIQUE NOT NULL,
        name VARCHAR(100) NOT NULL,
        description TEXT NOT NULL,
        icon VARCHAR(50),
        category VARCHAR(30),
        points INTEGER DEFAULT 10,
        is_hidden BOOLEAN DEFAULT false
      )
    `);

    // User achievements table
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_achievements (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        achievement_id INTEGER REFERENCES achievements(id) ON DELETE CASCADE,
        unlocked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, achievement_id)
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_user_achievements_user ON user_achievements(user_id)
    `);

    // Seed achievements if table is empty
    const achievementCount = await client.query('SELECT COUNT(*) FROM achievements');
    if (parseInt(achievementCount.rows[0].count) === 0) {
      await client.query(`
        INSERT INTO achievements (code, name, description, icon, category, points, is_hidden) VALUES
        ('first_rating', 'First Blood', 'Rate your first movie', 'star', 'ratings', 10, false),
        ('ratings_10', 'Dedicated Viewer', 'Rate 10 movies', 'film', 'ratings', 25, false),
        ('ratings_25', 'Movie Enthusiast', 'Rate 25 movies', 'film', 'ratings', 50, false),
        ('ratings_50', 'Movie Buff', 'Rate 50 movies', 'trophy', 'ratings', 100, false),
        ('ratings_100', 'Cinephile', 'Rate 100 movies', 'award', 'ratings', 200, false),
        ('streak_5', 'On Fire', 'Achieve a 5 movie rating streak', 'flame', 'streaks', 25, false),
        ('streak_10', 'Unstoppable', 'Achieve a 10 movie rating streak', 'flame', 'streaks', 50, false),
        ('streak_25', 'Legend', 'Achieve a 25 movie rating streak', 'flame', 'streaks', 100, false),
        ('hot_take', 'Hot Take', 'Give a rating that differs 3+ from the average', 'zap', 'special', 15, false),
        ('contrarian', 'Contrarian', 'Have 5 hot takes', 'zap', 'special', 50, false),
        ('harsh_critic', 'Harsh Critic', 'Have an average rating below 5', 'thumbs-down', 'special', 25, true),
        ('easy_grader', 'Easy Grader', 'Have an average rating above 8', 'thumbs-up', 'special', 25, true),
        ('marathon', 'Marathon Viewer', 'Watch 20+ hours of movies', 'clock', 'watchtime', 50, false),
        ('binge_master', 'Binge Master', 'Watch 50+ hours of movies', 'clock', 'watchtime', 100, false),
        ('collection_fan', 'Collection Fan', 'Watch 3 movies from the same collection', 'folder', 'collections', 25, false),
        ('completionist', 'Completionist', 'Watch an entire movie collection', 'check-circle', 'collections', 100, false),
        ('early_adopter', 'Early Adopter', 'Be among the first 10 users to rate', 'rocket', 'special', 50, true),
        ('night_owl', 'Night Owl', 'Rate a movie after midnight', 'moon', 'special', 15, true),
        ('perfect_ten', 'Perfect 10', 'Give a movie a perfect 10 rating', 'star', 'ratings', 15, false),
        ('tough_crowd', 'Tough Crowd', 'Give a movie a 1 rating', 'thumbs-down', 'ratings', 15, false)
      `);
    }

    // Notifications table
    await client.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        type VARCHAR(50) NOT NULL,
        title VARCHAR(255) NOT NULL,
        message TEXT,
        link VARCHAR(500),
        data JSONB,
        is_read BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, is_read)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC)
    `);

    // User follows table
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_follows (
        id SERIAL PRIMARY KEY,
        follower_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        following_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(follower_id, following_id)
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_user_follows_follower ON user_follows(follower_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_user_follows_following ON user_follows(following_id)
    `);

    // Activity feed table
    await client.query(`
      CREATE TABLE IF NOT EXISTS activity_feed (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        guild_id VARCHAR(20) NOT NULL,
        activity_type VARCHAR(50) NOT NULL,
        reference_id INTEGER,
        data JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_feed(created_at DESC)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_activity_user ON activity_feed(user_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_activity_guild ON activity_feed(guild_id)
    `);

    // Shared wishlists table
    await client.query(`
      CREATE TABLE IF NOT EXISTS shared_wishlists (
        id SERIAL PRIMARY KEY,
        owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        guild_id VARCHAR(20) NOT NULL,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        is_collaborative BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_shared_wishlists_owner ON shared_wishlists(owner_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_shared_wishlists_guild ON shared_wishlists(guild_id)
    `);

    // Shared wishlist members table
    await client.query(`
      CREATE TABLE IF NOT EXISTS shared_wishlist_members (
        id SERIAL PRIMARY KEY,
        wishlist_id INTEGER REFERENCES shared_wishlists(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        can_edit BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(wishlist_id, user_id)
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_shared_wishlist_members_wishlist ON shared_wishlist_members(wishlist_id)
    `);

    // Shared wishlist items table
    await client.query(`
      CREATE TABLE IF NOT EXISTS shared_wishlist_items (
        id SERIAL PRIMARY KEY,
        wishlist_id INTEGER REFERENCES shared_wishlists(id) ON DELETE CASCADE,
        added_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        tmdb_id INTEGER NOT NULL,
        title VARCHAR(255) NOT NULL,
        image_url VARCHAR(500),
        importance INTEGER DEFAULT 3,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(wishlist_id, tmdb_id)
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_shared_wishlist_items_wishlist ON shared_wishlist_items(wishlist_id)
    `);

    // Personal movies table (movies watched independently, not during movie nights)
    await client.query(`
      CREATE TABLE IF NOT EXISTS personal_movies (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        tmdb_id INTEGER NOT NULL,
        title VARCHAR(255) NOT NULL,
        image_url VARCHAR(500),
        release_year INTEGER,
        runtime INTEGER,
        genres VARCHAR(255),
        score DECIMAL(3,1) CHECK (score >= 1 AND score <= 10),
        comment TEXT,
        watched_at DATE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, tmdb_id)
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_personal_movies_user ON personal_movies(user_id)
    `);

    // Guild channels table (cached Discord channel list, written by bot)
    await client.query(`
      CREATE TABLE IF NOT EXISTS guild_channels (
        id SERIAL PRIMARY KEY,
        guild_id VARCHAR(20) NOT NULL,
        channel_id VARCHAR(20) NOT NULL,
        channel_name VARCHAR(100) NOT NULL,
        position INTEGER DEFAULT 0,
        parent_name VARCHAR(100),
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(guild_id, channel_id)
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_guild_channels_guild ON guild_channels(guild_id)
    `);

    // Guild settings table (admin-configured settings per guild)
    await client.query(`
      CREATE TABLE IF NOT EXISTS guild_settings (
        id SERIAL PRIMARY KEY,
        guild_id VARCHAR(20) UNIQUE NOT NULL,
        test_mode BOOLEAN DEFAULT false,
        test_channel_id VARCHAR(20),
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Add is_test column to pending_announcements if it doesn't exist
    const isTestPACheck = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'pending_announcements' AND column_name = 'is_test'
    `);
    if (isTestPACheck.rows.length === 0) {
      await client.query(`ALTER TABLE pending_announcements ADD COLUMN is_test BOOLEAN DEFAULT false`);
    }

    // Add is_test column to movie_nights if it doesn't exist
    const isTestMNCheck = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'movie_nights' AND column_name = 'is_test'
    `);
    if (isTestMNCheck.rows.length === 0) {
      await client.query(`ALTER TABLE movie_nights ADD COLUMN is_test BOOLEAN DEFAULT false`);
    }

    // Add discord_access_token to users for profile refresh
    const tokenCol = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'users' AND column_name = 'discord_access_token'
    `);
    if (tokenCol.rows.length === 0) {
      await client.query(`ALTER TABLE users ADD COLUMN discord_access_token TEXT`);
    }

    // Voice presence tracking for movie nights.
    // Column added without a default, THEN default set — so existing rows keep
    // NULL (grandfathered) while new inserts default to true.
    const voiceTrackingCol = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'movie_nights' AND column_name = 'voice_tracking_enabled'
    `);
    if (voiceTrackingCol.rows.length === 0) {
      await client.query(`ALTER TABLE movie_nights ADD COLUMN voice_tracking_enabled BOOLEAN`);
      await client.query(`ALTER TABLE movie_nights ALTER COLUMN voice_tracking_enabled SET DEFAULT true`);
    }

    await client.query(`
      CREATE TABLE IF NOT EXISTS movie_night_voice_presence (
        id SERIAL PRIMARY KEY,
        movie_night_id INTEGER NOT NULL REFERENCES movie_nights(id) ON DELETE CASCADE,
        user_discord_id VARCHAR(20) NOT NULL,
        joined_at TIMESTAMP NOT NULL,
        left_at TIMESTAMP
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_voice_presence_night_user
      ON movie_night_voice_presence(movie_night_id, user_discord_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_voice_presence_open
      ON movie_night_voice_presence(user_discord_id) WHERE left_at IS NULL
    `);

    await client.query('COMMIT');
    console.log('Migration completed successfully!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
};

migrate();
