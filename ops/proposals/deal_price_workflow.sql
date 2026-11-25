-- Deal price history and below-unit-price approval requests: additive migration.
-- Approved scope (Ali, WhatsApp 05:53:53, reply to the two-point proposal): two new tables only.
-- Idempotent. No change to existing tables, no data rewrite, no deletes. History starts empty at release.
-- Rollback: DROP TABLE deal_price_approvals; DROP TABLE deal_price_changes; (nothing else depends on them).
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE TABLE IF NOT EXISTS deal_price_approvals (
  id UUID PRIMARY KEY,
  tenant_id VARCHAR(255) NOT NULL,
  branch_id VARCHAR(255),
  deal_id INTEGER NOT NULL REFERENCES deals(id) ON DELETE RESTRICT,
  requested_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  requested_value NUMERIC(15,2) NOT NULL,
  deal_value_at_request NUMERIC(15,2) NOT NULL,
  unit_id UUID,
  unit_price_at_request NUMERIC(15,2) NOT NULL,
  approver_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  approver_route VARCHAR(20) NOT NULL,            -- team_manager | department_manager | admin
  status VARCHAR(20) NOT NULL DEFAULT 'pending',  -- pending | approved | rejected | cancelled | stale
  reason TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  decided_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ,
  decision_note TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_deal_price_approvals_one_pending ON deal_price_approvals(deal_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_deal_price_approvals_tenant_status ON deal_price_approvals(tenant_id, status, approver_user_id);

CREATE TABLE IF NOT EXISTS deal_price_changes (
  id UUID PRIMARY KEY,
  tenant_id VARCHAR(255) NOT NULL,
  branch_id VARCHAR(255),
  deal_id INTEGER NOT NULL REFERENCES deals(id) ON DELETE RESTRICT,
  old_value NUMERIC(15,2),
  new_value NUMERIC(15,2) NOT NULL,
  unit_price_at_change NUMERIC(15,2),
  changed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  source VARCHAR(40) NOT NULL,                    -- create | edit | approval
  approval_id UUID REFERENCES deal_price_approvals(id) ON DELETE SET NULL,
  reason TEXT
);
CREATE INDEX IF NOT EXISTS idx_deal_price_changes_deal ON deal_price_changes(tenant_id, deal_id, changed_at);

COMMIT;
