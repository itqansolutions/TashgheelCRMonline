/**
 * scripts/migrate_all_tests_to_guard.js
 * 
 * PHASE S.3: Repository-Wide Test Safety Migration Tool
 * 
 * Safely inserts canonical test context initialization into all database-capable
 * test files that currently lack it.
 * 
 * Preserves 100% of existing test logic, assertions, transactions, and cleanup.
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

const dryRun = process.argv.includes('--dry-run');
console.log(`Running migration (dryRun = ${dryRun})...\n`);

let migrated = 0;
let skipped = 0;

for (const file of testFiles) {
  const relPath = path.relative(rootDir, file).replace(/\\/g, '/');
  
  // Skip helpers
  if (relPath.includes('tests/helpers/')) {
    skipped++;
    continue;
  }

  const content = fs.readFileSync(file, 'utf8');

  // Check if touches DB
  const importsConfigDb = /require\s*\(\s*['"][^'"]*config\/db['"]\s*\)/.test(content);
  const importsPg = /require\s*\(\s*['"]pg['"]\s*\)/.test(content);
  const usesDirectPool = /new\s+Pool\s*\(/.test(content);
  const usesDirectClient = /new\s+Client\s*\(/.test(content);
  const usesDbUrl = /process\.env\.DATABASE_URL\b/.test(content);

  const isDbCapable = importsConfigDb || importsPg || usesDirectPool || usesDirectClient || usesDbUrl;

  if (!isDbCapable) {
    skipped++;
    continue;
  }

  // Check if already guarded
  const alreadyGuarded = content.includes('initTestContext') ||
                         content.includes('testSafetyGuard') ||
                         content.includes('testDb') ||
                         content.includes('verifySafetyGate') ||
                         content.includes('verifySafety');

  if (alreadyGuarded) {
    skipped++;
    continue;
  }

  // Calculate relative helper path
  const isIntegration = relPath.startsWith('tests/integration/');
  const helperPath = isIntegration ? '../helpers/testDb' : './helpers/testDb';

  const guardHeader = `// ============================================================================
// CANONICAL TEST SAFETY ENFORCEMENT (Phase S)
// Strictly mandates DATABASE_URL_TEST and prevents execution against PROD_HOST
// ============================================================================
const { initTestContext } = require('${helperPath}');
initTestContext();\n\n`;

  // Find insertion point (after any leading comment block)
  let insertionIndex = 0;
  if (content.startsWith('/*')) {
    const endComment = content.indexOf('*/');
    if (endComment !== -1) {
      insertionIndex = endComment + 2;
      // Skip trailing newlines
      while (content[insertionIndex] === '\n' || content[insertionIndex] === '\r') {
        insertionIndex++;
      }
    }
  }

  const newContent = content.slice(0, insertionIndex) + guardHeader + content.slice(insertionIndex);

  console.log(`Migrating: ${relPath} (inserted at byte ${insertionIndex})`);
  migrated++;

  if (!dryRun) {
    fs.writeFileSync(file, newContent, 'utf8');
  }
}

console.log(`\nMigration completed: ${migrated} files migrated, ${skipped} files skipped.`);
