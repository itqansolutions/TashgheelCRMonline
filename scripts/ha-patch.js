const db = require('../config/db');

async function runPatch() {
  try {
    console.log('Running patch through existing DB pool...');
    
    await db.query('BEGIN');
    
    console.log('1. Fixing tasks.parent_id...');
    await db.query('ALTER TABLE tasks ALTER COLUMN parent_id TYPE VARCHAR(255)');
    
    console.log('2. Updating tenants table...');
    await db.query(`
        ALTER TABLE tenants 
        ADD COLUMN IF NOT EXISTS quotation_terms TEXT,
        ADD COLUMN IF NOT EXISTS quotation_footer TEXT,
        ADD COLUMN IF NOT EXISTS quotation_prefix VARCHAR(50) DEFAULT 'QUO-'
    `);
    
    console.log('3. Creating quotation_items...');
    await db.query(`
        CREATE TABLE IF NOT EXISTS quotation_items (
            id SERIAL PRIMARY KEY,
            quotation_id INTEGER REFERENCES quotations(id) ON DELETE CASCADE,
            product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
            description TEXT,
            quantity INTEGER DEFAULT 1,
            unit_price DECIMAL(12, 2) NOT NULL,
            subtotal DECIMAL(15, 2) NOT NULL,
            tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
            branch_id UUID,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
    `);

    console.log('4. Linking quotations to client_id...');
    await db.query(`
        ALTER TABLE quotations 
        ADD COLUMN IF NOT EXISTS client_id INTEGER REFERENCES customers(id) ON DELETE SET NULL
    `);
    
    await db.query('COMMIT');
    console.log('PATCH COMPLETED SUCCESSFULLY!');
  } catch (e) {
    await db.query('ROLLBACK');
    console.error('PATCH FAILED:', e.message);
  } finally {
    process.exit();
  }
}

runPatch().catch(err => {
  console.error('EXECUTION FAILED:', err.message);
  process.exit();
});
