-- Migration: Create WhatsApp Multi-Number & Chat System
-- Enables multiple WhatsApp accounts per tenant, conversation threads with 24h window tracking, and idempotent message logs.

-- 1. WhatsApp Accounts Table
CREATE TABLE IF NOT EXISTS whatsapp_accounts (
    id SERIAL PRIMARY KEY,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id VARCHAR(255),
    phone_number_id VARCHAR(100) NOT NULL,
    display_phone_number VARCHAR(50) NOT NULL,
    verified_name VARCHAR(255),
    label VARCHAR(100), -- e.g. "Main Sales", "Support Line"
    access_token TEXT, -- Optional override; COALESCE with whatsapp_settings.access_token
    is_default BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    quality_rating VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_tenant_whatsapp_phone_number UNIQUE (tenant_id, phone_number_id)
);
CREATE INDEX IF NOT EXISTS idx_whatsapp_accounts_phone_id ON whatsapp_accounts(phone_number_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_accounts_tenant ON whatsapp_accounts(tenant_id);

-- Ensure meta_app_secret column exists in whatsapp_settings for HMAC verification
ALTER TABLE whatsapp_settings ADD COLUMN IF NOT EXISTS meta_app_secret TEXT;

-- 2. WhatsApp Conversations Table
CREATE TABLE IF NOT EXISTS whatsapp_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id VARCHAR(255),
    account_id INTEGER REFERENCES whatsapp_accounts(id) ON DELETE SET NULL,
    assigned_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    phone_number VARCHAR(50) NOT NULL, -- E.164 formatted customer phone
    contact_name VARCHAR(255),
    customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
    last_message_body TEXT,
    last_message_at TIMESTAMPTZ DEFAULT NOW(),
    last_message_direction VARCHAR(10) DEFAULT 'inbound',
    unread_count INTEGER DEFAULT 0,
    window_expires_at TIMESTAMPTZ, -- Fast UX hint for 24h window
    is_archived BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_tenant_account_chat UNIQUE (tenant_id, phone_number, account_id)
);
CREATE INDEX IF NOT EXISTS idx_wa_conv_tenant ON whatsapp_conversations(tenant_id, account_id);
CREATE INDEX IF NOT EXISTS idx_wa_conv_assigned ON whatsapp_conversations(assigned_user_id);
CREATE INDEX IF NOT EXISTS idx_wa_conv_phone ON whatsapp_conversations(phone_number);
CREATE INDEX IF NOT EXISTS idx_wa_conv_last_msg ON whatsapp_conversations(last_message_at DESC);

-- 3. WhatsApp Messages Table
CREATE TABLE IF NOT EXISTS whatsapp_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES whatsapp_conversations(id) ON DELETE CASCADE,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    account_id INTEGER REFERENCES whatsapp_accounts(id) ON DELETE SET NULL,
    meta_message_id VARCHAR(255) UNIQUE, -- Idempotency key for webhook retries
    direction VARCHAR(10) NOT NULL, -- 'inbound' or 'outbound'
    sender_type VARCHAR(20) NOT NULL DEFAULT 'agent', -- 'customer', 'agent', 'campaign', 'automation'
    sender_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    message_type VARCHAR(30) NOT NULL DEFAULT 'text', -- 'text', 'template', 'image', 'document', 'audio', 'video'
    body TEXT,
    template_name VARCHAR(100),
    media_url TEXT,
    status VARCHAR(20) DEFAULT 'sent', -- 'pending', 'sent', 'delivered', 'read', 'failed'
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wa_msgs_conv ON whatsapp_messages(conversation_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_wa_msgs_meta_id ON whatsapp_messages(meta_message_id);
