const { Pool } = require('pg');
require('dotenv').config();

// Determine execution context
const isTestContext = process.env.NODE_ENV === 'test' ||
                      process.env.npm_lifecycle_event === 'test' ||
                      (process.argv[1] && /[\\/]tests[\\/]/.test(process.argv[1]));

let connectionString;

if (isTestContext) {
  // STRICT TEST SAFETY ENFORCEMENT:
  // When running in a test context, config/db.js strictly REFUSES to connect
  // to application DATABASE_URL. It mandates DATABASE_URL_TEST via testSafetyGuard.
  const { validateTestEnvironmentConfig } = require('../tests/helpers/testSafetyGuard');
  const validated = validateTestEnvironmentConfig();
  connectionString = validated.connectionString;
} else {
  // Application Runtime (Production / Staging / Local Dev Server)
  connectionString = process.env.DATABASE_URL || `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`;

  if (!process.env.DATABASE_URL && !process.env.DB_HOST) {
    console.error('❌ CRITICAL: No database connection information found in environment variables!');
  }
}

const pool = new Pool({
  connectionString: connectionString,
  ssl: {
    rejectUnauthorized: false
  },
  // --- DATABASE STABILIZATION (Enterprise Tier) ---
  // Increased timeout to mitigate Railway proxy ETIMEDOUT errors
  connectionTimeoutMillis: 10000, // 10s wait for new connection
  idleTimeoutMillis: 30000,    // 30s before closing idle connection
  max: 20,                     // Limit concurrent connections to avoid Railway proxy saturation
});

pool.on('connect', () => {
  console.log('Connected to PostgreSQL');
});

pool.on('error', (err) => {
  console.error('PostgreSQL connection error:', err);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
  connect: () => pool.connect()
};
