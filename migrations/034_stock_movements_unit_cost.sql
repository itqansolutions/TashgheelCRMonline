-- =========================================================================
-- MIGRATION 034: cost snapshot on stock movements (COGS)
-- =========================================================================
-- Additive only. One nullable column. Existing rows are not touched (no cost, no COGS for past sales).
-- New stock-outs from invoices / delivery notes store the product cost at the moment of sale.
-- Safe to run more than once. Rollback: 034_rollback_stock_movements_unit_cost.sql
-- =========================================================================
BEGIN;
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS unit_cost NUMERIC(15,4) NULL;
COMMIT;
