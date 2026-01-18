import 'dotenv/config';
import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
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

    // Indexes
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
