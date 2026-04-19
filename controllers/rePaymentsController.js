const db = require('../config/db');

/**
 * Real Estate Payments MVP Controller
 * Handles financial tracking for "Won" deals (Tracking-First approach)
 */

// @desc    Get payment summary for a deal
// @route   GET /api/re-payments/deal/:dealId
exports.getPaymentByDeal = async (req, res) => {
    const { dealId } = req.params;
    const tenant_id = String(req.user.tenant_id);

    try {
        const result = await db.query(`
            SELECT *, 
                   (total_amount - paid_amount) as remaining_amount
            FROM re_payments_mvp
            WHERE deal_id::text = $1::text AND tenant_id::text = $2::text
        `, [dealId, tenant_id]);

        if (result.rows.length === 0) return res.json({ status: 'success', data: null });
        
        const payment = result.rows[0];
        
        // Dynamic status based on math
        const remaining = parseFloat(payment.remaining_amount);
        payment.is_fully_paid = remaining <= 0;
        
        res.json({ status: 'success', data: payment });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
};

// @desc    Update paid amount or next due date
// @route   PUT /api/re-payments/:id
exports.updatePayment = async (req, res) => {
    const { id } = req.params;
    const { paid_amount, down_payment, next_payment_date } = req.body;
    const tenant_id = String(req.user.tenant_id);

    try {
        const result = await db.query(`
            UPDATE re_payments_mvp SET
                paid_amount = COALESCE($1, paid_amount),
                down_payment = COALESCE($2, down_payment),
                next_payment_date = COALESCE($3, next_payment_date),
                updated_at = NOW()
            WHERE id = $4 AND tenant_id::text = $5::text
            RETURNING *, (total_amount - (COALESCE($1, paid_amount))) as remaining_amount
        `, [paid_amount, down_payment, next_payment_date, id, tenant_id]);

        if (result.rows.length === 0) return res.status(404).json({ status: 'error', message: 'Payment record not found' });
        
        const updated = result.rows[0];
        const remaining = parseFloat(updated.remaining_amount);

        // Automation Log: Notify of update
        const { logAction, ACTIONS } = require('../services/loggerService');
        logAction({ 
            userId: req.user.id,
            tenantId: tenant_id,
            action: ACTIONS.AUTOMATION, 
            entityType: 'Payment', 
            entityId: id, 
            details: { 
                paid_amount: updated.paid_amount,
                remaining_amount: remaining,
                status: remaining <= 0 ? 'Fully Paid' : 'Pending'
            } 
        });

        res.json({ status: 'success', data: updated });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
};

// @desc    Admin: Delete payment record
exports.deletePayment = async (req, res) => {
    const { id } = req.params;
    const tenant_id = String(req.user.tenant_id);
    try {
        await db.query('DELETE FROM re_payments_mvp WHERE id = $1 AND tenant_id::text = $2::text', [id, tenant_id]);
        res.json({ status: 'success', message: 'Payment tracking removed' });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
};
