-- =========================================================================
-- MIGRATION 029: REQUEST IDEMPOTENCY LEDGER SCHEMA
-- =========================================================================
-- Target Database: PostgreSQL 13+ (Shared Database / Shared Schema)
-- Description: Creates request_idempotency table for deduplication and replay protection.
-- =========================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS request_idempotency (
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    endpoint VARCHAR(128) NOT NULL DEFAULT 'POST /customers/bulk-assign',
    idempotency_key VARCHAR(128) NOT NULL,
    request_hash VARCHAR(64) NOT NULL,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'expired')),
    response_code INTEGER NOT NULL DEFAULT 200,
    response_body JSONB NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT pk_request_idempotency PRIMARY KEY (tenant_id, endpoint, idempotency_key),
    CONSTRAINT chk_request_idempotency_response_code CHECK (response_code >= 200 AND response_code < 600)
);

CREATE INDEX IF NOT EXISTS idx_request_idempotency_retention 
ON request_idempotency (created_at, status);

CREATE INDEX IF NOT EXISTS idx_request_idempotency_user_audit 
ON request_idempotency (tenant_id, user_id, created_at DESC);

COMMIT;
