const test = require('node:test');
const assert = require('node:assert/strict');
const { Pool } = require('pg');

/**
 * Phase 1 Integration Tests — Strictly Isolated PostgreSQL Harness
 *
 * RIGID SAFETY CONTRACT:
 * 1. Checks that TEST_DATABASE_URL is explicitly set.
 * 2. Positively verifies host is on the approved local whitelist ('localhost', '127.0.0.1', '::1', 'postgres-test').
 * 3. Never connects or exposes credentials in output/logs.
 * 4. Checks current_database() and inet_server_addr() upon connection to verify local identity.
 * 5. Refuses execution if anything points to a cloud/production host (Railway, AWS, etc.).
 */

const testDbUrl = process.env.TEST_DATABASE_URL;

const APPROVED_HOSTS = ['localhost', '127.0.0.1', '::1', 'postgres-test'];

test('Phase 1: Isolated PostgreSQL Multi-Tenant Integration Tests', async (t) => {
  if (!testDbUrl) {
    t.diagnostic('STATUS: BLOCKED / SKIPPED — TEST_DATABASE_URL is not provided.');
    t.diagnostic('Execution safely halted. No write operations performed against any database.');
    return;
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(testDbUrl);
  } catch (e) {
    t.diagnostic(`STATUS: BLOCKED — Invalid TEST_DATABASE_URL format: ${e.message}`);
    return;
  }

  const hostname = parsedUrl.hostname.toLowerCase();

  // Guard 1: Must match approved local test whitelist
  if (!APPROVED_HOSTS.includes(hostname)) {
    t.diagnostic(`SAFETY REFUSAL: Host '${hostname}' is not in the approved local test whitelist (${APPROVED_HOSTS.join(', ')}).`);
    assert.fail(`SAFETY_ABORT: Refusing to run tests against non-whitelisted host: ${hostname}`);
  }

  const pool = new Pool({ connectionString: testDbUrl });

  t.after(async () => {
    await pool.end();
  });

  // Guard 2: Verify server identity and database name before ANY writes
  await t.test('Preflight Identity & Isolation Verification', async () => {
    const res = await pool.query('SELECT current_database(), current_user, inet_server_addr()::text as server_ip');
    const { current_database, current_user, server_ip } = res.rows[0];

    // Ensure database name explicitly indicates a test database
    if (!current_database.toLowerCase().includes('test')) {
      assert.fail(`SAFETY_ABORT: Target database '${current_database}' does not contain 'test' in its name. Aborting.`);
    }

    t.diagnostic(`Verified test database identity: db='${current_database}', user='${current_user}', server_ip='${server_ip || 'local socket'}'`);
  });

  // Suite: DocumentSequencer Concurrency under isolated PostgreSQL
  await t.test('DocumentSequencer Concurrency & Partial Indexes (20 Parallel Connections)', async (t2) => {
    const { nextSequence } = require('../src/infrastructure/sequencing/DocumentSequencer');

    // Run 20 concurrent transactions using independent pool clients
    const concurrency = 20;
    const tenantA = 'tenant-test-a';
    const tenantB = 'tenant-test-b';
    const fiscalYear = 2026;

    // A. 20 concurrent calls for Tenant A with branchId: null
    const promisesA = Array.from({ length: concurrency }).map(async () => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const num = await nextSequence(client, {
          tenantId: tenantA,
          branchId: null,
          docType: 'QUO',
          fiscalYear
        });
        await client.query('COMMIT');
        return num;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    });

    const resultsA = await Promise.all(promisesA);

    // Verify all 20 numbers are unique
    const uniqueA = new Set(resultsA);
    assert.equal(uniqueA.size, concurrency, 'All 20 generated sequence numbers must be distinct');

    // Verify only 1 counter row exists for (tenantA, 'QUO', 2026) with branch_id IS NULL
    const checkA = await pool.query(
      `SELECT last_sequence FROM document_sequences WHERE tenant_id = $1 AND doc_type = 'QUO' AND fiscal_year = $2 AND branch_id IS NULL`,
      [tenantA, fiscalYear]
    );
    assert.equal(checkA.rows.length, 1, 'Exactly one counter row must exist for branch_id IS NULL');
    assert.equal(checkA.rows[0].last_sequence, concurrency, `Counter last_sequence must equal ${concurrency}`);

    // B. Tenant B starts independently
    const clientB = await pool.connect();
    try {
      await clientB.query('BEGIN');
      const numB = await nextSequence(clientB, {
        tenantId: tenantB,
        branchId: null,
        docType: 'QUO',
        fiscalYear
      });
      await clientB.query('COMMIT');
      assert.equal(numB, 'QUO-2026-00001', 'Tenant B sequence must start independently at 00001');
    } finally {
      clientB.release();
    }
  });
});
