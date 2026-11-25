-- PROPOSED, NOT APPLIED. Needs Ali's explicit approval before any run. Adds one new table, touches no existing table or row.
-- Kept in database/proposed on purpose: the startup runner executes every numbered file in database/migrations.
-- Stores distance and accuracy only. No raw GPS coordinates. Retention 90 days (purged by the app on write, hourly at most).
BEGIN;
CREATE TABLE IF NOT EXISTS hr_attendance_location_rejects (
 id BIGSERIAL PRIMARY KEY,
 tenant_id UUID NOT NULL REFERENCES tenants(id),
 branch_id UUID NOT NULL REFERENCES branches(id),
 user_id INTEGER NOT NULL REFERENCES users(id),
 mode TEXT NOT NULL CHECK (mode IN ('in','out')),
 reason_code TEXT NOT NULL CHECK (reason_code IN ('GEO_OUTSIDE_AREA','GEO_FIX_STALE','GEO_FIX_REQUIRED','GEO_FIX_INVALID','GEO_MOBILE_ONLY')),
 distance_m INTEGER,
 accuracy_m INTEGER,
 radius_m DOUBLE PRECISION,
 fix_age_seconds INTEGER,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_hr_att_rejects_tenant_branch_time ON hr_attendance_location_rejects(tenant_id, branch_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hr_att_rejects_created ON hr_attendance_location_rejects(created_at);
COMMIT;
-- Rollback (manual, only if approved): DROP TABLE hr_attendance_location_rejects;
