const db = require('../config/db');

async function runPatch() {
  console.log('Starting resilient patch...');
  let client;
  while (!client) {
    try {
      client = await db.pool.connect();
    } catch (err) {
      console.log('Retrying connection...');
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  try {
    console.log('Connected! Executing SQL...');
    await client.query('BEGIN');
    await client.query('ALTER TABLE tasks ALTER COLUMN parent_id TYPE VARCHAR(255)');
    await client.query(`
        ALTER TABLE tenants 
        ADD COLUMN IF NOT EXISTS quotation_terms TEXT,
        ADD COLUMN IF NOT EXISTS quotation_footer TEXT,
        ADD COLUMN IF NOT EXISTS quotation_prefix VARCHAR(50) DEFAULT 'QUO-'
    `);
    await client.query(`
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
            unit_id INTEGER REFERENCES re_units(id) ON DELETE SET NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
    `);
    await client.query(`
        ALTER TABLE quotations 
        ADD COLUMN IF NOT EXISTS client_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS unit_id INTEGER REFERENCES re_units(id) ON DELETE SET NULL
    `);
    await client.query(`
        ALTER TABLE invoices 
        ADD COLUMN IF NOT EXISTS unit_id INTEGER REFERENCES re_units(id) ON DELETE SET NULL
    `);
    await client.query('COMMIT');
    console.log('PATCH SUCCESSFUL!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('PATCH ERROR:', err.message);
  } finally {
    client.release();
    process.exit();
  }
}

runPatch();
