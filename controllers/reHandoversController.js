/**
 * reHandoversController.js
 * Controller for Phase 2.6: Real Estate Handover Lightweight Milestone
 */

const db = require('../config/db');
const accessScopeService = require('../services/accessScopeService');

// @desc    Get handovers
// @route   GET /api/re-handovers
exports.getHandovers = async (req, res) => {
    const tenant_id = String(req.user.tenant_id);
    const { deal_id, contract_id, unit_id, status } = req.query;

    try {
        let whereClause = `WHERE rh.tenant_id::text = $1::text`;
        const params = [tenant_id];

        if (deal_id) {
            params.push(parseInt(deal_id));
            whereClause += ` AND rh.deal_id = $${params.length}`;
        }
        if (contract_id) {
            params.push(contract_id);
            whereClause += ` AND rh.contract_id::text = $${params.length}::text`;
        }
        if (unit_id) {
            params.push(unit_id);
            whereClause += ` AND rh.unit_id::text = $${params.length}::text`;
        }
        if (status) {
            params.push(status);
            whereClause += ` AND rh.status = $${params.length}`;
        }

        // Row-level scope: same visibility as the originating deal
        const scope = await accessScopeService.buildScopePredicate({
            user: req.user, tableAlias: 'd', assigneeCol: 'assigned_to', paramIndex: params.length + 1
        });
        whereClause += ` AND (${scope.sql})`;
        params.push(...scope.params);

        const result = await db.query(`
            SELECT 
                rh.*,
                d.title as deal_title,
                d.value as deal_value,
                rcon.contract_number,
                ru.unit_number,
                ru.project_name,
                c.name as customer_name
            FROM re_handovers rh
            JOIN deals d ON rh.deal_id = d.id AND d.tenant_id::text = rh.tenant_id::text
            LEFT JOIN re_contracts rcon ON rh.contract_id = rcon.id AND rcon.tenant_id::text = rh.tenant_id::text
            LEFT JOIN re_units ru ON rh.unit_id::text = ru.id::text AND ru.tenant_id::text = rh.tenant_id::text
            LEFT JOIN customers c ON rh.customer_id = c.id
            ${whereClause}
            ORDER BY rh.created_at DESC
        `, params);

        res.json({
            status: 'success',
            data: result.rows
        });
    } catch (err) {
        console.error('[Get Handovers Error]:', err.message);
        res.status(500).json({ status: 'error', message: err.message });
    }
};

// @desc    Create handover milestone for a deal
// @route   POST /api/re-handovers
exports.createHandover = async (req, res) => {
    const tenant_id = String(req.user.tenant_id);
    const branch_id = req.branchId || req.user?.branch_id || null;
    const actor = req.user?.username || req.user?.name || 'Agent';

    const {
        deal_id,
        scheduled_date,
        snagging_notes
    } = req.body;

    if (!deal_id) {
        return res.status(400).json({ status: 'error', message: 'deal_id is required.' });
    }

    try {
        // 1. Verify Deal
        const dealRes = await db.query(`
            SELECT id, title, client_id, unit_id
            FROM deals
            WHERE id = $1 AND tenant_id::text = $2::text
        `, [parseInt(deal_id), tenant_id]);

        if (dealRes.rows.length === 0) {
            return res.status(404).json({ status: 'error', message: 'Deal not found or unauthorized.' });
        }

        const deal = dealRes.rows[0];
        if (!deal.unit_id) {
            return res.status(400).json({ status: 'error', message: 'Cannot create handover for a deal without a linked unit.' });
        }

        // 2. Prevent duplicate handover
        const existingHandover = await db.query(`
            SELECT id FROM re_handovers WHERE deal_id = $1 AND tenant_id::text = $2::text
        `, [deal.id, tenant_id]);

        if (existingHandover.rows.length > 0) {
            return res.status(409).json({ status: 'error', message: 'A handover record already exists for this deal.' });
        }

        // 3. Resolve contract if exists
        const contractRes = await db.query(`
            SELECT id FROM re_contracts WHERE deal_id = $1 AND tenant_id::text = $2::text
        `, [deal.id, tenant_id]);
        const contractId = contractRes.rows.length > 0 ? contractRes.rows[0].id : null;

        const insertRes = await db.query(`
            INSERT INTO re_handovers (
                deal_id, contract_id, unit_id, customer_id,
                scheduled_date, snagging_notes, status, handled_by,
                tenant_id, branch_id
            ) VALUES ($1, $2, $3, $4, $5, $6, 'Scheduled', $7, $8, $9)
            RETURNING *
        `, [
            deal.id,
            contractId,
            deal.unit_id,
            deal.client_id || null,
            scheduled_date || null,
            snagging_notes || null,
            actor,
            tenant_id,
            branch_id
        ]);

        res.status(201).json({
            status: 'success',
            message: 'Handover milestone scheduled successfully.',
            data: insertRes.rows[0]
        });
    } catch (err) {
        console.error('[Create Handover Error]:', err.message);
        res.status(500).json({ status: 'error', message: err.message });
    }
};

// @desc    Update handover milestone status
// @route   PATCH /api/re-handovers/:id/status
exports.updateHandoverStatus = async (req, res) => {
    const tenant_id = String(req.user.tenant_id);
    const { id } = req.params;
    const {
        status,
        actual_handover_date,
        snagging_notes,
        keys_handed_over,
        clearance_certificate
    } = req.body;

    const allowed = ['Scheduled', 'Inspection', 'Ready for Delivery', 'Handed Over', 'Postponed'];
    if (!status || !allowed.includes(status)) {
        return res.status(400).json({ status: 'error', message: `Invalid status. Allowed: ${allowed.join(', ')}` });
    }

    const client = await db.connect();
    try {
        await client.query('BEGIN');

        const hoRes = await client.query(`
            SELECT * FROM re_handovers
            WHERE id::text = $1::text AND tenant_id::text = $2::text
            FOR UPDATE
        `, [id, tenant_id]);

        if (hoRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ status: 'error', message: 'Handover record not found or unauthorized.' });
        }

        const ho = hoRes.rows[0];

        const isDelivered = status === 'Handed Over';
        const actualDate = isDelivered 
            ? (actual_handover_date || new Date().toISOString().split('T')[0]) 
            : ho.actual_handover_date;

        const keysFlag = isDelivered ? true : (keys_handed_over !== undefined ? Boolean(keys_handed_over) : ho.keys_handed_over);
        const certFlag = isDelivered ? true : (clearance_certificate !== undefined ? Boolean(clearance_certificate) : ho.clearance_certificate);

        const updateRes = await client.query(`
            UPDATE re_handovers SET
                status = $1,
                actual_handover_date = $2,
                keys_handed_over = $3,
                clearance_certificate = $4,
                snagging_notes = COALESCE($5, snagging_notes),
                updated_at = NOW()
            WHERE id = $6 AND tenant_id::text = $7::text
            RETURNING *
        `, [status, actualDate, keysFlag, certFlag, snagging_notes, ho.id, tenant_id]);

        // If handed over, finalize unit status as 'Sold' and advance contract to 'Completed'
        if (isDelivered) {
            await client.query(`
                UPDATE re_units SET status = 'Sold', updated_at = NOW()
                WHERE id::text = $1::text AND tenant_id::text = $2::text
            `, [ho.unit_id, tenant_id]);

            if (ho.contract_id) {
                await client.query(`
                    UPDATE re_contracts SET status = 'Completed', updated_at = NOW()
                    WHERE id = $1 AND tenant_id::text = $2::text
                `, [ho.contract_id, tenant_id]);
            }
        }

        await client.query('COMMIT');

        res.json({
            status: 'success',
            message: `Handover status updated to ${status}.`,
            data: updateRes.rows[0]
        });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('[Update Handover Status Error]:', err.message);
        res.status(500).json({ status: 'error', message: err.message });
    } finally {
        client.release();
    }
};

// @desc    Delete scheduled handover
// @route   DELETE /api/re-handovers/:id
exports.deleteHandover = async (req, res) => {
    const tenant_id = String(req.user.tenant_id);
    const { id } = req.params;

    try {
        const hoRes = await db.query(`
            SELECT id, status FROM re_handovers
            WHERE id::text = $1::text AND tenant_id::text = $2::text
        `, [id, tenant_id]);

        if (hoRes.rows.length === 0) {
            return res.status(404).json({ status: 'error', message: 'Handover not found or unauthorized.' });
        }

        if (hoRes.rows[0].status === 'Handed Over') {
            return res.status(400).json({ status: 'error', message: 'Cannot delete a finalized handover.' });
        }

        await db.query(`DELETE FROM re_handovers WHERE id::text = $1::text AND tenant_id::text = $2::text`, [id, tenant_id]);

        res.json({ status: 'success', message: 'Handover deleted successfully.' });
    } catch (err) {
        console.error('[Delete Handover Error]:', err.message);
        res.status(500).json({ status: 'error', message: err.message });
    }
};
