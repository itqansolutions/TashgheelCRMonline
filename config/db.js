const { Pool } = require('pg');
require('dotenv').config();

const connectionString = process.env.DATABASE_URL || `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`;

if (!process.env.DATABASE_URL && !process.env.DB_HOST) {
  console.error('❌ CRITICAL: No database connection information found in environment variables!');
}

const pool = new Pool({
  connectionString: connectionString,
  ssl: {
    rejectUnauthorized: false
  }
});

pool.on('connect', () => {
  console.log('Connected to PostgreSQL');
});

pool.on('error', (err) => {
  console.error('PostgreSQL connection error:', err);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool
};
