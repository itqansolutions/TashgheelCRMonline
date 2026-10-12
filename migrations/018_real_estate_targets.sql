-- Migration 018: Real Estate Targets & Performance Engine
-- Implements dedicated, independent target tracking for Real Estate organizations
-- Supporting Contracted Value, Units Count, and Cash Collection metrics.

BEGIN;

CREATE TABLE IF NOT EXISTS re_targets (
    id SERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id VARCHAR(255),
    user_id INTEGER REFERENCES users(id) ON DELETE RESTRICT,
    target_scope VARCHAR(50) NOT NULL DEFAULT 'individual' CHECK (target_scope IN ('individual', 'branch', 'company')),
    period VARCHAR(20) NOT NULL,
    period_type VARCHAR(20) NOT NULL CHECK (period_type IN ('monthly', 'quarterly', 'yearly')),
    target_amount NUMERIC(15, 2) NOT NULL DEFAULT 0.00 CHECK (target_amount >= 0),
    target_units INTEGER NOT NULL DEFAULT 0 CHECK (target_units >= 0),
    commission_rate NUMERIC(5, 2) DEFAULT 0.00 CHECK (commission_rate >= 0 AND commission_rate <= 100),
    notes TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    deleted_at TIMESTAMP WITH TIME ZONE,
    deleted_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_re_targets_scope CHECK (
        (target_scope = 'individual' AND user_id IS NOT NULL) OR
        (target_scope = 'branch' AND branch_id IS NOT NULL AND user_id IS NULL) OR
        (target_scope = 'company' AND user_id IS NULL)
    )
);

-- Partial unique indexes preventing duplicate active targets for the same scope and period
CREATE UNIQUE INDEX IF NOT EXISTS uq_re_targets_individual
    ON re_targets (tenant_id, user_id, period)
    WHERE (target_scope = 'individual' AND deleted_at IS NULL AND is_active = true);

CREATE UNIQUE INDEX IF NOT EXISTS uq_re_targets_branch
    ON re_targets (tenant_id, branch_id, period)
    WHERE (target_scope = 'branch' AND deleted_at IS NULL AND is_active = true);

CREATE UNIQUE INDEX IF NOT EXISTS uq_re_targets_company
    ON re_targets (tenant_id, period)
    WHERE (target_scope = 'company' AND deleted_at IS NULL AND is_active = true);

CREATE INDEX IF NOT EXISTS idx_re_targets_lookup
    ON re_targets (tenant_id, period, target_scope, is_active);

COMMIT;
