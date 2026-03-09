import pg from 'pg';
const { Pool } = pg;

const sslConfig = (() => {
  if (process.env.NODE_ENV !== 'production') return false;
  if (process.env.DATABASE_CA_CERT) {
    return { rejectUnauthorized: true, ca: process.env.DATABASE_CA_CERT };
  }
  // Railway and similar PaaS providers may not provide a CA cert.
  // Set DATABASE_CA_CERT to enable full verification.
  return { rejectUnauthorized: false };
})();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: sslConfig
});

export default pool;
