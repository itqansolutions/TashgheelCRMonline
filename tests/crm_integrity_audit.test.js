const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

test('CRM Integrity Audit Script Test Suite', async (t) => {
  const rootDir = path.resolve(__dirname, '..');
  const scriptPath = path.join(rootDir, 'scripts', 'crm_integrity_audit_and_repair.js');

  await t.test('1. Audit mode runs cleanly and generates structured JSON report without writes', async () => {
    const reportPath = path.join(rootDir, 'scripts', 'crm_integrity_audit_report.json');
    if (fs.existsSync(reportPath)) fs.unlinkSync(reportPath);

    // Execute audit mode
    const output = execSync(`node "${scriptPath}" --mode=audit`, {
      cwd: rootDir,
      encoding: 'utf8',
      env: { ...process.env, NODE_ENV: 'test' }
    });

    assert.match(output, /Tashgheel CRM Integrity Diagnostic Audit/i);
    assert.match(output, /DIAGNOSTIC AUDIT SUMMARY/i);
    assert.equal(fs.existsSync(reportPath), true, 'Report JSON file must be generated');

    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    assert.equal(report.mode, 'audit');
    assert.ok(report.tally);
    assert.ok(typeof report.tally.total_deals === 'number');
    assert.ok(report.deal_navigation);
    assert.ok(report.deal_values);
    assert.ok(report.relationships);
  });

  await t.test('2. Repair mode strictly refuses to run without --confirm-local flag', async () => {
    let threw = false;
    let errOutput = '';
    try {
      execSync(`node "${scriptPath}" --mode=repair`, {
        cwd: rootDir,
        encoding: 'utf8',
        stdio: 'pipe',
        env: { ...process.env, NODE_ENV: 'test', DATABASE_URL: 'postgresql://localhost:5432/test_db', DB_HOST: 'localhost' }
      });
    } catch (err) {
      threw = true;
      errOutput = (err.stdout || '') + (err.stderr || '');
    }

    assert.equal(threw, true, 'Repair mode must exit with error if --confirm-local is omitted');
    assert.match(errOutput, /requires explicit confirmation flag: --confirm-local/i);
  });

  await t.test('3. Repair mode strictly blocks execution if Production/Railway indicator is detected', async () => {
    let threw = false;
    let errOutput = '';
    try {
      execSync(`node "${scriptPath}" --mode=repair --confirm-local`, {
        cwd: rootDir,
        encoding: 'utf8',
        stdio: 'pipe',
        env: { ...process.env, DATABASE_URL: 'postgresql://user:pass@containers-us-west-99.railway.app:7123/railway' }
      });
    } catch (err) {
      threw = true;
      errOutput = (err.stdout || '') + (err.stderr || '');
    }

    assert.equal(threw, true, 'Repair mode must abort if Railway URL is present');
    assert.match(errOutput, /strictly prohibited from running against Production \/ Railway databases/i);
  });
});
