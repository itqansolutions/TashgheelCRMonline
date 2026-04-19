const db = require('../config/db');

async function checkConstraints() {
    try {
        const query = `
            SELECT 
                tc.table_name, 
                kcu.column_name, 
                tc.constraint_name, 
                ccu.table_name AS foreign_table_name, 
                ccu.column_name AS foreign_column_name 
            FROM 
                information_schema.table_constraints AS tc 
                JOIN information_schema.key_column_usage AS kcu 
                  ON tc.constraint_name = kcu.constraint_name 
                  AND tc.table_schema = kcu.table_schema 
                JOIN information_schema.constraint_column_usage AS ccu 
                  ON ccu.constraint_name = tc.constraint_name 
                  AND ccu.table_schema = tc.table_schema 
            WHERE 
                tc.constraint_type = 'FOREIGN KEY' 
                AND kcu.column_name IN ('tenant_id', 'branch_id');
        `;
        const res = await db.query(query);
        console.table(res.rows);

        const typesQuery = `
            SELECT table_name, column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name IN ('tenants', 'branches') AND column_name = 'id';
        `;
        const typesRes = await db.query(typesQuery);
        console.table(typesRes.rows);
    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}

checkConstraints();
