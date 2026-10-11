-- Migration 014: Unify real estate contract numbering uniqueness (Phase 2.3)
-- Scope: Ensure unique contract numbers per tenant without breaking historical data

BEGIN;

DO $$
DECLARE
    duplicate_count INTEGER;
BEGIN
    -- 1. Preflight check: detect any duplicate (tenant_id, contract_number) pairs
    SELECT COUNT(*) INTO duplicate_count
    FROM (
        SELECT tenant_id, contract_number
        FROM re_contracts
        GROUP BY tenant_id, contract_number
        HAVING COUNT(*) > 1
    ) dupes;

    IF duplicate_count > 0 THEN
        RAISE EXCEPTION 'Migration 014 Preflight Check Failed: Found % duplicate (tenant_id, contract_number) pairs in re_contracts. Please resolve duplicates before applying unique constraint.', duplicate_count;
    END IF;

    -- 2. Create unique index if not exists
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE tablename = 're_contracts'
          AND indexname = 'idx_re_contracts_tenant_number'
    ) THEN
        CREATE UNIQUE INDEX idx_re_contracts_tenant_number
        ON re_contracts (tenant_id, contract_number);
    END IF;
END $$;

COMMIT;
