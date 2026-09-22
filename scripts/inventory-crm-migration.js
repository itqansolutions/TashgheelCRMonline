const db = require('../config/db');

/**
 * Lightweight CRM-Level Inventory & Purchasing Migration
 * Intentionally simple: NO bins/racks, NO lot/serial, NO 3-way match.
 */
async function runMigration() {
  console.log('🚀 [CRM-INVENTORY] Starting Lightweight Inventory & Purchasing Migration...');

  const exec = async (sql, label) => {
    try {
      await db.query(sql);
      console.log(`✅ ${label}`);
    } catch (err) {
      console.warn(`⚠️ ${label}: ${err.message}`);
    }
  };

  // 1. Products: Add unit
  await exec(`
    ALTER TABLE products 
    ADD COLUMN IF NOT EXISTS unit VARCHAR(50) DEFAULT 'piece';
  `, 'products.unit');

  // 2. Warehouses: Add code, location, is_active
  await exec(`
    ALTER TABLE warehouses 
    ADD COLUMN IF NOT EXISTS code VARCHAR(50);
  `, 'warehouses.code');

  await exec(`
    ALTER TABLE warehouses 
    ADD COLUMN IF NOT EXISTS location TEXT;
  `, 'warehouses.location');

  await exec(`
    ALTER TABLE warehouses 
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
  `, 'warehouses.is_active');

  // 3. Warehouse Keepers: Many-to-Many junction table
  await exec(`
    CREATE TABLE IF NOT EXISTS warehouse_keepers (
      id SERIAL PRIMARY KEY,
      warehouse_id INTEGER REFERENCES warehouses(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (warehouse_id, user_id)
    );
  `, 'warehouse_keepers table');

  await exec(`
    CREATE INDEX IF NOT EXISTS idx_warehouse_keepers_wh ON warehouse_keepers(warehouse_id);
    CREATE INDEX IF NOT EXISTS idx_warehouse_keepers_user ON warehouse_keepers(user_id);
  `, 'warehouse_keepers indexes');

  // 4. Purchase Invoices: Simple CRM purchase header
  await exec(`
    CREATE TABLE IF NOT EXISTS purchase_invoices (
      id SERIAL PRIMARY KEY,
      invoice_number VARCHAR(100) NOT NULL,
      vendor_id INTEGER REFERENCES vendors(id) ON DELETE RESTRICT,
      warehouse_id INTEGER REFERENCES warehouses(id) ON DELETE RESTRICT,
      invoice_date DATE DEFAULT CURRENT_DATE,
      total_amount DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
      paid_amount DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
      status VARCHAR(50) DEFAULT 'unpaid', -- 'unpaid', 'partial', 'paid'
      notes TEXT,
      tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
      branch_id VARCHAR(255),
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `, 'purchase_invoices table');

  await exec(`
    CREATE INDEX IF NOT EXISTS idx_purchase_invoices_tenant_branch ON purchase_invoices(tenant_id, branch_id);
    CREATE INDEX IF NOT EXISTS idx_purchase_invoices_vendor ON purchase_invoices(vendor_id);
  `, 'purchase_invoices indexes');

  // 5. Purchase Invoice Items: Simple item lines
  await exec(`
    CREATE TABLE IF NOT EXISTS purchase_invoice_items (
      id SERIAL PRIMARY KEY,
      purchase_invoice_id INTEGER REFERENCES purchase_invoices(id) ON DELETE CASCADE,
      product_id INTEGER REFERENCES products(id) ON DELETE RESTRICT,
      quantity DECIMAL(12, 3) NOT NULL,
      unit_price DECIMAL(12, 2) NOT NULL,
      subtotal DECIMAL(15, 2) NOT NULL,
      tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE
    );
  `, 'purchase_invoice_items table');

  await exec(`
    CREATE INDEX IF NOT EXISTS idx_purchase_invoice_items_invoice ON purchase_invoice_items(purchase_invoice_id);
  `, 'purchase_invoice_items indexes');

  console.log('✨ [CRM-INVENTORY] Migration completed successfully.');
}

if (require.main === module) {
  runMigration()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Fatal migration error:', err);
      process.exit(1);
    });
}

module.exports = runMigration;
