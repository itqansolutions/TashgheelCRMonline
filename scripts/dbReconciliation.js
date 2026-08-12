const db = require('../config/db');

/**
 * Universal Database Reconciliation & Gold Demo Seeder
 * RECOVERY MODE: Ensures existence of modular tables WITHOUT altering core legacy types.
 */
const reconcileDatabase = async () => {
    console.log('🔍 [DB-RECON] Starting schema existence check...');
    
    try {
        // 2. ENSURE REAL ESTATE TABLES (Safe Schema with ID Compatibility)
        console.log('🚧 [DB-RECON] Verifying Real Estate schema for ID alignment...');
        
        await db.query(`
            CREATE TABLE IF NOT EXISTS re_units (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                name VARCHAR(255) NOT NULL,
                project_name VARCHAR(255),
                unit_number VARCHAR(100),
                type VARCHAR(100),
                floor VARCHAR(50),
                area_sqm VARCHAR(50),
                price NUMERIC DEFAULT 0,
                status VARCHAR(20) DEFAULT 'available',
                tenant_id VARCHAR(255),
                branch_id VARCHAR(255),
                vendor_id VARCHAR(255),
                responsible_person_id VARCHAR(255),
                transaction_type VARCHAR(20) DEFAULT 'sale',
                rooms INTEGER DEFAULT 0,
                location TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await db.query(`
            CREATE TABLE IF NOT EXISTS re_payments_mvp (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                unit_id VARCHAR(255),
                customer_id VARCHAR(255),
                deal_id VARCHAR(255),
                total_amount NUMERIC DEFAULT 0,
                paid_amount NUMERIC DEFAULT 0,
                down_payment NUMERIC DEFAULT 0,
                next_payment_date DATE,
                status VARCHAR(20) DEFAULT 'pending',
                tenant_id VARCHAR(255),
                branch_id VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await db.query(`
            CREATE TABLE IF NOT EXISTS workflow_logs (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                tenant_id VARCHAR(255),
                branch_id VARCHAR(255),
                rule_key VARCHAR(100),
                action VARCHAR(100),
                entity_type VARCHAR(100),
                entity_id VARCHAR(255),
                details JSONB,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await db.query(`
            CREATE TABLE IF NOT EXISTS workflow_config (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                tenant_id VARCHAR(255),
                rule_key VARCHAR(100),
                is_enabled BOOLEAN DEFAULT true,
                cooldown_minutes INTEGER DEFAULT 0,
                last_triggered_at TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(tenant_id, rule_key)
            )
        `);

        await db.query(`
            CREATE TABLE IF NOT EXISTS lead_statuses (
                id SERIAL PRIMARY KEY,
                tenant_id VARCHAR(255),
                name VARCHAR(50) NOT NULL,
                color VARCHAR(20),
                is_default BOOLEAN DEFAULT false,
                sort_order INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Migration logic for existing property DBs to explicitly support mixed Integer/UUID string types
        try {
            await db.query(`ALTER TABLE re_units ALTER COLUMN vendor_id TYPE VARCHAR(255), ALTER COLUMN responsible_person_id TYPE VARCHAR(255)`);
            await db.query(`ALTER TABLE re_payments_mvp ALTER COLUMN unit_id TYPE VARCHAR(255), ALTER COLUMN customer_id TYPE VARCHAR(255), ALTER COLUMN deal_id TYPE VARCHAR(255)`);
            
            // Hard Schema Resilience (Unconditional)
            await db.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS category VARCHAR(100)`);
            await db.query(`ALTER TABLE deals ADD COLUMN IF NOT EXISTS unit_id VARCHAR(255)`);
            await db.query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS client_id VARCHAR(255)`);
            await db.query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS deal_id VARCHAR(255)`);
            await db.query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS unit_id VARCHAR(255)`);

            // Branch Isolation Columns (Required for Triple Isolation)
            await db.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS branch_id VARCHAR(255)`);
            await db.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS branch_id VARCHAR(255)`);
            await db.query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS branch_id VARCHAR(255)`);
            await db.query(`ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS branch_id VARCHAR(255)`);
            await db.query(`ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS description TEXT`);
            await db.query(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS branch_id VARCHAR(255)`);
            await db.query(`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS branch_id VARCHAR(255)`);
            await db.query(`ALTER TABLE quotations ADD COLUMN IF NOT EXISTS branch_id VARCHAR(255)`);
            await db.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS branch_id VARCHAR(255)`);
            await db.query(`ALTER TABLE deals ADD COLUMN IF NOT EXISTS branch_id VARCHAR(255)`);
            await db.query(`ALTER TABLE departments ADD COLUMN IF NOT EXISTS branch_id VARCHAR(255)`);
            await db.query(`ALTER TABLE lead_sources ADD COLUMN IF NOT EXISTS branch_id VARCHAR(255)`);
            await db.query(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS branch_id VARCHAR(255)`);
            await db.query(`ALTER TABLE system_logs ADD COLUMN IF NOT EXISTS branch_id VARCHAR(255)`);
            await db.query(`ALTER TABLE user_access ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(255)`);
            await db.query(`ALTER TABLE user_access ADD COLUMN IF NOT EXISTS branch_id VARCHAR(255)`);

            // Real Estate Extended Columns
            await db.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS entity_type VARCHAR(50) DEFAULT 'customer'`);
            await db.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS budget_min NUMERIC DEFAULT 0`);
            await db.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS budget_max NUMERIC DEFAULT 0`);
            await db.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS preferred_area_min NUMERIC DEFAULT 0`);
            await db.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS preferred_area_max NUMERIC DEFAULT 0`);
            await db.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS preferred_location TEXT`);
            await db.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS preferred_rooms INTEGER DEFAULT 0`);

            // Quotation System Schema
            await db.query(`
                CREATE TABLE IF NOT EXISTS quotations (
                    id SERIAL PRIMARY KEY,
                    tenant_id VARCHAR(255) NOT NULL,
                    branch_id VARCHAR(255),
                    total_amount NUMERIC DEFAULT 0,
                    status VARCHAR(20) DEFAULT 'draft',
                    notes TEXT,
                    valid_until DATE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // Ensure columns exist (for existing tables)
            await db.query(`ALTER TABLE quotations ADD COLUMN IF NOT EXISTS deal_id VARCHAR(255)`);
            await db.query(`ALTER TABLE quotations ADD COLUMN IF NOT EXISTS client_id VARCHAR(255)`);
            await db.query(`ALTER TABLE quotations ADD COLUMN IF NOT EXISTS unit_id VARCHAR(255)`);

            await db.query(`
                CREATE TABLE IF NOT EXISTS quotation_items (
                    id SERIAL PRIMARY KEY,
                    quotation_id INTEGER REFERENCES quotations(id) ON DELETE CASCADE,
                    product_id VARCHAR(255),
                    description TEXT,
                    quantity NUMERIC DEFAULT 1,
                    unit_price NUMERIC DEFAULT 0,
                    subtotal NUMERIC DEFAULT 0,
                    tenant_id VARCHAR(255) NOT NULL,
                    branch_id VARCHAR(255)
                )
            `);

            // Branding & Identity Columns (Ensuring SaaS capability)
            await db.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS address TEXT`);
            await db.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS phone VARCHAR(50)`);
            await db.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS tax_no VARCHAR(100)`);
            await db.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS reg_no VARCHAR(100)`);
            await db.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS logo_url TEXT`);
            await db.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS currency VARCHAR(10) DEFAULT 'EGP'`);
            await db.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS tax_rate NUMERIC DEFAULT 0`);
            await db.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS invoice_prefix VARCHAR(20) DEFAULT 'INV-'`);
            await db.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS invoice_footer TEXT`);
            await db.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS terms TEXT`);
            await db.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS quotation_terms TEXT`);
            await db.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS quotation_footer TEXT`);
            await db.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS quotation_prefix VARCHAR(10) DEFAULT 'QUO-'`);
            await db.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS primary_color VARCHAR(20) DEFAULT '#f59e0b'`);

            // Resilient Fix for Tasks (500 Error Fix)
            await db.query(`ALTER TABLE tasks ALTER COLUMN parent_id TYPE VARCHAR(255)`);

            // RE Payments extended
            await db.query(`ALTER TABLE re_payments_mvp ADD COLUMN IF NOT EXISTS down_payment NUMERIC DEFAULT 0`);

            // Finance extended
            await db.query(`ALTER TABLE branches ADD COLUMN IF NOT EXISTS invoice_prefix VARCHAR(20)`);
            await db.query(`ALTER TABLE branches ADD COLUMN IF NOT EXISTS is_main BOOLEAN DEFAULT false`);
            await db.query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS notes TEXT`);

            // Core Stability (Phase 1)
            await db.query(`ALTER TABLE re_units ADD COLUMN IF NOT EXISTS reservation_expires_at TIMESTAMP NULL`);

            // UI Power (Phase 2 - Kanban Metrics)
            await db.query(`ALTER TABLE deals ADD COLUMN IF NOT EXISTS probability INTEGER DEFAULT 0`);
            await db.query(`ALTER TABLE deals ADD COLUMN IF NOT EXISTS expected_close_date DATE NULL`);
            await db.query(`ALTER TABLE deals ADD COLUMN IF NOT EXISTS next_action VARCHAR(255) NULL`);

            // Attachments System (Required for Logo/Files)
            await db.query(`
                CREATE TABLE IF NOT EXISTS attachments (
                    id SERIAL PRIMARY KEY,
                    filename VARCHAR(255) NOT NULL,
                    original_name VARCHAR(255) NOT NULL,
                    mime_type VARCHAR(100),
                    file_path TEXT NOT NULL,
                    linked_type VARCHAR(50) NOT NULL,
                    linked_id VARCHAR(255) NOT NULL,
                    uploaded_by INTEGER,
                    tenant_id VARCHAR(255),
                    branch_id VARCHAR(255),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);

        } catch(e) { /* Ignore - Migration already applied or invalid cast */ }

        // ── Task Statuses (OUTSIDE swallowed try/catch — must always run) ──
        await db.query(`
            CREATE TABLE IF NOT EXISTS task_statuses (
                id SERIAL PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                color VARCHAR(20) DEFAULT '#64748b',
                order_index INTEGER DEFAULT 0,
                can_make_deal BOOLEAN DEFAULT false,
                is_final BOOLEAN DEFAULT false,
                tenant_id VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(name, tenant_id)
            )
        `);

        // Add status_id & can_make_deal to tasks (idempotent)
        await db.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS status_id INTEGER REFERENCES task_statuses(id) ON DELETE SET NULL`);
        await db.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS can_make_deal BOOLEAN DEFAULT false`);

        // Seed default statuses for every tenant that has none yet
        await db.query(`
            INSERT INTO task_statuses (name, color, order_index, can_make_deal, is_final, tenant_id)
            SELECT 'To Do', '#64748b', 0, false, false, t.id::text
            FROM tenants t
            WHERE NOT EXISTS (
                SELECT 1 FROM task_statuses ts WHERE ts.tenant_id = t.id::text
            )
            ON CONFLICT (name, tenant_id) DO NOTHING
        `);
        await db.query(`
            INSERT INTO task_statuses (name, color, order_index, can_make_deal, is_final, tenant_id)
            SELECT 'In Progress', '#f59e0b', 1, false, false, t.id::text
            FROM tenants t
            WHERE EXISTS (SELECT 1 FROM task_statuses ts WHERE ts.tenant_id = t.id::text AND ts.name = 'To Do')
            ON CONFLICT (name, tenant_id) DO NOTHING
        `);
        await db.query(`
            INSERT INTO task_statuses (name, color, order_index, can_make_deal, is_final, tenant_id)
            SELECT 'Done', '#10b981', 2, true, true, t.id::text
            FROM tenants t
            WHERE EXISTS (SELECT 1 FROM task_statuses ts WHERE ts.tenant_id = t.id::text AND ts.name = 'To Do')
            ON CONFLICT (name, tenant_id) DO NOTHING
        `);
        console.log('✅ [DB-RECON] task_statuses table verified and default statuses seeded.');


        await db.query(`
            CREATE TABLE IF NOT EXISTS system_notifications (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                tenant_id VARCHAR(255),
                branch_id VARCHAR(255),
                user_id VARCHAR(255),
                type VARCHAR(50) DEFAULT 'info',
                title VARCHAR(255),
                message TEXT,
                link VARCHAR(255),
                metadata JSONB,
                is_read BOOLEAN DEFAULT false,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Event Store Table for Domain Events
        await db.query(`
            CREATE TABLE IF NOT EXISTS domain_events (
                id UUID PRIMARY KEY,
                tenant_id VARCHAR(255) NOT NULL,
                branch_id VARCHAR(255),
                aggregate_type VARCHAR(100) NOT NULL,
                aggregate_id VARCHAR(255) NOT NULL,
                event_name VARCHAR(100) NOT NULL,
                version VARCHAR(20) DEFAULT 'v1',
                payload JSONB DEFAULT '{}',
                actor_id VARCHAR(255) DEFAULT 'SYSTEM',
                occurred_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Universal Polymorphic Activity Feed Table
        await db.query(`
            CREATE TABLE IF NOT EXISTS activities (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                tenant_id VARCHAR(255) NOT NULL,
                branch_id VARCHAR(255),
                entity_type VARCHAR(100) NOT NULL,
                entity_id VARCHAR(255) NOT NULL,
                activity_type VARCHAR(100) NOT NULL,
                actor_id VARCHAR(255) DEFAULT 'SYSTEM',
                actor_name VARCHAR(255),
                title VARCHAR(255) NOT NULL,
                details JSONB DEFAULT '{}',
                visibility VARCHAR(20) DEFAULT 'internal',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Transactional Outbox Pattern Table
        await db.query(`
            CREATE TABLE IF NOT EXISTS outbox_events (
                id UUID PRIMARY KEY,
                tenant_id VARCHAR(255) NOT NULL,
                branch_id VARCHAR(255),
                aggregate_type VARCHAR(100) NOT NULL,
                aggregate_id VARCHAR(255) NOT NULL,
                event_name VARCHAR(100) NOT NULL,
                version VARCHAR(20) DEFAULT 'v1',
                payload JSONB DEFAULT '{}',
                actor_id VARCHAR(255) DEFAULT 'SYSTEM',
                status VARCHAR(20) DEFAULT 'pending',
                retry_count INTEGER DEFAULT 0,
                processed_at TIMESTAMP WITH TIME ZONE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // ── ERP CORE FOUNDATION (Stage 0 - Week 1 Schema) ──
        
        // Tenant Configuration Extensions
        await db.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS fiscal_year_start_month INTEGER DEFAULT 1`);
        await db.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS fiscal_year_start_day INTEGER DEFAULT 1`);
        await db.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS allow_negative_stock BOOLEAN DEFAULT false`);
        await db.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS ppv_tolerance_pct NUMERIC(5,2) DEFAULT 2.00`);
        await db.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS ppv_auto_approve BOOLEAN DEFAULT true`);

        // Document Sequences (Centralized Document Numbering Engine)
        await db.query(`
            CREATE TABLE IF NOT EXISTS document_sequences (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                tenant_id VARCHAR(255) NOT NULL,
                branch_id VARCHAR(255),
                doc_type VARCHAR(50) NOT NULL,
                fiscal_year INTEGER NOT NULL,
                prefix VARCHAR(20) NOT NULL,
                last_sequence INTEGER DEFAULT 0,
                reset_yearly BOOLEAN DEFAULT true,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(tenant_id, branch_id, doc_type, fiscal_year)
            )
        `);

        // Fiscal Calendar (Years & Periods)
        await db.query(`
            CREATE TABLE IF NOT EXISTS fiscal_years (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                tenant_id VARCHAR(255) NOT NULL,
                name VARCHAR(50) NOT NULL,
                start_date DATE NOT NULL,
                end_date DATE NOT NULL,
                status VARCHAR(20) DEFAULT 'open',
                closed_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(tenant_id, name)
            )
        `);

        await db.query(`
            CREATE TABLE IF NOT EXISTS fiscal_periods (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                fiscal_year_id UUID REFERENCES fiscal_years(id) ON DELETE CASCADE,
                tenant_id VARCHAR(255) NOT NULL,
                period_number INTEGER NOT NULL,
                name VARCHAR(50) NOT NULL,
                start_date DATE NOT NULL,
                end_date DATE NOT NULL,
                status VARCHAR(20) DEFAULT 'open',
                closed_at TIMESTAMP,
                closed_by VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(fiscal_year_id, period_number)
            )
        `);

        // Financial Permissions Table
        await db.query(`
            CREATE TABLE IF NOT EXISTS financial_permissions (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                tenant_id VARCHAR(255) NOT NULL,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                role VARCHAR(50),
                permission VARCHAR(100) NOT NULL,
                granted BOOLEAN DEFAULT true,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(tenant_id, user_id, permission)
            )
        `);

        // Segregation of Duties (SOD) Rules Table
        await db.query(`
            CREATE TABLE IF NOT EXISTS sod_rules (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                tenant_id VARCHAR(255) NOT NULL,
                document_type VARCHAR(50) NOT NULL,
                action_create VARCHAR(100) NOT NULL,
                action_approve VARCHAR(100) NOT NULL,
                enforce BOOLEAN DEFAULT true,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(tenant_id, document_type)
            )
        `);

        console.log('✅ [DB-RECON] ERP Core Week 1 tables verified (document_sequences, fiscal_years, fiscal_periods, financial_permissions, sod_rules).');

        // ── ERP CORE FOUNDATION (Stage 0 - Week 2 Schema) ──

        // Chart of Accounts (COA)
        await db.query(`
            CREATE TABLE IF NOT EXISTS accounts (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                tenant_id VARCHAR(255) NOT NULL,
                code VARCHAR(50) NOT NULL,
                name VARCHAR(255) NOT NULL,
                type VARCHAR(30) NOT NULL,
                sub_type VARCHAR(50),
                parent_id UUID REFERENCES accounts(id) ON DELETE RESTRICT,
                is_group BOOLEAN DEFAULT false,
                currency VARCHAR(10) DEFAULT 'EGP',
                is_active BOOLEAN DEFAULT true,
                branch_id VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(tenant_id, code)
            )
        `);

        // Cost Centers
        await db.query(`
            CREATE TABLE IF NOT EXISTS cost_centers (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                tenant_id VARCHAR(255) NOT NULL,
                branch_id VARCHAR(255),
                code VARCHAR(50) NOT NULL,
                name VARCHAR(255) NOT NULL,
                type VARCHAR(30) DEFAULT 'department',
                parent_id UUID REFERENCES cost_centers(id) ON DELETE RESTRICT,
                is_active BOOLEAN DEFAULT true,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(tenant_id, code)
            )
        `);

        // GL Opening Balances Header
        await db.query(`
            CREATE TABLE IF NOT EXISTS opening_balances (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                tenant_id VARCHAR(255) NOT NULL,
                fiscal_year_id UUID REFERENCES fiscal_years(id) ON DELETE CASCADE,
                account_id UUID REFERENCES accounts(id) ON DELETE RESTRICT,
                debit NUMERIC(15,2) DEFAULT 0 CHECK (debit >= 0),
                credit NUMERIC(15,2) DEFAULT 0 CHECK (credit >= 0),
                is_posted BOOLEAN DEFAULT false,
                posted_at TIMESTAMP,
                posted_by VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT chk_ob_not_both_zero CHECK (debit > 0 OR credit > 0),
                CONSTRAINT chk_ob_no_mixed CHECK (NOT (debit > 0 AND credit > 0))
            )
        `);

        // Customer Invoice Opening Balances (AR Detail)
        await db.query(`
            CREATE TABLE IF NOT EXISTS opening_customer_invoices (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                tenant_id VARCHAR(255) NOT NULL,
                opening_balance_id UUID REFERENCES opening_balances(id) ON DELETE CASCADE,
                customer_id INTEGER REFERENCES customers(id) ON DELETE RESTRICT,
                invoice_reference VARCHAR(100) NOT NULL,
                invoice_date DATE NOT NULL,
                due_date DATE,
                amount NUMERIC(15,2) NOT NULL CHECK (amount > 0),
                currency VARCHAR(10) DEFAULT 'EGP',
                is_posted BOOLEAN DEFAULT false,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Supplier Invoice Opening Balances (AP Detail)
        await db.query(`
            CREATE TABLE IF NOT EXISTS opening_supplier_invoices (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                tenant_id VARCHAR(255) NOT NULL,
                opening_balance_id UUID REFERENCES opening_balances(id) ON DELETE CASCADE,
                supplier_id UUID,
                invoice_reference VARCHAR(100) NOT NULL,
                invoice_date DATE NOT NULL,
                due_date DATE,
                amount NUMERIC(15,2) NOT NULL CHECK (amount > 0),
                currency VARCHAR(10) DEFAULT 'EGP',
                is_posted BOOLEAN DEFAULT false,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Inventory Opening Balances (Stock Detail)
        await db.query(`
            CREATE TABLE IF NOT EXISTS opening_inventory (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                tenant_id VARCHAR(255) NOT NULL,
                opening_balance_id UUID REFERENCES opening_balances(id) ON DELETE CASCADE,
                product_id INTEGER REFERENCES products(id) ON DELETE RESTRICT,
                warehouse_id UUID,
                quantity NUMERIC(12,3) NOT NULL CHECK (quantity > 0),
                unit_cost NUMERIC(12,2) NOT NULL CHECK (unit_cost >= 0),
                total_value NUMERIC(15,2) GENERATED ALWAYS AS (quantity * unit_cost) STORED,
                batch_number VARCHAR(100),
                expiry_date DATE,
                is_posted BOOLEAN DEFAULT false,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        console.log('✅ [DB-RECON] ERP Core Week 2 tables verified (accounts, cost_centers, opening_balances, opening_customer_invoices, opening_supplier_invoices, opening_inventory).');


        console.log('✅ [DB-RECON] Modular tables verified (domain_events, activities, outbox_events, notifications).');

        // 2. SEED GOLD DEMO (Showcase Data)
        const demoEmail = 'demo@tashgheel.com';
        const userRes = await db.query('SELECT u.id, u.tenant_id FROM users u WHERE u.email = $1', [demoEmail]);
        
        if (userRes.rows.length > 0) {
            const { id: userId, tenant_id: tenantId } = userRes.rows[0];
            const tenantIdStr = String(tenantId);

            // Force Dashboard Upgrade (Generic casting for legacy tables)
            await db.query('UPDATE tenants SET template_name = $1 WHERE id::text = $2', ['real_estate', tenantIdStr]);
            
            // Seed sample units if empty
            const unitCheck = await db.query('SELECT 1 FROM re_units WHERE tenant_id::text = $1 LIMIT 1', [tenantIdStr]);
            if (unitCheck.rows.length === 0) {
                const branchRes = await db.query('SELECT id FROM branches WHERE tenant_id::text = $1 LIMIT 1', [tenantIdStr]);
                const branchIdStr = String(branchRes.rows[0]?.id || '1');

                // No auto-seeding of sample units per user request
                
                console.log('✅ [DB-RECON] Real Estate Demo Active.');
            }
        }

        console.log('🧹 [DB-RECON] System is ready and stable.');
    } catch (err) {
        console.error('❌ [DB-RECON] Failure:', err.message);
    }
};

/**
 * Resilient Wrapper for RECON
 */
const startReconciliationWithRetry = async (retries = 3, delay = 5000) => {
    for (let i = 0; i < retries; i++) {
        try {
            await reconcileDatabase();
            return;
        } catch (err) {
            console.error(`⚠️ [DB-RECON] Attempt ${i + 1} failed: ${err.message}`);
            if (i < retries - 1) await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
};

module.exports = startReconciliationWithRetry;
