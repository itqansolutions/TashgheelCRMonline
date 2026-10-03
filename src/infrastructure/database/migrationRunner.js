const fs = require('fs');
const path = require('path');
const db = require('../../../config/db');
const { ensurePurchasesSchema } = require('../../../controllers/purchasesController');

async function runMigrations() {
    console.log('🔄 [Migration Runner] Starting database schema verification & migrations...');

    // 1. Ensure core Purchases schema first
    try {
        await ensurePurchasesSchema();
        console.log('✅ [Migration Runner] Core purchases schema verified (purchase_invoices, finance_vouchers).');
    } catch (err) {
        console.error('❌ [Migration Runner] Error ensuring purchases schema:', err.message);
    }

    // 2. Ensure schema_migrations tracker table
    await db.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
            name VARCHAR(255) PRIMARY KEY,
            applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
    `);

    // 3. Scan and apply migrations in order
    const migrationsDir = path.join(__dirname, '..', '..', '..', 'migrations');
    if (!fs.existsSync(migrationsDir)) {
        console.log('⚠️ [Migration Runner] migrations directory not found.');
        return;
    }

    const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

    for (const file of files) {
        const checkRes = await db.query('SELECT 1 FROM schema_migrations WHERE name = $1', [file]);
        if (checkRes.rows.length > 0) {
            console.log(`⚡ [Migration Runner] Already applied: ${file}`);
            continue;
        }

        console.log(`🚀 [Migration Runner] Applying migration: ${file}...`);
        const filePath = path.join(migrationsDir, file);
        const sql = fs.readFileSync(filePath, 'utf8');

        try {
            await db.query(sql);
            await db.query('INSERT INTO schema_migrations (name) VALUES ($1) ON CONFLICT (name) DO NOTHING', [file]);
            console.log(`✅ [Migration Runner] Successfully applied: ${file}`);
        } catch (err) {
            console.error(`❌ [Migration Runner] Failed to apply ${file}:`, err.message);
            // In boot sequence we don't halt the entire server, but log error prominently
        }
    }

    console.log('🏁 [Migration Runner] Completed migration check.');
}

module.exports = runMigrations;

if (require.main === module) {
    runMigrations().then(() => process.exit(0)).catch(err => {
        console.error('Fatal migration error:', err);
        process.exit(1);
    });
}
