-- Migration 024: Sales Teams Management & Employee-Based Organization Layer (Batch C)
-- Architecture: Sales teams as an organizational layer over existing users/employees
-- Enforces:
-- 1. Tenant-isolated sales_teams with branch, department, supervising manager, and operational leader references
-- 2. sales_team_members linking existing employees without creating duplicate user accounts
-- 3. Lead-receiving toggles (is_active) and daily lead quotas per member
-- 4. Unique constraints preventing duplicate memberships per team
-- 5. Safe cascade and deletion protections (no deleting users or deals on team changes)

BEGIN;

-- 1. Sales Teams Table
CREATE TABLE IF NOT EXISTS sales_teams (
    id SERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id UUID NULL REFERENCES branches(id) ON DELETE SET NULL,
    department_id INTEGER NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    manager_id INTEGER NULL REFERENCES users(id) ON DELETE SET NULL, -- Supervising Manager (e.g. Dept/Branch Head)
    leader_id INTEGER NULL REFERENCES users(id) ON DELETE SET NULL,  -- Operational Team Leader (قائد الفريق التشغيلي)
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    distribution_method VARCHAR(50) NOT NULL DEFAULT 'least_loaded', -- 'least_loaded', 'round_robin', 'manual'
    max_active_leads_per_rep INTEGER NOT NULL DEFAULT 20,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uk_sales_teams_tenant_name UNIQUE (tenant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_sales_teams_tenant ON sales_teams(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sales_teams_dept ON sales_teams(tenant_id, department_id);
CREATE INDEX IF NOT EXISTS idx_sales_teams_branch ON sales_teams(tenant_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_sales_teams_manager ON sales_teams(tenant_id, manager_id);
CREATE INDEX IF NOT EXISTS idx_sales_teams_leader ON sales_teams(tenant_id, leader_id);

-- 2. Sales Team Members Table
CREATE TABLE IF NOT EXISTS sales_team_members (
    id SERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    team_id INTEGER NOT NULL REFERENCES sales_teams(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE, -- Active for receiving incoming leads
    daily_lead_quota INTEGER NOT NULL DEFAULT 5,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uk_sales_team_member UNIQUE (team_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_sales_team_members_lookup ON sales_team_members(tenant_id, team_id, is_active);
CREATE INDEX IF NOT EXISTS idx_sales_team_user_lookup ON sales_team_members(tenant_id, user_id);

COMMIT;
