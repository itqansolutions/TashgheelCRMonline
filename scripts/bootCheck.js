/**
 * scripts/bootCheck.js
 *
 * Verifies that the server can boot cleanly against a FRESH / EMPTY PostgreSQL database.
 * Safety Guard:
 *   - Parses DATABASE_URL (current) and DATABASE_URL_TEST.
 *   - Refuses if host + port + db match DATABASE_URL.
 *   - Refuses if DATABASE_URL_TEST is missing or malformed.
 *   - Prints masked host:port/db targets.
 *   - Spawns child server process with explicit DATABASE_URL = DATABASE_URL_TEST.
 *   - Probes the server and treats any HTTP status code (including 200, 401, 403, 404) as successful listen.
 *
 * Usage:
 *   $env:DATABASE_URL_TEST="postgres://user:pass@host:5432/staging_db"
 *   node scripts/bootCheck.js
 */

const { spawn } = require('child_process');
const http = require('http');
require('dotenv').config();

const currentDbUrl = process.env.DATABASE_URL;
const testDbUrl = process.env.DATABASE_URL_TEST;

function maskUrl(urlStr) {
    try {
        const u = new URL(urlStr);
        return `${u.protocol}//${u.username ? '***:***@' : ''}${u.hostname}:${u.port || '5432'}${u.pathname}`;
    } catch {
        return '[INVALID_URL]';
    }
}

if (!testDbUrl) {
    console.error('❌ [Safety Guard] Missing DATABASE_URL_TEST environment variable.');
    console.error('   Please provide a disposable staging/test PostgreSQL URL:');
    console.error('   Example: DATABASE_URL_TEST="postgres://user:pass@staging-host:5432/staging_db" node scripts/bootCheck.js');
    process.exit(1);
}

let currentParsed = null;
let testParsed = null;

try {
    testParsed = new URL(testDbUrl);
} catch (e) {
    console.error('❌ [Safety Guard] Invalid DATABASE_URL_TEST format:', e.message);
    process.exit(1);
}

if (currentDbUrl) {
    try {
        currentParsed = new URL(currentDbUrl);
    } catch (_) {}
}

const testHost = (testParsed.hostname || '').toLowerCase();
const testPort = testParsed.port || '5432';
const testPath = (testParsed.pathname || '').toLowerCase();

console.log(`🔍 [Safety Guard] Target DB (masked): ${maskUrl(testDbUrl)}`);
if (currentDbUrl) {
    console.log(`🔍 [Safety Guard] Base DB   (masked): ${maskUrl(currentDbUrl)}`);
}

// 1. Strict equality check: Never allow identical target host + port + database
if (currentParsed) {
    const curHost = (currentParsed.hostname || '').toLowerCase();
    const curPort = currentParsed.port || '5432';
    const curPath = (currentParsed.pathname || '').toLowerCase();

    if (curHost === testHost && curPort === testPort && curPath === testPath) {
        console.error(`🛑 [SAFETY STOP] DATABASE_URL_TEST targets the exact same host:port/db as current DATABASE_URL!`);
        console.error(`   Refusing to run tests against active database.`);
        process.exit(1);
    }
}

// 2. Reject known production host + port + db combos if identical to Railway live
if (testHost.includes('reseau.proxy.rlwy.net') && testPort === '36173' && testPath.includes('railway')) {
    console.error(`🛑 [SAFETY STOP] Target matches production Railway database port & db. Refusing to run.`);
    process.exit(1);
}

console.log('✅ [Safety Guard] Target database verified as separate from production.');

// Spawn server process with explicit DATABASE_URL = DATABASE_URL_TEST
const serverPort = process.env.TEST_PORT || '5055';
const childEnv = {
    ...process.env,
    DATABASE_URL: testDbUrl,
    PORT: serverPort,
    NODE_ENV: 'test'
};

console.log(`🚀 [Boot Check] Spawning server instance on port ${serverPort}...`);
console.log(`🚀 [Boot Check] Injected DATABASE_URL: ${maskUrl(testDbUrl)}`);

const serverProc = spawn('node', ['server.js'], {
    env: childEnv,
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe']
});

let bootResolved = false;

serverProc.stdout.on('data', (chunk) => {
    const text = chunk.toString();
    process.stdout.write(`[SERVER] ${text}`);

    if (text.includes(`Server running on port ${serverPort}`) || text.includes('Server running on port')) {
        onServerListening();
    }
});

serverProc.stderr.on('data', (chunk) => {
    const text = chunk.toString();
    process.stderr.write(`[SERVER ERR] ${text}`);
});

serverProc.on('exit', (code, signal) => {
    if (!bootResolved) {
        console.error(`❌ [Boot Check] Server crashed or exited prematurely with code ${code} / signal ${signal}`);
        process.exit(1);
    }
});

async function onServerListening() {
    if (bootResolved) return;
    bootResolved = true;
    console.log('\n📡 [Boot Check] Server is listening! Running health probe against /api/plans or / ...');

    // Wait 2 seconds for boot initializers (migrationRunner, schema reconciliations) to settle
    await new Promise(r => setTimeout(r, 2000));

    const checkUrl = `http://127.0.0.1:${serverPort}/api/plans`;
    
    http.get(checkUrl, (res) => {
        console.log(`📥 [Boot Check] HTTP Probe returned status: ${res.statusCode} (${res.statusMessage})`);
        let body = '';
        res.on('data', (c) => body += c);
        res.on('end', () => {
            console.log(`📥 [Boot Check] Probe response preview: ${body.slice(0, 150)}`);
            // Any valid HTTP response indicates the express application booted and routing engine is alive
            if (res.statusCode >= 200 && res.statusCode < 500) {
                cleanup(0, `Server booted successfully, database initialized, and responded with HTTP ${res.statusCode}.`);
            } else {
                cleanup(1, `Server returned HTTP ${res.statusCode} 5xx error on boot probe.`);
            }
        });
    }).on('error', (err) => {
        cleanup(1, `HTTP Probe network error: ${err.message}`);
    });
}

function cleanup(exitCode, message) {
    console.log(`\n🛑 [Boot Check] Shutting down test server (PID: ${serverProc.pid})...`);
    serverProc.kill('SIGTERM');
    setTimeout(() => {
        try { serverProc.kill('SIGKILL'); } catch (e) {}
        console.log(`🏁 [Boot Check] ${message}`);
        process.exit(exitCode);
    }, 1500);
}

// Timeout after 35 seconds
setTimeout(() => {
    if (!bootResolved) {
        console.error('⏰ [Boot Check] Timed out waiting for server to boot.');
        cleanup(1, 'Boot check timed out.');
    }
}, 35000);
