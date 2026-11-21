/**
 * tests/helpers/testDb.js
 * 
 * CENTRALIZED TEST DATABASE CONNECTION HELPER (Phase S.2)
 * 
 * Architectural Mandates:
 * 1. Requires DATABASE_URL_TEST (never silently falls back to DATABASE_URL).
 * 2. Rejects canonical PROD_HOST ('reseau.proxy.rlwy.net').
 * 3. Rejects identical test and production connection strings.
 * 4. Strictly validates live database identity against approved test databases (tashgheel_crm_test, tashgheel_crm_dev).
 * 5. Fails closed if any identity check fails.
 * 6. Provides pooled clients and automatic verification for all integration tests.
 */

const { Pool } = require('pg');
const {
  validateTestEnvironmentConfig,
  validateLiveDatabaseSession,
  enforceTestSafetyGate,
  PROD_HOST,
  DEFAULT_APPROVED_TEST_DATABASES
} = require('./testSafetyGuard');

let _testPool = null;

/**
 * Returns a validated singleton Pool bound strictly to DATABASE_URL_TEST.
 * Throws a fatal exception if the environment fails security validation.
 * 
 * @param {Object} [customOptions={}] Additional Pool options
 * @returns {Pool} Validated test pg.Pool instance
 */
function getTestPool(customOptions = {}) {
  const { connectionString } = validateTestEnvironmentConfig();

  if (!_testPool) {
    _testPool = new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 10000,
      max: 10,
      ...customOptions
    });

    _testPool.on('error', (err) => {
      console.error('Test Pool Error:', err.message);
    });
  }

  return _testPool;
}

/**
 * Acquires a client from the test pool and immediately verifies live engine telemetry.
 * 
 * @param {Object} [customOptions={}]
 * @returns {Promise<import('pg').PoolClient>}
 */
async function getTestClient(customOptions = {}) {
  const pool = getTestPool(customOptions);
  const client = await pool.connect();
  try {
    await validateLiveDatabaseSession(client);
    return client;
  } catch (err) {
    client.release();
    throw err;
  }
}

/**
 * Closes the singleton test pool if active.
 */
async function closeTestPool() {
  if (_testPool) {
    const p = _testPool;
    _testPool = null;
    await p.end();
  }
}

/**
 * Ensures that test execution context is active and config/db.js cannot accidentally bind to production.
 */
function initTestContext() {
  process.env.NODE_ENV = 'test';
  return validateTestEnvironmentConfig();
}

module.exports = {
  getTestPool,
  getTestClient,
  closeTestPool,
  initTestContext,
  validateTestEnvironmentConfig,
  validateLiveDatabaseSession,
  enforceTestSafetyGate,
  PROD_HOST,
  DEFAULT_APPROVED_TEST_DATABASES
};
