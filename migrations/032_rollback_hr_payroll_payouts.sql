-- Rollback for 032. Only safe when no payouts exist (reverse them first).
DROP TABLE IF EXISTS hr_payroll_payouts;
