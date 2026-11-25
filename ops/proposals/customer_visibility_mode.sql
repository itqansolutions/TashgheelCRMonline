-- Customer visibility mode: additive tenant setting.
-- Approved scope (Ali, WhatsApp 2026-11-25 08:33 via main): one additive column on tenants,
-- default 'scoped' (safe mode: rep own / manager team / admin all, enforced on detail reads
-- with 404 like deals). 'shared' = everyone in tenant/branch reads all customers.
-- Idempotent. No data rewrite; every existing tenant lands on 'scoped' by default.
-- Rollback: ALTER TABLE tenants DROP COLUMN customer_visibility_mode;
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS customer_visibility_mode varchar(20) NOT NULL DEFAULT 'scoped';

COMMIT;
