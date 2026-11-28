-- Rollback for 034. Drops the cost snapshot (COGS figures disappear; stock quantities are unaffected).
-- WARNING: if unit_cost existed before 034 (used by sales returns), do NOT run this.
BEGIN;
ALTER TABLE stock_movements DROP COLUMN IF EXISTS unit_cost;
COMMIT;
