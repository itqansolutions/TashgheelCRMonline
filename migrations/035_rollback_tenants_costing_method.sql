-- Rollback for 035. Drops the costing method choice (new sales fall back to the default average cost in code).
BEGIN;
ALTER TABLE tenants DROP COLUMN IF EXISTS costing_method;
COMMIT;
