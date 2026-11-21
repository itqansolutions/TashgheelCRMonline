const db = require('../config/db');
const tenantEntitlementService = require('../services/tenantEntitlementService');

/**
 * Admin Pricing Engine — Full Plans CRUD
 * Route: /api/admin/plans
 * Access: Super Admin only
 */

// ── GET all plans (including disabled) ─────────────────────────
exports.getAdminPlans = async (req, res) => {
    try {
        const result = await db.query(`
            SELECT p.*, 
                (SELECT COUNT(*) FROM subscriptions s WHERE s.plan_id = p.id) as tenant_count
            FROM plans p
            ORDER BY p.sort_order ASC, p.created_at ASC
        `);
        res.json({ status: 'success', data: result.rows });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
};

// ── CREATE new plan ─────────────────────────────────────────────
exports.createPlan = async (req, res) => {
    const { name, display_name, price_monthly, max_users, max_branches, modules, sort_order } = req.body;
    try {
        if (!name || !display_name) {
            return res.status(400).json({ status: 'error', message: 'name and display_name are required.' });
        }
        const result = await db.query(`
            INSERT INTO plans (name, display_name, price_monthly, max_users, max_branches, modules, sort_order, is_active)
            VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE)
            RETURNING *
        `, [
            name.toLowerCase().replace(/\s+/g, '_'),
            display_name,
            price_monthly || 0,
            max_users || 10,
            max_branches || 1,
            JSON.stringify(modules || { crm: true, finance: true, hr: false, inventory: false, automation: false, reports: true }),
            sort_order || 99
        ]);
        res.status(201).json({ status: 'success', data: result.rows[0] });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
};

// ── UPDATE plan ─────────────────────────────────────────────────
exports.updatePlan = async (req, res) => {
    const { id } = req.params;
    const { display_name, price_monthly, max_users, max_branches, modules, sort_order, is_active } = req.body;
    try {
        const result = await db.query(`
            UPDATE plans SET
                display_name   = COALESCE($1, display_name),
                price_monthly  = COALESCE($2, price_monthly),
                max_users      = COALESCE($3, max_users),
                max_branches   = COALESCE($4, max_branches),
                modules        = COALESCE($5, modules),
                sort_order     = COALESCE($6, sort_order),
                is_active      = COALESCE($7, is_active)
            WHERE id = $8 RETURNING *
        `, [
            display_name, price_monthly,
            max_users, max_branches,
            modules ? JSON.stringify(modules) : null,
            sort_order, is_active, id
        ]);
        if (result.rows.length === 0) return res.status(404).json({ status: 'error', message: 'Plan not found.' });
        res.json({ status: 'success', data: result.rows[0] });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
};

// ── CLONE plan ──────────────────────────────────────────────────
exports.clonePlan = async (req, res) => {
    const { id } = req.params;
    try {
        const original = await db.query(`SELECT * FROM plans WHERE id = $1`, [id]);
        if (original.rows.length === 0) return res.status(404).json({ status: 'error', message: 'Plan not found.' });

        const p = original.rows[0];
        const result = await db.query(`
            INSERT INTO plans (name, display_name, price_monthly, max_users, max_branches, modules, sort_order, is_active)
            VALUES ($1, $2, $3, $4, $5, $6, $7, FALSE)
            RETURNING *
        `, [
            `${p.name}_copy_${Date.now().toString().slice(-4)}`,
            `${p.display_name} (Copy)`,
            p.price_monthly, p.max_users, p.max_branches,
            p.modules, (p.sort_order || 99) + 1
        ]);
        res.status(201).json({ status: 'success', data: result.rows[0], message: 'Plan cloned (saved as draft).' });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
};

// ── DELETE plan (only if no active subscriptions) ───────────────
exports.deletePlan = async (req, res) => {
    const { id } = req.params;
    try {
        const inUse = await db.query(`SELECT COUNT(*) FROM subscriptions WHERE plan_id = $1`, [id]);
        if (parseInt(inUse.rows[0].count) > 0) {
            return res.status(400).json({ status: 'error', message: 'Cannot delete a plan that has active subscribers. Disable it instead.' });
        }
        await db.query(`DELETE FROM plans WHERE id = $1`, [id]);
        res.json({ status: 'success', message: 'Plan deleted.' });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
};

// ── GET all tenants with subscription info ──────────────────────
exports.getAdminTenants = async (req, res) => {
    try {
        const result = await db.query(`
            SELECT 
                t.id, t.name, t.slug, t.status, t.created_at, t.template_name,
                t.admin_name, t.admin_email, t.admin_phone,
                s.status as sub_status, s.trial_ends_at, s.expires_at,
                p.id as plan_id, p.name as plan_name, p.display_name,
                p.price_monthly,
                COALESCE((o.limits->>'max_users')::int, p.max_users, 10) as max_users,
                COALESCE((o.limits->>'max_branches')::int, p.max_branches, 1) as max_branches,
                p.modules as plan_modules,
                o.modules as override_modules,
                o.limits as override_limits,
                (SELECT COUNT(*)::int FROM users u WHERE u.tenant_id::text = t.id::text AND COALESCE(u.is_working, true) = true) as user_count,
                (SELECT COUNT(*)::int FROM users u WHERE u.tenant_id::text = t.id::text) as total_user_count,
                (SELECT COUNT(*)::int FROM branches b WHERE b.tenant_id::text = t.id::text AND COALESCE(b.is_active, true) = true) as branch_count,
                o.updated_at as override_updated_at,
                -- Check for override
                CASE WHEN o.id IS NOT NULL THEN TRUE ELSE FALSE END as has_override
            FROM tenants t
            LEFT JOIN subscriptions s ON s.tenant_id::text = t.id::text
            LEFT JOIN plans p ON s.plan_id = p.id
            LEFT JOIN tenant_overrides o ON o.tenant_id::text = t.id::text
            ORDER BY t.created_at DESC
        `);

        const rows = result.rows.map(row => {
            const rawPlanMods = typeof row.plan_modules === 'string'
                ? JSON.parse(row.plan_modules)
                : (row.plan_modules || { crm: true, finance: true, hr: false, inventory: false, automation: false, reports: true });
            const planMods = { reports: true, ...rawPlanMods };
            const ovMods = row.override_modules
                ? (typeof row.override_modules === 'string' ? JSON.parse(row.override_modules) : row.override_modules)
                : {};
            return {
                ...row,
                modules: { ...planMods, ...ovMods }
            };
        });

        res.json({ status: 'success', data: rows });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
};

// ── ASSIGN plan to tenant ───────────────────────────────────────
exports.assignPlanToTenant = async (req, res) => {
    const { tenant_id } = req.params;
    const { plan_id, status, expires_at } = req.body;
    try {
        const effectiveStatus = status || 'active';
        const effectiveExpiresAt = (expires_at && typeof expires_at === 'string' && expires_at.trim() !== '')
            ? expires_at
            : (expires_at instanceof Date ? expires_at : null);

        const result = await db.query(`
            INSERT INTO subscriptions (tenant_id, plan_id, status, expires_at, trial_ends_at)
            VALUES (
                $1, 
                $2, 
                $3::varchar, 
                $4::timestamptz, 
                CASE WHEN $3::varchar = 'trial' THEN COALESCE($4::timestamptz, NOW() + INTERVAL '14 days') ELSE NULL END
            )
            ON CONFLICT (tenant_id)
            DO UPDATE SET 
                plan_id = $2, 
                status = $3::varchar, 
                expires_at = $4::timestamptz,
                trial_ends_at = CASE WHEN $3::varchar = 'trial' THEN COALESCE($4::timestamptz, subscriptions.trial_ends_at, NOW() + INTERVAL '14 days') ELSE subscriptions.trial_ends_at END,
                updated_at = NOW()
            RETURNING *
        `, [tenant_id, plan_id, effectiveStatus, effectiveExpiresAt]);

        // Keep tenants table synchronized with subscription status & plan name
        const planRes = await db.query(`SELECT name FROM plans WHERE id = $1`, [plan_id]);
        const planName = planRes.rows[0]?.name || 'basic';
        const mappedTenantStatus = effectiveStatus === 'suspended' ? 'suspended' : 'active';
        await db.query(
            `UPDATE tenants SET plan = $1, status = $2, subscription_end = $3::timestamptz WHERE id::text = $4::text`,
            [planName, mappedTenantStatus, effectiveExpiresAt, tenant_id]
        );

        res.json({ status: 'success', data: result.rows[0], message: 'Plan assigned successfully.' });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
};

// ── GET tenant override (Entitlement Profile) ───────────────────
exports.getTenantOverride = async (req, res) => {
    const { tenant_id } = req.params;
    try {
        const entitlements = await tenantEntitlementService.getTenantEntitlements(tenant_id, db);
        res.json({
            status: 'success',
            data: {
                tenant_id,
                modules: entitlements.modules,
                limits: entitlements.limits,
                notes: entitlements.notes,
                isConfigured: entitlements.isConfigured,
                updated_at: entitlements.updated_at
            }
        });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
};

// ── SET per-tenant override (module/limit entitlements) ─────────
exports.setTenantOverride = async (req, res) => {
    const { tenant_id } = req.params;
    const { modules, limits, notes, reason } = req.body;
    try {
        const auditReason = reason && typeof reason === 'string' && reason.trim().length >= 5
            ? reason.trim()
            : (notes && notes.trim().length >= 5 ? notes.trim() : 'Updated via ITQAN Platform HUD');

        const updated = await tenantEntitlementService.setTenantEntitlements({
            tenant_id,
            modules,
            limits,
            notes,
            reason: auditReason,
            admin_user_id: req.user?.id,
            ip_address: req.ip
        }, db);

        res.json({
            status: 'success',
            message: 'Tenant access profile saved successfully.',
            data: updated
        });
    } catch (err) {
        res.status(400).json({ status: 'error', message: err.message });
    }
};

// ── REMOVE tenant override ──────────────────────────────────────
exports.removeTenantOverride = async (req, res) => {
    const { tenant_id } = req.params;
    try {
        await db.query(`DELETE FROM tenant_overrides WHERE tenant_id::text = $1::text`, [tenant_id]);
        tenantEntitlementService.invalidateTenantEntitlements(tenant_id);
        res.json({ status: 'success', message: 'Tenant access profile removed.' });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
};

// ── GET tenant access audit log ─────────────────────────────────
exports.getTenantAccessAuditLog = async (req, res) => {
    const { tenant_id } = req.params;
    try {
        const result = await db.query(`
            SELECT 
                a.id, a.tenant_id, a.changed_by, a.previous_modules, a.new_modules,
                a.previous_limits, a.new_limits, a.reason, a.ip_address, a.created_at,
                u.name as admin_name, u.email as admin_email
            FROM tenant_access_audit_logs a
            LEFT JOIN users u ON a.changed_by = u.id
            WHERE a.tenant_id::text = $1::text
            ORDER BY a.created_at DESC
            LIMIT 50
        `, [tenant_id]);
        res.json({ status: 'success', data: result.rows });
    } catch (err) {
        // Graceful fallback if audit table not yet migrated
        res.json({ status: 'success', data: [], notice: 'Audit table pending migration' });
    }
};
