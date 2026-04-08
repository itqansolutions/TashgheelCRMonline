const db = require('../config/db');

async function debugQuery() {
    try {
        console.log('Testing Customers query...');
        const result = await db.query(`
            SELECT 
              c.*, 
              u.name as assigned_to_name,
              m.name as manager_name,
              ls.name as source_name
            FROM customers c
            LEFT JOIN users u ON c.assigned_to = u.id
            LEFT JOIN users m ON c.manager_id = m.id
            LEFT JOIN lead_sources ls ON c.source_id = ls.id
            ORDER BY c.created_at DESC
        `);
        console.log('SUCCESS! Rows returned:', result.rows.length);
        if (result.rows.length > 0) {
            console.log('Sample row:', result.rows[0]);
        }
    } catch (err) {
        console.error('FAILED with error:', err.message);
        console.error('Stack trace:', err.stack);
    } finally {
        process.exit();
    }
}

debugQuery();
