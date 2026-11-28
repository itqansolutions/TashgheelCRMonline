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
