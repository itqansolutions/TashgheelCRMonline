-- WhatsApp Business Cloud API settings — one row per tenant.
-- Run this once against the production database.

CREATE TABLE IF NOT EXISTS whatsapp_settings (
  tenant_id             UUID        PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,

  -- Meta WhatsApp Business Account details
  phone_number_id       VARCHAR(255) NOT NULL DEFAULT '',    -- e.g. "123456789012345"
  access_token          TEXT         NOT NULL DEFAULT '',    -- Permanent system-user token

  -- Template configuration
  template_name         VARCHAR(100) NOT NULL DEFAULT '',    -- e.g. "welcome_new_lead"
  template_language_ar  VARCHAR(20)  NOT NULL DEFAULT 'ar', -- e.g. "ar"
  template_language_en  VARCHAR(20)  NOT NULL DEFAULT 'en_US', -- e.g. "en_US"
  send_arabic           BOOLEAN      NOT NULL DEFAULT TRUE,
  send_english          BOOLEAN      NOT NULL DEFAULT FALSE,

  -- Phone number normalisation default
  default_country_code  VARCHAR(10)  NOT NULL DEFAULT '20', -- 20 = Egypt

  -- Toggle
  is_active             BOOLEAN      NOT NULL DEFAULT FALSE,

  created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Index for fast per-tenant lookup
CREATE INDEX IF NOT EXISTS idx_whatsapp_settings_tenant_id ON whatsapp_settings(tenant_id);

-- Auto-update updated_at (requires the trigger function to exist)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column'
  ) THEN
    CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $func$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $func$ LANGUAGE plpgsql;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_whatsapp_settings_updated_at ON whatsapp_settings;
CREATE TRIGGER trg_whatsapp_settings_updated_at
  BEFORE UPDATE ON whatsapp_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
