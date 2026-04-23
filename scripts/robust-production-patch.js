const { Client } = require('pg');
require('dotenv').config();

const config = {
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 30000,
};

async function patch() {
  console.log('🚀 Starting Aggressive Production Patch...');
  let connected = false;
  let attempts = 0;
  let client;

  while (!connected && attempts < 50) {
    attempts++;
    console.log(`📡 Connection Attempt ${attempts}/50...`);
    client = new Client(config);
    try {
      await client.connect();
      connected = true;
      console.log('✅ CONNECTED TO DATABASE!');
    } catch (err) {
      console.error(`❌ Connection Failed: ${err.message}`);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  if (!connected) {
    console.error('💀 Failed to connect after 50 attempts.');
    process.exit(1);
  }

  try {
    await client.query('BEGIN');

    console.log('📦 Patching Tasks table...');
    await client.query('ALTER TABLE tasks ALTER COLUMN parent_id TYPE VARCHAR(255)');

    console.log('📦 Patching Quotations table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS quotations (
        id SERIAL PRIMARY KEY,
        tenant_id UUID NOT NULL,
        branch_id UUID,
        client_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
        unit_id INTEGER,
        total_amount DECIMAL(15,2) DEFAULT 0,
        status VARCHAR(20) DEFAULT 'draft',
        notes TEXT,
        valid_until DATE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('📦 Patching Quotation Items table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS quotation_items (
        id SERIAL PRIMARY KEY,
        quotation_id INTEGER REFERENCES quotations(id) ON DELETE CASCADE,
        product_id INTEGER,
        description TEXT,
        quantity DECIMAL(10,2) DEFAULT 1,
        unit_price DECIMAL(15,2) DEFAULT 0,
        subtotal DECIMAL(15,2) DEFAULT 0,
        tenant_id UUID NOT NULL,
        branch_id UUID
      )
    `);

    console.log('📦 Patching Invoices table...');
    // Check if columns exist first to avoid errors
    await client.query(`
      ALTER TABLE invoices ADD COLUMN IF NOT EXISTS client_id INTEGER REFERENCES customers(id) ON DELETE SET NULL;
      ALTER TABLE invoices ADD COLUMN IF NOT EXISTS unit_id INTEGER;
    `);

    console.log('📦 Patching Tenants table branding...');
    await client.query(`
      ALTER TABLE tenants 
      ADD COLUMN IF NOT EXISTS quotation_terms TEXT,
      ADD COLUMN IF NOT EXISTS quotation_footer TEXT,
      ADD COLUMN IF NOT EXISTS quotation_prefix VARCHAR(10) DEFAULT 'QUO-'
    `);

    await client.query('COMMIT');
    console.log('🎉 PATCH SUCCESSFUL!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('💥 PATCH FAILED:', err.message);
  } finally {
    await client.end();
    process.exit(0);
  }
}

patch();
