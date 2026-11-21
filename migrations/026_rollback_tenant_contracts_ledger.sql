-- =========================================================================
-- ROLLBACK 026: COMMERCIAL CONTRACTS LEDGER SCHEMA ROLLBACK
-- =========================================================================
-- Phase: 4.2.6-F — Migration Preparation & Deployment Safety
-- Target Database: PostgreSQL (Shared Database / Shared Schema)
-- Description: Reverses Migration 026 cleanly and removes schema_migrations entry.
-- Usage: Execute ONLY in emergency rollback scenarios approved by ITQAN leadership.
-- =========================================================================

BEGIN;

-- 1. Drop audit log table and indexes
DROP TABLE IF EXISTS tenant_contract_audit_logs CASCADE;

-- 2. Drop contracts ledger table and indexes
DROP TABLE IF EXISTS tenant_contracts CASCADE;

-- 3. Remove entry from schema_migrations
DELETE FROM schema_migrations 
WHERE name = '026_create_tenant_contracts_ledger.sql';

COMMIT;

-- Verification query:
-- SELECT table_name FROM information_schema.tables WHERE table_name IN ('tenant_contracts', 'tenant_contract_audit_logs');
