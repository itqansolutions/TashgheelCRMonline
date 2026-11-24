-- ISOLATED PROPOSAL, not legacyCRM migration or production route wiring.
CREATE TABLE whatsapp_verified_inbox_events(
 inbox_id bigint NOT NULL REFERENCES whatsapp_verified_webhook_inbox(id),
 operation_index integer NOT NULL,
 event_index integer NOT NULL,
 tenant_id uuid NOT NULL,
 account_id integer NOT NULL,
 branch_id text,
 phone_number_id text NOT NULL,
 claim_generation bigint NOT NULL,
 field text NOT NULL,
 event jsonb NOT NULL,
 PRIMARY KEY(inbox_id,operation_index,event_index)
);
