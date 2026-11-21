-- =========================================================================
-- MIGRATION 011: MANUAL ENTITLEMENTS & AUDIT LOG SCHEMA (REVIEW ONLY)
-- =========================================================================
-- Phase: 4.2.4 — Implementation: Manual Entitlements Engine
-- Target Database: PostgreSQL (Shared Database / Shared Schema)
-- Status: PENDING ITQAN REVIEW — DO NOT EXECUTE DIRECTLY AGAINST PRODUCTION
-- =========================================================================

-- 1. Ensure tenant_overrides table has all required columns and constraints
CREATE TABLE IF NOT EXISTS tenant_overrides (
    id SERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL UNIQUE,
    modules JSONB NOT NULL DEFAULT '{}'::jsonb,
    limits JSONB NOT NULL DEFAULT '{}'::jsonb,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_tenant_overrides_tenant_id 
ON tenant_overrides (tenant_id);

-- 2. Audit Trail Table: Records every manual entitlement change made in ITQAN HUD
CREATE TABLE IF NOT EXISTS tenant_access_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    changed_by INTEGER,
    previous_modules JSONB NOT NULL DEFAULT '{}'::jsonb,
    new_modules JSONB NOT NULL DEFAULT '{}'::jsonb,
    previous_limits JSONB NOT NULL DEFAULT '{}'::jsonb,
    new_limits JSONB NOT NULL DEFAULT '{}'::jsonb,
    reason TEXT NOT NULL,
    ip_address VARCHAR(45),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tenant_access_audit_tenant_created 
ON tenant_access_audit_logs (tenant_id, created_at DESC);

-- End of Migration 011
