-- ============================================================
-- Migration: 012_reconnect_purchasing_workflow.sql
-- Date: 2026-10-11
-- Phase: 2.1 — Purchasing Reconnection (PR -> PO -> Receipt -> Invoice)
--
-- PURPOSE:
--   1. Allow 'converted_to_po' status in purchase_requests.
--   2. Add purchase_request_id and partial unique index to purchase_orders.
--   3. Add invoiced_quantity to purchase_order_items.
--   4. Add purchase_order_id to purchase_invoices and po_item_id to purchase_invoice_items.
--
-- ROLLBACK (for reference):
--   ALTER TABLE purchase_invoice_items DROP COLUMN IF EXISTS po_item_id;
--   ALTER TABLE purchase_invoices DROP COLUMN IF EXISTS purchase_order_id;
--   ALTER TABLE purchase_order_items DROP COLUMN IF EXISTS invoiced_quantity;
--   DROP INDEX IF EXISTS idx_po_tenant_pr;
--   DROP INDEX IF EXISTS idx_po_purchase_request;
--   ALTER TABLE purchase_orders DROP COLUMN IF EXISTS purchase_request_id;
-- ============================================================

BEGIN;

-- 1. Safely update purchase_requests status constraint to include 'converted_to_po'
ALTER TABLE purchase_requests DROP CONSTRAINT IF EXISTS purchase_requests_status_check;
ALTER TABLE purchase_requests DROP CONSTRAINT IF EXISTS chk_purchase_requests_status;

ALTER TABLE purchase_requests 
    ADD CONSTRAINT chk_purchase_requests_status 
    CHECK (status IN ('draft', 'submitted', 'approved', 'rejected', 'cancelled', 'converted_to_rfq', 'converted_to_po'));

-- 2. Add purchase_request_id to purchase_orders + partial unique index for idempotency
ALTER TABLE purchase_orders 
    ADD COLUMN IF NOT EXISTS purchase_request_id INTEGER REFERENCES purchase_requests(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_po_purchase_request 
    ON purchase_orders (purchase_request_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_po_tenant_pr 
    ON purchase_orders (tenant_id, purchase_request_id) 
    WHERE purchase_request_id IS NOT NULL AND status != 'cancelled';

-- 3. Add invoiced_quantity to purchase_order_items
ALTER TABLE purchase_order_items 
    ADD COLUMN IF NOT EXISTS invoiced_quantity DECIMAL(12, 3) NOT NULL DEFAULT 0.000;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conrelid = 'purchase_order_items'::regclass 
          AND conname = 'chk_poi_invoiced_qty'
    ) THEN
        ALTER TABLE purchase_order_items 
            ADD CONSTRAINT chk_poi_invoiced_qty CHECK (invoiced_quantity >= 0);
    END IF;
END $$;

-- 4. Add purchase_order_id to purchase_invoices
ALTER TABLE purchase_invoices 
    ADD COLUMN IF NOT EXISTS purchase_order_id INTEGER REFERENCES purchase_orders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pinv_po 
    ON purchase_invoices (purchase_order_id);

-- 5. Add po_item_id to purchase_invoice_items
ALTER TABLE purchase_invoice_items 
    ADD COLUMN IF NOT EXISTS po_item_id INTEGER REFERENCES purchase_order_items(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pii_po_item 
    ON purchase_invoice_items (po_item_id);

COMMIT;
