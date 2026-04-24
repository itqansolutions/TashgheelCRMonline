const db = require('../config/db');
async function test() {
    try {
        const r = await db.query("SELECT table_name FROM information_schema.tables WHERE table_name = 'quotations'");
        console.log('TABLE EXISTS:', r.rows.length > 0);
        if (r.rows.length > 0) {
            const cols = await db.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'quotations'");
            console.log('COLUMNS:', cols.rows.map(c => c.column_name));
        }
    } catch (e) {
        console.error('TEST FAILED:', e.message);
    } finally {
        process.exit(0);
    }
}
test();
