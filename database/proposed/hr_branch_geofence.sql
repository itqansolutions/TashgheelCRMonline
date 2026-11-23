-- PREPARATION ONLY. Separate live execution approval required. No branch is configured here.
BEGIN;
CREATE TABLE hr_branch_attendance_policy (
 branch_id UUID PRIMARY KEY REFERENCES branches(id),
 tenant_id UUID NOT NULL REFERENCES tenants(id),
 center_lat DOUBLE PRECISION NOT NULL CHECK(center_lat BETWEEN -90 AND 90),
 center_lng DOUBLE PRECISION NOT NULL CHECK(center_lng BETWEEN -180 AND 180),
 radius_m DOUBLE PRECISION NOT NULL CHECK(radius_m>0),
 max_fix_age_seconds INTEGER NOT NULL CHECK(max_fix_age_seconds>0),
 max_future_skew_seconds INTEGER NOT NULL CHECK(max_future_skew_seconds>=0),
 require_mobile BOOLEAN NOT NULL DEFAULT TRUE,
 enforcement_enabled BOOLEAN NOT NULL DEFAULT FALSE,
 updated_by INTEGER REFERENCES users(id),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- No rows inserted. Freshness/skew values require owner policy decision.
COMMIT;
