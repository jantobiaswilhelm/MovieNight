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
        description TEXT,
        tmdb_id INTEGER,
        tmdb_rating DECIMAL(3,1),
        genres VARCHAR(255),
        runtime INTEGER,
        release_year INTEGER,
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
    const tmdbColumns = ['description', 'tmdb_id', 'tmdb_rating', 'genres', 'runtime', 'release_year'];
    for (const col of tmdbColumns) {
      const check = await client.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'movie_nights' AND column_name = $1
      `, [col]);
      if (check.rows.length === 0) {
        let colType = 'TEXT';
        if (col === 'tmdb_id' || col === 'runtime' || col === 'release_year') colType = 'INTEGER';
        if (col === 'tmdb_rating') colType = 'DECIMAL(3,1)';
        if (col === 'genres') colType = 'VARCHAR(255)';
        await client.query(`ALTER TABLE movie_nights ADD COLUMN ${col} ${colType}`);
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
        description TEXT,
        tmdb_id INTEGER,
        tmdb_rating DECIMAL(3,1),
        genres VARCHAR(255),
        runtime INTEGER,
        release_year INTEGER,
        suggested_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Add TMDB columns to movie_suggestions if they don't exist
    const suggestionTmdbColumns = ['description', 'tmdb_id', 'tmdb_rating', 'genres', 'runtime', 'release_year'];
    for (const col of suggestionTmdbColumns) {
      const check = await client.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'movie_suggestions' AND column_name = $1
      `, [col]);
      if (check.rows.length === 0) {
        let colType = 'TEXT';
        if (col === 'tmdb_id' || col === 'runtime' || col === 'release_year') colType = 'INTEGER';
        if (col === 'tmdb_rating') colType = 'DECIMAL(3,1)';
        if (col === 'genres') colType = 'VARCHAR(255)';
        await client.query(`ALTER TABLE movie_suggestions ADD COLUMN ${col} ${colType}`);
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
