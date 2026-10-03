const fs = require('fs');
const path = require('path');
const db = require('../../../config/db');
const { ensurePurchasesSchema } = require('../../../controllers/purchasesController');
const { ensureInvoicesTable, ensureVouchersTable } = require('../../../controllers/financeController');

async function ensureProcurementTables() {
    // A. Rename legacy ERP prototype tables if they occupy CRM table names
    await db.query(`
        DO $$
        BEGIN
            -- 1. purchase_requests legacy rename
            IF EXISTS (
                SELECT 1 FROM information_schema.tables WHERE table_name = 'purchase_requests'
            ) AND NOT EXISTS (
                SELECT 1 FROM information_schema.columns WHERE table_name = 'purchase_requests' AND column_name = 'request_number'
            ) THEN
                ALTER TABLE purchase_requests RENAME TO erp_legacy_purchase_requests;
            END IF;

            -- 2. purchase_request_items legacy rename
            IF EXISTS (
                SELECT 1 FROM information_schema.tables WHERE table_name = 'purchase_request_items'
            ) AND NOT EXISTS (
                SELECT 1 FROM information_schema.columns WHERE table_name = 'purchase_request_items' AND column_name = 'request_id'
            ) THEN
                ALTER TABLE purchase_request_items RENAME TO erp_legacy_purchase_request_items;
            END IF;

            -- 3. purchase_orders legacy rename
            IF EXISTS (
                SELECT 1 FROM information_schema.tables WHERE table_name = 'purchase_orders'
            ) AND NOT EXISTS (
                SELECT 1 FROM information_schema.columns WHERE table_name = 'purchase_orders' AND column_name = 'po_number'
            ) THEN
                ALTER TABLE purchase_orders RENAME TO erp_legacy_purchase_orders;
            END IF;

            -- 4. purchase_order_items legacy rename
            IF EXISTS (
                SELECT 1 FROM information_schema.tables WHERE table_name = 'purchase_order_items'
            ) AND NOT EXISTS (
                SELECT 1 FROM information_schema.columns WHERE table_name = 'purchase_order_items' AND column_name = 'po_id'
            ) THEN
                ALTER TABLE purchase_order_items RENAME TO erp_legacy_purchase_order_items;
            END IF;
        END $$;

        ALTER TABLE vendors ADD COLUMN IF NOT EXISTS contact_name VARCHAR(255);
        ALTER TABLE vendors ADD COLUMN IF NOT EXISTS contact_person VARCHAR(255);
        ALTER TABLE vendors ADD COLUMN IF NOT EXISTS tax_number VARCHAR(100);
        ALTER TABLE vendors ADD COLUMN IF NOT EXISTS tax_no VARCHAR(100);
        UPDATE vendors SET contact_name = contact_person WHERE contact_name IS NULL AND contact_person IS NOT NULL;
        UPDATE vendors SET contact_person = contact_name WHERE contact_person IS NULL AND contact_name IS NOT NULL;
    `);

    // B. Create CRM purchase_requests & items
    await db.query(`
        CREATE TABLE IF NOT EXISTS purchase_requests (
            id                  SERIAL PRIMARY KEY,
            request_number      VARCHAR(50) NOT NULL,
            requested_by        INTEGER REFERENCES users(id) ON DELETE SET NULL,
            department          VARCHAR(100),
            branch_id           VARCHAR(255),
            warehouse_id        INTEGER REFERENCES warehouses(id) ON DELETE SET NULL,
            priority            VARCHAR(20) NOT NULL DEFAULT 'normal'
                                CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
            required_date       DATE,
            notes               TEXT,
            status              VARCHAR(30) NOT NULL DEFAULT 'draft'
                                CHECK (status IN ('draft', 'submitted', 'approved', 'rejected', 'cancelled', 'converted_to_rfq')),
            rejection_reason    TEXT,
            approved_by         INTEGER REFERENCES users(id) ON DELETE SET NULL,
            approved_at         TIMESTAMP WITH TIME ZONE,
            tenant_id           UUID NOT NULL,
            created_at          TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at          TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_pr_tenant_reqnum ON purchase_requests (tenant_id, request_number);
        CREATE INDEX IF NOT EXISTS idx_pr_tenant_branch ON purchase_requests (tenant_id, branch_id);
        CREATE INDEX IF NOT EXISTS idx_pr_status ON purchase_requests (tenant_id, status);

        CREATE TABLE IF NOT EXISTS purchase_request_items (
            id                   SERIAL PRIMARY KEY,
            request_id           INTEGER NOT NULL REFERENCES purchase_requests(id) ON DELETE CASCADE,
            product_id          INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
            description          TEXT,
            quantity             DECIMAL(12, 3) NOT NULL CHECK (quantity > 0),
            estimated_unit_price DECIMAL(12, 2) NOT NULL DEFAULT 0.00 CHECK (estimated_unit_price >= 0),
            created_at           TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_pr_items_request ON purchase_request_items (request_id);
        CREATE INDEX IF NOT EXISTS idx_pr_items_product ON purchase_request_items (product_id);
    `);

    // C. Create CRM RFQs, Quotations & Items
    await db.query(`
        CREATE TABLE IF NOT EXISTS rfqs (
            id                  SERIAL PRIMARY KEY,
            rfq_number          VARCHAR(50) NOT NULL,
            purchase_request_id INTEGER REFERENCES purchase_requests(id) ON DELETE SET NULL,
            issue_date          DATE NOT NULL DEFAULT CURRENT_DATE,
            deadline_date       DATE,
            status              VARCHAR(30) NOT NULL DEFAULT 'draft'
                                CHECK (status IN ('draft', 'sent', 'quotes_received', 'awarded', 'closed', 'cancelled')),
            notes               TEXT,
            created_by          INTEGER REFERENCES users(id) ON DELETE SET NULL,
            tenant_id           UUID NOT NULL,
            branch_id           VARCHAR(255),
            created_at          TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at          TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_rfq_tenant_num ON rfqs (tenant_id, rfq_number);
        CREATE INDEX IF NOT EXISTS idx_rfq_tenant_status ON rfqs (tenant_id, status);
        CREATE INDEX IF NOT EXISTS idx_rfq_tenant_branch ON rfqs (tenant_id, branch_id);
        CREATE INDEX IF NOT EXISTS idx_rfq_pr_id ON rfqs (purchase_request_id);

        CREATE TABLE IF NOT EXISTS rfq_items (
            id           SERIAL PRIMARY KEY,
            rfq_id       INTEGER NOT NULL REFERENCES rfqs(id) ON DELETE CASCADE,
            product_id   INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
            quantity     DECIMAL(12, 3) NOT NULL CHECK (quantity > 0),
            target_specs TEXT,
            created_at   TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_rfq_items_rfq ON rfq_items (rfq_id);
        CREATE INDEX IF NOT EXISTS idx_rfq_items_product ON rfq_items (product_id);

        CREATE TABLE IF NOT EXISTS rfq_vendors (
            id                SERIAL PRIMARY KEY,
            rfq_id            INTEGER NOT NULL REFERENCES rfqs(id) ON DELETE CASCADE,
            vendor_id         INTEGER NOT NULL REFERENCES vendors(id) ON DELETE RESTRICT,
            invitation_status VARCHAR(30) NOT NULL DEFAULT 'sent'
                              CHECK (invitation_status IN ('sent', 'quoted', 'declined')),
            created_at        TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT uq_rfq_vendor UNIQUE (rfq_id, vendor_id)
        );
        CREATE INDEX IF NOT EXISTS idx_rfq_vendors_rfq ON rfq_vendors (rfq_id);
        CREATE INDEX IF NOT EXISTS idx_rfq_vendors_vendor ON rfq_vendors (vendor_id);

        CREATE TABLE IF NOT EXISTS vendor_quotations (
            id                  SERIAL PRIMARY KEY,
            quotation_number    VARCHAR(100) NOT NULL,
            rfq_id              INTEGER NOT NULL REFERENCES rfqs(id) ON DELETE CASCADE,
            vendor_id           INTEGER NOT NULL REFERENCES vendors(id) ON DELETE RESTRICT,
            quotation_date      DATE NOT NULL DEFAULT CURRENT_DATE,
            valid_until         DATE,
            currency            VARCHAR(10) NOT NULL DEFAULT 'EGP',
            payment_terms       TEXT,
            delivery_time_days  INTEGER NOT NULL DEFAULT 0 CHECK (delivery_time_days >= 0),
            warranty_terms      TEXT,
            subtotal            DECIMAL(14, 2) NOT NULL DEFAULT 0.00 CHECK (subtotal >= 0),
            discount_amount     DECIMAL(14, 2) NOT NULL DEFAULT 0.00 CHECK (discount_amount >= 0),
            tax_amount          DECIMAL(14, 2) NOT NULL DEFAULT 0.00 CHECK (tax_amount >= 0),
            shipping_cost       DECIMAL(14, 2) NOT NULL DEFAULT 0.00 CHECK (shipping_cost >= 0),
            total_amount        DECIMAL(14, 2) NOT NULL DEFAULT 0.00 CHECK (total_amount >= 0),
            selection_status    VARCHAR(30) NOT NULL DEFAULT 'under_review'
                                CHECK (selection_status IN ('under_review', 'selected', 'rejected', 'expired')),
            selection_notes     TEXT,
            awarded_by          INTEGER REFERENCES users(id) ON DELETE SET NULL,
            awarded_at          TIMESTAMP WITH TIME ZONE,
            tenant_id           UUID NOT NULL,
            branch_id           VARCHAR(255),
            created_at          TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at          TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_vq_tenant_vendor_qnum ON vendor_quotations (tenant_id, vendor_id, quotation_number);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_vq_rfq_vendor ON vendor_quotations (rfq_id, vendor_id);
        CREATE INDEX IF NOT EXISTS idx_vq_rfq_id ON vendor_quotations (rfq_id);
        CREATE INDEX IF NOT EXISTS idx_vq_tenant_status ON vendor_quotations (tenant_id, selection_status);

        CREATE TABLE IF NOT EXISTS vendor_quotation_items (
            id             SERIAL PRIMARY KEY,
            quotation_id   INTEGER NOT NULL REFERENCES vendor_quotations(id) ON DELETE CASCADE,
            product_id     INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
            quantity       DECIMAL(12, 3) NOT NULL CHECK (quantity > 0),
            unit_price     DECIMAL(14, 2) NOT NULL DEFAULT 0.00 CHECK (unit_price >= 0),
            discount_pct   DECIMAL(5, 2) NOT NULL DEFAULT 0.00 CHECK (discount_pct >= 0 AND discount_pct <= 100),
            tax_pct        DECIMAL(5, 2) NOT NULL DEFAULT 0.00 CHECK (tax_pct >= 0),
            subtotal       DECIMAL(14, 2) NOT NULL DEFAULT 0.00 CHECK (subtotal >= 0),
            created_at     TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_vqi_quotation ON vendor_quotation_items (quotation_id);
        CREATE INDEX IF NOT EXISTS idx_vqi_product ON vendor_quotation_items (product_id);
    `);

    // D. Create CRM purchase_orders & items
    await db.query(`
        CREATE TABLE IF NOT EXISTS purchase_orders (
            id                     SERIAL PRIMARY KEY,
            po_number              VARCHAR(50) NOT NULL,
            rfq_id                 INTEGER REFERENCES rfqs(id) ON DELETE SET NULL,
            vendor_quotation_id    INTEGER REFERENCES vendor_quotations(id) ON DELETE SET NULL,
            vendor_id              INTEGER NOT NULL REFERENCES vendors(id) ON DELETE RESTRICT,
            warehouse_id           INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
            order_date             DATE NOT NULL DEFAULT CURRENT_DATE,
            expected_delivery_date DATE,
            payment_terms          TEXT,
            shipping_terms         TEXT,
            subtotal               DECIMAL(14, 2) NOT NULL DEFAULT 0.00 CHECK (subtotal >= 0),
            discount_amount        DECIMAL(14, 2) NOT NULL DEFAULT 0.00 CHECK (discount_amount >= 0),
            tax_amount             DECIMAL(14, 2) NOT NULL DEFAULT 0.00 CHECK (tax_amount >= 0),
            shipping_cost          DECIMAL(14, 2) NOT NULL DEFAULT 0.00 CHECK (shipping_cost >= 0),
            total_amount           DECIMAL(14, 2) NOT NULL DEFAULT 0.00 CHECK (total_amount >= 0),
            status                 VARCHAR(30) NOT NULL DEFAULT 'draft'
                                   CHECK (status IN ('draft', 'approved', 'sent_to_vendor', 'partially_received', 'completed', 'cancelled')),
            notes                  TEXT,
            approved_by            INTEGER REFERENCES users(id) ON DELETE SET NULL,
            approved_at            TIMESTAMP WITH TIME ZONE,
            tenant_id              UUID NOT NULL,
            branch_id              VARCHAR(255),
            created_at             TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at             TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_po_tenant_ponum ON purchase_orders (tenant_id, po_number);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_po_tenant_quotation ON purchase_orders (tenant_id, vendor_quotation_id) WHERE vendor_quotation_id IS NOT NULL;
        CREATE INDEX IF NOT EXISTS idx_po_tenant_status ON purchase_orders (tenant_id, status);
        CREATE INDEX IF NOT EXISTS idx_po_tenant_branch ON purchase_orders (tenant_id, branch_id);
        CREATE INDEX IF NOT EXISTS idx_po_vendor ON purchase_orders (vendor_id);
        CREATE INDEX IF NOT EXISTS idx_po_warehouse ON purchase_orders (warehouse_id);
        CREATE INDEX IF NOT EXISTS idx_po_rfq ON purchase_orders (rfq_id);

        CREATE TABLE IF NOT EXISTS purchase_order_items (
            id                SERIAL PRIMARY KEY,
            po_id             INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
            product_id        INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
            quantity          DECIMAL(12, 3) NOT NULL CHECK (quantity > 0),
            received_quantity DECIMAL(12, 3) NOT NULL DEFAULT 0.000 CHECK (received_quantity >= 0),
            unit_price        DECIMAL(14, 2) NOT NULL DEFAULT 0.00 CHECK (unit_price >= 0),
            discount_pct      DECIMAL(5, 2) NOT NULL DEFAULT 0.00 CHECK (discount_pct >= 0 AND discount_pct <= 100),
            tax_pct           DECIMAL(5, 2) NOT NULL DEFAULT 0.00 CHECK (tax_pct >= 0),
            subtotal          DECIMAL(14, 2) NOT NULL DEFAULT 0.00 CHECK (subtotal >= 0),
            created_at        TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT chk_poi_received_qty CHECK (received_quantity <= quantity)
        );
        CREATE INDEX IF NOT EXISTS idx_poi_po ON purchase_order_items (po_id);
        CREATE INDEX IF NOT EXISTS idx_poi_product ON purchase_order_items (product_id);
    `);
}

async function runMigrations() {
    console.log('🔄 [Migration Runner] Starting database schema verification & migrations...');

    // 1. Ensure core Finance and Purchases schemas first
    try {
        if (ensureInvoicesTable) await ensureInvoicesTable();
        if (ensureVouchersTable) await ensureVouchersTable();
        if (ensurePurchasesSchema) await ensurePurchasesSchema();
        console.log('✅ [Migration Runner] Core finance & purchases schemas verified.');
    } catch (err) {
        console.error('❌ [Migration Runner] Error ensuring core schemas:', err.message);
    }

    // 2. Ensure CRM procurement schema & rename any colliding legacy tables
    try {
        await ensureProcurementTables();
        console.log('✅ [Migration Runner] All procurement tables ensured (PR, RFQ, PO, Items).');
    } catch (err) {
        console.error('❌ [Migration Runner] Error ensuring procurement tables:', err.message);
    }

    // 3. Ensure schema_migrations tracker table
    await db.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
            name VARCHAR(255) PRIMARY KEY,
            applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
    `);

    // 4. Scan and apply migrations in order
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
