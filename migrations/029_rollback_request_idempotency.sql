-- =========================================================================
-- ROLLBACK 029: REQUEST IDEMPOTENCY LEDGER SCHEMA ROLLBACK
-- =========================================================================
-- Target Database: PostgreSQL (Shared Database / Shared Schema)
-- Description: Reverses Migration 029 cleanly and drops idempotency table.
-- Usage: Execute ONLY in emergency pre-activation scenarios approved by ITQAN leadership.
-- =========================================================================

BEGIN;

DROP TABLE IF EXISTS request_idempotency CASCADE;

DELETE FROM schema_migrations 
WHERE name = '029_create_request_idempotency.sql';

COMMIT;
