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
    const branch_id = (req.user?.role === 'admin')
        ? (req.query.branch_id || null)
        : (req.branchId || req.user?.branch_id || null);

    try {
        let whereClause = `WHERE rc.tenant_id::text = $1::text`;
        const params = [tenant_id];

        if (branch_id) {
            params.push(String(branch_id));
            whereClause += ` AND ($${params.length}::text IS NULL OR COALESCE(rc.branch_id, d.branch_id)::text = $${params.length}::text OR (rc.branch_id IS NULL AND d.branch_id IS NULL))`;
        }

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

    // Permission check: canceling a deal requires deal.delete
    const { checkDealPermission } = require('../middleware/dealPermission');
    const canDelete = await checkDealPermission(req.user.id, tenant_id, 'deal.delete', req.user.role);
    if (!canDelete) {
        return res.status(403).json({
            status: 'error',
            code: 'PERMISSION_DENIED',
            message: 'Permission denied: "deal.delete" is required to cancel deals.',
            required_permission: 'deal.delete'
        });
    }

    const client = await db.connect();
    try {
        await client.query('BEGIN');

        // 1. Lock and verify deal
        const dealRes = await client.query(`
            SELECT id, title, value, pipeline_stage, unit_id, branch_id
            FROM deals
            WHERE id = $1 AND tenant_id::text = $2::text
            FOR UPDATE
        `, [parseInt(deal_id), tenant_id]);

        if (dealRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ status: 'error', message: 'Deal not found or unauthorized.' });
        }

        const deal = dealRes.rows[0];
        if (req.user?.role !== 'admin' && branch_id && deal.branch_id && String(deal.branch_id) !== String(branch_id)) {
            await client.query('ROLLBACK');
            return res.status(404).json({ status: 'error', message: 'Deal not found or unauthorized.' });
        }

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

        // 4. Calculate total paid amount accurately without duplication
        // 4a. Query all authoritative receipt vouchers for this deal
        let vouchersPaid = 0;
        let voucheredInstallments = 0;
        // 4a. Query all authoritative receipt vouchers for this deal (FAIL-CLOSED: do not catch/swallow errors)
        const vRes = await client.query(`
            SELECT
                COALESCE(SUM(amount), 0) as total_vouchers,
                COALESCE(SUM(CASE WHEN installment_id IS NOT NULL THEN amount ELSE 0 END), 0) as vouchered_installments
            FROM finance_vouchers
            WHERE deal_id::text = $1::text
              AND tenant_id::text = $2::text
              AND voucher_type = 'receipt'
              AND (COALESCE(status, 'active') != 'cancelled')
        `, [String(deal.id), tenant_id]);
        vouchersPaid = parseFloat(vRes.rows[0].total_vouchers) || 0;
        voucheredInstallments = parseFloat(vRes.rows[0].vouchered_installments) || 0;

        // 4b. Query contractual installments paid amount
        let installmentsPaid = 0;
        const instPaidRes = await client.query(`
            SELECT COALESCE(SUM(paid_amount), 0) as sum_paid
            FROM re_installments
            WHERE deal_id = $1 AND tenant_id::text = $2::text
        `, [deal.id, tenant_id]);
        installmentsPaid = parseFloat(instPaidRes.rows[0].sum_paid) || 0;

        // 4c. Query legacy fallback sources if neither vouchers nor installment payments exist
        let contractDownPayment = 0;
        if (contract && contract.down_payment) {
            contractDownPayment = parseFloat(contract.down_payment) || 0;
        }

        let mvpPaid = 0;
        const payRes = await client.query(`
            SELECT paid_amount FROM re_payments_mvp
            WHERE deal_id::text = $1::text AND tenant_id::text = $2::text
        `, [String(deal.id), tenant_id]);
        if (payRes.rows.length > 0) {
            mvpPaid = parseFloat(payRes.rows[0].paid_amount) || 0;
        }

        // 4d. Consolidate without double-counting:
        // - vouchersPaid captures all authoritative vouchers (both direct deal receipts and vouchered installments).
        // - unvoucheredInstallments = Math.max(0, installmentsPaid - voucheredInstallments) captures historical unvouchered installments.
        // - If both are zero, fall back to legacy contract down payment or re_payments_mvp.
        let totalPaid = 0;
        if (vouchersPaid > 0 || installmentsPaid > 0) {
            const unvoucheredInstallments = Math.max(0, installmentsPaid - voucheredInstallments);
            totalPaid = vouchersPaid + unvoucheredInstallments;
        } else {
            totalPaid = Math.max(contractDownPayment, mvpPaid);
        }
        totalPaid = Number(totalPaid.toFixed(2));

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

        // 8. Handle Unit state transition according to cancellation policy
        if (deal.unit_id) {
            if (unit_action === 'dispute') {
                await client.query(`
                    UPDATE re_units SET
                        status = 'Under Dispute',
                        reservation_expires_at = NULL,
                        reservation_extended_at = NULL,
                        reservation_extended_by = NULL,
                        reservation_extension_count = 0,
                        updated_at = NOW()
                    WHERE id::text = $1::text AND tenant_id::text = $2::text
                `, [String(deal.unit_id), tenant_id]);
            } else if (unit_action === 'release') {
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

// @desc    Update refund status (Processed) and create official payment voucher
// @route   PATCH /api/re-cancellations/:id/refund
exports.updateRefundStatus = async (req, res) => {
    const tenant_id = String(req.user.tenant_id);
    const branch_id = (req.user?.role === 'admin')
        ? null
        : (req.branchId || req.user?.branch_id || null);
    const { id } = req.params;
    const { refund_status, refund_date, notes, payment_method, treasury_account_id } = req.body;

    const allowed = ['Pending', 'Processed', 'No Refund'];
    if (!refund_status || !allowed.includes(refund_status)) {
        return res.status(400).json({ status: 'error', message: `Invalid refund status. Allowed: ${allowed.join(', ')}` });
    }

    try {
        const checkRes = await db.query(`
            SELECT rc.*, d.branch_id as deal_branch_id
            FROM re_cancellations rc
            LEFT JOIN deals d ON rc.deal_id = d.id
            WHERE rc.id::text = $1::text AND rc.tenant_id::text = $2::text
        `, [id, tenant_id]);

        if (checkRes.rows.length === 0) {
            return res.status(404).json({ status: 'error', message: 'Cancellation record not found or unauthorized.' });
        }

        const cancelRow = checkRes.rows[0];
        const cancelBranch = cancelRow.branch_id || cancelRow.deal_branch_id;
        if (branch_id && cancelBranch && String(cancelBranch) !== String(branch_id)) {
            return res.status(404).json({ status: 'error', message: 'Cancellation record not found or unauthorized.' });
        }

        const refundableAmount = parseFloat(cancelRow.refundable_amount) || 0;

        // 1. Guard against re-processing already processed refunds (Idempotent replay with ZERO side-effects)
        if (cancelRow.refund_status === 'Processed') {
            const existingVoucherRes = await db.query(`
                SELECT id, voucher_number, amount, status FROM finance_vouchers
                WHERE tenant_id::text = $1::text
                  AND voucher_type = 'payment'
                  AND reference_no = $2
                  AND (COALESCE(status, 'active') != 'cancelled')
                LIMIT 1
            `, [tenant_id, `REFUND-CANCEL-${id}`]);

            return res.status(200).json({
                status: 'success',
                message: 'Refund was already processed; no modifications made.',
                data: cancelRow,
                voucher: existingVoucherRes.rows[0] || null
            });
        }

        // 2. Validate eligibility when requesting Processed status
        if (refund_status === 'Processed' && refundableAmount <= 0) {
            return res.status(400).json({
                status: 'error',
                message: 'Cannot process refund: refundable_amount is zero or not eligible for refund.'
            });
        }

        const dateVal = refund_status === 'Processed' ? (refund_date || new Date().toISOString().split('T')[0]) : null;

        // 3. If transitioning to Processed and refundable amount exists, generate payment voucher atomically
        if (refund_status === 'Processed' && refundableAmount > 0) {
            // Validate treasury account if supplied before opening transaction
            let validatedTreasuryId = null;
            let validatedTreasuryName = null;
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
                validatedTreasuryId = taCheck.rows[0].id;
                validatedTreasuryName = taCheck.rows[0].name;
            }

            const client = await db.connect();
            try {
                await client.query('BEGIN');

                // Transaction advisory lock to prevent concurrent duplicate vouchers
                await client.query(`SELECT pg_advisory_xact_lock(hashtext('refund_cancel:' || $1::text))`, [String(id)]);

                // Lock cancellation record FOR UPDATE
                const lockedRes = await client.query(`
                    SELECT * FROM re_cancellations
                    WHERE id = $1 AND tenant_id::text = $2::text
                    FOR UPDATE
                `, [id, tenant_id]);

                if (lockedRes.rows.length === 0) {
                    await client.query('ROLLBACK');
                    return res.status(404).json({ status: 'error', message: 'Cancellation record not found.' });
                }

                const lockedCancel = lockedRes.rows[0];
                if (lockedCancel.refund_status === 'Processed') {
                    // Another concurrent request just processed this refund
                    await client.query('ROLLBACK');
                    const existingVoucherRes = await db.query(`
                        SELECT id, voucher_number, amount, status FROM finance_vouchers
                        WHERE tenant_id::text = $1::text AND voucher_type = 'payment' AND reference_no = $2
                          AND (COALESCE(status, 'active') != 'cancelled') LIMIT 1
                    `, [tenant_id, `REFUND-CANCEL-${id}`]);
                    return res.status(200).json({
                        status: 'success',
                        message: 'Refund was already processed; no modifications made.',
                        data: lockedCancel,
                        voucher: existingVoucherRes.rows[0] || null
                    });
                }

                // 3. Strict Idempotency Check AFTER lock: verify if an active payment voucher already exists
                const refNo = `REFUND-CANCEL-${id}`;
                const existingVoucherRes = await client.query(`
                    SELECT id, voucher_number, amount, status FROM finance_vouchers
                    WHERE tenant_id::text = $1::text
                      AND voucher_type = 'payment'
                      AND reference_no = $2
                      AND (COALESCE(status, 'active') != 'cancelled')
                    LIMIT 1
                `, [tenant_id, refNo]);

                if (existingVoucherRes.rows.length > 0) {
                    // Voucher already issued; rollback and exit with zero modifications
                    await client.query('ROLLBACK');
                    return res.status(200).json({
                        status: 'success',
                        message: 'Refund was already processed; no modifications made.',
                        data: lockedCancel,
                        voucher: existingVoucherRes.rows[0]
                    });
                }

                let voucher = null;
                {
                    // Resolve customer info from deal
                    const dealInfo = await client.query(`
                        SELECT d.title as deal_title, d.client_id, c.name as customer_name
                        FROM deals d
                        LEFT JOIN customers c ON d.client_id::text = c.id::text
                        WHERE d.id = $1 AND d.tenant_id::text = $2::text
                    `, [cancelRow.deal_id, tenant_id]);

                    const customerName = (dealInfo.rows.length && dealInfo.rows[0].customer_name)
                        ? dealInfo.rows[0].customer_name
                        : (cancelRow.processed_by ? `عميل مسترد (${cancelRow.processed_by})` : 'عميل مسترد');
                    const customerId = (dealInfo.rows.length && dealInfo.rows[0].client_id)
                        ? dealInfo.rows[0].client_id
                        : null;

                    let resolvedTreasuryId = validatedTreasuryId;
                    let resolvedTreasuryName = validatedTreasuryName || req.body.treasury_account || null;

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
                            `, [tenant_id, cancelBranch ? String(cancelBranch) : null, accType]);
                            if (taRes.rows.length > 0) {
                                resolvedTreasuryId = taRes.rows[0].id;
                                resolvedTreasuryName = taRes.rows[0].name;
                            }
                        } catch (_) {}
                    }

                    if (!resolvedTreasuryName) {
                        resolvedTreasuryName = 'Main Cash / الخزينة الرئيسية';
                    }

                    // Concurrency-safe voucher numbering
                    const { generateVoucherNumber } = require('../services/voucherNumbering');
                    const voucherNumber = await generateVoucherNumber(tenant_id, cancelBranch, 'payment', client);

                    const voucherInsert = await client.query(`
                        INSERT INTO finance_vouchers (
                            voucher_number, voucher_type, party_type, party_name, customer_id,
                            deal_id, contract_id, amount, payment_method, treasury_account,
                            treasury_account_id, reference_no, notes, voucher_date,
                            created_by, tenant_id, branch_id, status
                        ) VALUES ($1, 'payment', 'customer', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 'active')
                        RETURNING *
                    `, [
                        voucherNumber,
                        customerName,
                        customerId ? String(customerId) : null,
                        String(cancelRow.deal_id),
                        cancelRow.contract_id ? String(cancelRow.contract_id) : null,
                        refundableAmount,
                        payment_method || 'cash',
                        resolvedTreasuryName,
                        resolvedTreasuryId,
                        refNo,
                        notes || `استرداد مالي لإلغاء صفقة #${cancelRow.deal_id}`,
                        dateVal,
                        req.user.id,
                        tenant_id,
                        cancelBranch ? String(cancelBranch) : null
                    ]);

                    voucher = voucherInsert.rows[0];
                }

                // Update cancellation record
                const updateRes = await client.query(`
                    UPDATE re_cancellations SET
                        refund_status = $1,
                        refund_date = COALESCE($2, CURRENT_DATE),
                        updated_at = NOW()
                    WHERE id = $3 AND tenant_id::text = $4::text
                    RETURNING *
                `, [refund_status, dateVal, id, tenant_id]);

                await client.query('COMMIT');

                return res.json({
                    status: 'success',
                    message: `Refund status updated to ${refund_status} and official payment voucher generated.`,
                    data: updateRes.rows[0],
                    voucher
                });
            } catch (txErr) {
                await client.query('ROLLBACK');
                throw txErr;
            } finally {
                client.release();
            }
        }

        // Standard update for non-Processed statuses (e.g. Pending, No Refund)
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
