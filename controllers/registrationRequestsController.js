const db = require('../config/db');
const bcrypt = require('bcrypt');
const { provisionTenant } = require('../services/provisioningService');

const VALID_MODULES = ['crm', 'finance', 'hr', 'inventory', 'real_estate', 'automation'];
const VALID_PLANS   = ['basic', 'pro', 'enterprise'];

// ── GET all registration requests (Super Admin only) ─────────────
exports.getAll = async (req, res) => {
    const { status } = req.query;
    try {
        let where = '';
        const params = [];
        if (status && ['pending', 'approved', 'rejected'].includes(status)) {
            params.push(status);
            where = `WHERE rr.status = $${params.length}`;
        }

        const result = await db.query(`
            SELECT
                rr.id,
                rr.company_name,
                rr.contact_name,
                rr.email,
                rr.phone,
                rr.template_name,
                rr.status,
                rr.plan,
                rr.modules,
                rr.notes,
                rr.created_at,
                rr.approved_at,
                rr.approved_by,
                u.name AS approved_by_name
            FROM registration_requests rr
            LEFT JOIN users u ON rr.approved_by = u.id
            ${where}
            ORDER BY
                CASE rr.status WHEN 'pending' THEN 0 ELSE 1 END,
                rr.created_at DESC
        `, params);

        // NOTE: password_hash is intentionally excluded from SELECT
        res.json({ status: 'success', data: result.rows });
    } catch (err) {
        console.error('[RegistrationRequests.getAll]', err.message);
        res.status(500).json({ status: 'error', message: err.message });
    }
};

// ── APPROVE a registration request ───────────────────────────────
exports.approve = async (req, res) => {
    const { id } = req.params;
    const { modules: selectedModules, plan, notes } = req.body;
    const reviewer_id = req.user.id;

    // Validate plan
    if (!plan || !VALID_PLANS.includes(plan)) {
        return res.status(400).json({
            status: 'error',
            message: `Invalid plan. Must be one of: ${VALID_PLANS.join(', ')}.`
        });
    }

    // Validate modules — must be an object with at least one truthy key
    if (!selectedModules || typeof selectedModules !== 'object') {
        return res.status(400).json({ status: 'error', message: 'modules must be an object.' });
    }
    const hasAtLeastOne = Object.values(selectedModules).some(Boolean);
    if (!hasAtLeastOne) {
        return res.status(400).json({ status: 'error', message: 'At least one module must be enabled.' });
    }

    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Lock the row — prevents double approval
        const reqRes = await client.query(
            `SELECT * FROM registration_requests WHERE id = $1 FOR UPDATE`,
            [id]
        );
        if (reqRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ status: 'error', message: 'Registration request not found.' });
        }
        const regReq = reqRes.rows[0];

        // 2. Idempotency check
        if (regReq.status !== 'pending') {
            await client.query('ROLLBACK');
            return res.status(409).json({
                status: 'error',
                message: `Registration request has already been processed (status: ${regReq.status}).`
            });
        }

        // 3. Provision tenant + user using the shared provisioning service
        const { user, subscription } = await provisionTenant({
            name:          regReq.contact_name,
            email:         regReq.email,
            passwordHash:  regReq.password_hash, // Already bcrypt-hashed, reused directly
            companyName:   regReq.company_name,
            phone:         regReq.phone,
            templateName:  regReq.template_name,
            selectedPlan:  plan,
            moduleOverride: selectedModules,
            req:           null
        });

        // 4. Mark request as approved
        await client.query(
            `UPDATE registration_requests
             SET status = 'approved',
                 approved_by = $1,
                 approved_at = NOW(),
                 modules = $2,
                 plan = $3,
                 notes = COALESCE($4, notes)
             WHERE id = $5`,
            [reviewer_id, JSON.stringify(selectedModules), plan, notes || null, id]
        );

        await client.query('COMMIT');

        res.json({
            status: 'success',
            message: `Workspace for ${regReq.company_name} created successfully.`,
            data: { tenant_user_id: user.id, tenant_id: user.tenant_id }
        });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('[RegistrationRequests.approve]', err.message);
        res.status(500).json({ status: 'error', message: 'Approval failed. No changes were made.' });
    } finally {
        client.release();
    }
};

// ── REJECT a registration request ────────────────────────────────
exports.reject = async (req, res) => {
    const { id } = req.params;
    const { notes } = req.body;
    const reviewer_id = req.user.id;

    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Lock and verify
        const reqRes = await client.query(
            `SELECT * FROM registration_requests WHERE id = $1 FOR UPDATE`,
            [id]
        );
        if (reqRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ status: 'error', message: 'Registration request not found.' });
        }
        const regReq = reqRes.rows[0];

        if (regReq.status !== 'pending') {
            await client.query('ROLLBACK');
            return res.status(409).json({
                status: 'error',
                message: `Registration request has already been processed (status: ${regReq.status}).`
            });
        }

        // 2. Mark as rejected — no tenant or user created
        await client.query(
            `UPDATE registration_requests
             SET status = 'rejected',
                 approved_by = $1,
                 approved_at = NOW(),
                 notes = $2
             WHERE id = $3`,
            [reviewer_id, notes || null, id]
        );

        await client.query('COMMIT');

        res.json({ status: 'success', message: 'Registration request rejected.' });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('[RegistrationRequests.reject]', err.message);
        res.status(500).json({ status: 'error', message: 'Rejection failed.' });
    } finally {
        client.release();
    }
};
