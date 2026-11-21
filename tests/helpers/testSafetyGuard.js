/**
 * tests/helpers/testSafetyGuard.js
 * 
 * CANONICAL REPOSITORY TEST SAFETY GUARD
 * 
 * Purpose:
 * Strictly prevents automated tests and diagnostic scripts from connecting
 * to or executing against the Production PostgreSQL cluster.
 * 
 * Safety Policy Enforcement:
 * 1. NODE_ENV must not be 'production'.
 * 2. DATABASE_URL_TEST is mandatory for real DB tests (no silent fallback to DATABASE_URL).
 * 3. Rejects canonical PROD_HOST ('reseau.proxy.rlwy.net').
 * 4. Rejects identical DATABASE_URL_TEST and DATABASE_URL (unless on approved staging like 'turntable.proxy.rlwy.net').
 * 5. Dynamic DB verification: Only explicitly approved test databases are permitted (e.g. 'tashgheel_crm_test', 'tashgheel_crm_dev').
 *    The production database name 'tashgheel_crm' is strictly rejected.
 * 6. Fails closed if database identity cannot be resolved.
 */

const PROD_HOST = 'reseau.proxy.rlwy.net';
const DEFAULT_APPROVED_TEST_DATABASES = ['tashgheel_crm_test', 'tashgheel_crm_dev'];

/**
 * Validates environment variables before any connection attempt.
 * Pure function: can be evaluated with mock env for zero-connection unit testing.
 * 
 * @param {Object} options
 * @param {Object} [options.env=process.env]
 * @returns {{ ok: boolean, connectionString: string }}
 */
function validateTestEnvironmentConfig({ env = process.env } = {}) {
  // 1. Production environment check
  if (env.NODE_ENV === 'production') {
    throw new Error('FATAL SECURITY ABORT: NODE_ENV is set to production. Test execution refused.');
  }

  const testDbUrl = env.DATABASE_URL_TEST;

  // 2. Mandatory DATABASE_URL_TEST check (fail-closed, no fallback to DATABASE_URL)
  if (!testDbUrl || typeof testDbUrl !== 'string' || testDbUrl.trim() === '') {
    throw new Error('FATAL SECURITY ABORT: DATABASE_URL_TEST is not configured. Real database tests strictly refuse to run against fallback DATABASE_URL.');
  }

  // 3. Rejection of canonical PROD_HOST
  if (testDbUrl.includes(PROD_HOST)) {
    throw new Error(`FATAL SECURITY ABORT: DATABASE_URL_TEST points to canonical PROD_HOST (${PROD_HOST}). Execution strictly refused.`);
  }

  // 4. Rejection of identical test and production URLs
  const prodDbUrl = env.DATABASE_URL;
  if (prodDbUrl && testDbUrl === prodDbUrl && !testDbUrl.includes('turntable.proxy.rlwy.net')) {
    throw new Error('FATAL SECURITY ABORT: DATABASE_URL_TEST is identical to production DATABASE_URL. Execution strictly refused.');
  }

  return { ok: true, connectionString: testDbUrl };
}

/**
 * Validates dynamic PostgreSQL connection telemetry.
 * 
 * @param {Object} client Database client or pool with .query() method
 * @param {Object} [options]
 * @param {string[]} [options.allowedDatabases]
 * @returns {Promise<{ ok: boolean, db_name: string, server_ip: string, server_port: number }>}
 */
async function validateLiveDatabaseSession(client, { allowedDatabases = DEFAULT_APPROVED_TEST_DATABASES } = {}) {
  if (!client || typeof client.query !== 'function') {
    throw new Error('FATAL SECURITY ABORT: Invalid database client provided for safety validation.');
  }

  const identRes = await client.query(`
    SELECT 
      current_database() as db_name,
      inet_server_addr() as server_ip,
      inet_server_port() as server_port
  `);

  const row = identRes?.rows?.[0] || {};
  const { db_name, server_ip, server_port } = row;

  if (!db_name || !server_ip || !server_port) {
    throw new Error('FATAL SECURITY ABORT: Unable to resolve live database identity telemetry.');
  }

  if (!allowedDatabases.includes(db_name)) {
    throw new Error(`FATAL SECURITY ABORT: Database "${db_name}" is NOT in approved test database allowlist: [${allowedDatabases.join(', ')}]. Production database "tashgheel_crm" is strictly forbidden.`);
  }

  return {
    ok: true,
    db_name,
    server_ip: String(server_ip),
    server_port: Number(server_port)
  };
}

/**
 * Unified Safety Gate Enforcer
 * Validates config first, then live session if client is provided.
 */
async function enforceTestSafetyGate(client = null, { env = process.env, allowedDatabases = DEFAULT_APPROVED_TEST_DATABASES } = {}) {
  const configCheck = validateTestEnvironmentConfig({ env });
  let sessionCheck = null;

  if (client) {
    sessionCheck = await validateLiveDatabaseSession(client, { allowedDatabases });
  }

  return {
    ok: true,
    connectionString: configCheck.connectionString,
    session: sessionCheck
  };
}

module.exports = {
  PROD_HOST,
  DEFAULT_APPROVED_TEST_DATABASES,
  validateTestEnvironmentConfig,
  validateLiveDatabaseSession,
  enforceTestSafetyGate
};
