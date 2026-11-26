-- =========================================================================
-- MIGRATION 032: payroll payouts (payroll -> Finance posting at actual payout)
-- =========================================================================
-- Additive only. One new table; hr_payroll itself is NOT touched (finalized slips are locked by trigger).
-- Each row links one finalized payslip to the payment voucher (finance_vouchers, voucher_type='payment',
-- reference_no 'PAYROLL-...') that moved money out of a treasury account. Reversal marks the row and
-- cancels the voucher; nothing is deleted. The app also creates this table on first use (IF NOT EXISTS).
-- Rollback: 032_rollback_hr_payroll_payouts.sql
-- =========================================================================
BEGIN;
CREATE TABLE IF NOT EXISTS hr_payroll_payouts (
    id                  SERIAL PRIMARY KEY,
    tenant_id           VARCHAR(255) NOT NULL,
    branch_id           VARCHAR(255),
    payroll_id          INTEGER NOT NULL,
    user_id             INTEGER NOT NULL,
    payroll_month       INTEGER NOT NULL,
    payroll_year        INTEGER NOT NULL,
    amount              NUMERIC(15,2) NOT NULL,
    voucher_id          INTEGER,
    voucher_number      VARCHAR(100),
    treasury_account_id INTEGER,
    payment_method      VARCHAR(50) DEFAULT 'cash',
    batch_ref           VARCHAR(100),
    status              VARCHAR(20) NOT NULL DEFAULT 'paid',
    paid_at             TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    paid_by             INTEGER,
    reversed_at         TIMESTAMP WITH TIME ZONE,
    reversed_by         INTEGER,
    reversal_reason     TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_hr_payroll_payouts_active ON hr_payroll_payouts (payroll_id) WHERE status = 'paid';
CREATE INDEX IF NOT EXISTS idx_hr_payroll_payouts_tenant ON hr_payroll_payouts (tenant_id, payroll_year, payroll_month);
COMMIT;
