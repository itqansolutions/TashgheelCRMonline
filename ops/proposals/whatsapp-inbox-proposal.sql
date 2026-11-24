-- ISOLATED PROPOSAL. No route wiring, no automatic scheduling or trust backfill.
CREATE TABLE whatsapp_verified_webhook_inbox(
 id bigserial PRIMARY KEY,
 app_id text NOT NULL,
 payload_sha256 text NOT NULL,
 raw_payload bytea NOT NULL,
 operations jsonb NOT NULL,
 schema_version integer NOT NULL DEFAULT 1 CHECK(schema_version=1),
 signature_algorithm text NOT NULL DEFAULT 'hmac-sha256',
 quarantine_reason text,
 quarantined_at timestamptz,
 state text NOT NULL DEFAULT 'captured' CHECK(state IN ('captured','staged','processing','processed','quarantined')),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(app_id,payload_sha256)
);
