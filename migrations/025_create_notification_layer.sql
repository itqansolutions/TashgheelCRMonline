-- ============================================================================
-- Migration 025: Tashgheel CRM — Messaging & Notification Layer (Phase 1)
-- Tables: notification_rules, notification_jobs, notification_logs
-- Multi-tenant isolated, database-backed queue, monotonic webhook tracking
-- ============================================================================

BEGIN;

-- 1. Notification Rules (Per-Tenant Notification Configurations)
CREATE TABLE IF NOT EXISTS notification_rules (
    id SERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id UUID NULL REFERENCES branches(id) ON DELETE SET NULL,
    event_name VARCHAR(100) NOT NULL,
    is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    channels JSONB NOT NULL DEFAULT '["whatsapp"]'::jsonb,
    template_name VARCHAR(100) NULL,
    template_language VARCHAR(20) NOT NULL DEFAULT 'ar',
    recipient_roles JSONB DEFAULT '["assignee"]'::jsonb,
    conditions JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uk_notification_rules_tenant_event UNIQUE (tenant_id, event_name)
);

CREATE INDEX IF NOT EXISTS idx_notification_rules_tenant ON notification_rules(tenant_id);
CREATE INDEX IF NOT EXISTS idx_notification_rules_event ON notification_rules(tenant_id, event_name, is_enabled);

-- 2. Notification Jobs (Database-backed queue for reliable message dispatch)
CREATE TABLE IF NOT EXISTS notification_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id UUID NULL REFERENCES branches(id) ON DELETE SET NULL,
    event_name VARCHAR(100) NOT NULL,
    channel VARCHAR(30) NOT NULL DEFAULT 'whatsapp',
    recipient_type VARCHAR(50) NOT NULL, -- 'employee' or 'customer'
    recipient_id VARCHAR(100) NULL,      -- User ID or Customer ID
    recipient_phone VARCHAR(50) NOT NULL,
    recipient_name VARCHAR(255) NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    deduplication_key VARCHAR(255) NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
    priority INTEGER NOT NULL DEFAULT 10,
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 3,
    scheduled_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP WITH TIME ZONE NULL,
    error_message TEXT NULL,
    meta_message_id VARCHAR(255) NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_notif_jobs_dedup 
    ON notification_jobs(tenant_id, deduplication_key) 
    WHERE deduplication_key IS NOT NULL AND status IN ('pending', 'processing', 'completed');

CREATE INDEX IF NOT EXISTS idx_notif_jobs_queue_lookup 
    ON notification_jobs(status, scheduled_at, priority DESC) 
    WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_notif_jobs_tenant ON notification_jobs(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notif_jobs_meta_id ON notification_jobs(meta_message_id) WHERE meta_message_id IS NOT NULL;

-- 3. Notification Logs (Audit Trail and Monotonic Delivery Tracking)
CREATE TABLE IF NOT EXISTS notification_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NULL REFERENCES notification_jobs(id) ON DELETE SET NULL,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id UUID NULL REFERENCES branches(id) ON DELETE SET NULL,
    channel VARCHAR(30) NOT NULL DEFAULT 'whatsapp',
    event_name VARCHAR(100) NOT NULL,
    recipient_type VARCHAR(50) NOT NULL, -- 'employee' or 'customer'
    recipient_id VARCHAR(100) NULL,
    recipient_phone VARCHAR(50) NOT NULL,
    recipient_name VARCHAR(255) NULL,
    message_body TEXT NULL,
    template_name VARCHAR(100) NULL,
    meta_message_id VARCHAR(255) NULL,
    delivery_status VARCHAR(30) NOT NULL DEFAULT 'queued'
        CHECK (delivery_status IN ('queued', 'sent', 'delivered', 'read', 'failed')),
    error_code VARCHAR(100) NULL,
    error_message TEXT NULL,
    sent_at TIMESTAMP WITH TIME ZONE NULL,
    delivered_at TIMESTAMP WITH TIME ZONE NULL,
    read_at TIMESTAMP WITH TIME ZONE NULL,
    failed_at TIMESTAMP WITH TIME ZONE NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notif_logs_meta_id ON notification_logs(meta_message_id) WHERE meta_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notif_logs_tenant_created ON notification_logs(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notif_logs_job_id ON notification_logs(job_id);
CREATE INDEX IF NOT EXISTS idx_notif_logs_event ON notification_logs(tenant_id, event_name);

COMMIT;
