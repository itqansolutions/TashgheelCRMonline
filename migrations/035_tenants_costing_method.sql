-- =========================================================================
-- MIGRATION 035: inventory costing method per company (tenant)
-- =========================================================================
-- Additive only. 'average' (weighted moving average, default) or 'fifo'.
-- Existing companies get 'average'. Past cost snapshots (stock_movements.unit_cost) are never rewritten.
-- Safe to run more than once. Rollback: 035_rollback_tenants_costing_method.sql
-- =========================================================================
BEGIN;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS costing_method VARCHAR(10) NOT NULL DEFAULT 'average';
COMMIT;
