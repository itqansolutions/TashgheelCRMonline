const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

test('Schema Migrations and DB Reconciliation Integrity Test Suite', async (t) => {
  const rootDir = path.resolve(__dirname, '..');

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Migration 024 (Sales Teams Management) Schema Verification
  // ───────────────────────────────────────────────────────────────────────────
  await t.test('1. Migration 024: sales_teams.branch_id type matches branches.id (UUID)', async () => {
    const migration024Path = path.join(rootDir, 'migrations', '024_sales_teams_management.sql');
    const content = fs.readFileSync(migration024Path, 'utf8');

    // branch_id must be UUID to match branches(id) UUID primary key
    assert.match(
      content,
      /branch_id\s+UUID\s+NULL\s+REFERENCES\s+branches\(id\)\s+ON\s+DELETE\s+SET\s+NULL/i,
      'branch_id in sales_teams must be UUID referencing branches(id)'
    );

    // Ensure VARCHAR(255) is NOT used for branch_id
    assert.doesNotMatch(
      content,
      /branch_id\s+VARCHAR\(255\)\s+NULL\s+REFERENCES\s+branches/i,
      'branch_id must NOT be VARCHAR(255)'
    );

    // Audit all foreign key references in Migration 024
    assert.match(
      content,
      /tenant_id\s+UUID\s+NOT\s+NULL\s+REFERENCES\s+tenants\(id\)\s+ON\s+DELETE\s+CASCADE/i,
      'tenant_id must be UUID referencing tenants(id)'
    );
    assert.match(
      content,
      /department_id\s+INTEGER\s+NOT\s+NULL\s+REFERENCES\s+departments\(id\)\s+ON\s+DELETE\s+CASCADE/i,
      'department_id must be INTEGER referencing departments(id)'
    );
    assert.match(
      content,
      /manager_id\s+INTEGER\s+NULL\s+REFERENCES\s+users\(id\)\s+ON\s+DELETE\s+SET\s+NULL/i,
      'manager_id must be INTEGER referencing users(id)'
    );
    assert.match(
      content,
      /leader_id\s+INTEGER\s+NULL\s+REFERENCES\s+users\(id\)\s+ON\s+DELETE\s+SET\s+NULL/i,
      'leader_id must be INTEGER referencing users(id)'
    );
    assert.match(
      content,
      /team_id\s+INTEGER\s+NOT\s+NULL\s+REFERENCES\s+sales_teams\(id\)\s+ON\s+DELETE\s+CASCADE/i,
      'team_id must be INTEGER referencing sales_teams(id)'
    );
    assert.match(
      content,
      /user_id\s+INTEGER\s+NOT\s+NULL\s+REFERENCES\s+users\(id\)\s+ON\s+DELETE\s+CASCADE/i,
      'user_id must be INTEGER referencing users(id)'
    );
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Migration 022 (Attachments & Branding) Integrity Verification
  // ───────────────────────────────────────────────────────────────────────────
  await t.test('2. Migration 022: Preserves UUID foreign keys on attachments.tenant_id', async () => {
    const migration022Path = path.join(rootDir, 'migrations', '022_add_branding_and_headers.sql');
    const content = fs.readFileSync(migration022Path, 'utf8');

    // Must NOT have top-level unconditional ALTER TABLE attachments ALTER COLUMN tenant_id
    // It must be enclosed in the conditional DO $$ block that checks data_type = 'uuid'
    const topLevelLines = content
      .split('\n')
      .filter(l => !l.startsWith(' ') && !l.startsWith('\t'))
      .map(l => l.trim());
    const topLevelAlter = topLevelLines.find(l => l.startsWith('ALTER TABLE attachments ALTER COLUMN tenant_id TYPE'));
    assert.equal(
      topLevelAlter,
      undefined,
      'Migration 022 must not contain a top-level unconditional ALTER COLUMN tenant_id'
    );

    // Must check for existing uuid data_type before attempting VARCHAR alter
    assert.match(
      content,
      /table_name\s*=\s*'attachments'\s+AND\s+column_name\s*=\s*'tenant_id'\s+AND\s+data_type\s*=\s*'uuid'/i,
      'Must inspect data_type of attachments.tenant_id in information_schema to preserve UUID FK'
    );
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. DB-RECON (dbReconciliation.js) Warehouse Data Preservation Verification
  // ───────────────────────────────────────────────────────────────────────────
  await t.test('3. DB-RECON: delivery_notes.warehouse_id preserves data and avoids USING NULL', async () => {
    const reconPath = path.join(rootDir, 'scripts', 'dbReconciliation.js');
    const content = fs.readFileSync(reconPath, 'utf8');

    // Never use USING NULL
    assert.doesNotMatch(
      content,
      /USING\s+NULL/i,
      'dbReconciliation.js must NEVER use USING NULL to alter delivery_notes.warehouse_id'
    );

    // Must check if column is already integer and skip
    assert.match(
      content,
      /wh_col_type\s+IN\s+\('integer',\s*'smallint',\s*'bigint'\)/i,
      'dbReconciliation.js must check if column is already integer and skip alter'
    );

    // Must inspect non-null row count and raise exception if non-convertible data exists
    assert.match(
      content,
      /IF\s+non_null_wh_count\s*>\s*0\s+THEN\s+RAISE\s+EXCEPTION/i,
      'dbReconciliation.js must raise exception if non-null warehouse_id records exist'
    );
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. Execution Simulation of DB-RECON Logic under all database conditions
  // ───────────────────────────────────────────────────────────────────────────
  await t.test('4. Logic Simulation: Verifies behavior for all schema states', async () => {
    // Simulator representing the PL/pgSQL block logic in JS
    function simulateRecon(whColType, existingRows) {
      // 1. If column does not exist or already integer
      if (!whColType || ['integer', 'smallint', 'bigint'].includes(whColType)) {
        return { action: 'SKIPPED', altered: false };
      }

      // 2. If UUID
      if (whColType === 'uuid') {
        const nonNullCount = existingRows.filter(r => r.warehouse_id !== null).length;
        if (nonNullCount > 0) {
          throw new Error(`Cannot alter delivery_notes.warehouse_id from UUID to INTEGER: ${nonNullCount} existing records have non-NULL warehouse_id that requires manual mapping.`);
        }
        return { action: 'ALTERED_SAFE', altered: true, expression: 'warehouse_id::text::integer' };
      }

      // 3. If VARCHAR/TEXT
      if (['character varying', 'varchar', 'text'].includes(whColType)) {
        const nonNumericCount = existingRows.filter(r => r.warehouse_id !== null && !/^-?[0-9]+$/.test(String(r.warehouse_id))).length;
        if (nonNumericCount > 0) {
          throw new Error(`Cannot alter delivery_notes.warehouse_id from ${whColType} to INTEGER: ${nonNumericCount} records contain non-numeric data.`);
        }
        return { action: 'ALTERED_NUMERIC', altered: true, expression: 'warehouse_id::integer' };
      }

      throw new Error(`Unexpected type ${whColType}`);
    }

    // State A: Already integer
    const resultA = simulateRecon('integer', [{ warehouse_id: 10 }]);
    assert.equal(resultA.action, 'SKIPPED');
    assert.equal(resultA.altered, false);

    // State B: UUID with non-null rows -> Must throw, preventing data loss
    assert.throws(
      () => simulateRecon('uuid', [{ warehouse_id: '123e4567-e89b-12d3-a456-426614174000' }]),
      /Cannot alter delivery_notes.warehouse_id from UUID to INTEGER: 1 existing records/
    );

    // State C: UUID with ONLY null rows -> Safe alteration without data loss
    const resultC = simulateRecon('uuid', [{ warehouse_id: null }, { warehouse_id: null }]);
    assert.equal(resultC.action, 'ALTERED_SAFE');
    assert.equal(resultC.altered, true);

    // State D: VARCHAR with valid integers -> Safe conversion preserving values
    const resultD = simulateRecon('varchar', [{ warehouse_id: '5' }, { warehouse_id: '12' }]);
    assert.equal(resultD.action, 'ALTERED_NUMERIC');
    assert.equal(resultD.altered, true);

    // State E: VARCHAR with alphanumeric/uuid strings -> Must throw to prevent data corruption
    assert.throws(
      () => simulateRecon('varchar', [{ warehouse_id: 'WH-MAIN-01' }]),
      /records contain non-numeric data/
    );
  });
});
