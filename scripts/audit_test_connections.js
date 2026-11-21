const fs = require('fs');
const path = require('path');

function scanDir(dir) {
  let files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files = files.concat(scanDir(fullPath));
    } else if (entry.isFile() && (entry.name.endsWith('.js') || entry.name.endsWith('.test.js'))) {
      files.push(fullPath);
    }
  }
  return files;
}

const testFiles = scanDir(path.join(__dirname, '..', 'tests'));
const scriptFiles = scanDir(path.join(__dirname, '..', 'scripts'));
const allFiles = [...testFiles, ...scriptFiles];

console.log('=== REPOSITORY-WIDE TEST & SCRIPT CONNECTION AUDIT ===\n');
console.log(`Total files audited: ${allFiles.length} (${testFiles.length} tests, ${scriptFiles.length} scripts)\n`);

const results = [];

for (const file of allFiles) {
  const content = fs.readFileSync(file, 'utf8');
  const relPath = path.relative(path.join(__dirname, '..'), file);

  const hasDbUrl = content.includes('DATABASE_URL');
  const hasDbUrlTest = content.includes('DATABASE_URL_TEST');
  const hasProdHost = content.includes('reseau.proxy.rlwy.net') || content.includes('PROD_HOST');
  const hasDbImport = content.includes("require('../config/db')") || content.includes("require('./config/db')") || content.includes("require('../../config/db')");
  const hasDirectPool = content.includes("new Pool");
  const hasFallback = content.includes("DATABASE_URL_TEST ||") || content.includes("DATABASE_URL_TEST ??");

  const connectsToDb = hasDbUrl || hasDbImport || hasDirectPool;

  if (connectsToDb) {
    let safetyLevel = 'UNKNOWN';
    const hasGate = content.includes('verifySafetyGate') || content.includes('SAFETY GATE') || content.includes('PROD_HOST');

    if (hasGate && hasDbUrlTest) {
      safetyLevel = 'GUARDED_CANONICAL (Uses DATABASE_URL_TEST + Rejects PROD_HOST)';
    } else if (hasDbImport && !hasGate) {
      safetyLevel = 'UNPROTECTED_FALLBACK (Directly imports config/db without guard)';
    } else if (hasDbUrl && !hasDbUrlTest) {
      safetyLevel = 'DIRECT_DATABASE_URL (Bypasses test DB, binds directly to DATABASE_URL)';
    } else {
      safetyLevel = 'PARTIALLY_GUARDED';
    }

    results.push({
      file: relPath,
      hasDbUrl,
      hasDbUrlTest,
      hasProdHost,
      hasDbImport,
      hasDirectPool,
      hasFallback,
      safetyLevel
    });
  }
}

console.log(`Found ${results.length} files that interact with PostgreSQL:\n`);

const bySafety = {};
for (const r of results) {
  bySafety[r.safetyLevel] = bySafety[r.safetyLevel] || [];
  bySafety[r.safetyLevel].push(r.file);
}

for (const [level, files] of Object.entries(bySafety)) {
  console.log(`\n### Classification: ${level} (${files.length} files)`);
  files.forEach(f => console.log(`  - ${f}`));
}

process.exit(0);
