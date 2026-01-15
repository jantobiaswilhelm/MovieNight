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
        scheduled_at TIMESTAMP NOT NULL,
        announced_by INTEGER REFERENCES users(id),
        guild_id VARCHAR(20) NOT NULL,
        channel_id VARCHAR(20),
        message_id VARCHAR(20),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

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
