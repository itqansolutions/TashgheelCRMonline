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

        // ── ERP CORE FOUNDATION (Stage 0 - Week 3 Schema) ──

        // Tax Components (VAT, WHT, Stamp Duty, etc.)
        await db.query(`
            CREATE TABLE IF NOT EXISTS tax_components (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                tenant_id VARCHAR(255) NOT NULL,
                name VARCHAR(100) NOT NULL,
                code VARCHAR(20) NOT NULL,
                rate NUMERIC(5,2) NOT NULL,
                type VARCHAR(30) DEFAULT 'percentage',
                applies_to VARCHAR(20) DEFAULT 'both',
                is_inclusive BOOLEAN DEFAULT false,
                is_withholding BOOLEAN DEFAULT false,
                gl_account_id UUID REFERENCES accounts(id),
                country_code VARCHAR(10) DEFAULT 'EG',
                is_active BOOLEAN DEFAULT true,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(tenant_id, code)
            )
        `);

        // Tax Groups (Bundle multiple components like VAT 14% + WHT 1%)
        await db.query(`
            CREATE TABLE IF NOT EXISTS tax_groups (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                tenant_id VARCHAR(255) NOT NULL,
                name VARCHAR(100) NOT NULL,
                code VARCHAR(20) NOT NULL,
                description TEXT,
                is_active BOOLEAN DEFAULT true,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(tenant_id, code)
            )
        `);

        await db.query(`
            CREATE TABLE IF NOT EXISTS tax_group_components (
                tax_group_id UUID REFERENCES tax_groups(id) ON DELETE CASCADE,
                tax_component_id UUID REFERENCES tax_components(id) ON DELETE CASCADE,
                PRIMARY KEY (tax_group_id, tax_component_id)
            )
        `);

        // Document Line Tax Breakdown Storage
        await db.query(`
            CREATE TABLE IF NOT EXISTS document_line_taxes (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                tenant_id VARCHAR(255) NOT NULL,
                document_type VARCHAR(50) NOT NULL,
                document_line_id UUID NOT NULL,
                tax_component_id UUID REFERENCES tax_components(id),
                taxable_amount NUMERIC(15,2) NOT NULL,
                tax_rate NUMERIC(5,2) NOT NULL,
                tax_amount NUMERIC(15,2) NOT NULL,
                is_inclusive BOOLEAN DEFAULT false,
                is_withholding BOOLEAN DEFAULT false,
                wht_account_id UUID REFERENCES accounts(id),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        console.log('✅ [DB-RECON] ERP Core Week 3 tables verified (tax_components, tax_groups, tax_group_components, document_line_taxes).');

        // ── ERP CORE FOUNDATION (Stage 0 - Week 4 Schema) ──

        // Journal Entries Header (with Idempotency Unique Constraint)
        await db.query(`
            CREATE TABLE IF NOT EXISTS journal_entries (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                tenant_id VARCHAR(255) NOT NULL,
                branch_id VARCHAR(255),
                number VARCHAR(50) NOT NULL,
                date DATE NOT NULL DEFAULT CURRENT_DATE,
                fiscal_period_id UUID REFERENCES fiscal_periods(id),
                description TEXT,
                source_type VARCHAR(50) NOT NULL,
                source_id VARCHAR(255) NOT NULL,
                entry_purpose VARCHAR(50) NOT NULL,
                status VARCHAR(20) DEFAULT 'posted',
                reversal_of UUID REFERENCES journal_entries(id),
                posted_by VARCHAR(255),
                posted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE (tenant_id, source_type, source_id, entry_purpose)
            )
        `);

        // Journal Entry Lines (Double Entry + Multi-Currency + DB Financial Constraints)
        await db.query(`
            CREATE TABLE IF NOT EXISTS journal_entry_lines (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                journal_entry_id UUID REFERENCES journal_entries(id) ON DELETE CASCADE,
                account_id UUID REFERENCES accounts(id) ON DELETE RESTRICT,
                debit NUMERIC(15,2) DEFAULT 0 CHECK (debit >= 0),
                credit NUMERIC(15,2) DEFAULT 0 CHECK (credit >= 0),
                transaction_currency VARCHAR(10) DEFAULT 'EGP',
                exchange_rate NUMERIC(12,6) DEFAULT 1.000000,
                foreign_debit NUMERIC(15,2) DEFAULT 0 CHECK (foreign_debit >= 0),
                foreign_credit NUMERIC(15,2) DEFAULT 0 CHECK (foreign_credit >= 0),
                cost_center_id UUID REFERENCES cost_centers(id),
                description TEXT,
                tenant_id VARCHAR(255) NOT NULL,
                CONSTRAINT chk_no_mixed_dr_cr CHECK (NOT (debit > 0 AND credit > 0)),
                CONSTRAINT chk_not_both_zero CHECK (debit > 0 OR credit > 0)
            )
        `);

        // Deferred Journal Entry Balance Check Trigger (PostgreSQL Constraint Trigger)
        try {
            await db.query(`
                CREATE OR REPLACE FUNCTION check_journal_balance()
                RETURNS TRIGGER AS $$
                DECLARE
                    total_dr NUMERIC;
                    total_cr NUMERIC;
                BEGIN
                    SELECT COALESCE(SUM(debit), 0), COALESCE(SUM(credit), 0)
                    INTO total_dr, total_cr
                    FROM journal_entry_lines
                    WHERE journal_entry_id = NEW.journal_entry_id;

                    IF ABS(total_dr - total_cr) > 0.01 THEN
                        RAISE EXCEPTION 'Journal entry % is imbalanced: DR=% CR=%',
                            NEW.journal_entry_id, total_dr, total_cr;
                    END IF;
                    RETURN NEW;
                END;
                $$ LANGUAGE plpgsql;
            `);

            await db.query(`
                DROP TRIGGER IF EXISTS trg_journal_balance ON journal_entry_lines;
                CREATE CONSTRAINT TRIGGER trg_journal_balance
                AFTER INSERT OR UPDATE ON journal_entry_lines
                DEFERRABLE INITIALLY DEFERRED
                FOR EACH ROW EXECUTE FUNCTION check_journal_balance();
            `);
        } catch (trigErr) {
            console.warn('⚠️ [DB-RECON] Trigger creation notice (handled):', trigErr.message);
        }

        // Document Snapshots & Versioning
        await db.query(`
            CREATE TABLE IF NOT EXISTS document_versions (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                tenant_id VARCHAR(255) NOT NULL,
                document_type VARCHAR(50) NOT NULL,
                document_id VARCHAR(255) NOT NULL,
                version_number INTEGER NOT NULL,
                snapshot JSONB NOT NULL,
                changed_by VARCHAR(255),
                changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                change_reason TEXT
            )
        `);

        console.log('✅ [DB-RECON] ERP Core Week 4 tables verified (journal_entries, journal_entry_lines, document_versions).');

        // ── ERP CORE FOUNDATION (Stage 0 - Week 6 Schema & Views) ──

        // Payment Allocations Table (Multi-Invoice Payment Settlement)
        await db.query(`
            CREATE TABLE IF NOT EXISTS payment_allocations (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                tenant_id VARCHAR(255) NOT NULL,
                payment_id VARCHAR(255) NOT NULL,
                invoice_id VARCHAR(255),
                supplier_invoice_id VARCHAR(255),
                amount_allocated NUMERIC(15,2) NOT NULL CHECK (amount_allocated > 0),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // PostgreSQL AR Subledger & GL Reconciliation Views
        try {
            await db.query(`
                CREATE OR REPLACE VIEW v_ar_subledger AS
                WITH invoice_charges AS (
                    SELECT
                        je.tenant_id,
                        i.client_id::text AS customer_id,
                        i.id::text AS invoice_id,
                        je.date,
                        SUM(jel.debit) AS charged
                    FROM journal_entry_lines jel
                    JOIN journal_entries je ON jel.journal_entry_id = je.id AND je.status = 'posted'
                    JOIN accounts a ON jel.account_id = a.id AND a.sub_type = 'receivable'
                    JOIN invoices i ON je.source_id::text = i.id::text AND je.source_type = 'invoice'
                    GROUP BY je.tenant_id, i.client_id, i.id, je.date
                ),
                invoice_payments AS (
                    SELECT
                        pa.tenant_id,
                        i.client_id::text AS customer_id,
                        pa.invoice_id::text AS invoice_id,
                        SUM(pa.amount_allocated) AS paid
                    FROM payment_allocations pa
                    JOIN invoices i ON pa.invoice_id::text = i.id::text
                    GROUP BY pa.tenant_id, i.client_id, pa.invoice_id
                )
                SELECT
                    ic.tenant_id,
                    ic.customer_id,
                    c.name AS customer_name,
                    ic.invoice_id,
                    ic.date,
                    ic.charged,
                    COALESCE(ip.paid, 0) AS paid,
                    (ic.charged - COALESCE(ip.paid, 0)) AS outstanding
                FROM invoice_charges ic
                LEFT JOIN invoice_payments ip ON ic.invoice_id = ip.invoice_id AND ic.customer_id = ip.customer_id
                LEFT JOIN customers c ON ic.customer_id = c.id::text;
            `);

            await db.query(`
                CREATE OR REPLACE VIEW v_ar_gl_reconciliation AS
                SELECT
                    gl.tenant_id,
                    gl.gl_ar_balance,
                    sub.subledger_outstanding,
                    ABS(gl.gl_ar_balance - sub.subledger_outstanding) AS difference,
                    CASE WHEN ABS(gl.gl_ar_balance - sub.subledger_outstanding) < 0.01
                         THEN 'RECONCILED' ELSE 'MISMATCH' END AS status
                FROM (
                    SELECT jel.tenant_id, SUM(jel.debit) - SUM(jel.credit) AS gl_ar_balance
                    FROM journal_entry_lines jel
                    JOIN journal_entries je ON jel.journal_entry_id = je.id AND je.status = 'posted'
                    JOIN accounts a ON jel.account_id = a.id AND a.sub_type = 'receivable'
                    GROUP BY jel.tenant_id
                ) gl
                JOIN (
                    SELECT tenant_id, SUM(outstanding) AS subledger_outstanding
                    FROM v_ar_subledger
                    GROUP BY tenant_id
                ) sub USING (tenant_id);
            `);
        } catch (viewErr) {
            console.warn('⚠️ [DB-RECON] AR View creation notice (handled):', viewErr.message);
        }

        console.log('✅ [DB-RECON] ERP Core Week 6 tables & views verified (payment_allocations, v_ar_subledger, v_ar_gl_reconciliation).');

        // ── ERP STAGE 1 — SALES CYCLE SCHEMA ──

        // Sales Orders
        await db.query(`
            CREATE TABLE IF NOT EXISTS sales_orders (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                tenant_id VARCHAR(255) NOT NULL,
                branch_id VARCHAR(255),
                number VARCHAR(50) NOT NULL,
                customer_id INTEGER REFERENCES customers(id) ON DELETE RESTRICT,
                deal_id INTEGER REFERENCES deals(id) ON DELETE SET NULL,
                quotation_id INTEGER REFERENCES quotations(id) ON DELETE SET NULL,
                order_date DATE DEFAULT CURRENT_DATE,
                expected_delivery DATE,
                status VARCHAR(30) DEFAULT 'draft',
                accounting_status VARCHAR(20) DEFAULT 'unposted',
                total_amount NUMERIC(15,2) DEFAULT 0,
                tax_amount NUMERIC(15,2) DEFAULT 0,
                discount_amount NUMERIC(15,2) DEFAULT 0,
                currency VARCHAR(10) DEFAULT 'EGP',
                exchange_rate NUMERIC(12,6) DEFAULT 1.000000,
                local_value NUMERIC(15,2) DEFAULT 0,
                notes TEXT,
                assigned_to INTEGER REFERENCES users(id),
                created_by INTEGER REFERENCES users(id),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(tenant_id, number)
            )
        `);

        await db.query(`
            CREATE TABLE IF NOT EXISTS sales_order_items (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                sales_order_id UUID REFERENCES sales_orders(id) ON DELETE CASCADE,
                product_id INTEGER REFERENCES products(id) ON DELETE RESTRICT,
                description TEXT,
                quantity NUMERIC(12,3) NOT NULL CHECK (quantity > 0),
                unit_price NUMERIC(12,2) NOT NULL CHECK (unit_price >= 0),
                discount_pct NUMERIC(5,2) DEFAULT 0,
                tax_rate_id UUID REFERENCES tax_components(id),
                tax_amount NUMERIC(12,2) DEFAULT 0,
                subtotal NUMERIC(15,2) NOT NULL,
                quantity_delivered NUMERIC(12,3) DEFAULT 0,
                quantity_invoiced NUMERIC(12,3) DEFAULT 0,
                tenant_id VARCHAR(255) NOT NULL
            )
        `);

        // Delivery Notes
        await db.query(`
            CREATE TABLE IF NOT EXISTS delivery_notes (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                tenant_id VARCHAR(255) NOT NULL,
                branch_id VARCHAR(255),
                number VARCHAR(50) NOT NULL,
                sales_order_id UUID REFERENCES sales_orders(id) ON DELETE RESTRICT,
                customer_id INTEGER REFERENCES customers(id) ON DELETE RESTRICT,
                delivery_date DATE DEFAULT CURRENT_DATE,
                warehouse_id UUID,
                status VARCHAR(30) DEFAULT 'draft',
                accounting_status VARCHAR(20) DEFAULT 'unposted',
                journal_entry_id UUID REFERENCES journal_entries(id),
                notes TEXT,
                created_by INTEGER REFERENCES users(id),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(tenant_id, number)
            )
        `);

        await db.query(`
            CREATE TABLE IF NOT EXISTS delivery_note_items (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                delivery_note_id UUID REFERENCES delivery_notes(id) ON DELETE CASCADE,
                sales_order_item_id UUID REFERENCES sales_order_items(id),
                product_id INTEGER REFERENCES products(id) ON DELETE RESTRICT,
                quantity_delivered NUMERIC(12,3) NOT NULL CHECK (quantity_delivered > 0),
                unit_cost NUMERIC(12,2) DEFAULT 0,
                tenant_id VARCHAR(255) NOT NULL
            )
        `);

        // Sales Returns
        await db.query(`
            CREATE TABLE IF NOT EXISTS sales_returns (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                tenant_id VARCHAR(255) NOT NULL,
                branch_id VARCHAR(255),
                number VARCHAR(50) NOT NULL,
                delivery_note_id UUID REFERENCES delivery_notes(id),
                customer_id INTEGER REFERENCES customers(id),
                return_date DATE DEFAULT CURRENT_DATE,
                status VARCHAR(30) DEFAULT 'draft',
                accounting_status VARCHAR(20) DEFAULT 'unposted',
                journal_entry_id UUID REFERENCES journal_entries(id),
                total_amount NUMERIC(15,2) DEFAULT 0,
                notes TEXT,
                created_by INTEGER REFERENCES users(id),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(tenant_id, number)
            )
        `);

        // Credit Notes
        await db.query(`
            CREATE TABLE IF NOT EXISTS credit_notes (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                tenant_id VARCHAR(255) NOT NULL,
                branch_id VARCHAR(255),
                number VARCHAR(50) NOT NULL,
                customer_id INTEGER REFERENCES customers(id),
                invoice_id VARCHAR(255),
                amount NUMERIC(15,2) NOT NULL CHECK (amount > 0),
                reason TEXT,
                status VARCHAR(30) DEFAULT 'draft',
                accounting_status VARCHAR(20) DEFAULT 'unposted',
                journal_entry_id UUID REFERENCES journal_entries(id),
                created_by INTEGER REFERENCES users(id),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(tenant_id, number)
            )
        `);

        // Column extension on invoices table
        await db.query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS sales_order_id VARCHAR(255)`);
        await db.query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS accounting_status VARCHAR(20) DEFAULT 'unposted'`);
        await db.query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS journal_entry_id UUID REFERENCES journal_entries(id)`);

        console.log('✅ [DB-RECON] ERP Stage 1 Sales Cycle tables verified (sales_orders, delivery_notes, sales_returns, credit_notes).');

        // ── ERP STAGE 2 — PURCHASING CYCLE SCHEMA ──

        // Suppliers
        await db.query(`
            CREATE TABLE IF NOT EXISTS suppliers (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                tenant_id VARCHAR(255) NOT NULL,
                branch_id VARCHAR(255),
                name VARCHAR(255) NOT NULL,
                company_name VARCHAR(255),
                email VARCHAR(255),
                phone VARCHAR(50),
                address TEXT,
                tax_no VARCHAR(100),
                payment_terms INTEGER DEFAULT 30,
                credit_limit NUMERIC(15,2) DEFAULT 0,
                currency VARCHAR(10) DEFAULT 'EGP',
                ap_account_id UUID REFERENCES accounts(id),
                is_active BOOLEAN DEFAULT true,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(tenant_id, name)
            )
        `);

        // Purchase Requests
        await db.query(`
            CREATE TABLE IF NOT EXISTS purchase_requests (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                tenant_id VARCHAR(255) NOT NULL,
                branch_id VARCHAR(255),
                number VARCHAR(50) NOT NULL,
                requested_by INTEGER REFERENCES users(id),
                status VARCHAR(30) DEFAULT 'draft',
                notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(tenant_id, number)
            )
        `);

        await db.query(`
            CREATE TABLE IF NOT EXISTS purchase_request_items (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                purchase_request_id UUID REFERENCES purchase_requests(id) ON DELETE CASCADE,
                product_id INTEGER REFERENCES products(id) ON DELETE RESTRICT,
                description TEXT,
                quantity NUMERIC(12,3) NOT NULL CHECK (quantity > 0),
                estimated_cost NUMERIC(12,2) DEFAULT 0,
                tenant_id VARCHAR(255) NOT NULL
            )
        `);

        // Purchase Orders (NO ACCOUNTING ENTRY ON PO — commitment document only)
        await db.query(`
            CREATE TABLE IF NOT EXISTS purchase_orders (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                tenant_id VARCHAR(255) NOT NULL,
                branch_id VARCHAR(255),
                number VARCHAR(50) NOT NULL,
                supplier_id UUID REFERENCES suppliers(id) ON DELETE RESTRICT,
                purchase_request_id UUID REFERENCES purchase_requests(id) ON DELETE SET NULL,
                order_date DATE DEFAULT CURRENT_DATE,
                expected_date DATE,
                status VARCHAR(30) DEFAULT 'draft',
                total_amount NUMERIC(15,2) DEFAULT 0,
                tax_amount NUMERIC(15,2) DEFAULT 0,
                currency VARCHAR(10) DEFAULT 'EGP',
                exchange_rate NUMERIC(12,6) DEFAULT 1.000000,
                local_value NUMERIC(15,2) DEFAULT 0,
                approval_status VARCHAR(30) DEFAULT 'pending',
                approved_by INTEGER REFERENCES users(id),
                notes TEXT,
                created_by INTEGER REFERENCES users(id),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(tenant_id, number)
            )
        `);

        await db.query(`
            CREATE TABLE IF NOT EXISTS purchase_order_items (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                purchase_order_id UUID REFERENCES purchase_orders(id) ON DELETE CASCADE,
                product_id INTEGER REFERENCES products(id) ON DELETE RESTRICT,
                description TEXT,
                quantity NUMERIC(12,3) NOT NULL CHECK (quantity > 0),
                unit_cost NUMERIC(12,2) NOT NULL CHECK (unit_cost >= 0),
                tax_rate_id UUID REFERENCES tax_components(id),
                tax_amount NUMERIC(12,2) DEFAULT 0,
                subtotal NUMERIC(15,2) NOT NULL,
                quantity_received NUMERIC(12,3) DEFAULT 0,
                tenant_id VARCHAR(255) NOT NULL
            )
        `);

        // Goods Receipt Notes (GRN) — Posts DR Inventory / CR GRNI
        await db.query(`
            CREATE TABLE IF NOT EXISTS goods_receipts (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                tenant_id VARCHAR(255) NOT NULL,
                branch_id VARCHAR(255),
                number VARCHAR(50) NOT NULL,
                purchase_order_id UUID REFERENCES purchase_orders(id) ON DELETE RESTRICT,
                supplier_id UUID REFERENCES suppliers(id) ON DELETE RESTRICT,
                receipt_date DATE DEFAULT CURRENT_DATE,
                warehouse_id UUID,
                status VARCHAR(30) DEFAULT 'draft',
                accounting_status VARCHAR(20) DEFAULT 'unposted',
                journal_entry_id UUID REFERENCES journal_entries(id),
                notes TEXT,
                received_by INTEGER REFERENCES users(id),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(tenant_id, number)
            )
        `);

        await db.query(`
            CREATE TABLE IF NOT EXISTS goods_receipt_items (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                goods_receipt_id UUID REFERENCES goods_receipts(id) ON DELETE CASCADE,
                purchase_order_item_id UUID REFERENCES purchase_order_items(id),
                product_id INTEGER REFERENCES products(id) ON DELETE RESTRICT,
                quantity_ordered NUMERIC(12,3) NOT NULL,
                quantity_received NUMERIC(12,3) NOT NULL CHECK (quantity_received > 0),
                unit_cost NUMERIC(12,2) NOT NULL CHECK (unit_cost >= 0),
                tenant_id VARCHAR(255) NOT NULL
            )
        `);

        // Supplier Invoices (AP) — Posts DR GRNI [+ DR PPV] / CR Accounts Payable
        await db.query(`
            CREATE TABLE IF NOT EXISTS supplier_invoices (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                tenant_id VARCHAR(255) NOT NULL,
                branch_id VARCHAR(255),
                number VARCHAR(50) NOT NULL,
                supplier_id UUID REFERENCES suppliers(id) ON DELETE RESTRICT,
                purchase_order_id UUID REFERENCES purchase_orders(id),
                goods_receipt_id UUID REFERENCES goods_receipts(id),
                invoice_date DATE DEFAULT CURRENT_DATE,
                due_date DATE,
                total_amount NUMERIC(15,2) NOT NULL CHECK (total_amount >= 0),
                tax_amount NUMERIC(15,2) DEFAULT 0,
                currency VARCHAR(10) DEFAULT 'EGP',
                exchange_rate NUMERIC(12,6) DEFAULT 1.000000,
                local_value NUMERIC(15,2) DEFAULT 0,
                status VARCHAR(30) DEFAULT 'unpaid',
                accounting_status VARCHAR(20) DEFAULT 'unposted',
                three_way_matched BOOLEAN DEFAULT false,
                ppv_amount NUMERIC(15,2) DEFAULT 0,
                journal_entry_id UUID REFERENCES journal_entries(id),
                created_by INTEGER REFERENCES users(id),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(tenant_id, number)
            )
        `);

        // Purchase Returns & Debit Notes
        await db.query(`
            CREATE TABLE IF NOT EXISTS purchase_returns (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                tenant_id VARCHAR(255) NOT NULL,
                branch_id VARCHAR(255),
                number VARCHAR(50) NOT NULL,
                goods_receipt_id UUID REFERENCES goods_receipts(id),
                supplier_id UUID REFERENCES suppliers(id),
                return_date DATE DEFAULT CURRENT_DATE,
                status VARCHAR(30) DEFAULT 'draft',
                accounting_status VARCHAR(20) DEFAULT 'unposted',
                journal_entry_id UUID REFERENCES journal_entries(id),
                total_amount NUMERIC(15,2) DEFAULT 0,
                notes TEXT,
                created_by INTEGER REFERENCES users(id),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(tenant_id, number)
            )
        `);

        await db.query(`
            CREATE TABLE IF NOT EXISTS debit_notes (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                tenant_id VARCHAR(255) NOT NULL,
                branch_id VARCHAR(255),
                number VARCHAR(50) NOT NULL,
                supplier_id UUID REFERENCES suppliers(id),
                supplier_invoice_id UUID REFERENCES supplier_invoices(id),
                amount NUMERIC(15,2) NOT NULL CHECK (amount > 0),
                reason TEXT,
                status VARCHAR(30) DEFAULT 'draft',
                accounting_status VARCHAR(20) DEFAULT 'unposted',
                journal_entry_id UUID REFERENCES journal_entries(id),
                created_by INTEGER REFERENCES users(id),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(tenant_id, number)
            )
        `);

        // PostgreSQL AP Subledger & GL Reconciliation Views
        try {
            await db.query(`
                CREATE OR REPLACE VIEW v_ap_subledger AS
                WITH invoice_credits AS (
                    SELECT
                        je.tenant_id,
                        si.supplier_id::text AS supplier_id,
                        si.id::text AS supplier_invoice_id,
                        je.date,
                        SUM(jel.credit) AS charged
                    FROM journal_entry_lines jel
                    JOIN journal_entries je ON jel.journal_entry_id = je.id AND je.status = 'posted'
                    JOIN accounts a ON jel.account_id = a.id AND a.sub_type = 'payable'
                    JOIN supplier_invoices si ON je.source_id::text = si.id::text AND je.source_type = 'supplier_invoice'
                    GROUP BY je.tenant_id, si.supplier_id, si.id, je.date
                ),
                invoice_payments AS (
                    SELECT
                        pa.tenant_id,
                        si.supplier_id::text AS supplier_id,
                        pa.supplier_invoice_id::text AS supplier_invoice_id,
                        SUM(pa.amount_allocated) AS paid
                    FROM payment_allocations pa
                    JOIN supplier_invoices si ON pa.supplier_invoice_id::text = si.id::text
                    GROUP BY pa.tenant_id, si.supplier_id, pa.supplier_invoice_id
                )
                SELECT
                    ic.tenant_id,
                    ic.supplier_id,
                    s.name AS supplier_name,
                    ic.supplier_invoice_id,
                    ic.date,
                    ic.charged,
                    COALESCE(ip.paid, 0) AS paid,
                    (ic.charged - COALESCE(ip.paid, 0)) AS outstanding
                FROM invoice_credits ic
                LEFT JOIN invoice_payments ip ON ic.supplier_invoice_id = ip.supplier_invoice_id AND ic.supplier_id = ip.supplier_id
                LEFT JOIN suppliers s ON ic.supplier_id = s.id::text;
            `);

            await db.query(`
                CREATE OR REPLACE VIEW v_ap_gl_reconciliation AS
                SELECT
                    gl.tenant_id,
                    gl.gl_ap_balance,
                    sub.subledger_outstanding,
                    ABS(gl.gl_ap_balance - sub.subledger_outstanding) AS difference,
                    CASE WHEN ABS(gl.gl_ap_balance - sub.subledger_outstanding) < 0.01
                         THEN 'RECONCILED' ELSE 'MISMATCH' END AS status
                FROM (
                    SELECT jel.tenant_id, SUM(jel.credit) - SUM(jel.debit) AS gl_ap_balance
                    FROM journal_entry_lines jel
                    JOIN journal_entries je ON jel.journal_entry_id = je.id AND je.status = 'posted'
                    JOIN accounts a ON jel.account_id = a.id AND a.sub_type = 'payable'
                    GROUP BY jel.tenant_id
                ) gl
                JOIN (
                    SELECT tenant_id, SUM(outstanding) AS subledger_outstanding
                    FROM v_ap_subledger
                    GROUP BY tenant_id
                ) sub USING (tenant_id);
            `);
        } catch (apViewErr) {
            console.warn('⚠️ [DB-RECON] AP View creation notice (handled):', apViewErr.message);
        }

        console.log('✅ [DB-RECON] ERP Stage 2 Purchasing Cycle tables & views verified (suppliers, purchase_orders, goods_receipts, supplier_invoices, v_ap_subledger).');


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
