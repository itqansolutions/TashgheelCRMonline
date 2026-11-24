-- PROPOSAL ONLY. Do not run against application databases.
-- Existing rows do not become trusted through this additive schema.
CREATE TABLE whatsapp_onboarding_attempts (
 id uuid PRIMARY KEY,
 tenant_id uuid NOT NULL,
 user_id text NOT NULL,
 branch_id text,
 app_id text NOT NULL CHECK(app_id ~ '^[0-9]+$'),
 config_id text NOT NULL CHECK(config_id ~ '^[0-9]+$'),
 expires_at timestamptz NOT NULL,
 status text NOT NULL CHECK(status IN ('open','processing','preview','reserved','linked','failed','expired')),
 phone_number_id text,
 preview_waba_id text,
 preview_token text,
 preview_display_phone text,
 preview_verified_name text,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE whatsapp_phone_claims (
 phone_number_id text PRIMARY KEY CHECK(phone_number_id ~ '^[0-9]+$'),
 tenant_id uuid NOT NULL,
 app_id text NOT NULL CHECK(app_id ~ '^[0-9]+$'),
 waba_id text NOT NULL CHECK(waba_id ~ '^[0-9]+$'),
 attempt_id uuid NOT NULL REFERENCES whatsapp_onboarding_attempts(id),
 state text NOT NULL CHECK(state IN ('reserved','linked','disconnected','quarantined')),
 generation bigint NOT NULL DEFAULT 1 CHECK(generation > 0),
 verified_at timestamptz NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now()
);
-- No automatic backfill, legacy JSON import, global WABA uniqueness or deletes.
