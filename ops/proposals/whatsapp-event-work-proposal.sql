-- ISOLATED work queue proposal. No effect handler is installed or auto-run.
CREATE TABLE whatsapp_verified_event_work(
 id bigserial PRIMARY KEY,
 tenant_id uuid NOT NULL,
 account_id integer NOT NULL,
 app_id text NOT NULL,
 waba_id text NOT NULL,
 branch_id text,
 phone_number_id text NOT NULL,
 claim_generation bigint NOT NULL,
 event_key text NOT NULL,
 event_digest text NOT NULL,
 event jsonb NOT NULL,
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','processing','applied','quarantined')),
 attempts integer NOT NULL DEFAULT 0,
 available_at timestamptz NOT NULL DEFAULT now(),
 lease_token uuid,
 lease_expires_at timestamptz,
 error_code text,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,account_id,event_key)
);
