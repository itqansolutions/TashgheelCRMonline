/**
 * scripts/detailed_inventory_audit.js
 * 
 * PHASE S.1: Comprehensive Static Dependency and Connection Mapping
 * 
 * Audits all 86 test files in `tests/` and 85 script files in `scripts/`.
 * Strictly READ-ONLY. No database connections.
 */

const fs = require('fs');
const path = require('path');

function scanDir(dir) {
  let files = [];
  if (!fs.existsSync(dir)) return files;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files = files.concat(scanDir(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(fullPath);
    }
  }
  return files;
}

const rootDir = path.join(__dirname, '..');
const testFiles = scanDir(path.join(rootDir, 'tests'));
const scriptFiles = scanDir(path.join(rootDir, 'scripts'));

const inventory = [];

// Audit test files
for (const file of testFiles) {
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
  if (hasDbImport && (hasPgPool || hasPgClient)) entryPoint = 'config/db.js + direct pg';
  else if (hasDbImport) entryPoint = 'config/db.js';
  else if (hasPgPool) entryPoint = 'direct pg.Pool';
  else if (hasPgClient) entryPoint = 'direct pg.Client';

  let vars = [];
  if (content.includes("DATABASE_URL_TEST")) vars.push("DATABASE_URL_TEST");
  if (content.includes("DATABASE_URL") && !content.includes("DATABASE_URL_TEST")) vars.push("DATABASE_URL");
  else if (content.includes("DATABASE_URL") && content.includes("DATABASE_URL_TEST")) vars.push("DATABASE_URL (for prod check/override)");
  const connectionVars = vars.length > 0 ? vars.join(', ') : (entryPoint === 'config/db.js' ? 'DATABASE_URL (via config/db)' : 'NONE');

  const touchesDb = entryPoint !== 'NONE' || content.includes('DATABASE_URL');

  let classification = 'ZERO_DB';
  let silentFallback = 'NO';

  if (!touchesDb) {
    classification = 'ZERO_DB';
    silentFallback = 'NO';
  } else {
    if (hasSafetyGate && hasDbUrlTest && hasProdHost) {
      classification = 'PROTECTED';
      silentFallback = 'NO (Rejects PROD_HOST & fails if unset)';
    } else if (hasSafetyGate && hasDbUrlTest) {
      classification = 'PARTIALLY PROTECTED';
      silentFallback = 'POSSIBLE (Missing explicit PROD_HOST check)';
    } else if (entryPoint === 'config/db.js' && !hasSafetyGate) {
      classification = 'UNPROTECTED';
      silentFallback = 'HIGH (Direct config/db uses default DATABASE_URL)';
    } else if (hasDbUrl && !hasDbUrlTest) {
      classification = 'UNPROTECTED';
      silentFallback = 'HIGH (Direct DATABASE_URL)';
    } else {
      classification = 'UNPROTECTED';
      silentFallback = 'YES';
    }
  }

  inventory.push({
    file: relPath,
    category: 'TEST',
    entryPoint,
    connectionVars,
    invokesGuard: hasSafetyGate ? 'YES' : 'NO',
    silentFallback,
    classification
  });
}

// Audit script files
for (const file of scriptFiles) {
  const relPath = path.relative(rootDir, file).replace(/\\/g, '/');
  const content = fs.readFileSync(file, 'utf8');

  const hasDbImport = content.includes("config/db");
  const hasPgPool = content.includes("new Pool") || content.includes(".Pool(");
  const hasPgClient = content.includes("new Client") || content.includes(".Client(");
  const hasDbUrlTest = content.includes("DATABASE_URL_TEST");
  const hasProdHost = content.includes("reseau.proxy.rlwy.net") || content.includes("PROD_HOST");
  const hasSafetyGate = content.includes("verifySafetyGate") || content.includes("testSafetyGuard");

  let entryPoint = 'NONE';
  if (hasDbImport && (hasPgPool || hasPgClient)) entryPoint = 'config/db.js + direct pg';
  else if (hasDbImport) entryPoint = 'config/db.js';
  else if (hasPgPool) entryPoint = 'direct pg.Pool';
  else if (hasPgClient) entryPoint = 'direct pg.Client';

  let classification = 'OPERATIONAL_SCRIPT_REQUIRES_SEPARATE_POLICY';
  let silentFallback = 'N/A (Operational/Migration)';

  if (entryPoint === 'NONE' && !content.includes('DATABASE_URL')) {
    classification = 'ZERO_DB';
    silentFallback = 'NO';
  } else if (relPath.includes('audit') || relPath.includes('verify')) {
    classification = 'OPERATIONAL_SCRIPT_REQUIRES_SEPARATE_POLICY';
  }

  inventory.push({
    file: relPath,
    category: 'SCRIPT',
    entryPoint,
    connectionVars: content.includes('DATABASE_URL') ? 'DATABASE_URL' : (entryPoint !== 'NONE' ? 'DATABASE_URL (via config/db)' : 'NONE'),
    invokesGuard: hasSafetyGate ? 'YES' : 'NO',
    silentFallback,
    classification
  });
}

console.log(JSON.stringify(inventory, null, 2));
