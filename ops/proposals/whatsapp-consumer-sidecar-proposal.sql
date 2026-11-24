-- Isolated sidecar only. No legacy contact merge, no message send or live route.
CREATE TABLE whatsapp_verified_message_records(
 tenant_id uuid NOT NULL,
 account_id integer NOT NULL,
 message_id text NOT NULL,
 branch_id text NOT NULL,
 phone_number_id text NOT NULL,
 app_id text NOT NULL,
 waba_id text NOT NULL,
 claim_generation bigint NOT NULL,
 direction text NOT NULL CHECK(direction IN ('inbound','outbound')),
 peer jsonb NOT NULL,
 message_type text NOT NULL,
 body text NOT NULL,
 timestamp_seconds bigint NOT NULL,
 immutable_digest text NOT NULL,
 PRIMARY KEY(tenant_id,account_id,message_id)
);
CREATE TABLE whatsapp_verified_status_facts(
 tenant_id uuid NOT NULL,
 account_id integer NOT NULL,
 event_key text NOT NULL,
 message_id text NOT NULL,
 status text NOT NULL,
 timestamp_seconds bigint NOT NULL,
 fact jsonb NOT NULL,
 PRIMARY KEY(tenant_id,account_id,event_key)
);
CREATE TABLE whatsapp_verified_work_origins(
 work_id bigint NOT NULL REFERENCES whatsapp_verified_event_work(id),
 source text NOT NULL,
 PRIMARY KEY(work_id,source)
);
