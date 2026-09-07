-- Tenant-scoped Meta credentials. These must never be stored in the shared
-- `settings` table, which is also used for public branding settings.
CREATE TABLE IF NOT EXISTS meta_integration_settings (
    tenant_id UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
    meta_app_id VARCHAR(255),
    meta_app_secret TEXT,
    meta_webhook_verify_token TEXT,
    meta_default_access_token TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- A webhook verification token identifies one tenant during Meta's handshake.
CREATE UNIQUE INDEX IF NOT EXISTS idx_meta_integration_settings_verify_token
    ON meta_integration_settings (meta_webhook_verify_token)
    WHERE meta_webhook_verify_token IS NOT NULL
      AND meta_webhook_verify_token <> '';

-- A real Meta Instant Form belongs to one organization. Existing duplicate
-- configurations need manual resolution before this index can be created.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT form_id
        FROM meta_forms
        GROUP BY form_id
        HAVING COUNT(*) > 1
    ) THEN
        CREATE UNIQUE INDEX IF NOT EXISTS idx_meta_forms_unique_form_id
            ON meta_forms (form_id);
    ELSE
        RAISE NOTICE 'Meta form ownership index was not created because duplicate form IDs already exist.';
    END IF;
END $$;
