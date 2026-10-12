-- ============================================================================
-- Migration 019: Property Finder Integration Core Tables
-- Multi-Tenant, Bidirectional Listings & Lead Management for Egypt Market
-- ============================================================================

BEGIN;

-- 1. Tenant-scoped Property Finder Integration Settings
CREATE TABLE IF NOT EXISTS property_finder_settings (
    tenant_id               UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
    api_key_encrypted       TEXT,
    api_secret_encrypted    TEXT,
    environment             VARCHAR(20) NOT NULL DEFAULT 'sandbox'
                            CHECK (environment IN ('sandbox', 'production')),
    is_enabled              BOOLEAN NOT NULL DEFAULT false,
    is_connected            BOOLEAN NOT NULL DEFAULT false,
    listing_sync_enabled    BOOLEAN NOT NULL DEFAULT true,
    lead_sync_enabled       BOOLEAN NOT NULL DEFAULT true,
    auto_publish            BOOLEAN NOT NULL DEFAULT false,
    webhook_secret_encrypted TEXT,
    webhook_subscription_id VARCHAR(255),
    webhook_status          VARCHAR(50) NOT NULL DEFAULT 'unregistered'
                            CHECK (webhook_status IN ('unregistered', 'active', 'paused', 'failed')),
    country_code            VARCHAR(10) NOT NULL DEFAULT 'EG',
    default_assigned_to     INTEGER REFERENCES users(id) ON DELETE SET NULL,
    default_lead_source_id  INTEGER REFERENCES lead_sources(id) ON DELETE SET NULL,
    last_sync_at            TIMESTAMP WITH TIME ZONE,
    last_sync_status        VARCHAR(50) NOT NULL DEFAULT 'never_run'
                            CHECK (last_sync_status IN ('never_run', 'success', 'warning', 'failed')),
    last_error_message      TEXT,
    created_at              TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at              TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pf_settings_enabled ON property_finder_settings(is_enabled, is_connected);

-- 2. Property Listing Mappings (Unit <-> External Listing)
CREATE TABLE IF NOT EXISTS property_finder_listing_mappings (
    id                      SERIAL PRIMARY KEY,
    tenant_id               UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    unit_id                 UUID NOT NULL REFERENCES re_units(id) ON DELETE CASCADE,
    external_listing_id     VARCHAR(150) NOT NULL,
    publication_status      VARCHAR(50) NOT NULL DEFAULT 'draft'
                            CHECK (publication_status IN ('draft', 'pending_publication', 'published', 'rejected', 'unpublished', 'sync_error')),
    external_status         VARCHAR(50) DEFAULT 'draft',
    external_reference      VARCHAR(150),
    portal_url              TEXT,
    rejection_reason        TEXT,
    last_synced_at          TIMESTAMP WITH TIME ZONE,
    sync_hash               VARCHAR(64),
    last_payload_snapshot   JSONB,
    created_at              TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at              TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_pf_mapping_tenant_external UNIQUE (tenant_id, external_listing_id),
    CONSTRAINT uq_pf_mapping_tenant_unit UNIQUE (tenant_id, unit_id)
);

CREATE INDEX IF NOT EXISTS idx_pf_listing_unit ON property_finder_listing_mappings(unit_id);
CREATE INDEX IF NOT EXISTS idx_pf_listing_tenant_status ON property_finder_listing_mappings(tenant_id, publication_status);
CREATE INDEX IF NOT EXISTS idx_pf_listing_ext_id ON property_finder_listing_mappings(external_listing_id);

-- 3. Lead Mappings (Customer <-> External Lead)
CREATE TABLE IF NOT EXISTS property_finder_lead_mappings (
    id                      SERIAL PRIMARY KEY,
    tenant_id               UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    customer_id             INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    external_lead_id        VARCHAR(150) NOT NULL,
    external_listing_id     VARCHAR(150),
    unit_id                 UUID REFERENCES re_units(id) ON DELETE SET NULL,
    channel                 VARCHAR(50) NOT NULL DEFAULT 'form'
                            CHECK (channel IN ('form', 'whatsapp', 'phone', 'email', 'other')),
    raw_enquiry_details     JSONB,
    ingested_at             TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_pf_lead_tenant_external UNIQUE (tenant_id, external_lead_id)
);

CREATE INDEX IF NOT EXISTS idx_pf_lead_customer ON property_finder_lead_mappings(customer_id);
CREATE INDEX IF NOT EXISTS idx_pf_lead_unit ON property_finder_lead_mappings(unit_id);
CREATE INDEX IF NOT EXISTS idx_pf_lead_tenant ON property_finder_lead_mappings(tenant_id);

-- 4. Background Synchronization Jobs
CREATE TABLE IF NOT EXISTS property_finder_sync_jobs (
    id                      SERIAL PRIMARY KEY,
    tenant_id               UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    job_type                VARCHAR(50) NOT NULL
                            CHECK (job_type IN ('import_listings', 'publish_listing', 'update_listing', 'sync_status', 'pull_leads', 'webhook_event')),
    status                  VARCHAR(30) NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
    entity_id               VARCHAR(100),
    payload                 JSONB,
    attempts                INTEGER NOT NULL DEFAULT 0,
    max_retries             INTEGER NOT NULL DEFAULT 3,
    error_details           TEXT,
    started_at              TIMESTAMP WITH TIME ZONE,
    completed_at            TIMESTAMP WITH TIME ZONE,
    created_at              TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at              TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pf_jobs_tenant_status ON property_finder_sync_jobs(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_pf_jobs_pending ON property_finder_sync_jobs(status, created_at) WHERE status = 'pending';

-- 5. Audit & Activity Event Logs
CREATE TABLE IF NOT EXISTS property_finder_event_logs (
    id                      SERIAL PRIMARY KEY,
    tenant_id               UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    event_type              VARCHAR(100) NOT NULL,
    severity                VARCHAR(20) NOT NULL DEFAULT 'info'
                            CHECK (severity IN ('info', 'warn', 'error', 'debug')),
    message                 TEXT NOT NULL,
    details                 JSONB,
    created_at              TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pf_logs_tenant_created ON property_finder_event_logs(tenant_id, created_at DESC);

-- 6. Webhook Idempotency & Event Store
CREATE TABLE IF NOT EXISTS property_finder_webhook_events (
    id                      SERIAL PRIMARY KEY,
    tenant_id               UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    provider_event_id       VARCHAR(150) NOT NULL,
    event_type              VARCHAR(100) NOT NULL,
    status                  VARCHAR(30) NOT NULL DEFAULT 'received'
                            CHECK (status IN ('received', 'processed', 'duplicate', 'failed')),
    payload_summary         JSONB,
    processed_at            TIMESTAMP WITH TIME ZONE,
    created_at              TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_pf_webhook_tenant_event UNIQUE (tenant_id, provider_event_id)
);

CREATE INDEX IF NOT EXISTS idx_pf_webhook_tenant_event ON property_finder_webhook_events(tenant_id, provider_event_id);

COMMIT;
