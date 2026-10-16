const crypto = require('crypto');
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
    const branch_id = (req.user?.role === 'admin')
        ? (req.query?.branch_id || null)
        : (req.branchId || req.user?.branch_id || null);

    try {
        if (req.user?.role !== 'admin' && branch_id) {
            const dealCheck = await db.query(`
                SELECT branch_id FROM deals
                WHERE id = $1 AND tenant_id::text = $2::text
            `, [parseInt(dealId), tenant_id]);
            if (dealCheck.rows.length === 0) {
                return res.status(404).json({ status: 'error', message: 'Deal not found or unauthorized' });
            }
            if (dealCheck.rows[0].branch_id && String(dealCheck.rows[0].branch_id) !== String(branch_id)) {
                return res.status(404).json({ status: 'error', message: 'Deal not found or unauthorized' });
            }
        }

        const result = await db.query(`
            SELECT rp.*,
                   COALESCE(fv.actual_paid, rp.paid_amount, 0) as paid_amount,
                   (rp.total_amount - COALESCE(fv.actual_paid, rp.paid_amount, 0)) as remaining_amount
            FROM re_payments_mvp rp
            LEFT JOIN (
                SELECT deal_id, SUM(amount) as actual_paid
                FROM finance_vouchers
                WHERE tenant_id::text = $2::text
                  AND voucher_type = 'receipt'
                  AND (COALESCE(status, 'active') != 'cancelled')
                  AND deal_id IS NOT NULL
                GROUP BY deal_id
            ) fv ON rp.deal_id::text = fv.deal_id::text
            WHERE rp.deal_id::text = $1::text
              AND rp.tenant_id::text = $2::text
              AND ($3::text IS NULL OR rp.branch_id::text = $3::text OR rp.branch_id IS NULL)
        `, [dealId, tenant_id, branch_id ? String(branch_id) : null]);

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

// @desc    Update payment metadata or record official cash collection
// @route   PUT /api/re-payments/:id
exports.updatePayment = async (req, res) => {
    const { id } = req.params;
    const {
        paid_amount,
        down_payment,
        next_payment_date,
        record_collection,
        action,
        amount,
        payment_method,
        treasury_account_id,
        notes
    } = req.body;

    const tenant_id = String(req.user.tenant_id);
    const branch_id = (req.user?.role === 'admin')
        ? null
        : (req.branchId || req.user?.branch_id || null);

    try {
        const checkRes = await db.query(`
            SELECT rp.*, d.title as deal_title, d.client_id
            FROM re_payments_mvp rp
            LEFT JOIN deals d ON rp.deal_id = d.id
            WHERE rp.id = $1 AND rp.tenant_id::text = $2::text
        `, [id, tenant_id]);

        if (checkRes.rows.length === 0) {
            return res.status(404).json({ status: 'error', message: 'Payment record not found or unauthorized' });
        }
        if (branch_id && checkRes.rows[0].branch_id && String(checkRes.rows[0].branch_id) !== String(branch_id)) {
            return res.status(404).json({ status: 'error', message: 'Payment record not found or unauthorized' });
        }

        const current = checkRes.rows[0];
        const recordBranch = current.branch_id;

        // =========================================================================
        // CASE A: EXPLICIT CASH COLLECTION RECORDING (تسجيل تحصيل نقدي فعلي)
        // Generates an official finance_vouchers receipt, credits Treasury, and updates cache.
        // =========================================================================
        const isCollection = Boolean(record_collection === true || action === 'record_collection');
        if (isCollection) {
            const collectAmt = parseFloat(amount);
            if (isNaN(collectAmt) || collectAmt <= 0) {
                return res.status(400).json({ status: 'error', message: 'Valid positive amount is required for collection recording.' });
            }

            // Client-supplied request idempotency key (body.idempotency_key, header, body.request_id, or body.reference_no).
            // When client supplies a retry key, reuse it to guarantee idempotency across network retries.
            // If no explicit idempotency key is supplied, generate a unique per-operation token so multiple
            // legitimate payments of the identical amount on the same day are never falsely deduplicated or blocked.
            const rawClientKey = req.body?.idempotency_key || req.headers?.['idempotency-key'] || req.body?.request_id || req.body?.reference_no || null;
            const refNo = rawClientKey
                ? (String(rawClientKey).startsWith('DIRECT-PAY-') ? String(rawClientKey) : `DIRECT-PAY-${rawClientKey}`)
                : `DIRECT-PAY-DEAL-${current.deal_id}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

            // Validate treasury account if supplied
            let resolvedTreasuryId = null;
            let resolvedTreasuryName = req.body.treasury_account || null;
            if (treasury_account_id) {
                const taCheck = await db.query(`
                    SELECT id, name, branch_id FROM treasury_accounts
                    WHERE id = $1 AND tenant_id::text = $2::text AND is_active = true
                `, [treasury_account_id, tenant_id]);
                if (taCheck.rows.length === 0) {
                    return res.status(400).json({ status: 'error', message: 'Selected treasury account is invalid or inactive.' });
                }
                if (branch_id && taCheck.rows[0].branch_id && String(taCheck.rows[0].branch_id) !== String(branch_id)) {
                    return res.status(403).json({ status: 'error', message: 'Unauthorized access to the selected treasury account branch.' });
                }
                resolvedTreasuryId = taCheck.rows[0].id;
                resolvedTreasuryName = taCheck.rows[0].name;
            }

            const client = await db.connect();
            try {
                await client.query('BEGIN');

                // Concurrency lock for deal payment
                await client.query(`SELECT pg_advisory_xact_lock(hashtext('re_payment_collect:' || $1::text))`, [String(id)]);

                // Idempotency Check: Verify if voucher already recorded for this reference_no
                const existingVoucherRes = await client.query(`
                    SELECT id, voucher_number, amount, status FROM finance_vouchers
                    WHERE tenant_id::text = $1::text
                      AND voucher_type = 'receipt'
                      AND reference_no = $2
                      AND (COALESCE(status, 'active') != 'cancelled')
                    LIMIT 1
                `, [tenant_id, refNo]);

                if (existingVoucherRes.rows.length > 0) {
                    // Already processed; abort transaction and return existing voucher with zero mutations
                    await client.query('ROLLBACK');
                    return res.status(200).json({
                        status: 'success',
                        message: 'Cash collection was already recorded; returning existing voucher without duplicate charges.',
                        data: current,
                        voucher: existingVoucherRes.rows[0]
                    });
                }

                if (!resolvedTreasuryId) {
                    try {
                        const accType = (payment_method === 'bank_transfer' || payment_method === 'card' || payment_method === 'check')
                            ? 'bank' : 'cash';
                        const taRes = await client.query(`
                            SELECT id, name FROM treasury_accounts
                            WHERE tenant_id::text = $1::text
                              AND ($2::text IS NULL OR branch_id::text = $2::text OR branch_id IS NULL)
                              AND type = $3 AND is_default = true AND is_active = true
                            LIMIT 1
                        `, [tenant_id, recordBranch ? String(recordBranch) : null, accType]);
                        if (taRes.rows.length > 0) {
                            resolvedTreasuryId = taRes.rows[0].id;
                            resolvedTreasuryName = taRes.rows[0].name;
                        }
                    } catch (_) {}
                }

                if (!resolvedTreasuryName) {
                    resolvedTreasuryName = 'Main Cash / الخزينة الرئيسية';
                }

                // Customer info
                let customerName = 'عميل نقدي';
                let customerId = current.client_id ? String(current.client_id) : null;
                if (customerId) {
                    const cRes = await client.query(`SELECT name FROM customers WHERE id::text = $1::text`, [customerId]);
                    if (cRes.rows.length) customerName = cRes.rows[0].name;
                }

                const { generateVoucherNumber } = require('../services/voucherNumbering');
                const voucherNumber = await generateVoucherNumber(tenant_id, recordBranch, 'receipt', client);

                // Insert authoritative receipt voucher with deterministic reference_no
                const vRes = await client.query(`
                    INSERT INTO finance_vouchers (
                        voucher_number, voucher_type, party_type, party_name, customer_id,
                        deal_id, amount, payment_method, treasury_account, treasury_account_id,
                        reference_no, notes, voucher_date, created_by, tenant_id, branch_id, status
                    ) VALUES ($1, 'receipt', 'customer', $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_DATE, $11, $12, $13, 'active')
                    RETURNING *
                `, [
                    voucherNumber,
                    customerName,
                    customerId,
                    String(current.deal_id),
                    collectAmt,
                    payment_method || 'cash',
                    resolvedTreasuryName,
                    resolvedTreasuryId,
                    refNo,
                    notes || `تحصيل نقدي مباشر على صفقة #${current.deal_id}`,
                    req.user.id,
                    tenant_id,
                    recordBranch ? String(recordBranch) : null
                ]);

                // Increment paid_amount in cache
                const newPaid = Number((parseFloat(current.paid_amount || 0) + collectAmt).toFixed(2));
                const totalAmt = parseFloat(current.total_amount || 0);
                const newRemaining = Number((totalAmt - newPaid).toFixed(2));
                const newStatus = newRemaining <= 0 ? 'Completed' : 'Pending';

                const updateRes = await client.query(`
                    UPDATE re_payments_mvp SET
                        paid_amount = $1,
                        status = $2,
                        next_payment_date = COALESCE($3, next_payment_date),
                        updated_at = NOW()
                    WHERE id = $4 AND tenant_id::text = $5::text
                    RETURNING *, (total_amount - paid_amount) as remaining_amount
                `, [newPaid, newStatus, next_payment_date, id, tenant_id]);

                await client.query('COMMIT');

                const { logAction, ACTIONS } = require('../services/loggerService');
                logAction({
                    userId: req.user.id,
                    tenantId: tenant_id,
                    action: ACTIONS.AUTOMATION,
                    entityType: 'Payment',
                    entityId: id,
                    details: {
                        collected_amount: collectAmt,
                        voucher_number: voucherNumber,
                        paid_amount: newPaid,
                        remaining_amount: newRemaining
                    }
                });

                return res.status(201).json({
                    status: 'success',
                    message: 'Cash collection recorded and official receipt voucher generated.',
                    data: updateRes.rows[0],
                    voucher: vRes.rows[0]
                });
            } catch (cErr) {
                await client.query('ROLLBACK');
                throw cErr;
            } finally {
                client.release();
            }
        }

        // =========================================================================
        // CASE B: ADMINISTRATIVE METADATA ADJUSTMENT (تعديل إداري للكاش)
        // Adjusts down_payment, next_payment_date, or performs cache correction.
        // Does NOT generate any voucher or financial ledger movement.
        // =========================================================================
        let targetPaid = current.paid_amount;
        if (paid_amount !== undefined) {
            const parsedPaid = parseFloat(paid_amount);
            if (isNaN(parsedPaid) || parsedPaid < 0) {
                return res.status(400).json({ status: 'error', message: 'paid_amount must be a non-negative number.' });
            }

            // Check authoritative vouchers for this deal
            const vRes = await db.query(`
                SELECT COALESCE(SUM(amount), 0) as total_vouchers
                FROM finance_vouchers
                WHERE deal_id::text = $1::text
                  AND tenant_id::text = $2::text
                  AND voucher_type = 'receipt'
                  AND (COALESCE(status, 'active') != 'cancelled')
            `, [String(current.deal_id), tenant_id]);
            const vouchersTotal = parseFloat(vRes.rows[0].total_vouchers) || 0;

            // Never allow administrative cache modification to set paid_amount below verified vouchers
            targetPaid = Math.max(parsedPaid, vouchersTotal);
        }

        const result = await db.query(`
            UPDATE re_payments_mvp SET
                paid_amount = COALESCE($1, paid_amount),
                down_payment = COALESCE($2, down_payment),
                next_payment_date = COALESCE($3, next_payment_date),
                updated_at = NOW()
            WHERE id = $4 AND tenant_id::text = $5::text
            RETURNING *, (total_amount - (COALESCE($1, paid_amount))) as remaining_amount
        `, [paid_amount !== undefined ? targetPaid : null, down_payment, next_payment_date, id, tenant_id]);

        if (result.rows.length === 0) return res.status(404).json({ status: 'error', message: 'Payment record not found' });

        const updated = result.rows[0];
        const remaining = parseFloat(updated.remaining_amount);

        const { logAction, ACTIONS } = require('../services/loggerService');
        logAction({
            userId: req.user.id,
            tenantId: tenant_id,
            action: ACTIONS.AUTOMATION,
            entityType: 'Payment',
            entityId: id,
            details: {
                action_type: 'administrative_cache_adjustment',
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
    const branch_id = (req.user?.role === 'admin')
        ? null
        : (req.branchId || req.user?.branch_id || null);

    try {
        if (branch_id) {
            const checkRes = await db.query(`
                SELECT branch_id FROM re_payments_mvp
                WHERE id = $1 AND tenant_id::text = $2::text
            `, [id, tenant_id]);
            if (checkRes.rows.length === 0) {
                return res.status(404).json({ status: 'error', message: 'Payment record not found or unauthorized' });
            }
            if (checkRes.rows[0].branch_id && String(checkRes.rows[0].branch_id) !== String(branch_id)) {
                return res.status(404).json({ status: 'error', message: 'Payment record not found or unauthorized' });
            }
        }

        await db.query('DELETE FROM re_payments_mvp WHERE id = $1 AND tenant_id::text = $2::text', [id, tenant_id]);
        res.json({ status: 'success', message: 'Payment tracking removed' });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
};
