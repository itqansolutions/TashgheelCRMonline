-- ============================================================
-- Migration: 002_add_vendor_payables_and_treasury.sql
-- Date: 2026-10-03
-- Phase: 5A — Procurement & Payables Integration
--
-- PURPOSE:
--   1. Add due_date to purchase_invoices for accurate Vendor Aging.
--   2. Add treasury_account_id to finance_vouchers to link Vendor Payments to Treasury.
-- ============================================================

BEGIN;

-- 1. Add due_date to purchase_invoices
ALTER TABLE purchase_invoices
    ADD COLUMN IF NOT EXISTS due_date DATE;

-- Update existing purchase_invoices due_date if null (default to invoice_date + 30 days)
UPDATE purchase_invoices
SET due_date = invoice_date + INTERVAL '30 days'
WHERE due_date IS NULL AND invoice_date IS NOT NULL;

-- 2. Add treasury_account_id to finance_vouchers
ALTER TABLE finance_vouchers
    ADD COLUMN IF NOT EXISTS treasury_account_id INTEGER
        REFERENCES treasury_accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_fv_treasury_account
    ON finance_vouchers(treasury_account_id)
    WHERE treasury_account_id IS NOT NULL;

COMMIT;
