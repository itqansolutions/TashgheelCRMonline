/**
 * reCancellationsController.js
 * Controller for Phase 2.5: Real Estate Cancellation & Refund
 */

const db = require('../config/db');

// @desc    Get cancellations
// @route   GET /api/re-cancellations
exports.getCancellations = async (req, res) => {
    const tenant_id = String(req.user.tenant_id);
    const { deal_id, contract_id, unit_id } = req.query;

    try {
        let whereClause = `WHERE rc.tenant_id::text = $1::text`;
        const params = [tenant_id];

        if (deal_id) {
            params.push(parseInt(deal_id));
            whereClause += ` AND rc.deal_id = $${params.length}`;
        }
        if (contract_id) {
            params.push(contract_id);
            whereClause += ` AND rc.contract_id::text = $${params.length}::text`;
        }
        if (unit_id) {
            params.push(unit_id);
            whereClause += ` AND rc.unit_id::text = $${params.length}::text`;
        }

        const result = await db.query(`
            SELECT 
                rc.*,
                d.title as deal_title,
                d.value as deal_value,
                rcon.contract_number,
                ru.unit_number,
                ru.project_name
            FROM re_cancellations rc
            JOIN deals d ON rc.deal_id = d.id AND d.tenant_id::text = rc.tenant_id::text
            LEFT JOIN re_contracts rcon ON rc.contract_id = rcon.id AND rcon.tenant_id::text = rc.tenant_id::text
            LEFT JOIN re_units ru ON rc.unit_id::text = ru.id::text AND ru.tenant_id::text = rc.tenant_id::text
            ${whereClause}
            ORDER BY rc.created_at DESC
        `, params);

        res.json({
            status: 'success',
            data: result.rows
        });
    } catch (err) {
        console.error('[Get Cancellations Error]:', err.message);
        res.status(500).json({ status: 'error', message: err.message });
    }
};

// @desc    Process cancellation and release unit with refund calculation
// @route   POST /api/re-cancellations
exports.processCancellation = async (req, res) => {
    const tenant_id = String(req.user.tenant_id);
    const branch_id = req.branchId || req.user?.branch_id || null;
    const actor = req.user?.username || req.user?.name || 'User';

    const {
        deal_id,
        cancellation_reason,
        deduction_amount = 0,
        unit_action = 'release' // 'release' or 'keep_reserved'
    } = req.body;

    if (!deal_id) {
        return res.status(400).json({ status: 'error', message: 'deal_id is required.' });
    }
    if (!cancellation_reason || !cancellation_reason.trim()) {
        return res.status(400).json({ status: 'error', message: 'cancellation_reason is required.' });
    }

    const client = await db.connect();
    try {
        await client.query('BEGIN');

        // 1. Lock and verify deal
        const dealRes = await client.query(`
            SELECT id, title, value, pipeline_stage, unit_id
            FROM deals
            WHERE id = $1 AND tenant_id::text = $2::text
            FOR UPDATE
        `, [parseInt(deal_id), tenant_id]);

        if (dealRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ status: 'error', message: 'Deal not found or unauthorized.' });
        }

        const deal = dealRes.rows[0];

        // 2. Prevent duplicate cancellation
        const existingCancel = await client.query(`
            SELECT id FROM re_cancellations WHERE deal_id = $1 AND tenant_id::text = $2::text
        `, [deal.id, tenant_id]);

        if (existingCancel.rows.length > 0) {
            await client.query('ROLLBACK');
            return res.status(409).json({ status: 'error', message: 'This deal has already been cancelled.' });
        }

        // 3. Find contract if exists
        const contractRes = await client.query(`
            SELECT id, contract_number, status, down_payment
            FROM re_contracts
            WHERE deal_id = $1 AND tenant_id::text = $2::text
        `, [deal.id, tenant_id]);

        const contract = contractRes.rows.length > 0 ? contractRes.rows[0] : null;

        // 4. Calculate total paid amount across installments and payments
        let totalPaid = 0;
        const instPaidRes = await client.query(`
            SELECT COALESCE(SUM(paid_amount), 0) as sum_paid
            FROM re_installments
            WHERE deal_id = $1 AND tenant_id::text = $2::text
        `, [deal.id, tenant_id]);

        totalPaid = parseFloat(instPaidRes.rows[0].sum_paid) || 0;

        if (totalPaid === 0 && contract) {
            totalPaid = parseFloat(contract.down_payment) || 0;
        }

        if (totalPaid === 0) {
            const payRes = await client.query(`
                SELECT paid_amount FROM re_payments_mvp
                WHERE deal_id::text = $1::text AND tenant_id::text = $2::text
            `, [String(deal.id), tenant_id]);
            if (payRes.rows.length > 0) {
                totalPaid = parseFloat(payRes.rows[0].paid_amount) || 0;
            }
        }

        const deduction = Math.max(0, parseFloat(deduction_amount) || 0);
        const refundable = Math.max(0, Number((totalPaid - deduction).toFixed(2)));
        const refundStatus = refundable > 0 ? 'Pending' : 'No Refund';

        // 5. Insert cancellation record
        const insertRes = await client.query(`
            INSERT INTO re_cancellations (
                deal_id, contract_id, unit_id, cancellation_reason,
                total_paid_amount, deduction_amount, refundable_amount,
                refund_status, unit_action, processed_by, tenant_id, branch_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            RETURNING *
        `, [
            deal.id,
            contract ? contract.id : null,
            deal.unit_id || null,
            cancellation_reason.trim(),
            totalPaid,
            deduction,
            refundable,
            refundStatus,
            unit_action,
            actor,
            tenant_id,
            branch_id
        ]);

        // 6. Update Deal stage to 'Lost'
        await client.query(`
            UPDATE deals SET
                pipeline_stage = 'Lost',
                updated_at = NOW()
            WHERE id = $1 AND tenant_id::text = $2::text
        `, [deal.id, tenant_id]);

        // 7. Update contract to 'Cancelled'
        if (contract) {
            await client.query(`
                UPDATE re_contracts SET
                    status = 'Cancelled',
                    updated_at = NOW()
                WHERE id = $1 AND tenant_id::text = $2::text
            `, [contract.id, tenant_id]);
        }

        // 7.5. Clawback or cancel commissions associated with this cancelled deal
        await client.query(`
            UPDATE re_commissions SET
                status = CASE WHEN paid_amount > 0 THEN 'Clawback' ELSE 'Cancelled' END,
                notes = COALESCE(notes, '') || ' [Cancelled due to deal cancellation]',
                updated_at = NOW()
            WHERE deal_id = $1 AND tenant_id::text = $2::text AND status NOT IN ('Cancelled', 'Clawback')
        `, [deal.id, tenant_id]);

        // 8. Release unit if requested
        if (deal.unit_id && unit_action === 'release') {
            await client.query(`
                UPDATE re_units SET
                    status = 'Available',
                    reservation_expires_at = NULL,
                    reservation_extended_at = NULL,
                    reservation_extended_by = NULL,
                    reservation_extension_count = 0,
                    updated_at = NOW()
                WHERE id::text = $1::text AND tenant_id::text = $2::text
            `, [String(deal.unit_id), tenant_id]);
        }

        await client.query('COMMIT');

        res.status(201).json({
            status: 'success',
            message: `Deal cancelled successfully. Unit ${unit_action === 'release' ? 'released to Available' : 'retained'}. Refundable amount: ${refundable} EGP.`,
            data: insertRes.rows[0]
        });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('[Process Cancellation Error]:', err.message);
        res.status(500).json({ status: 'error', message: err.message });
    } finally {
        client.release();
    }
};

// @desc    Update refund status (Processed)
// @route   PATCH /api/re-cancellations/:id/refund
exports.updateRefundStatus = async (req, res) => {
    const tenant_id = String(req.user.tenant_id);
    const { id } = req.params;
    const { refund_status, refund_date, notes } = req.body;

    const allowed = ['Pending', 'Processed', 'No Refund'];
    if (!refund_status || !allowed.includes(refund_status)) {
        return res.status(400).json({ status: 'error', message: `Invalid refund status. Allowed: ${allowed.join(', ')}` });
    }

    try {
        const checkRes = await db.query(`
            SELECT id FROM re_cancellations WHERE id::text = $1::text AND tenant_id::text = $2::text
        `, [id, tenant_id]);

        if (checkRes.rows.length === 0) {
            return res.status(404).json({ status: 'error', message: 'Cancellation record not found or unauthorized.' });
        }

        const dateVal = refund_status === 'Processed' ? (refund_date || new Date().toISOString().split('T')[0]) : null;

        const updateRes = await db.query(`
            UPDATE re_cancellations SET
                refund_status = $1,
                refund_date = COALESCE($2, refund_date),
                updated_at = NOW()
            WHERE id = $3 AND tenant_id::text = $4::text
            RETURNING *
        `, [refund_status, dateVal, id, tenant_id]);

        res.json({
            status: 'success',
            message: `Refund status updated to ${refund_status}.`,
            data: updateRes.rows[0]
        });
    } catch (err) {
        console.error('[Update Refund Status Error]:', err.message);
        res.status(500).json({ status: 'error', message: err.message });
    }
};
