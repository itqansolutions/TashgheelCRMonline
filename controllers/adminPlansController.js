const db = require('../config/db');

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
        const result = await db.query(`
            INSERT INTO subscriptions (tenant_id, plan_id, status, expires_at, trial_ends_at)
            VALUES ($1, $2, $3, $4, CASE WHEN $3 = 'trial' THEN COALESCE($4, NOW() + INTERVAL '14 days') ELSE NULL END)
            ON CONFLICT (tenant_id)
            DO UPDATE SET plan_id = $2, status = $3, expires_at = $4, updated_at = NOW()
            RETURNING *
        `, [tenant_id, plan_id, effectiveStatus, expires_at || null]);

        // Keep tenants table synchronized with subscription status & plan name
        const planRes = await db.query(`SELECT name FROM plans WHERE id = $1`, [plan_id]);
        const planName = planRes.rows[0]?.name || 'basic';
        const mappedTenantStatus = effectiveStatus === 'suspended' ? 'suspended' : 'active';
        await db.query(
            `UPDATE tenants SET plan = $1, status = $2, subscription_end = $3 WHERE id::text = $4::text`,
            [planName, mappedTenantStatus, expires_at || null, tenant_id]
        );

        res.json({ status: 'success', data: result.rows[0], message: 'Plan assigned successfully.' });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
};

// ── GET tenant override ─────────────────────────────────────────
exports.getTenantOverride = async (req, res) => {
    const { tenant_id } = req.params;
    try {
        const result = await db.query(`SELECT * FROM tenant_overrides WHERE tenant_id::text = $1::text`, [tenant_id]);
        res.json({ status: 'success', data: result.rows[0] || null });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
};

// ── SET per-tenant override (module/limit overrides) ───────────
exports.setTenantOverride = async (req, res) => {
    const { tenant_id } = req.params;
    const { modules, limits, notes } = req.body;
    try {
        const result = await db.query(`
            INSERT INTO tenant_overrides (tenant_id, modules, limits, notes)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (tenant_id)
            DO UPDATE SET
                modules = COALESCE($2, tenant_overrides.modules),
                limits = COALESCE($3, tenant_overrides.limits),
                notes = COALESCE($4, tenant_overrides.notes),
                updated_at = NOW()
            RETURNING *
        `, [
            tenant_id,
            modules !== undefined ? (modules ? JSON.stringify(modules) : null) : null,
            limits !== undefined ? (limits ? JSON.stringify(limits) : null) : null,
            notes !== undefined ? notes : null
        ]);
        res.json({ status: 'success', data: result.rows[0], message: 'Tenant override saved.' });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
};

// ── REMOVE tenant override ──────────────────────────────────────
exports.removeTenantOverride = async (req, res) => {
    const { tenant_id } = req.params;
    try {
        await db.query(`DELETE FROM tenant_overrides WHERE tenant_id::text = $1::text`, [tenant_id]);
        res.json({ status: 'success', message: 'Override removed. Tenant reverts to plan defaults.' });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
};
