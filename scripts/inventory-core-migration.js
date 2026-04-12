const db = require('../config/db');

/**
 * Enterprise Inventory MVP (Event Sourced Stock Movements Ledger)
 */
const migrate = async () => {
    try {
        console.log('--- 📦 Enterprise Logistics: Inventory Core Deployment ---');

        await db.query('BEGIN');

        console.log('1. Building Base [warehouses] nodes...');
        await db.query(`
            CREATE TABLE IF NOT EXISTS warehouses (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
                branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
                
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                
                -- Ensure no duplicate warehouse names per branch
                UNIQUE (name, branch_id)
            );
        `);

        console.log('2. Building strict Immutable Ledger [stock_movements]...');
        await db.query(`
            CREATE TABLE IF NOT EXISTS stock_movements (
                id SERIAL PRIMARY KEY,
                tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
                branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
                
                product_id INTEGER REFERENCES products(id) ON DELETE RESTRICT,
                
                from_warehouse_id INTEGER REFERENCES warehouses(id) ON DELETE RESTRICT,
                to_warehouse_id INTEGER REFERENCES warehouses(id) ON DELETE RESTRICT,
                
                type VARCHAR(50) NOT NULL, -- in, out, transfer, adjustment
                
                quantity DECIMAL(15, 4) NOT NULL,
                
                reference_type VARCHAR(100), -- 'sale', 'purchase', 'manual'
                reference_id VARCHAR(100),
                
                status VARCHAR(50) DEFAULT 'pending', -- pending, approved
                
                created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
                approved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
                
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                
                CONSTRAINT chk_stock_qty CHECK (quantity > 0),
                CONSTRAINT chk_stock_type CHECK (type IN ('in', 'out', 'transfer', 'adjustment'))
            );
        `);

        console.log('3. Applying Logistics Scoping Indexes...');
        // Multitenant mapping indexes
        await db.query(`CREATE INDEX IF NOT EXISTS idx_stock_movements_iso ON stock_movements (tenant_id, branch_id);`);
        await db.query(`CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements (product_id);`);
        // Index over the status engine for the Live Dynamic SUM queries
        await db.query(`CREATE INDEX IF NOT EXISTS idx_stock_movements_engine ON stock_movements (product_id, status);`);

        await db.query('COMMIT');

        console.log('✅ Inventory Tables Deployed (Warehouses & Strict Movements Ledger).');
        console.log('🚀 [FINAL] Migrations passed securely.');
        process.exit(0);
    } catch (err) {
        await db.query('ROLLBACK');
        console.error('💣 [FATAL] Logistics Migration Error:', err.message);
        process.exit(1);
    }
};

migrate();
