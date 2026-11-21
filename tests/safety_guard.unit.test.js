/**
 * tests/safety_guard.unit.test.js
 * 
 * PURE MOCK UNIT TEST SUITE FOR REPOSITORY SAFETY GUARD
 * 
 * Safety Verification:
 * - ZERO database connections.
 * - ZERO network calls.
 * - Evaluates all security invariants against mock configurations.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  PROD_HOST,
  DEFAULT_APPROVED_TEST_DATABASES,
  validateTestEnvironmentConfig,
  validateLiveDatabaseSession,
  enforceTestSafetyGate
} = require('./helpers/testSafetyGuard');

test('Safety Guard Unit Test Suite (Zero-DB Mock Isolation)', async (t) => {

  await t.test('1. Environment Configuration: Should reject if NODE_ENV is "production"', () => {
    assert.throws(
      () => validateTestEnvironmentConfig({
        env: {
          NODE_ENV: 'production',
          DATABASE_URL_TEST: 'postgresql://postgres:pass@localhost:5432/tashgheel_crm_test'
        }
      }),
      /NODE_ENV is set to production/i
    );
  });

  await t.test('2. Environment Configuration: Should reject if DATABASE_URL_TEST is missing or empty', () => {
    // Missing
    assert.throws(
      () => validateTestEnvironmentConfig({
        env: {
          NODE_ENV: 'development',
          DATABASE_URL: 'postgresql://postgres:pass@localhost:5432/tashgheel_crm'
        }
      }),
      /DATABASE_URL_TEST is not configured/i
    );

    // Empty string
    assert.throws(
      () => validateTestEnvironmentConfig({
        env: {
          NODE_ENV: 'development',
          DATABASE_URL_TEST: '   ',
          DATABASE_URL: 'postgresql://postgres:pass@localhost:5432/tashgheel_crm'
        }
      }),
      /DATABASE_URL_TEST is not configured/i
    );
  });

  await t.test('3. Environment Configuration: Should strictly reject canonical PROD_HOST ("reseau.proxy.rlwy.net")', () => {
    assert.throws(
      () => validateTestEnvironmentConfig({
        env: {
          NODE_ENV: 'development',
          DATABASE_URL_TEST: `postgresql://postgres:secret@${PROD_HOST}:29141/tashgheel_crm_test`,
          DATABASE_URL: 'postgresql://postgres:secret@localhost:5432/tashgheel_crm'
        }
      }),
      /points to canonical PROD_HOST/i
    );
  });

  await t.test('4. Environment Configuration: Should reject if DATABASE_URL_TEST matches DATABASE_URL', () => {
    const identicalUrl = 'postgresql://postgres:secret@localhost:5432/tashgheel_crm';
    assert.throws(
      () => validateTestEnvironmentConfig({
        env: {
          NODE_ENV: 'development',
          DATABASE_URL_TEST: identicalUrl,
          DATABASE_URL: identicalUrl
        }
      }),
      /identical to production DATABASE_URL/i
    );
  });

  await t.test('5. Environment Configuration: Should accept valid isolated test database config', () => {
    const validTestUrl = 'postgresql://postgres:pass@localhost:5432/tashgheel_crm_test';
    const result = validateTestEnvironmentConfig({
      env: {
        NODE_ENV: 'test',
        DATABASE_URL_TEST: validTestUrl,
        DATABASE_URL: 'postgresql://postgres:secret@reseau.proxy.rlwy.net:29141/tashgheel_crm'
      }
    });

    assert.equal(result.ok, true);
    assert.equal(result.connectionString, validTestUrl);
  });

  await t.test('6. Dynamic DB Verification: Should strictly reject production database name "tashgheel_crm"', async () => {
    const mockClient = {
      query: async () => ({
        rows: [{
          db_name: 'tashgheel_crm',
          server_ip: '127.0.0.1',
          server_port: 5432
        }]
      })
    };

    await assert.rejects(
      async () => validateLiveDatabaseSession(mockClient),
      /is NOT in approved test database allowlist/i
    );
  });

  await t.test('7. Dynamic DB Verification: Should reject if database identity telemetry fails to resolve', async () => {
    // Missing db_name
    const mockClientNoDb = {
      query: async () => ({
        rows: [{
          db_name: null,
          server_ip: '127.0.0.1',
          server_port: 5432
        }]
      })
    };

    await assert.rejects(
      async () => validateLiveDatabaseSession(mockClientNoDb),
      /Unable to resolve live database identity telemetry/i
    );

    // Missing server_ip
    const mockClientNoIp = {
      query: async () => ({
        rows: [{
          db_name: 'tashgheel_crm_test',
          server_ip: null,
          server_port: 5432
        }]
      })
    };

    await assert.rejects(
      async () => validateLiveDatabaseSession(mockClientNoIp),
      /Unable to resolve live database identity telemetry/i
    );
  });

  await t.test('8. Dynamic DB Verification: Should accept approved test database ("tashgheel_crm_test")', async () => {
    const mockClientValid = {
      query: async () => ({
        rows: [{
          db_name: 'tashgheel_crm_test',
          server_ip: '127.0.0.1',
          server_port: 5432
        }]
      })
    };

    const session = await validateLiveDatabaseSession(mockClientValid);
    assert.equal(session.ok, true);
    assert.equal(session.db_name, 'tashgheel_crm_test');
    assert.equal(session.server_ip, '127.0.0.1');
    assert.equal(session.server_port, 5432);
  });

  await t.test('9. Unified Guard Enforcer: Successfully runs both checks when valid', async () => {
    const validTestUrl = 'postgresql://postgres:test@127.0.0.1:5433/tashgheel_crm_test';
    const mockClient = {
      query: async () => ({
        rows: [{
          db_name: 'tashgheel_crm_test',
          server_ip: '127.0.0.1',
          server_port: 5433
        }]
      })
    };

    const result = await enforceTestSafetyGate(mockClient, {
      env: {
        NODE_ENV: 'test',
        DATABASE_URL_TEST: validTestUrl,
        DATABASE_URL: 'postgresql://postgres:secret@reseau.proxy.rlwy.net:29141/tashgheel_crm'
      }
    });

    assert.equal(result.ok, true);
    assert.equal(result.connectionString, validTestUrl);
    assert.equal(result.session.db_name, 'tashgheel_crm_test');
  });

});
