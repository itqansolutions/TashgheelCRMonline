-- Migration 017: Sales Commissions Ledger & Settlement Lifecycle (Phase 3.3C)
-- Implements immutable commission accruals, rule versioning, tiered bonus calculation,
-- durable monthly settlements, and integration with Finance payout vouchers.

BEGIN;

-- 1. sales_commission_rules: Defines commission policy rates per period and scope
CREATE TABLE IF NOT EXISTS sales_commission_rules (
    id SERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id VARCHAR(255),
    name VARCHAR(150) NOT NULL,
    base_rate NUMERIC(5, 2) NOT NULL CHECK (base_rate >= 0 AND base_rate <= 100),
    effective_from DATE NOT NULL,
    effective_to DATE,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_commission_rules_dates CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

CREATE INDEX IF NOT EXISTS idx_sales_commission_rules_lookup 
    ON sales_commission_rules (tenant_id, is_active, effective_from);

-- 2. sales_commission_tiers: Fixed cash bonus tiers per achievement percentage threshold
CREATE TABLE IF NOT EXISTS sales_commission_tiers (
    id SERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    rule_id INTEGER NOT NULL REFERENCES sales_commission_rules(id) ON DELETE CASCADE,
    min_achievement_pct NUMERIC(6, 2) NOT NULL CHECK (min_achievement_pct >= 0),
    max_achievement_pct NUMERIC(6, 2) CHECK (max_achievement_pct IS NULL OR max_achievement_pct > min_achievement_pct),
    bonus_amount NUMERIC(15, 2) NOT NULL CHECK (bonus_amount >= 0),
    tier_order INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sales_commission_tiers_rule 
    ON sales_commission_tiers (rule_id, tier_order);

-- 3. sales_commissions: Per-payment immutable commission accruals
CREATE TABLE IF NOT EXISTS sales_commissions (
    id SERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id VARCHAR(255),
    payment_id INTEGER NOT NULL REFERENCES payments(id) ON DELETE RESTRICT,
    invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
    sales_order_id VARCHAR(255),
    deal_id VARCHAR(255),
    beneficiary_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    beneficiary_name VARCHAR(255) NOT NULL,
    rule_id INTEGER REFERENCES sales_commission_rules(id) ON DELETE SET NULL,
    rule_snapshot JSONB,
    eligible_payment_amount NUMERIC(15, 2) NOT NULL CHECK (eligible_payment_amount >= 0),
    applied_rate NUMERIC(5, 2) NOT NULL CHECK (applied_rate >= 0),
    commission_amount NUMERIC(15, 2) NOT NULL,
    payment_date TIMESTAMP WITH TIME ZONE NOT NULL,
    period VARCHAR(20) NOT NULL,
    attribution_source VARCHAR(50) NOT NULL CHECK (attribution_source IN ('sales_order', 'deal')),
    status VARCHAR(20) NOT NULL DEFAULT 'calculated' CHECK (status IN ('calculated', 'settled', 'cancelled', 'adjusted')),
    settlement_id INTEGER,
    adjustment_of_id INTEGER REFERENCES sales_commissions(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Crucial: Unique partial index preventing duplicate accruals for the same payment and beneficiary
CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_commissions_payment_beneficiary
    ON sales_commissions (tenant_id, payment_id, beneficiary_user_id)
    WHERE (status != 'cancelled' AND adjustment_of_id IS NULL);

CREATE INDEX IF NOT EXISTS idx_sales_commissions_period_user
    ON sales_commissions (tenant_id, beneficiary_user_id, period, status);

-- 4. sales_commission_settlements: Monthly reconciliation and durable payout heads
CREATE TABLE IF NOT EXISTS sales_commission_settlements (
    id SERIAL PRIMARY KEY,
    settlement_number VARCHAR(100) NOT NULL,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id VARCHAR(255),
    beneficiary_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    beneficiary_name VARCHAR(255) NOT NULL,
    period VARCHAR(20) NOT NULL,
    target_id INTEGER REFERENCES sales_targets(id) ON DELETE SET NULL,
    target_snapshot JSONB,
    target_amount NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    total_collected_amount NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    achievement_percentage NUMERIC(6, 2) NOT NULL DEFAULT 0.00,
    base_commission_total NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    selected_tier_id INTEGER REFERENCES sales_commission_tiers(id) ON DELETE SET NULL,
    bonus_amount NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    adjustment_total NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    net_payable_amount NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    status VARCHAR(20) NOT NULL DEFAULT 'calculated' CHECK (status IN ('calculated', 'approved', 'paid', 'cancelled')),
    approved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    approved_at TIMESTAMP WITH TIME ZONE,
    payout_voucher_id INTEGER REFERENCES finance_vouchers(id) ON DELETE SET NULL,
    payout_at TIMESTAMP WITH TIME ZONE,
    payout_notes TEXT,
    notes TEXT,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_commission_settlements_period_user
    ON sales_commission_settlements (tenant_id, beneficiary_user_id, period)
    WHERE (status != 'cancelled');

CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_commission_settlements_number
    ON sales_commission_settlements (tenant_id, settlement_number);

CREATE INDEX IF NOT EXISTS idx_sales_commission_settlements_status
    ON sales_commission_settlements (tenant_id, period, status);

-- Link sales_commissions.settlement_id FK
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_sales_commissions_settlement'
    ) THEN
        ALTER TABLE sales_commissions 
            ADD CONSTRAINT fk_sales_commissions_settlement 
            FOREIGN KEY (settlement_id) REFERENCES sales_commission_settlements(id) ON DELETE SET NULL;
    END IF;
END $$;

-- 5. sales_commission_settlement_items: Junction table linking accruals to settlements
CREATE TABLE IF NOT EXISTS sales_commission_settlement_items (
    id SERIAL PRIMARY KEY,
    settlement_id INTEGER NOT NULL REFERENCES sales_commission_settlements(id) ON DELETE CASCADE,
    commission_id INTEGER NOT NULL REFERENCES sales_commissions(id) ON DELETE RESTRICT,
    amount NUMERIC(15, 2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_settlement_items_comm UNIQUE (settlement_id, commission_id)
);

COMMIT;
