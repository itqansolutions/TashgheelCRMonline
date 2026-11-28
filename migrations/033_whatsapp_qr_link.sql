-- Migration 033: WhatsApp QR linking (unofficial pairing track)
-- Additive only. Isolated from the Cloud API / Coexistence module: nothing here
-- alters whatsapp_settings, the Meta webhook, or any verified-onboarding table.
--
-- The application also ensures this schema idempotently at runtime
-- (services/whatsappQrGateway.js ensureSchema) because serving startup does not
-- run migrations; this file is the reviewed record of the same DDL.

CREATE TABLE IF NOT EXISTS whatsapp_qr_sessions (
    account_id INTEGER PRIMARY KEY,
    tenant_id UUID NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'pending',
    qr_data TEXT,
    qr_generated_at TIMESTAMPTZ,
    phone_e164 VARCHAR(30),
    push_name VARCHAR(255),
    last_error TEXT,
    linked_at TIMESTAMPTZ,
    last_seen_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Baileys auth state (creds + signal keys) so a redeploy does not force a re-scan.
CREATE TABLE IF NOT EXISTS whatsapp_qr_auth_keys (
    account_id INTEGER NOT NULL,
    category TEXT NOT NULL,
    key_id TEXT NOT NULL,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (account_id, category, key_id)
);

ALTER TABLE whatsapp_accounts ADD COLUMN IF NOT EXISTS qr_status VARCHAR(30);
ALTER TABLE whatsapp_accounts ADD COLUMN IF NOT EXISTS qr_linked_at TIMESTAMPTZ;

-- Two pre-existing Meta-only guards would otherwise reject QR rows. Both are
-- widened for connection_type='qr_link' only; every Cloud API / Coexistence rule
-- is preserved verbatim.
--
-- 1) The binding guard trigger (ops/proposals/all-writer-guard-proposal.sql) now
--    returns early for QR rows and still refuses to convert an existing
--    Cloud API / coexistence row into a QR row.
CREATE OR REPLACE FUNCTION guard_whatsapp_binding_candidate() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE claim whatsapp_phone_claims%ROWTYPE;
BEGIN
  IF NEW.connection_type = 'qr_link' AND (TG_OP = 'INSERT' OR OLD.connection_type = 'qr_link') THEN
    RETURN NEW;
  END IF;
  IF TG_OP='UPDATE' AND NEW.tenant_id IS NOT DISTINCT FROM OLD.tenant_id
    AND NEW.phone_number_id IS NOT DISTINCT FROM OLD.phone_number_id
    AND NEW.access_token IS NOT DISTINCT FROM OLD.access_token
    AND (to_jsonb(NEW)->'branch_id') IS NOT DISTINCT FROM (to_jsonb(OLD)->'branch_id')
    AND (to_jsonb(NEW)->'connection_type') IS NOT DISTINCT FROM (to_jsonb(OLD)->'connection_type')
    AND NOT (NEW.is_active IS TRUE AND OLD.is_active IS DISTINCT FROM TRUE)
  THEN
    IF TG_TABLE_NAME='whatsapp_accounts' THEN
      IF NEW.coexistence_status IS NOT DISTINCT FROM OLD.coexistence_status THEN RETURN NEW; END IF;
    ELSE
      IF NEW.waba_id IS NOT DISTINCT FROM OLD.waba_id THEN RETURN NEW; END IF;
    END IF;
  END IF;
  SELECT * INTO claim FROM whatsapp_phone_claims WHERE phone_number_id=NEW.phone_number_id FOR SHARE;
  IF NOT FOUND OR claim.tenant_id IS DISTINCT FROM NEW.tenant_id OR claim.state NOT IN ('reserved','linked','disconnected')
    OR claim.token_sha256 IS NULL OR claim.token_sha256 IS DISTINCT FROM encode(sha256(convert_to(coalesce(NEW.access_token,''),'UTF8')),'hex')
  THEN RAISE EXCEPTION 'WhatsApp verified ownership binding required' USING ERRCODE='23514'; END IF;
  IF TG_TABLE_NAME='whatsapp_settings' THEN
    IF claim.waba_id IS DISTINCT FROM NEW.waba_id THEN
    RAISE EXCEPTION 'WhatsApp WABA binding mismatch' USING ERRCODE='23514';
    END IF;
  END IF;
  IF TG_TABLE_NAME='whatsapp_accounts' THEN
    IF NEW.branch_id IS DISTINCT FROM (SELECT branch_id FROM whatsapp_onboarding_attempts WHERE id=claim.attempt_id) OR NEW.connection_type IS DISTINCT FROM 'coexistence' THEN
      RAISE EXCEPTION 'WhatsApp branch or connection binding changed' USING ERRCODE='23514';
    END IF;
    IF NEW.coexistence_status IS NULL OR NEW.coexistence_status NOT IN ('pending','linked','disconnected') THEN
      RAISE EXCEPTION 'WhatsApp invalid lifecycle status' USING ERRCODE='23514';
    END IF;
    IF NEW.coexistence_status='linked' AND claim.state<>'linked' THEN
      RAISE EXCEPTION 'WhatsApp account status not verified' USING ERRCODE='23514';
    END IF;
    IF NEW.coexistence_status='disconnected' AND claim.state<>'disconnected' THEN
      RAISE EXCEPTION 'WhatsApp disconnect transition required' USING ERRCODE='23514';
    END IF;
  END IF;
  IF NEW.is_active IS TRUE AND claim.state<>'linked' THEN
    RAISE EXCEPTION 'WhatsApp provisioning incomplete' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;

-- 2) The connection_type CHECK constraint gains the QR value.
ALTER TABLE whatsapp_accounts DROP CONSTRAINT IF EXISTS check_whatsapp_accounts_connection_type;
ALTER TABLE whatsapp_accounts ADD CONSTRAINT check_whatsapp_accounts_connection_type
  CHECK (connection_type IN ('cloud_api','coexistence','qr_link'));
