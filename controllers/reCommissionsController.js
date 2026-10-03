/**
 * reCommissionsController.js
 * Controller for Phase 2.4: Real Estate Agent / Broker Commissions
 */

const db = require('../config/db');

// @desc    Get commissions list with summary
// @route   GET /api/re-commissions
exports.getCommissions = async (req, res) => {
    const tenant_id = String(req.user.tenant_id);
    const { deal_id, contract_id, beneficiary_user_id, status } = req.query;

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
        if (beneficiary_user_id) {
            params.push(parseInt(beneficiary_user_id));
            whereClause += ` AND rc.beneficiary_user_id = $${params.length}`;
        }
        if (status) {
            params.push(status);
            whereClause += ` AND rc.status = $${params.length}`;
        }

        const result = await db.query(`
            SELECT 
                rc.*,
                d.title as deal_title,
                d.value as deal_value,
                rcon.contract_number,
                (rc.calculated_amount - rc.paid_amount) as remaining_balance
            FROM re_commissions rc
            JOIN deals d ON rc.deal_id = d.id AND d.tenant_id::text = rc.tenant_id::text
            LEFT JOIN re_contracts rcon ON rc.contract_id = rcon.id AND rcon.tenant_id::text = rc.tenant_id::text
            ${whereClause}
            ORDER BY rc.created_at DESC
        `, params);

        let totalCalculated = 0;
        let totalPaid = 0;
        let totalPending = 0;

        result.rows.forEach(item => {
            const calc = parseFloat(item.calculated_amount) || 0;
            const paid = parseFloat(item.paid_amount) || 0;
            totalCalculated += calc;
            totalPaid += paid;
            if (item.status === 'Pending' || item.status === 'Approved') {
                totalPending += (calc - paid);
            }
        });

        res.json({
            status: 'success',
            data: result.rows,
            summary: {
                total_commissions: Number(totalCalculated.toFixed(2)),
                total_paid: Number(totalPaid.toFixed(2)),
                total_pending: Number(totalPending.toFixed(2)),
                count: result.rows.length
            }
        });
    } catch (err) {
        console.error('[Get Commissions Error]:', err.message);
        res.status(500).json({ status: 'error', message: err.message });
    }
};

// @desc    Create commission record
// @route   POST /api/re-commissions
exports.createCommission = async (req, res) => {
    const tenant_id = String(req.user.tenant_id);
    const branch_id = req.branchId || req.user?.branch_id || null;
    const {
        deal_id,
        contract_id,
        beneficiary_type = 'internal_agent', // 'internal_agent', 'broker', 'agency'
        beneficiary_user_id,
        beneficiary_name,
        commission_type = 'percentage', // 'percentage', 'fixed'
        rate = 0,
        base_amount,
        calculated_amount,
        notes
    } = req.body;

    if (!deal_id) {
        return res.status(400).json({ status: 'error', message: 'deal_id is required.' });
    }

    try {
        // 1. Verify Deal
        const dealRes = await db.query(`
            SELECT id, title, value, assigned_to
            FROM deals
            WHERE id = $1 AND tenant_id::text = $2::text
        `, [parseInt(deal_id), tenant_id]);

        if (dealRes.rows.length === 0) {
            return res.status(404).json({ status: 'error', message: 'Deal not found or unauthorized.' });
        }

        const deal = dealRes.rows[0];

        // 2. Resolve Beneficiary Name
        let name = beneficiary_name;
        let userId = beneficiary_user_id ? parseInt(beneficiary_user_id) : null;

        if (!name && userId) {
            const userRes = await db.query(`SELECT name FROM users WHERE id = $1`, [userId]);
            if (userRes.rows.length > 0) name = userRes.rows[0].name;
        }

        if (!name && beneficiary_type === 'internal_agent' && deal.assigned_to) {
            userId = parseInt(deal.assigned_to);
            const userRes = await db.query(`SELECT name FROM users WHERE id = $1`, [userId]);
            if (userRes.rows.length > 0) name = userRes.rows[0].name;
        }

        if (!name) {
            return res.status(400).json({ status: 'error', message: 'beneficiary_name is required.' });
        }

        // 3. Resolve base amount & calculated amount
        const base = base_amount !== undefined && !isNaN(Number(base_amount))
            ? Number(Number(base_amount).toFixed(2))
            : Number(Number(deal.value || 0).toFixed(2));

        let computed = 0;
        const rateNum = Number(Number(rate || 0).toFixed(4));

        if (calculated_amount !== undefined && !isNaN(Number(calculated_amount))) {
            computed = Number(Number(calculated_amount).toFixed(2));
        } else if (commission_type === 'percentage') {
            computed = Number(((base * rateNum) / 100).toFixed(2));
        } else {
            computed = base;
        }

        // 4. Resolve contract_id if not given
        let finalContractId = contract_id || null;
        if (!finalContractId) {
            const contractRes = await db.query(`
                SELECT id FROM re_contracts WHERE deal_id = $1 AND tenant_id::text = $2::text
            `, [deal.id, tenant_id]);
            if (contractRes.rows.length > 0) finalContractId = contractRes.rows[0].id;
        }

        const insertRes = await db.query(`
            INSERT INTO re_commissions (
                deal_id, contract_id, beneficiary_type, beneficiary_user_id,
                beneficiary_name, commission_type, rate, base_amount,
                calculated_amount, paid_amount, status, notes, tenant_id, branch_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 0, 'Pending', $10, $11, $12)
            RETURNING *
        `, [
            deal.id,
            finalContractId,
            beneficiary_type,
            userId,
            name,
            commission_type,
            rateNum,
            base,
            computed,
            notes,
            tenant_id,
            branch_id
        ]);

        res.status(201).json({
            status: 'success',
            message: `Commission record created for ${name} (${computed} EGP).`,
            data: insertRes.rows[0]
        });
    } catch (err) {
        console.error('[Create Commission Error]:', err.message);
        res.status(500).json({ status: 'error', message: err.message });
    }
};

// @desc    Update commission status (Approve, Cancel)
// @route   PATCH /api/re-commissions/:id/status
exports.updateCommissionStatus = async (req, res) => {
    const tenant_id = String(req.user.tenant_id);
    const { id } = req.params;
    const { status } = req.body;

    const allowed = ['Pending', 'Approved', 'Cancelled'];
    if (!status || !allowed.includes(status)) {
        return res.status(400).json({ status: 'error', message: `Invalid status. Allowed: ${allowed.join(', ')}` });
    }

    try {
        const commRes = await db.query(`
            SELECT id, status, paid_amount FROM re_commissions
            WHERE id::text = $1::text AND tenant_id::text = $2::text
        `, [id, tenant_id]);

        if (commRes.rows.length === 0) {
            return res.status(404).json({ status: 'error', message: 'Commission not found or unauthorized.' });
        }

        const comm = commRes.rows[0];

        if (comm.status === 'Paid') {
            return res.status(400).json({ status: 'error', message: 'Cannot modify a fully paid commission.' });
        }
        if (comm.status === 'Cancelled') {
            return res.status(400).json({ status: 'error', message: 'Cannot modify a cancelled commission.' });
        }

        const approvalDate = status === 'Approved' ? new Date().toISOString().split('T')[0] : null;

        const updateRes = await db.query(`
            UPDATE re_commissions SET
                status = $1,
                approval_date = COALESCE($2, approval_date),
                updated_at = NOW()
            WHERE id = $3 AND tenant_id::text = $4::text
            RETURNING *
        `, [status, approvalDate, comm.id, tenant_id]);

        res.json({
            status: 'success',
            message: `Commission status updated to ${status}.`,
            data: updateRes.rows[0]
        });
    } catch (err) {
        console.error('[Update Commission Status Error]:', err.message);
        res.status(500).json({ status: 'error', message: err.message });
    }
};

// @desc    Record payment for approved commission
// @route   POST /api/re-commissions/:id/pay
exports.payCommission = async (req, res) => {
    const tenant_id = String(req.user.tenant_id);
    const { id } = req.params;
    const { amount, payment_date, notes } = req.body;

    const payAmt = parseFloat(amount);
    if (isNaN(payAmt) || payAmt <= 0) {
        return res.status(400).json({ status: 'error', message: 'Payment amount must be greater than 0.' });
    }

    const client = await db.connect();
    try {
        await client.query('BEGIN');

        const commRes = await client.query(`
            SELECT * FROM re_commissions
            WHERE id::text = $1::text AND tenant_id::text = $2::text
            FOR UPDATE
        `, [id, tenant_id]);

        if (commRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ status: 'error', message: 'Commission not found or unauthorized.' });
        }

        const comm = commRes.rows[0];

        if (comm.status !== 'Approved' && comm.status !== 'Partially Paid') {
            await client.query('ROLLBACK');
            return res.status(400).json({
                status: 'error',
                message: `Commission must be in 'Approved' status to record payment (current: ${comm.status}).`
            });
        }

        const currentPaid = parseFloat(comm.paid_amount) || 0;
        const totalCalculated = parseFloat(comm.calculated_amount) || 0;
        const newPaidTotal = Number((currentPaid + payAmt).toFixed(2));

        if (newPaidTotal > totalCalculated + 0.01) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                status: 'error',
                message: `Payment amount (${payAmt}) exceeds unpaid balance (${(totalCalculated - currentPaid).toFixed(2)}).`
            });
        }

        const isFull = newPaidTotal >= totalCalculated;
        const newStatus = isFull ? 'Paid' : 'Partially Paid';
        const payDate = payment_date || new Date().toISOString().split('T')[0];

        const updatedRes = await client.query(`
            UPDATE re_commissions SET
                paid_amount = $1,
                status = $2,
                payment_date = $3,
                notes = COALESCE($4, notes),
                updated_at = NOW()
            WHERE id = $5 AND tenant_id::text = $6::text
            RETURNING *
        `, [newPaidTotal, newStatus, payDate, notes, comm.id, tenant_id]);

        await client.query('COMMIT');

        res.json({
            status: 'success',
            message: `Commission payment of ${payAmt} EGP recorded successfully (${newStatus}).`,
            data: updatedRes.rows[0]
        });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('[Pay Commission Error]:', err.message);
        res.status(500).json({ status: 'error', message: err.message });
    } finally {
        client.release();
    }
};

// @desc    Delete unpaid commission
// @route   DELETE /api/re-commissions/:id
exports.deleteCommission = async (req, res) => {
    const tenant_id = String(req.user.tenant_id);
    const { id } = req.params;

    try {
        const checkRes = await db.query(`
            SELECT id, paid_amount FROM re_commissions
            WHERE id::text = $1::text AND tenant_id::text = $2::text
        `, [id, tenant_id]);

        if (checkRes.rows.length === 0) {
            return res.status(404).json({ status: 'error', message: 'Commission not found or unauthorized.' });
        }

        if (parseFloat(checkRes.rows[0].paid_amount) > 0) {
            return res.status(400).json({ status: 'error', message: 'Cannot delete commission with payments recorded.' });
        }

        await db.query(`DELETE FROM re_commissions WHERE id::text = $1::text AND tenant_id::text = $2::text`, [id, tenant_id]);

        res.json({ status: 'success', message: 'Commission deleted successfully.' });
    } catch (err) {
        console.error('[Delete Commission Error]:', err.message);
        res.status(500).json({ status: 'error', message: err.message });
    }
};
