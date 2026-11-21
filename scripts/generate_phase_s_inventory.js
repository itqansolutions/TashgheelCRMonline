/**
 * scripts/generate_phase_s_inventory.js
 * 
 * Generates the full file-level static inventory for Phase S.1.
 * Audits all files in `tests/` and `scripts/`.
 * Strictly READ-ONLY regarding application/database code.
 */

const fs = require('fs');
const path = require('path');

function scanDir(dir) {
  let files = [];
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files = files.concat(scanDir(full));
    else if (entry.isFile() && entry.name.endsWith('.js')) files.push(full);
  }
  return files;
}

const rootDir = path.join(__dirname, '..');
const testFiles = scanDir(path.join(rootDir, 'tests')).sort();
const scriptFiles = scanDir(path.join(rootDir, 'scripts')).sort();

let md = `# Phase S.1 — Static Dependency and Connection Mapping Inventory\n\n`;
md += `**Date:** November 21, 2026  \n`;
md += `**Scope:** Repository-wide inspection of all test files (\`tests/\`) and operational scripts (\`scripts/\`).  \n`;
md += `**Audit Type:** Strictly READ-ONLY static AST & regex analysis. Zero database calls.  \n\n`;

md += `## 1. Summary of Repository Inventory\n\n`;

const records = [];

function analyzeFile(file, category) {
  const relPath = path.relative(rootDir, file).replace(/\\/g, '/');
  const content = fs.readFileSync(file, 'utf8');

  const hasDbImport = content.includes("config/db");
  const hasPgPool = content.includes("new Pool") || content.includes(".Pool(");
  const hasPgClient = content.includes("new Client") || content.includes(".Client(");
  const hasDbUrl = content.includes("DATABASE_URL") && !content.includes("DATABASE_URL_TEST");
  const hasDbUrlTest = content.includes("DATABASE_URL_TEST");
  const hasProdHost = content.includes("reseau.proxy.rlwy.net") || content.includes("PROD_HOST");
  const hasSafetyGate = content.includes("verifySafetyGate") || content.includes("testSafetyGuard") || content.includes("enforceTestSafetyGate");
  const hasFallback = content.includes("DATABASE_URL_TEST ||") || content.includes("DATABASE_URL_TEST ??");

  let entryPoint = 'NONE';
  if (hasDbImport && (hasPgPool || hasPgClient)) entryPoint = '`config/db.js` + direct `pg`';
  else if (hasDbImport) entryPoint = '`config/db.js`';
  else if (hasPgPool) entryPoint = 'direct `pg.Pool`';
  else if (hasPgClient) entryPoint = 'direct `pg.Client`';

  let vars = [];
  if (content.includes("DATABASE_URL_TEST")) vars.push("`DATABASE_URL_TEST`");
  if (content.includes("DATABASE_URL") && !content.includes("DATABASE_URL_TEST")) vars.push("`DATABASE_URL`");
  else if (content.includes("DATABASE_URL") && content.includes("DATABASE_URL_TEST")) vars.push("`DATABASE_URL` (comparison)");
  const connectionVars = vars.length > 0 ? vars.join(', ') : (entryPoint.includes('config/db.js') ? '`DATABASE_URL` (via `config/db`)' : 'NONE');

  const touchesDb = entryPoint !== 'NONE' || content.includes('DATABASE_URL');

  let classification = 'ZERO_DB';
  let silentFallback = 'NO';

  if (category === 'SCRIPT') {
    if (!touchesDb) {
      classification = 'ZERO_DB';
      silentFallback = 'NO';
    } else {
      classification = 'OPERATIONAL_SCRIPT_REQUIRES_SEPARATE_POLICY';
      silentFallback = 'N/A (Operational/Maintenance)';
    }
  } else {
    // Category === 'TEST'
    if (!touchesDb) {
      classification = 'ZERO_DB';
      silentFallback = 'NO';
    } else {
      if (hasSafetyGate && hasDbUrlTest && hasProdHost) {
        classification = 'PROTECTED';
        silentFallback = 'NO (Rejects `PROD_HOST` & aborts if unset)';
      } else if (hasSafetyGate && hasDbUrlTest) {
        classification = 'PARTIALLY PROTECTED';
        silentFallback = 'POSSIBLE (Missing explicit `PROD_HOST` block)';
      } else if (entryPoint.includes('config/db.js') && !hasSafetyGate) {
        classification = 'UNPROTECTED';
        silentFallback = 'HIGH (Direct `config/db.js` connects to `DATABASE_URL`)';
      } else if (hasDbUrl && !hasDbUrlTest) {
        classification = 'UNPROTECTED';
        silentFallback = 'HIGH (Binds directly to `DATABASE_URL`)';
      } else {
        classification = 'UNPROTECTED';
        silentFallback = 'HIGH';
      }
    }
  }

  return {
    file: relPath,
    category,
    entryPoint,
    connectionVars,
    invokesGuard: hasSafetyGate ? 'YES' : 'NO',
    silentFallback,
    classification
  };
}

for (const f of testFiles) records.push(analyzeFile(f, 'TEST'));
for (const f of scriptFiles) records.push(analyzeFile(f, 'SCRIPT'));

const counts = {};
records.forEach(r => {
  counts[r.classification] = (counts[r.classification] || 0) + 1;
});

md += `| Classification | Category | Count |\n`;
md += `| :--- | :--- | :--- |\n`;
md += `| **UNPROTECTED** | Tests | ${records.filter(r => r.category === 'TEST' && r.classification === 'UNPROTECTED').length} |\n`;
md += `| **PROTECTED** | Tests | ${records.filter(r => r.category === 'TEST' && r.classification === 'PROTECTED').length} |\n`;
md += `| **PARTIALLY PROTECTED** | Tests | ${records.filter(r => r.category === 'TEST' && r.classification === 'PARTIALLY PROTECTED').length} |\n`;
md += `| **ZERO_DB** | Tests | ${records.filter(r => r.category === 'TEST' && r.classification === 'ZERO_DB').length} |\n`;
md += `| **OPERATIONAL_SCRIPT_REQUIRES_SEPARATE_POLICY** | Scripts | ${records.filter(r => r.category === 'SCRIPT' && r.classification === 'OPERATIONAL_SCRIPT_REQUIRES_SEPARATE_POLICY').length} |\n`;
md += `| **ZERO_DB** | Scripts | ${records.filter(r => r.category === 'SCRIPT' && r.classification === 'ZERO_DB').length} |\n`;
md += `| **TOTAL AUDITED FILES** | All | **${records.length}** |\n\n`;

md += `---\n\n`;
md += `## 2. Test Files Inventory (\`tests/\` — 86 Files)\n\n`;
md += `| # | File Path | Entry Point | Connection Vars | Invokes Guard | Silent Fallback Risk | Classification |\n`;
md += `| :- | :--- | :--- | :--- | :--- | :--- | :--- |\n`;

records.filter(r => r.category === 'TEST').forEach((r, idx) => {
  md += `| ${idx + 1} | \`${r.file}\` | ${r.entryPoint} | ${r.connectionVars} | ${r.invokesGuard} | ${r.silentFallback} | **${r.classification}** |\n`;
});

md += `\n---\n\n`;
md += `## 3. Operational Scripts Inventory (\`scripts/\` — ${scriptFiles.length} Files)\n\n`;
md += `> **Operational Policy Requirement:** Scripts in \`scripts/\` are operational utilities (schema migrations, data seeders, emergency patches, manual reconciliation, and environment diagnostics). They are NOT test scripts and must NEVER be run in automated test suites without explicit human authorization and dedicated parameters.\n\n`;
md += `| # | File Path | Entry Point | Connection Vars | Operational Role | Classification |\n`;
md += `| :- | :--- | :--- | :--- | :--- | :--- |\n`;

records.filter(r => r.category === 'SCRIPT').forEach((r, idx) => {
  let role = 'Operational Utility';
  if (r.file.includes('migration')) role = 'Schema Migration';
  else if (r.file.includes('patch')) role = 'Emergency Schema Patch';
  else if (r.file.includes('seed')) role = 'Demo / Tenant Seeder';
  else if (r.file.includes('audit') || r.file.includes('verify') || r.file.includes('diag')) role = 'Operational Audit / Diagnostics';
  md += `| ${idx + 1} | \`${r.file}\` | ${r.entryPoint} | ${r.connectionVars} | ${role} | **${r.classification}** |\n`;
});

fs.writeFileSync(path.join(rootDir, 'PHASE-S-STATIC-INVENTORY.md'), md);
console.log('Successfully generated PHASE-S-STATIC-INVENTORY.md');
