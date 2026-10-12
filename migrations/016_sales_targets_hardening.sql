-- Migration 016: Sales Targets Hardening & Multi-Scope Integrity (Phase 3.3B)
-- Enforces:
-- 1. Explicit target scopes (individual, department, branch)
-- 2. Partial unique indexes on active targets preventing duplicates
-- 3. Soft deactivation columns (deleted_at, deleted_by, is_active)
-- 4. Safe legacy period normalization with original preservation

BEGIN;

-- 1. Add Scope and Subject Columns
ALTER TABLE sales_targets 
    ADD COLUMN IF NOT EXISTS target_scope VARCHAR(20) NOT NULL DEFAULT 'individual';

ALTER TABLE sales_targets 
    ADD COLUMN IF NOT EXISTS department_id INTEGER NULL REFERENCES departments(id) ON DELETE SET NULL;

ALTER TABLE sales_targets 
    ADD COLUMN IF NOT EXISTS legacy_period VARCHAR(50) NULL;

ALTER TABLE sales_targets 
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE sales_targets 
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE NULL;

ALTER TABLE sales_targets 
    ADD COLUMN IF NOT EXISTS deleted_by INTEGER NULL REFERENCES users(id) ON DELETE SET NULL;

-- 2. Safe Backfill of Existing Legacy Periods
UPDATE sales_targets 
    SET legacy_period = period 
    WHERE legacy_period IS NULL;

-- Normalize standard test / legacy periods if present
UPDATE sales_targets 
    SET period = '2026-Q3' 
    WHERE period = 'Q3 2026';

UPDATE sales_targets 
    SET period = '2026' 
    WHERE period = 'FY 2026';

-- 3. Partial Unique Indexes (Active Records Only)
CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_targets_individual 
    ON sales_targets (tenant_id, user_id, period) 
    WHERE target_scope = 'individual' AND deleted_at IS NULL AND is_active = true;

CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_targets_department 
    ON sales_targets (tenant_id, department_id, period) 
    WHERE target_scope = 'department' AND deleted_at IS NULL AND is_active = true;

CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_targets_branch 
    ON sales_targets (tenant_id, branch_id, period) 
    WHERE target_scope = 'branch' AND deleted_at IS NULL AND is_active = true;

CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_targets_company 
    ON sales_targets (tenant_id, period) 
    WHERE target_scope = 'company' AND deleted_at IS NULL AND is_active = true;

-- 4. Performance Index
CREATE INDEX IF NOT EXISTS idx_sales_targets_lookup 
    ON sales_targets (tenant_id, branch_id, period) 
    WHERE deleted_at IS NULL;

COMMIT;
