-- PROPOSAL ONLY. No automatic deployment. Retain all records, never resend from repair.
CREATE TABLE whatsapp_delivery_journal (
 id uuid PRIMARY KEY,
 tenant_id uuid NOT NULL,
 account_id integer NOT NULL,
 branch_id text NOT NULL,
 mirror_context jsonb NOT NULL,
 state text NOT NULL CHECK(state IN ('prepared','unknown','rejected','accepted','mirrored')),
 provider_message_id text UNIQUE,
 conversation_id uuid,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX whatsapp_delivery_pending ON whatsapp_delivery_journal(state,updated_at);
