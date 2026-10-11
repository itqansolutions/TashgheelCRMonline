-- 011_add_quotation_number_and_isolation.sql
-- Phase 1: Tenant Isolation & Document Numbering for Quotations

DO $$
DECLARE
    v_null_tenants INTEGER := 0;
    v_duplicates INTEGER := 0;
    v_col_exists BOOLEAN := false;
BEGIN
    -- 1. PREFLIGHT DIAGNOSTIC: Check for quotations with NULL tenant_id
    SELECT COUNT(*) INTO v_null_tenants FROM quotations WHERE tenant_id IS NULL;
    IF v_null_tenants > 0 THEN
        RAISE EXCEPTION 'PREFLIGHT_ABORT: Found % quotation record(s) with NULL tenant_id. Cannot safely proceed. Manual tenant assignment required before migration.', v_null_tenants;
    END IF;

    -- 2. Add column number VARCHAR(50) if not exists
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'quotations' AND column_name = 'number'
    ) INTO v_col_exists;

    IF NOT v_col_exists THEN
        ALTER TABLE quotations ADD COLUMN number VARCHAR(50);
    END IF;

    -- 3. PREFLIGHT DIAGNOSTIC: Check if any existing non-empty numbers have duplicates per tenant
    SELECT COUNT(*) INTO v_duplicates
    FROM (
        SELECT tenant_id, number, COUNT(*) 
        FROM quotations 
        WHERE number IS NOT NULL AND TRIM(number) <> ''
        GROUP BY tenant_id, number 
        HAVING COUNT(*) > 1
    ) dup;

    IF v_duplicates > 0 THEN
        RAISE EXCEPTION 'PREFLIGHT_ABORT: Found % existing duplicate quotation number(s) within the same tenant. Existing data must be manually resolved before creating unique index.', v_duplicates;
    END IF;

    -- 4. NON-DESTRUCTIVE BACKFILL:
    -- Only populate rows where number IS NULL or empty.
    -- Uses 'QUO-LEGACY-' || LPAD(id::text, 6, '0') to guarantee no collision with
    -- DocumentSequencer format 'QUO-YYYY-XXXXX'. Preserves existing assigned numbers.
    UPDATE quotations
    SET number = 'QUO-LEGACY-' || LPAD(id::text, 6, '0')
    WHERE number IS NULL OR TRIM(number) = '';

    -- 5. Enforce NOT NULL constraint
    ALTER TABLE quotations ALTER COLUMN number SET NOT NULL;

    -- 6. Create tenant-scoped unique index
    CREATE UNIQUE INDEX IF NOT EXISTS idx_quotations_tenant_number ON quotations (tenant_id, number);

    -- 7. Add index for efficient tenant listing
    CREATE INDEX IF NOT EXISTS idx_quotations_tenant_branch_created ON quotations (tenant_id, branch_id, created_at DESC);

    -- 8. PREFLIGHT DIAGNOSTIC: Check for duplicate counter rows before creating partial unique indexes on document_sequences
    IF EXISTS (
        SELECT 1 FROM (
            SELECT tenant_id, doc_type, fiscal_year, COUNT(*)
            FROM document_sequences
            WHERE branch_id IS NULL
            GROUP BY tenant_id, doc_type, fiscal_year
            HAVING COUNT(*) > 1
        ) dup_null
    ) THEN
        RAISE EXCEPTION 'PREFLIGHT_ABORT: Found duplicate enterprise counter rows in document_sequences where branch_id IS NULL. Manual reconciliation required before index creation.';
    END IF;

    IF EXISTS (
        SELECT 1 FROM (
            SELECT tenant_id, branch_id, doc_type, fiscal_year, COUNT(*)
            FROM document_sequences
            WHERE branch_id IS NOT NULL
            GROUP BY tenant_id, branch_id, doc_type, fiscal_year
            HAVING COUNT(*) > 1
        ) dup_branch
    ) THEN
        RAISE EXCEPTION 'PREFLIGHT_ABORT: Found duplicate branch-specific counter rows in document_sequences where branch_id IS NOT NULL. Manual reconciliation required before index creation.';
    END IF;

    -- 9. Create partial unique indexes for DocumentSequencer concurrency safety
    CREATE UNIQUE INDEX IF NOT EXISTS idx_document_sequences_enterprise
    ON document_sequences (tenant_id, doc_type, fiscal_year)
    WHERE branch_id IS NULL;

    CREATE UNIQUE INDEX IF NOT EXISTS idx_document_sequences_branch
    ON document_sequences (tenant_id, branch_id, doc_type, fiscal_year)
    WHERE branch_id IS NOT NULL;
END $$;
