-- =========================================================================
-- MIGRATION 026: COMMERCIAL CONTRACTS LEDGER & AUDIT SCHEMA (LOCAL REVIEW ONLY)
-- =========================================================================
-- Phase: 4.2.6-B — Commercial Contracts: Value & Duration Ledger
-- Target Database: PostgreSQL (Shared Database / Shared Schema)
-- Status: PENDING ITQAN REVIEW — DO NOT EXECUTE DIRECTLY AGAINST PRODUCTION/RAILWAY
-- =========================================================================

-- 1. Tenant Commercial Contracts Ledger Table
-- Records agreed commercial contract values and duration periods.
-- Completely decoupled from technical entitlement enforcement.
CREATE TABLE IF NOT EXISTS tenant_contracts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    contract_value NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    currency VARCHAR(10) NOT NULL DEFAULT 'EGP',
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    notes TEXT,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT chk_tenant_contracts_dates CHECK (end_date >= start_date),
    CONSTRAINT chk_tenant_contracts_value CHECK (contract_value >= 0)
);

CREATE INDEX IF NOT EXISTS idx_tenant_contracts_tenant_dates 
ON tenant_contracts (tenant_id, start_date DESC);

-- 2. Commercial Contract Audit Trail Table
-- Preserves full audit history of all contract creation and update events.
-- Ensures previous commercial values and terms are never lost during amendments.
CREATE TABLE IF NOT EXISTS tenant_contract_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_id UUID NOT NULL,
    tenant_id UUID NOT NULL,
    action VARCHAR(20) NOT NULL, -- 'CREATE' | 'UPDATE'
    changed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    previous_data JSONB,
    new_data JSONB NOT NULL,
    reason TEXT,
    ip_address VARCHAR(45),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tenant_contract_audit_contract 
ON tenant_contract_audit_logs (contract_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tenant_contract_audit_tenant 
ON tenant_contract_audit_logs (tenant_id, created_at DESC);

-- End of Migration 026
