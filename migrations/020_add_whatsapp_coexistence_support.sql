-- ===========================================================================
-- Migration 020: Add WhatsApp Coexistence Support (100% Additive & Backward Compatible)
-- Principle: Backward Compatibility + Zero Regression
-- Description:
--   Adds connection_type, coexistence_status, and coexistence_metadata columns
--   to whatsapp_accounts and whatsapp_settings.
--   All existing records automatically default to connection_type = 'cloud_api'.
-- ===========================================================================

-- 1. Additive columns for whatsapp_accounts
ALTER TABLE whatsapp_accounts 
    ADD COLUMN IF NOT EXISTS connection_type VARCHAR(30) NOT NULL DEFAULT 'cloud_api',
    ADD COLUMN IF NOT EXISTS coexistence_status VARCHAR(50) DEFAULT 'unlinked',
    ADD COLUMN IF NOT EXISTS coexistence_metadata JSONB DEFAULT '{}'::jsonb;

-- Index for connection_type lookups
CREATE INDEX IF NOT EXISTS idx_whatsapp_accounts_connection_type 
    ON whatsapp_accounts(tenant_id, connection_type);

-- 2. Additive columns for whatsapp_settings
ALTER TABLE whatsapp_settings 
    ADD COLUMN IF NOT EXISTS connection_type VARCHAR(30) NOT NULL DEFAULT 'cloud_api',
    ADD COLUMN IF NOT EXISTS coexistence_status VARCHAR(50) DEFAULT 'unlinked',
    ADD COLUMN IF NOT EXISTS coexistence_metadata JSONB DEFAULT '{}'::jsonb;

-- 3. Additive check constraint for valid connection types (guarded)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'check_whatsapp_accounts_connection_type'
    ) THEN
        ALTER TABLE whatsapp_accounts 
            ADD CONSTRAINT check_whatsapp_accounts_connection_type 
            CHECK (connection_type IN ('cloud_api', 'coexistence'));
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'check_whatsapp_settings_connection_type'
    ) THEN
        ALTER TABLE whatsapp_settings 
            ADD CONSTRAINT check_whatsapp_settings_connection_type 
            CHECK (connection_type IN ('cloud_api', 'coexistence'));
    END IF;
END $$;
