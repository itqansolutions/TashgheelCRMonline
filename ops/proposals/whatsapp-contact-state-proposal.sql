-- Scoped WhatsApp Business address-book state, not CRM customer identity.
CREATE TABLE whatsapp_verified_contact_facts(
 tenant_id uuid NOT NULL,account_id integer NOT NULL,event_key text NOT NULL,
 branch_id text NOT NULL,claim_generation bigint NOT NULL,app_id text NOT NULL,waba_id text NOT NULL,
 user_id text NOT NULL,action text NOT NULL CHECK(action IN ('add','remove')),
 timestamp_seconds bigint NOT NULL,fact jsonb NOT NULL,event_digest text NOT NULL,
 PRIMARY KEY(tenant_id,account_id,branch_id,claim_generation,event_key)
);
CREATE TABLE whatsapp_verified_contact_state(
 tenant_id uuid NOT NULL,account_id integer NOT NULL,branch_id text NOT NULL,claim_generation bigint NOT NULL,
 app_id text NOT NULL,waba_id text NOT NULL,user_id text NOT NULL,
 phone_number text,full_name text,first_name text,username text,parent_user_id text,
 is_removed boolean NOT NULL,timestamp_seconds bigint NOT NULL,event_key text NOT NULL,
 PRIMARY KEY(tenant_id,account_id,branch_id,claim_generation,user_id)
);
