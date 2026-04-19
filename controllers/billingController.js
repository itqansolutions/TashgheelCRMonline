const db = require('../config/db');
const { logAction, ACTIONS } = require('../services/loggerService');

/**
 * 💳 Billing Controller — Mock Billing Simulation Engine
 * 
 * Flow:
 *  Tenant requests upgrade → pending
 *    → Admin approves → subscription updated to new plan + 'active'
 *    → Admin rejects → request rejected, tenant notified
 */

// ── GET current billing status (for /billing page) ─────────────
exports.getMyBilling = async (req, res) => {
    const tenant_id = req.user.tenant_id;
    try {
        // Subscription + plan details
        const subRes = await db.query(`
            SELECT 
                s.*, s.status as sub_status,
                p.id as plan_id, p.name as plan_name, p.display_name,
                p.price_monthly, p.max_users, p.max_branches, p.modules,
                CASE 
                    WHEN s.status = 'trial'
                    THEN GREATEST(0, CEIL(EXTRACT(EPOCH FROM (s.trial_ends_at - NOW())) / 86400))
                    ELSE NULL 
                END as trial_days_left
            FROM subscriptions s
            JOIN plans p ON s.plan_id = p.id
            WHERE s.tenant_id::text = $1::text
        `, [tenant_id]);

        // Latest upgrade request
        const reqRes = await db.query(`
            SELECT ur.*, 
                cp.display_name as current_plan_name,
                rp.display_name as requested_plan_name,
                rp.price_monthly as requested_price
            FROM upgrade_requests ur
            JOIN plans cp ON ur.current_plan_id = cp.id
            JOIN plans rp ON ur.requested_plan_id = rp.id
            WHERE ur.tenant_id::text = $1::text
            ORDER BY ur.created_at DESC LIMIT 1
        `, [tenant_id]);

        // All available plans for the upgrade picker
        const plansRes = await db.query(`SELECT id, name, display_name, price_monthly, modules FROM plans WHERE is_active = TRUE ORDER BY sort_order`);

        res.json({
            status: 'success',
            data: {
                subscription: subRes.rows[0] || null,
                latest_request: reqRes.rows[0] || null,
                available_plans: plansRes.rows
            }
        });
    } catch (err) {
        console.error('[getMyBilling]', err.message);
        res.status(500).json({ status: 'error', message: 'Failed to load billing data.' });
    }
};

// ── REQUEST an upgrade ──────────────────────────────────────────
exports.requestUpgrade = async (req, res) => {
    const tenant_id = req.user.tenant_id;
    const { requested_plan_id } = req.body;

    try {
        if (!requested_plan_id) {
            return res.status(400).json({ status: 'error', message: 'requested_plan_id is required.' });
        }

        // Get current subscription
        const subRes = await db.query(`SELECT * FROM subscriptions WHERE tenant_id::text = $1::text`, [tenant_id]);
        if (subRes.rows.length === 0) {
            return res.status(400).json({ status: 'error', message: 'No active subscription found.' });
        }
        const sub = subRes.rows[0];

        // Block duplicate pending requests
        const existingReq = await db.query(`
            SELECT id FROM upgrade_requests 
            WHERE tenant_id::text = $1::text AND status = 'pending'
        `, [tenant_id]);
        if (existingReq.rows.length > 0) {
            return res.status(409).json({ status: 'error', message: 'You already have a pending upgrade request. Please wait for admin review.' });
        }

        // Validate target plan is different
        if (parseInt(requested_plan_id) === sub.plan_id) {
            return res.status(400).json({ status: 'error', message: 'You are already on this plan.' });
        }

        // Create request
        const result = await db.query(`
            INSERT INTO upgrade_requests (tenant_id, current_plan_id, requested_plan_id, status)
            VALUES ($1, $2, $3, 'pending')
            RETURNING *
        `, [tenant_id, sub.plan_id, requested_plan_id]);

        // Mark subscription as pending_upgrade
        await db.query(`UPDATE subscriptions SET status = 'pending_upgrade' WHERE tenant_id::text = $1::text`, [tenant_id]);

        // Notify admin (optional - add to notifications for system tenant admin)
        try {
            const planRes = await db.query(`SELECT display_name FROM plans WHERE id = $1`, [requested_plan_id]);
            const planName = planRes.rows[0]?.display_name || '';
            const tenantRes = await db.query(`SELECT name FROM tenants WHERE id = $1`, [tenant_id]);
            const tenantName = tenantRes.rows[0]?.name || '';

            await db.query(`
                INSERT INTO notifications (user_id, tenant_id, type, title, message, link)
                SELECT u.id, u.tenant_id, 'warning',
                    'Upgrade Request',
                    $1,
                    '/admin/upgrade-requests'
                FROM users u
                WHERE u.tenant_id = '00000000-0000-0000-0000-000000000000' AND u.role = 'admin'
            `, [`${tenantName} has requested an upgrade to ${planName}`]);
        } catch {} // Non-critical

        res.status(201).json({
            status: 'success',
            data: result.rows[0],
            message: 'Upgrade request submitted. Our team will contact you within 24 hours.'
        });
    } catch (err) {
        console.error('[requestUpgrade]', err.message);
        res.status(500).json({ status: 'error', message: 'Failed to submit upgrade request.' });
    }
};

// ── CANCEL a pending request ────────────────────────────────────
exports.cancelUpgradeRequest = async (req, res) => {
    const tenant_id = req.user.tenant_id;
    try {
        await db.query(`UPDATE upgrade_requests SET status = 'cancelled' WHERE tenant_id::text = $1::text AND status = 'pending'`, [tenant_id]);
        // Revert sub status
        const subRes = await db.query(`SELECT status FROM subscriptions WHERE tenant_id::text = $1::text`, [tenant_id]);
        if (subRes.rows[0]?.status === 'pending_upgrade') {
            await db.query(`UPDATE subscriptions SET status = 'trial' WHERE tenant_id::text = $1::text`, [tenant_id]);
        }
        res.json({ status: 'success', message: 'Upgrade request cancelled.' });
    } catch (err) {
        res.status(500).json({ status: 'error', message: 'Failed to cancel request.' });
    }
};

// ════════════════════════════════════════════════════════════════
// ADMIN ENDPOINTS
// ════════════════════════════════════════════════════════════════

// ── GET all upgrade requests ────────────────────────────────────
exports.getUpgradeRequests = async (req, res) => {
    try {
        const result = await db.query(`
            SELECT 
                ur.*,
                t.name as tenant_name, t.slug as tenant_slug,
                cp.display_name as current_plan,
                rp.display_name as requested_plan,
                rp.price_monthly as requested_price,
                (SELECT COUNT(*) FROM users u WHERE u.tenant_id = ur.tenant_id) as user_count
            FROM upgrade_requests ur
            JOIN tenants t ON ur.tenant_id = t.id
            JOIN plans cp ON ur.current_plan_id = cp.id
            JOIN plans rp ON ur.requested_plan_id = rp.id
            ORDER BY CASE ur.status WHEN 'pending' THEN 0 ELSE 1 END, ur.created_at DESC
        `);
        res.json({ status: 'success', data: result.rows });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
};

// ── APPROVE an upgrade request ──────────────────────────────────
exports.approveUpgradeRequest = async (req, res) => {
    const { id } = req.params;
    const reviewer_id = req.user.id;
    try {
        await db.query('BEGIN');

        const reqRes = await db.query(`SELECT * FROM upgrade_requests WHERE id = $1 AND status = 'pending'`, [id]);
        if (reqRes.rows.length === 0) {
            await db.query('ROLLBACK');
            return res.status(404).json({ status: 'error', message: 'Pending request not found.' });
        }
        const upgradeReq = reqRes.rows[0];

        // 1. Update subscription to new plan + active status
        await db.query(`
            UPDATE subscriptions 
            SET plan_id = $1, status = 'active', expires_at = NOW() + INTERVAL '30 days', updated_at = NOW()
            WHERE tenant_id::text = $2::text
        `, [upgradeReq.requested_plan_id, upgradeReq.tenant_id]);

        // 2. Update tenant.plan column
        const planRes = await db.query(`SELECT name FROM plans WHERE id = $1`, [upgradeReq.requested_plan_id]);
        await db.query(`UPDATE tenants SET plan = $1 WHERE id = $2`, [planRes.rows[0]?.name, upgradeReq.tenant_id]);

        // 3. Mark request as approved
        await db.query(`
            UPDATE upgrade_requests 
            SET status = 'approved', reviewed_by = $1, reviewed_at = NOW()
            WHERE id = $2
        `, [reviewer_id, id]);

        // 4. Notify the tenant admin
        const planName = planRes.rows[0]?.name || '';
        await db.query(`
            INSERT INTO notifications (user_id, tenant_id, type, title, message)
            SELECT u.id, u.tenant_id, 'success',
                '🎉 Upgrade Approved!',
                $2
            FROM users u
            WHERE u.tenant_id::text = $1::text AND u.role = 'admin'
            LIMIT 1
        `, [upgradeReq.tenant_id, `Your account has been upgraded. Welcome to ${planName}!`]);

        await db.query('COMMIT');
        res.json({ status: 'success', message: 'Upgrade approved and subscription updated.' });
    } catch (err) {
        await db.query('ROLLBACK');
        console.error('[approveUpgrade]', err.message);
        res.status(500).json({ status: 'error', message: err.message });
    }
};

// ── REJECT an upgrade request ───────────────────────────────────
exports.rejectUpgradeRequest = async (req, res) => {
    const { id } = req.params;
    const { notes } = req.body;
    const reviewer_id = req.user.id;
    try {
        const reqRes = await db.query(`SELECT * FROM upgrade_requests WHERE id = $1`, [id]);
        if (reqRes.rows.length === 0) return res.status(404).json({ status: 'error', message: 'Request not found.' });

        await db.query(`
            UPDATE upgrade_requests 
            SET status = 'rejected', notes = $1, reviewed_by = $2, reviewed_at = NOW()
            WHERE id = $3
        `, [notes || null, reviewer_id, id]);

        // Revert subscription to trial (or active if they had active before)
        await db.query(`
            UPDATE subscriptions SET status = 'trial' WHERE tenant_id::text = $1::text AND status = 'pending_upgrade'
        `, [reqRes.rows[0].tenant_id]);

        // Notify tenant
        await db.query(`
            INSERT INTO notifications (user_id, tenant_id, type, title, message)
            SELECT u.id, u.tenant_id, 'error',
                'Upgrade Request Update',
                $2
            FROM users u
            WHERE u.tenant_id::text = $1::text AND u.role = 'admin' LIMIT 1
        `, [reqRes.rows[0].tenant_id, notes || 'Your upgrade request could not be processed. Please contact support.']);

        res.json({ status: 'success', message: 'Request rejected. Tenant notified.' });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
};

// ── Admin Instant Override Upgrade (no request needed) ─────────
exports.adminInstantUpgrade = async (req, res) => {
    const { tenant_id } = req.params;
    const { plan_id, months } = req.body;
    const reviewer_id = req.user.id;
    try {
        const planRes = await db.query(`SELECT name, display_name FROM plans WHERE id = $1`, [plan_id]);
        if (planRes.rows.length === 0) return res.status(404).json({ status: 'error', message: 'Plan not found.' });

        const duration = parseInt(months) || 1;
        await db.query(`
            UPDATE subscriptions 
            SET plan_id = $1, status = 'active', expires_at = NOW() + ($2 || ' months')::INTERVAL, updated_at = NOW()
            WHERE tenant_id::text = $3::text
        `, [plan_id, duration, tenant_id]);

        await db.query(`UPDATE tenants SET plan = $1 WHERE id = $2`, [planRes.rows[0].name, tenant_id]);

        // Cancel any pending requests
        await db.query(`UPDATE upgrade_requests SET status = 'approved', reviewed_by = $1, reviewed_at = NOW() WHERE tenant_id::text = $2::text AND status = 'pending'`, [reviewer_id, tenant_id]);

        // Notify tenant
        await db.query(`
            INSERT INTO notifications (user_id, tenant_id, type, title, message)
            SELECT u.id, u.tenant_id, 'success', '🎉 Account Upgraded!', $2
            FROM users u WHERE u.tenant_id::text = $1::text AND u.role = 'admin' LIMIT 1
        `, [tenant_id, `Your account has been upgraded to ${planRes.rows[0].display_name} for ${duration} month(s).`]);

        res.json({ status: 'success', message: `Tenant instantly upgraded to ${planRes.rows[0].display_name}.` });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
};
