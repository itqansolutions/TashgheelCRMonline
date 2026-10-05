-- migrations/006_add_finance_vouchers_cancellation_status.sql
-- Fully idempotent migration to add cancellation and status fields to finance_vouchers and payments.
-- Uses standard PostgreSQL 9.5+ `ALTER TABLE IF EXISTS ... ADD COLUMN IF NOT EXISTS` syntax.
-- Guaranteed to succeed on fresh, partial, or existing databases.
-- NOTE: Indexes are created safely inside ensureVouchersTable / ensureInvoicesTable 
-- once tables are guaranteed to exist, avoiding Postgres errors on non-existent relations.

-- 1. Finance vouchers status and cancellation fields
ALTER TABLE IF EXISTS finance_vouchers ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'active';
ALTER TABLE IF EXISTS finance_vouchers ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE IF EXISTS finance_vouchers ADD COLUMN IF NOT EXISTS cancelled_by VARCHAR(255);
ALTER TABLE IF EXISTS finance_vouchers ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;
ALTER TABLE IF EXISTS finance_vouchers ADD COLUMN IF NOT EXISTS installment_id VARCHAR(255);
ALTER TABLE IF EXISTS finance_vouchers ADD COLUMN IF NOT EXISTS deal_id VARCHAR(255);
ALTER TABLE IF EXISTS finance_vouchers ADD COLUMN IF NOT EXISTS contract_id VARCHAR(255);

-- 2. Payments link to vouchers and cancellation status
ALTER TABLE IF EXISTS payments ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'active';
ALTER TABLE IF EXISTS payments ADD COLUMN IF NOT EXISTS voucher_id INTEGER;
ALTER TABLE IF EXISTS payments ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE IF EXISTS payments ADD COLUMN IF NOT EXISTS cancelled_by VARCHAR(255);
