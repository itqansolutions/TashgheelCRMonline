-- Migration: Create registration_requests table
-- Safe to run multiple times (IF NOT EXISTS)

CREATE TABLE IF NOT EXISTS registration_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    company_name  VARCHAR(255) NOT NULL,
    contact_name  VARCHAR(255) NOT NULL,
    email         VARCHAR(255) NOT NULL,
    phone         VARCHAR(50),

    -- Password stored hashed using bcrypt (same mechanism as users table)
    password_hash VARCHAR(255) NOT NULL,

    template_name VARCHAR(100) DEFAULT ''general'',

    status        VARCHAR(20)  NOT NULL DEFAULT ''pending''
                  CHECK (status IN (''pending'',''approved'',''rejected'')),

    -- Modules assigned by Super Admin on approval (JSONB, same structure as plans.modules)
    modules       JSONB,

    -- Plan label assigned by Super Admin on approval
    plan          VARCHAR(50),

    notes         TEXT,

    -- FK to users(id) - the Super Admin who approved/rejected
    approved_by   INTEGER,

    created_at    TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    approved_at   TIMESTAMP WITH TIME ZONE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_reg_requests_status     ON registration_requests (status);
CREATE INDEX IF NOT EXISTS idx_reg_requests_email      ON registration_requests (email);
CREATE INDEX IF NOT EXISTS idx_reg_requests_created_at ON registration_requests (created_at DESC);

-- Prevent multiple pending requests for the same email.
-- A partial unique index only covers rows where status = ''pending''.
-- Previously rejected requests can re-apply (rejected rows are not covered).
CREATE UNIQUE INDEX IF NOT EXISTS idx_reg_requests_pending_email
    ON registration_requests (email)
    WHERE status = ''pending'';
