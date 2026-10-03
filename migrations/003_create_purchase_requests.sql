-- ============================================================
-- Migration: 003_create_purchase_requests.sql
-- Date: 2026-10-03
-- Phase: 5B.1 — Purchase Requests & Internal Approvals
--
-- PURPOSE:
--   Create CRM-native purchase_requests and purchase_request_items tables.
--   Fully scoped by tenant_id and branch_id.
--   SERIAL INTEGER IDs, no ERP accounting dependencies.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS purchase_requests (
    id                  SERIAL PRIMARY KEY,
    request_number      VARCHAR(50) NOT NULL,
    requested_by        INTEGER REFERENCES users(id) ON DELETE SET NULL,
    department          VARCHAR(100),
    branch_id           VARCHAR(255),
    warehouse_id        INTEGER REFERENCES warehouses(id) ON DELETE SET NULL,
    priority            VARCHAR(20) NOT NULL DEFAULT 'normal'
                        CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    required_date       DATE,
    notes               TEXT,
    status              VARCHAR(30) NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft', 'submitted', 'approved', 'rejected', 'cancelled', 'converted_to_rfq')),
    rejection_reason    TEXT,
    approved_by         INTEGER REFERENCES users(id) ON DELETE SET NULL,
    approved_at         TIMESTAMP WITH TIME ZONE,
    tenant_id           UUID NOT NULL,
    created_at          TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pr_tenant_reqnum
    ON purchase_requests (tenant_id, request_number);

CREATE INDEX IF NOT EXISTS idx_pr_tenant_branch
    ON purchase_requests (tenant_id, branch_id);

CREATE INDEX IF NOT EXISTS idx_pr_status
    ON purchase_requests (tenant_id, status);

CREATE TABLE IF NOT EXISTS purchase_request_items (
    id                   SERIAL PRIMARY KEY,
    request_id           INTEGER NOT NULL REFERENCES purchase_requests(id) ON DELETE CASCADE,
    product_id          INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    description          TEXT,
    quantity             DECIMAL(12, 3) NOT NULL CHECK (quantity > 0),
    estimated_unit_price DECIMAL(12, 2) NOT NULL DEFAULT 0.00 CHECK (estimated_unit_price >= 0),
    created_at           TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pr_items_request
    ON purchase_request_items (request_id);

CREATE INDEX IF NOT EXISTS idx_pr_items_product
    ON purchase_request_items (product_id);

COMMIT;
