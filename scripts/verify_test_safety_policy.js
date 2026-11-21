/**
 * scripts/verify_test_safety_policy.js
 * 
 * AUTOMATED STATIC TEST SAFETY POLICY ENFORCEMENT
 * 
 * Verifies that:
 * 1. Zero test files can bypass the canonical safety guard.
 * 2. Zero test files silently fall back to application DATABASE_URL.
 * 3. All database-capable tests use tests/helpers/testSafetyGuard or tests/helpers/testDb.
 * 4. All ZERO_DB tests remain 100% database-independent.
 * 5. All operational scripts in scripts/ are categorized under explicit operational policies.
 * 
 * Strictly static analysis (zero database connections).
 * Exits with code 0 if clean, code 1 if any unprotected test is found.
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

console.log('================================================================');
console.log('  Tashgheel CRM — Automated Test Safety Policy Enforcement      ');
console.log('================================================================\n');

let violations = [];
let protectedTests = [];
let zeroDbTests = [];
let operationalScripts = [];
let zeroDbScripts = [];

// Audit test files
for (const file of testFiles) {
  const relPath = path.relative(rootDir, file).replace(/\\/g, '/');
  const content = fs.readFileSync(file, 'utf8');

  // AST-like pattern matching
  const importsConfigDb = /require\s*\(\s*['"][^'"]*config\/db['"]\s*\)/.test(content);
  const importsPg = /require\s*\(\s*['"]pg['"]\s*\)/.test(content);
  const usesDirectPool = /new\s+Pool\s*\(/.test(content);
  const usesDirectClient = /new\s+Client\s*\(/.test(content);
  const usesDbUrlDirectly = /process\.env\.DATABASE_URL\b/.test(content) && !/process\.env\.DATABASE_URL_TEST\b/.test(content);

  const isDbCapable = importsConfigDb || importsPg || usesDirectPool || usesDirectClient || usesDbUrlDirectly;

  if (!isDbCapable) {
    zeroDbTests.push(relPath);
    continue;
  }

  // Check safety guard invocation
  const importsGuard = /require\s*\(\s*['"][^'"]*(testSafetyGuard|testDb)['"]\s*\)/.test(content) ||
                       content.includes('verifySafetyGate') ||
                       content.includes('verifySafety');
  const hasProdHostCheck = content.includes('reseau.proxy.rlwy.net') || content.includes('PROD_HOST');
  const hasSilentFallback = /DATABASE_URL_TEST\s*(\|\||\?\?)\s*(process\.env\.)?DATABASE_URL/.test(content);

  if (hasSilentFallback) {
    violations.push({
      file: relPath,
      reason: 'Contains silent fallback from DATABASE_URL_TEST to DATABASE_URL.'
    });
  } else if (importsGuard && hasProdHostCheck) {
    protectedTests.push(relPath);
  } else if (importsGuard) {
    // Has guard or helper
    protectedTests.push(relPath);
  } else {
    violations.push({
      file: relPath,
      reason: 'Database-capable test missing canonical safety guard (testSafetyGuard / testDb).'
    });
  }
}

// Audit scripts
for (const file of scriptFiles) {
  const relPath = path.relative(rootDir, file).replace(/\\/g, '/');
  const content = fs.readFileSync(file, 'utf8');

  const importsConfigDb = /require\s*\(\s*['"][^'"]*config\/db['"]\s*\)/.test(content);
  const importsPg = /require\s*\(\s*['"]pg['"]\s*\)/.test(content);
  const usesDbUrl = /process\.env\.DATABASE_URL\b/.test(content);

  if (importsConfigDb || importsPg || usesDbUrl) {
    operationalScripts.push(relPath);
  } else {
    zeroDbScripts.push(relPath);
  }
}

console.log(`Audited Tests: ${testFiles.length} files`);
console.log(` - Protected Tests: ${protectedTests.length}`);
console.log(` - Zero-DB Tests:   ${zeroDbTests.length}`);
console.log(` - Violations:      ${violations.length}\n`);

console.log(`Audited Scripts: ${scriptFiles.length} files`);
console.log(` - Operational Scripts (Separate Policy): ${operationalScripts.length}`);
console.log(` - Zero-DB Scripts:                      ${zeroDbScripts.length}\n`);

if (violations.length > 0) {
  console.error('❌ CRITICAL SAFETY VIOLATIONS DETECTED:');
  violations.forEach((v, idx) => {
    console.error(`  ${idx + 1}. [${v.file}] -> ${v.reason}`);
  });
  console.error('\nStatic Enforcement Failed. Test suite safety not guaranteed.');
  process.exit(1);
} else {
  console.log('✅ ALL TEST FILES VERIFIED: Zero unprotected database tests found.');
  console.log('Static Enforcement Passed.');
  process.exit(0);
}
