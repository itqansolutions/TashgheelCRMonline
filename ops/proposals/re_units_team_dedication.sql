-- Units team dedication: additive column on re_units.
-- Approved scope (Ali, WhatsApp 2026-11-25 08:32-08:33 via main): one additive INTEGER column
-- DEFAULT NULL pointing at sales_teams.id, same pattern as deals.assigned_team_id.
-- Idempotent. No data rewrite; every existing unit stays unassigned (shared).
-- Rollback: DROP INDEX idx_re_units_assigned_team_id; ALTER TABLE re_units DROP COLUMN assigned_team_id;
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE re_units
  ADD COLUMN IF NOT EXISTS assigned_team_id INTEGER NULL;

CREATE INDEX IF NOT EXISTS idx_re_units_assigned_team_id ON re_units (assigned_team_id);

COMMIT;
