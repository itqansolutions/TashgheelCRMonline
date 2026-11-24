-- CRM team / unit history / marketing state / rental alerts: additive migration.
-- Idempotent, additive only. No CHECK changes on existing tables, no data rewrites, no deletes.
-- Apply once, in a single transaction, before deploying the matching application version.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- A. Optional team ownership on deals. Existing deals stay untouched (NULL = individual/legacy ownership).
ALTER TABLE deals ADD COLUMN IF NOT EXISTS assigned_team_id INTEGER NULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'deals_assigned_team_id_fkey') THEN
    ALTER TABLE deals ADD CONSTRAINT deals_assigned_team_id_fkey FOREIGN KEY (assigned_team_id) REFERENCES sales_teams(id) ON DELETE RESTRICT;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_deals_tenant_team ON deals(tenant_id, assigned_team_id) WHERE assigned_team_id IS NOT NULL;

-- B. Marketing state, separate from the lifecycle status (lifecycle CHECK untouched). Default TRUE keeps every existing unit as it is today.
ALTER TABLE re_units ADD COLUMN IF NOT EXISTS marketing_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE re_units ADD COLUMN IF NOT EXISTS marketing_inactive_reason TEXT;
ALTER TABLE re_units ADD COLUMN IF NOT EXISTS marketing_changed_at TIMESTAMPTZ;
ALTER TABLE re_units ADD COLUMN IF NOT EXISTS marketing_changed_by INTEGER;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 're_units_marketing_changed_by_fkey') THEN
    ALTER TABLE re_units ADD CONSTRAINT re_units_marketing_changed_by_fkey FOREIGN KEY (marketing_changed_by) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- C. Unit history (price and marketing changes). Starts empty: history begins at release, nothing is invented.
CREATE TABLE IF NOT EXISTS re_unit_events (
  id UUID PRIMARY KEY,
  tenant_id VARCHAR(255) NOT NULL,
  branch_id VARCHAR(255),
  unit_id UUID NOT NULL REFERENCES re_units(id) ON DELETE RESTRICT,
  actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  actor_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  event_type VARCHAR(80) NOT NULL,
  previous_data JSONB,
  new_data JSONB,
  source VARCHAR(80) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_re_unit_events_timeline ON re_unit_events(tenant_id, unit_id, created_at, id);
CREATE INDEX IF NOT EXISTS idx_re_unit_events_period ON re_unit_events(tenant_id, event_type, created_at);

-- D. Rental occupancy: notice timing chosen by staff per handover. No default lead time.
CREATE TABLE IF NOT EXISTS re_rental_occupancies (
  id UUID PRIMARY KEY,
  tenant_id VARCHAR(255) NOT NULL,
  branch_id VARCHAR(255),
  unit_id UUID NOT NULL REFERENCES re_units(id) ON DELETE RESTRICT,
  handover_id UUID NOT NULL REFERENCES re_handovers(id) ON DELETE RESTRICT,
  contract_id UUID REFERENCES re_contracts(id) ON DELETE RESTRICT,
  starts_on DATE,
  ends_on DATE NOT NULL,
  reminder_lead_days INTEGER NOT NULL CHECK (reminder_lead_days >= 0 AND reminder_lead_days <= 365),
  timezone TEXT NOT NULL DEFAULT 'Africa/Cairo',
  reminder_local_time TIME NOT NULL DEFAULT '09:00',
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  state VARCHAR(30) NOT NULL DEFAULT 'occupied' CHECK (state IN ('occupied', 'vacancy_confirmed', 'cancelled')),
  vacancy_confirmed_at TIMESTAMPTZ,
  vacancy_confirmed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (starts_on IS NULL OR ends_on >= starts_on),
  UNIQUE (tenant_id, handover_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_current_rental_occupancy ON re_rental_occupancies(tenant_id, unit_id) WHERE state = 'occupied';
CREATE INDEX IF NOT EXISTS idx_rental_occupancy_open ON re_rental_occupancies(tenant_id, ends_on) WHERE state = 'occupied';

-- E. Per-recipient internal delivery record (dedupe per occupancy revision). No external message fields.
CREATE TABLE IF NOT EXISTS re_rental_alert_deliveries (
  id UUID PRIMARY KEY,
  tenant_id VARCHAR(255) NOT NULL,
  occupancy_id UUID NOT NULL REFERENCES re_rental_occupancies(id) ON DELETE RESTRICT,
  revision INTEGER NOT NULL,
  recipient_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  recipient_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  kind VARCHAR(40) NOT NULL DEFAULT 'vacancy_warning',
  due_at TIMESTAMPTZ NOT NULL,
  delivered_at TIMESTAMPTZ,
  notification_id INTEGER REFERENCES system_notifications(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (tenant_id, occupancy_id, revision, recipient_user_id, kind)
);
CREATE INDEX IF NOT EXISTS idx_rental_alert_occupancy ON re_rental_alert_deliveries(tenant_id, occupancy_id, revision);
COMMIT;
