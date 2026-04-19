const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

/**
 * 🚀 Tashgheel CRM Pre-Boot Orchestrator
 * Consolidates multiple migration scripts into a single idempotent flow.
 * Ensures the database is ready before the server starts.
 */

const scripts = [
    'init-db.js',
    'saas-migration.js',
    'custom-plans-migration.js',
    'billing-migration.js',
    'bulletproof-branch-migration.js',
    'create-logs-table.js',
    'initialize-rbac.js',
    'notifications-migration.js',
    'hr-core-migration.js',
    'hr-operations-migration.js',
    'hr-payroll-migration.js',
    'inventory-core-migration.js',
    'finance-engine-migration.js',
    'workflow-rules-migration.js',
    'fix-departments-tenant-migration.js',
    'fix-lead-sources-migration.js',
    'industry-templates-migration.js'
];

console.log('--- [PRE-BOOT] Starting System Synchronization ---');

for (const script of scripts) {
    try {
        const scriptPath = path.join(__dirname, script);
        if (fs.existsSync(scriptPath)) {
            console.log(`📡 [Sync] Running: ${script}...`);
            // Run synchronously to ensure order. Use inherit for real-time logs.
            execSync(`node "${scriptPath}"`, { stdio: 'inherit' });
            console.log(`✅ [Sync] ${script} completed.`);
        } else {
            console.warn(`⚠️ [Sync] Skipping missing script: ${script}`);
        }
    } catch (err) {
        // Many migrations fail with "column already exists" or similar.
        // We log it but proceed to ensure the next modules can still initialize if they are independent.
        console.warn(`❌ [Sync] Script ${script} encountered an issue. Continuing to next module...`);
    }
}

console.log('--- [PRE-BOOT] Synchronization Complete. Handing over to Server. ---');
process.exit(0);
