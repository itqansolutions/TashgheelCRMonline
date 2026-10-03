-- ============================================================
-- Migration: 001_create_treasury_accounts
-- Date: 2026-10-03
-- Phase: 3 — Treasury Layer
--
-- PURPOSE:
--   Add a lightweight CRM Treasury layer on top of existing
--   payments + expenses. No journal entries. No GL accounts.
--   No treasury_transactions table.
--
-- TABLES CREATED:
--   treasury_accounts
--
-- COLUMNS ADDED:
--   payments.treasury_account_id
--   expenses.treasury_account_id
--   expenses.payment_method
--
-- RULES:
--   1. Run once on the target database.
--   2. Do NOT run ensureTable() inside controllers.
--   3. Legacy data: cash → default_cash, bank_transfer → default_bank,
--      card/check → NULL (Unallocated). Run Section D manually after
--      confirming default accounts exist.
--   4. New payments/expenses SHOULD provide treasury_account_id.
--      Controller falls back to the default account for that type
--      if not provided (backward compat).
-- ============================================================

BEGIN;

-- ============================================================
-- Section A: Create treasury_accounts table
-- ============================================================

CREATE TABLE IF NOT EXISTS treasury_accounts (
    id               SERIAL PRIMARY KEY,
    name             VARCHAR(255) NOT NULL,

    -- 'cash' = physical cashbox | 'bank' = bank/card account
    type             VARCHAR(20)  NOT NULL DEFAULT 'cash'
                     CHECK (type IN ('cash', 'bank')),

    -- Bank-specific info (optional for cash accounts)
    bank_name        VARCHAR(255),
    account_number   VARCHAR(100),

    -- Opening balance: set once at creation, never edited via normal UI.
    -- Represents the account balance BEFORE the CRM started tracking.
    opening_balance  DECIMAL(15, 2) NOT NULL DEFAULT 0,

    -- At most ONE default per (tenant_id, branch_id, type).
    -- Enforced by partial unique index below.
    is_default       BOOLEAN NOT NULL DEFAULT false,

    is_active        BOOLEAN NOT NULL DEFAULT true,

    -- Multi-tenancy: mandatory
    tenant_id        UUID NOT NULL,
    branch_id        VARCHAR(255),

    created_at       TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index: fast lookup by tenant + branch
CREATE INDEX IF NOT EXISTS idx_treasury_accounts_tenant
    ON treasury_accounts (tenant_id, branch_id);

-- Partial unique index: at most one default account per (tenant, branch, type)
-- Example: one default cash + one default bank per branch ✓
CREATE UNIQUE INDEX IF NOT EXISTS idx_treasury_one_default_per_type
    ON treasury_accounts (tenant_id, branch_id, type)
    WHERE is_default = true;

-- ============================================================
-- Section B: Add treasury_account_id to payments
-- ============================================================

ALTER TABLE payments
    ADD COLUMN IF NOT EXISTS treasury_account_id INTEGER
        REFERENCES treasury_accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_payments_treasury_account
    ON payments (treasury_account_id)
    WHERE treasury_account_id IS NOT NULL;

-- ============================================================
-- Section C: Add treasury_account_id + payment_method to expenses
--
-- Note: expensesController.js does NOT have payment_method today.
--       This migration adds it to the table. The controller update
--       will accept it from the request body.
-- ============================================================

ALTER TABLE expenses
    ADD COLUMN IF NOT EXISTS treasury_account_id INTEGER
        REFERENCES treasury_accounts(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50) DEFAULT 'cash';

CREATE INDEX IF NOT EXISTS idx_expenses_treasury_account
    ON expenses (treasury_account_id)
    WHERE treasury_account_id IS NOT NULL;

-- ============================================================
-- Section D: Legacy data migration  (MANUAL STEP — run after
--            confirming default accounts exist in treasury_accounts)
--
-- Run in two passes:
--   Pass 1 — assign cash payments to default cash account
--   Pass 2 — assign bank_transfer payments to default bank account
--   card / check → remain NULL = "Unallocated"
--
-- Template (replace :tenant_id, :branch_id with actual values
--           or loop over all tenants):
--
-- -- D1. Legacy cash payments → default cash account
-- UPDATE payments p
-- SET treasury_account_id = ta.id
-- FROM treasury_accounts ta
-- WHERE ta.tenant_id::text = p.tenant_id::text
--   AND (ta.branch_id IS NULL OR ta.branch_id::text = p.branch_id::text)
--   AND ta.type = 'cash'
--   AND ta.is_default = true
--   AND p.payment_method = 'cash'
--   AND p.treasury_account_id IS NULL;
--
-- -- D2. Legacy bank_transfer payments → default bank account
-- UPDATE payments p
-- SET treasury_account_id = ta.id
-- FROM treasury_accounts ta
-- WHERE ta.tenant_id::text = p.tenant_id::text
--   AND (ta.branch_id IS NULL OR ta.branch_id::text = p.branch_id::text)
--   AND ta.type = 'bank'
--   AND ta.is_default = true
--   AND p.payment_method = 'bank_transfer'
--   AND p.treasury_account_id IS NULL;
--
-- -- D3. card / check → left as NULL (Unallocated)
-- -- D4. expenses → left as NULL (no payment_method data existed)
-- ============================================================

COMMIT;

-- ============================================================
-- Verification queries (run after migration):
-- ============================================================
--
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_name IN ('treasury_accounts','payments','expenses')
-- ORDER BY table_name, ordinal_position;
--
-- SELECT COUNT(*) FROM treasury_accounts;
-- SELECT COUNT(*) FROM payments WHERE treasury_account_id IS NOT NULL;
-- SELECT COUNT(*) FROM expenses  WHERE treasury_account_id IS NOT NULL;
