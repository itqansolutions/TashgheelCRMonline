const { resolveCollectionTreasury } = require('../services/resolveCollectionTreasury');
/**
 * reInstallmentsController.js
 * Controller for Phase 2.3: Real Estate Payment Plans & Installment Schedules.
 */

const db = require('../config/db');
const crypto = require('crypto');
const { logDelete } = require('../services/loggerService');
const accessScopeService = require('../services/accessScopeService');
const { logAction, ACTIONS } = require('../services/loggerService');

// Helper to add months to a Date
function addMonths(date, months) {
    const d = new Date(date);
    d.setMonth(d.getMonth() + months);
    return d.toISOString().split('T')[0];
}

// Fingerprint of the schedule a user is about to replace. The confirmation token sent back by the
// client must match the schedule as it is NOW (checked under the contract lock), so a confirmation
// given for an older view of the schedule cannot replace a newer one.
function scheduleToken(rows, contract) {
    const parts = (rows || []).map(r => [
        r.id, r.installment_number, r.installment_type,
        String(parseFloat(r.amount)), String(parseFloat(r.paid_amount)), r.status,
        r.due_date instanceof Date ? r.due_date.toISOString() : String(r.due_date),
        r.updated_at instanceof Date ? r.updated_at.toISOString() : String(r.updated_at)
    ].join('|'));
    parts.push(`dp:${parseFloat(contract.down_payment || 0)}|cv:${parseFloat(contract.contract_value || 0)}|st:${contract.status}`);
    return crypto.createHash('sha256').update(parts.join('\n')).digest('hex');
}

// @desc    Get installments (workspace list, or filtered by contract / deal)
// @route   GET /api/re-installments
//          Query: contract_id, deal_id, status (Pending|Partial|Paid), overdue=true
exports.getInstallments = async (req, res) => {
    const tenant_id = String(req.user.tenant_id);
    const { contract_id, deal_id, status, overdue } = req.query;
    const branch_id = (req.user?.role === 'admin')
        ? (req.query.branch_id || null)
        : (req.branchId || req.user?.branch_id || null);

    try {
        let whereClause = `WHERE ri.tenant_id::text = $1::text`;
        const params = [tenant_id];

        if (branch_id) {
            params.push(String(branch_id));
            whereClause += ` AND ($${params.length}::text IS NULL OR COALESCE(ri.branch_id, d.branch_id, rc.branch_id)::text = $${params.length}::text OR (ri.branch_id IS NULL AND d.branch_id IS NULL AND rc.branch_id IS NULL))`;
        }

        if (contract_id) {
            params.push(contract_id);
            whereClause += ` AND ri.contract_id::text = $${params.length}::text`;
        } else if (deal_id) {
            params.push(parseInt(deal_id));
            whereClause += ` AND ri.deal_id = $${params.length}`;
        }
        if (status) {
            params.push(String(status));
            whereClause += ` AND ri.status = $${params.length}`;
        }
        if (overdue === 'true') {
            whereClause += ` AND ri.status <> 'Paid' AND ri.due_date < CURRENT_DATE`;
        }

        // Row-level scope: same visibility as the originating deal
        const scope = await accessScopeService.buildScopePredicate({
            user: req.user, tableAlias: 'd', assigneeCol: 'assigned_to', paramIndex: params.length + 1
        });
        whereClause += ` AND (${scope.sql})`;
        params.push(...scope.params);

        const result = await db.query(`
            SELECT
                ri.*,
                rc.contract_number,
                rc.contract_value,
                rc.status as contract_status,
                d.title as deal_title,
                c.name as customer_name,
                ru.name as unit_name,
                ru.unit_number,
                (ri.amount - ri.paid_amount) as remaining_balance
            FROM re_installments ri
            JOIN re_contracts rc ON ri.contract_id = rc.id AND rc.tenant_id::text = ri.tenant_id::text
            JOIN deals d ON d.id = rc.deal_id AND d.tenant_id::text = rc.tenant_id::text
            LEFT JOIN customers c ON c.id = rc.customer_id
            LEFT JOIN re_units ru ON ru.id::text = rc.unit_id::text AND ru.tenant_id::text = rc.tenant_id::text
            ${whereClause}
            ORDER BY ${(contract_id || deal_id) ? 'ri.installment_number ASC' : 'ri.due_date ASC, ri.installment_number ASC'}
        `, params);

        // Compute summary aggregates
        const installments = result.rows;
        let totalScheduled = 0;
        let totalPaid = 0;
        let totalRemaining = 0;
        let overdueCount = 0;
        const now = new Date();

        installments.forEach(item => {
            const amt = parseFloat(item.amount) || 0;
            const paid = parseFloat(item.paid_amount) || 0;
            const rem = Math.max(0, amt - paid);
            totalScheduled += amt;
            totalPaid += paid;
            totalRemaining += rem;

            if (item.status !== 'Paid' && new Date(item.due_date) < now) {
                item.is_overdue = true;
                overdueCount++;
            } else {
                item.is_overdue = false;
            }
        });

        res.json({
            status: 'success',
            data: installments,
            summary: {
                total_scheduled: Number(totalScheduled.toFixed(2)),
                total_paid: Number(totalPaid.toFixed(2)),
                total_remaining: Number(totalRemaining.toFixed(2)),
                overdue_count: overdueCount,
                count: installments.length
            }
        });
    } catch (err) {
        console.error('[Get Installments Error]:', err.message);
        res.status(500).json({ status: 'error', message: err.message });
    }
};

// @desc    Generate a structured installment schedule for a contract
// @route   POST /api/re-installments/generate-schedule
exports.generateSchedule = async (req, res) => {
    const tenant_id = String(req.user.tenant_id);
    const branch_id = req.branchId || req.user?.branch_id || null;
    const {
        contract_id,
        down_payment = 0,
        number_of_installments,
        frequency = 'monthly', // 'monthly', 'quarterly', 'semi-annual', 'annual'
        start_date,
        confirm_replace_token = null
    } = req.body;

    if (!contract_id) {
        return res.status(400).json({ status: 'error', message: 'contract_id is required.' });
    }

    const numInstallments = parseInt(number_of_installments);
    if (isNaN(numInstallments) || numInstallments <= 0) {
        return res.status(400).json({ status: 'error', message: 'number_of_installments must be a positive integer.' });
    }

    const freqMonths = {
        'monthly': 1,
        'quarterly': 3,
        'semi-annual': 6,
        'annual': 12
    }[frequency.toLowerCase()] || 1;

    const baseDate = start_date ? new Date(start_date) : new Date();

    const client = await db.connect();
    try {
        await client.query('BEGIN');

        // Advisory transaction lock to serialize schedule operations on this contract
        await client.query(`SELECT pg_advisory_xact_lock(hashtext('re_schedule:' || $1::text))`, [String(contract_id)]);

        // 1. Fetch contract with FOR UPDATE (explicitly lock rc to prevent outer join lock error)
        const contractRes = await client.query(`
            SELECT rc.id, rc.deal_id, rc.branch_id, rc.contract_value, rc.down_payment, rc.status, d.branch_id as deal_branch_id
            FROM re_contracts rc
            LEFT JOIN deals d ON rc.deal_id = d.id
            WHERE rc.id::text = $1::text AND rc.tenant_id::text = $2::text
            FOR UPDATE OF rc
        `, [contract_id, tenant_id]);

        if (contractRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ status: 'error', message: 'Contract not found or unauthorized.' });
        }

        const contract = contractRes.rows[0];
        const contractBranch = contract.branch_id || contract.deal_branch_id;
        if (req.user?.role !== 'admin' && branch_id && contractBranch && String(contractBranch) !== String(branch_id)) {
            await client.query('ROLLBACK');
            return res.status(404).json({ status: 'error', message: 'Contract not found or unauthorized.' });
        }

        // Governance: Check contract lifecycle status
        const contractStatus = contract.status || 'Draft';
        if (['Completed', 'Cancelled'].includes(contractStatus)) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                status: 'error',
                message: `Cannot generate or reschedule installments for a contract in '${contractStatus}' status.`
            });
        }

        // Governance: Approved contracts (Signed / Active) require admin role to reschedule
        const isApprovedContract = ['Signed', 'Active'].includes(contractStatus);
        if (isApprovedContract) {
            if (req.user?.role !== 'admin') {
                await client.query('ROLLBACK');
                return res.status(403).json({
                    status: 'error',
                    message: `Cannot reschedule installments for an approved contract (${contractStatus}). Rescheduling requires admin authorization.`
                });
            }
            // For approved contracts, down payment is legally frozen and cannot be changed arbitrarily
            const approvedDp = parseFloat(contract.down_payment || 0);
            if (req.body.down_payment !== undefined && Math.abs(parseFloat(down_payment || 0) - approvedDp) > 0.01) {
                await client.query('ROLLBACK');
                return res.status(409).json({
                    status: 'error',
                    message: `Down payment cannot change once the contract is ${contractStatus}. Approved down payment is ${approvedDp}.`
                });
            }
        }

        const effectiveBranchId = branch_id || contractBranch || null;
        const contractValue = parseFloat(contract.contract_value) || 0;
        const dpAmount = Math.max(0, parseFloat(down_payment) || 0);

        if (dpAmount > contractValue) {
            await client.query('ROLLBACK');
            return res.status(400).json({ status: 'error', message: 'Down payment cannot exceed contract value.' });
        }

        // 2. Check if any existing installments have been paid
        const paidCheck = await client.query(`
            SELECT COUNT(*) FROM re_installments
            WHERE contract_id = $1 AND tenant_id::text = $2::text AND paid_amount > 0
        `, [contract.id, tenant_id]);

        if (parseInt(paidCheck.rows[0]?.count || 0) > 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                status: 'error',
                message: 'Cannot regenerate schedule: one or more installments have already been partially or fully paid.'
            });
        }

        // Check for official financial receipt vouchers
        try {
            const voucherCheck = await client.query(`
                SELECT COUNT(*) FROM finance_vouchers
                WHERE tenant_id::text = $1::text
                  AND voucher_type = 'receipt'
                  AND (COALESCE(status, 'active') != 'cancelled')
                  AND (
                      contract_id::text = $2::text
                      OR installment_id IN (
                          SELECT id::text FROM re_installments
                          WHERE contract_id::text = $2::text AND tenant_id::text = $1::text
                      )
                  )
            `, [tenant_id, String(contract.id)]);

            if (parseInt(voucherCheck.rows[0]?.count || 0) > 0) {
                await client.query('ROLLBACK');
                return res.status(400).json({
                    status: 'error',
                    message: 'Cannot regenerate schedule: financial receipt vouchers already exist for this contract.'
                });
            }
        } catch (vErr) {
            if (!vErr.message.includes('column') && !vErr.message.includes('does not exist')) {
                throw vErr;
            }
        }

        // 3. Existing unpaid schedule: require explicit confirmation and keep a history snapshot
        //    before it is replaced (the replaced rows get new IDs, so the snapshot is the only trace).
        const existingRes = await client.query(`
            SELECT * FROM re_installments
            WHERE contract_id = $1 AND tenant_id::text = $2::text
            ORDER BY installment_number
        `, [contract.id, tenant_id]);
        const existingRows = existingRes.rows || [];
        const priorDownPayment = parseFloat(contract.down_payment || 0);
        let historyId = null;

        if (existingRows.length > 0) {
            const currentToken = scheduleToken(existingRows, contract);
            if (confirm_replace_token !== currentToken) {
                await client.query('ROLLBACK');
                const supplied = typeof confirm_replace_token === 'string' && confirm_replace_token.length > 0;
                return res.status(409).json({
                    status: 'error',
                    code: supplied ? 'SCHEDULE_CHANGED_SINCE_CONFIRMATION' : 'SCHEDULE_REPLACE_CONFIRMATION_REQUIRED',
                    message: supplied
                        ? 'The installment schedule changed after you reviewed it. Review the current schedule and confirm again.'
                        : 'This contract already has an installment schedule. Generating a new one replaces it. Confirm to continue.',
                    confirm_replace_token: currentToken,
                    existing: {
                        count: existingRows.length,
                        total: Number(existingRows.reduce((a, r) => a + (parseFloat(r.amount) || 0), 0).toFixed(2)),
                        contract_down_payment: priorDownPayment,
                        ids: existingRows.map(r => r.id)
                    },
                    requested: { down_payment: dpAmount, number_of_installments: numInstallments, frequency }
                });
            }

            // Fail closed: if the history cannot be written, the schedule is not replaced.
            const histRes = await client.query(`
                INSERT INTO re_installment_schedule_history (
                    tenant_id, branch_id, contract_id, replaced_by_user_id,
                    prior_down_payment, new_down_payment, prior_installments, new_parameters
                ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb)
                RETURNING id
            `, [
                tenant_id,
                effectiveBranchId,
                contract.id,
                req.user?.id || null,
                priorDownPayment,
                dpAmount,
                JSON.stringify(existingRows),
                JSON.stringify({ down_payment: dpAmount, number_of_installments: numInstallments, frequency, start_date: start_date || null })
            ]);
            historyId = histRes.rows[0]?.id || null;
        }

        // 3b. Clear existing unpaid installments for this contract
        await client.query(`
            DELETE FROM re_installments
            WHERE contract_id = $1 AND tenant_id::text = $2::text
        `, [contract.id, tenant_id]);

        // 4. Calculate installment amounts
        const remainingToSchedule = contractValue - dpAmount;
        const baseInstallmentAmt = Math.floor((remainingToSchedule / numInstallments) * 100) / 100;
        // Remainder adjustment on final installment
        const totalBaseAllocated = baseInstallmentAmt * numInstallments;
        const difference = Number((remainingToSchedule - totalBaseAllocated).toFixed(2));

        const generatedInstallments = [];
        let seq = 1;

        // If down payment is specified, insert as installment #0
        if (dpAmount > 0) {
            const dpDate = baseDate.toISOString().split('T')[0];
            const dpRes = await client.query(`
                INSERT INTO re_installments (
                    contract_id, deal_id, installment_number, installment_type,
                    due_date, amount, paid_amount, status, notes, tenant_id, branch_id
                ) VALUES ($1, $2, $3, 'down_payment', $4, $5, 0, 'Pending', 'Initial Down Payment', $6, $7)
                RETURNING *
            `, [contract.id, contract.deal_id, 0, dpDate, dpAmount, tenant_id, effectiveBranchId]);
            generatedInstallments.push(dpRes.rows[0]);
        }

        // Generate periodic installments
        for (let i = 1; i <= numInstallments; i++) {
            const dueDate = addMonths(baseDate, (i - 1) * freqMonths);
            // Add remainder cent adjustment to the last installment
            const amount = i === numInstallments
                ? Number((baseInstallmentAmt + difference).toFixed(2))
                : baseInstallmentAmt;

            const instRes = await client.query(`
                INSERT INTO re_installments (
                    contract_id, deal_id, installment_number, installment_type,
                    due_date, amount, paid_amount, status, notes, tenant_id, branch_id
                ) VALUES ($1, $2, $3, 'installment', $4, $5, 0, 'Pending', $6, $7, $8)
                RETURNING *
            `, [
                contract.id,
                contract.deal_id,
                seq,
                dueDate,
                amount,
                `Installment #${seq} (${frequency})`,
                tenant_id,
                effectiveBranchId
            ]);
            generatedInstallments.push(instRes.rows[0]);
            seq++;
        }

        // Update contract down_payment & remaining_amount
        await client.query(`
            UPDATE re_contracts SET
                down_payment = $1,
                remaining_amount = $2,
                updated_at = NOW()
            WHERE id = $3 AND tenant_id::text = $4::text
        `, [dpAmount, remainingToSchedule, contract.id, tenant_id]);

        await client.query('COMMIT');

        logAction({
            req,
            action: existingRows.length > 0 ? ACTIONS.UPDATE : ACTIONS.CREATE,
            entityType: 'InstallmentSchedule',
            entityId: String(contract.id),
            details: {
                contract_id: contract.id,
                replaced_installments: existingRows.length,
                replaced_total: Number(existingRows.reduce((a, r) => a + (parseFloat(r.amount) || 0), 0).toFixed(2)),
                prior_down_payment: priorDownPayment,
                new_down_payment: dpAmount,
                generated_installments: generatedInstallments.length,
                history_id: historyId
            }
        });

        res.status(201).json({
            status: 'success',
            message: `Generated schedule of ${numInstallments} installment(s).`,
            history_id: historyId,
            data: generatedInstallments
        });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('[Generate Schedule Error]:', err.message);
        res.status(500).json({ status: 'error', message: 'Failed to generate installment schedule. Please try again or contact support.' });
    } finally {
        client.release();
    }
};

// @desc    Record a payment towards an installment
// @route   POST /api/re-installments/:id/pay
// Linkage columns used by installment payments. Created once per process, outside any payment
// transaction, so a payment never waits on schema locks while holding its installment row lock.
let paymentColumnsReady = null;
function ensurePaymentColumns() {
    if (!paymentColumnsReady) {
        paymentColumnsReady = (async () => {
            await db.query(`ALTER TABLE finance_vouchers ADD COLUMN IF NOT EXISTS deal_id VARCHAR(255)`);
            await db.query(`ALTER TABLE finance_vouchers ADD COLUMN IF NOT EXISTS contract_id VARCHAR(255)`);
            await db.query(`ALTER TABLE finance_vouchers ADD COLUMN IF NOT EXISTS installment_id VARCHAR(255)`);
            await db.query(`ALTER TABLE re_installments ADD COLUMN IF NOT EXISTS last_voucher_id INTEGER`);
        })().catch((err) => { paymentColumnsReady = null; throw err; });
    }
    return paymentColumnsReady;
}

exports.recordPayment = async (req, res) => {
    const tenant_id = String(req.user.tenant_id);
    const { id } = req.params;
    const { amount, payment_amount, payment_date, notes } = req.body;

    const payAmount = parseFloat(amount !== undefined ? amount : payment_amount);
    if (isNaN(payAmount) || payAmount <= 0) {
        return res.status(400).json({ status: 'error', message: 'Payment amount must be greater than 0.' });
    }

    try {
        await ensurePaymentColumns();
    } catch (ddlErr) {
        console.error('[Record Payment] schema check failed:', ddlErr.message);
        return res.status(500).json({ status: 'error', message: ddlErr.message });
    }

    const client = await db.connect();
    try {
        await client.query('BEGIN');

        // 1. Fetch and lock installment (explicitly lock ri to prevent outer join lock error)
        const instRes = await client.query(`
            SELECT ri.*, d.branch_id as deal_branch_id, rc.branch_id as contract_branch_id
            FROM re_installments ri
            LEFT JOIN deals d ON ri.deal_id = d.id
            LEFT JOIN re_contracts rc ON ri.contract_id = rc.id
            WHERE ri.id::text = $1::text AND ri.tenant_id::text = $2::text
            FOR UPDATE OF ri
        `, [id, tenant_id]);

        if (instRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ status: 'error', message: 'Installment not found or unauthorized.' });
        }

        const inst = instRes.rows[0];
        const branch_id = req.branchId || req.user?.branch_id || null;
        const instBranch = inst.branch_id || inst.deal_branch_id || inst.contract_branch_id;
        if (req.user?.role !== 'admin' && branch_id && instBranch && String(instBranch) !== String(branch_id)) {
            await client.query('ROLLBACK');
            return res.status(404).json({ status: 'error', message: 'Installment not found or unauthorized.' });
        }

        // A cancelled contract is closed: its refund was settled from the payments recorded at cancellation,
        // and deleteInstallment already treats Cancelled as closed. Share-lock the contract row so a
        // cancellation cannot commit between this check and the payment.
        if (inst.contract_id) {
            const csRes = await client.query(
                `SELECT status FROM re_contracts WHERE id::text = $1::text AND tenant_id::text = $2::text FOR SHARE`,
                [String(inst.contract_id), tenant_id]
            );
            if (csRes.rows.length > 0 && csRes.rows[0].status === 'Cancelled') {
                await client.query('ROLLBACK');
                return res.status(409).json({
                    status: 'error',
                    code: 'CONTRACT_CANCELLED',
                    message: 'Cannot record a payment on an installment of a Cancelled contract.'
                });
            }
        }

        const currentPaid = parseFloat(inst.paid_amount) || 0;
        const totalDue = parseFloat(inst.amount) || 0;
        const newPaidTotal = Number((currentPaid + payAmount).toFixed(2));

        if (newPaidTotal > totalDue + 0.01) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                status: 'error',
                message: `Payment amount (${payAmount}) exceeds remaining balance (${(totalDue - currentPaid).toFixed(2)}).`
            });
        }

        // Determine new status
        const isFull = newPaidTotal >= totalDue;
        const newStatus = isFull ? 'Paid' : 'Partially Paid';
        const paidAt = isFull ? (payment_date || new Date().toISOString()) : inst.paid_at;

        // (RE linkage columns on finance_vouchers / re_installments are ensured before the transaction.)

        // Fetch customer name for party_name
        let customerName = 'Real Estate Customer';
        let customerId = null;
        if (inst.deal_id) {
            try {
                const dealRes = await client.query(`
                    SELECT d.title, d.client_id, c.name as customer_name
                    FROM deals d
                    LEFT JOIN customers c ON d.client_id::text = c.id::text
                    WHERE d.id = $1
                `, [inst.deal_id]);
                if (dealRes.rows.length > 0) {
                    customerName = dealRes.rows[0].customer_name || dealRes.rows[0].title || 'Real Estate Customer';
                    customerId = dealRes.rows[0].client_id;
                }
            } catch (dErr) {
                console.warn('[Finance Link] Deal info lookup note:', dErr.message);
            }
        }

        // Generate authoritative receipt voucher number via shared concurrency-safe numbering service
        const { generateVoucherNumber } = require('../services/voucherNumbering');
        const voucherNumber = await generateVoucherNumber(tenant_id, req.branchId || null, 'receipt', client);
        const pDate = payment_date ? new Date(payment_date) : new Date();

        const treasury = await resolveCollectionTreasury(client, {
            tenant_id, branch_id: instBranch || branch_id,
            treasury_account_id: req.body.treasury_account_id,
            payment_method: req.body.payment_method
        });

        // 2. Authoritative Finance Receipt Voucher creation (money movement single source of truth)
        const voucherRes = await client.query(`
            INSERT INTO finance_vouchers (
                voucher_number, voucher_type, party_type, party_name,
                customer_id, deal_id, contract_id, installment_id,
                amount, payment_method, notes, voucher_date,
                created_by, tenant_id, branch_id, treasury_account_id, treasury_account
            ) VALUES ($1, 'receipt', 'customer', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
            RETURNING id, voucher_number
        `, [
            voucherNumber,
            customerName,
            customerId ? String(customerId) : null,
            inst.deal_id ? String(inst.deal_id) : null,
            inst.contract_id ? String(inst.contract_id) : null,
            String(inst.id),
            payAmount,
            req.body.payment_method || 'cash',
            notes || `Payment for Installment #${inst.installment_number}`,
            pDate,
            req.user?.id || null,
            tenant_id,
            instBranch || branch_id || null,
            treasury.id, treasury.name
        ]);

        const voucher = voucherRes.rows[0];

        // 3. Update installment with paid_amount derived from actual receipt
        const updatedRes = await client.query(`
            UPDATE re_installments SET
                paid_amount = $1,
                status = $2,
                paid_at = $3,
                last_voucher_id = $4,
                notes = COALESCE($5, notes),
                updated_at = NOW()
            WHERE id = $6 AND tenant_id::text = $7::text
            RETURNING *
        `, [newPaidTotal, newStatus, paidAt, voucher.id, notes, inst.id, tenant_id]);

        // 4. Best-effort cache synchronization with re_payments_mvp for legacy UI compatibility
        if (inst.deal_id) {
            const mvpCheck = await client.query(
                `SELECT id, total_amount, paid_amount FROM re_payments_mvp WHERE deal_id::text = $1::text AND tenant_id::text = $2::text`,
                [String(inst.deal_id), tenant_id]
            );
            if (mvpCheck.rows.length > 0) {
                await client.query(`
                    UPDATE re_payments_mvp SET
                        paid_amount = COALESCE(paid_amount, 0) + $1,
                        updated_at = NOW()
                    WHERE deal_id::text = $2::text AND tenant_id::text = $3::text
                `, [payAmount, String(inst.deal_id), tenant_id]);
            } else {
                // If deal was Closed (never won), create cache row so legacy readers don't show null/empty
                await client.query(`
                    INSERT INTO re_payments_mvp (
                        tenant_id, branch_id, deal_id, total_amount, paid_amount, status, created_at, updated_at
                    ) VALUES ($1, $2, $3, $4, $5, 'pending', NOW(), NOW())
                `, [
                    tenant_id,
                    req.branchId || null,
                    String(inst.deal_id),
                    inst.contract_value || inst.amount || payAmount,
                    payAmount
                ]);
            }
        }

        await client.query('COMMIT');

        res.json({
            status: 'success',
            message: `Payment of ${payAmount} recorded successfully (${newStatus}).`,
            data: updatedRes.rows[0]
        });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('[Record Installment Payment Error]:', err.message);
        res.status(err.status || 500).json({ status: 'error', message: err.status === 400 ? err.message : 'Failed to record installment payment. Please try again or contact support.' });
    } finally {
        client.release();
    }
};

// @desc    Payment history of an installment (source of truth: finance_vouchers)
// @route   GET /api/re-installments/:id/payments
exports.getInstallmentPayments = async (req, res) => {
    const tenant_id = String(req.user.tenant_id);
    const branch_id = (req.user?.role === 'admin')
        ? (req.query.branch_id || null)
        : (req.branchId || req.user?.branch_id || null);
    const { id } = req.params;
    try {
        const params = [id, tenant_id];
        const scope = await accessScopeService.buildScopePredicate({
            user: req.user, tableAlias: 'd', assigneeCol: 'assigned_to', paramIndex: 3
        });
        params.push(...scope.params);
        const instRes = await db.query(`
            SELECT ri.id, ri.branch_id, d.branch_id as deal_branch_id, rc.branch_id as contract_branch_id
            FROM re_installments ri
            JOIN re_contracts rc ON ri.contract_id = rc.id AND rc.tenant_id::text = ri.tenant_id::text
            JOIN deals d ON d.id = rc.deal_id AND d.tenant_id::text = rc.tenant_id::text
            WHERE ri.id::text = $1::text AND ri.tenant_id::text = $2::text AND (${scope.sql})
        `, params);
        if (instRes.rows.length === 0) {
            return res.status(404).json({ status: 'error', message: 'Installment not found or unauthorized.' });
        }
        const instRow = instRes.rows[0];
        const instBranch = instRow.branch_id || instRow.deal_branch_id || instRow.contract_branch_id;
        if (req.user?.role !== 'admin' && branch_id && instBranch && String(instBranch) !== String(branch_id)) {
            return res.status(404).json({ status: 'error', message: 'Installment not found or unauthorized.' });
        }
        let rows = [];
        try {
            const v = await db.query(`
                SELECT id, voucher_number, amount, payment_method, notes, voucher_date, created_at
                FROM finance_vouchers
                WHERE installment_id::text = $1::text AND tenant_id::text = $2::text
                ORDER BY voucher_date DESC, id DESC
            `, [id, tenant_id]);
            rows = v.rows;
        } catch (e) { /* installment_id column not yet created → no payments */ }
        res.json({ status: 'success', data: rows });
    } catch (err) {
        console.error('[Get Installment Payments Error]:', err.message);
        res.status(500).json({ status: 'error', message: err.message });
    }
};

// @desc    Delete an unpaid installment
// @route   DELETE /api/re-installments/:id
exports.deleteInstallment = async (req, res) => {
    const tenant_id = String(req.user.tenant_id);
    const branch_id = (req.user?.role === 'admin')
        ? null
        : (req.branchId || req.user?.branch_id || null);
    const { id } = req.params;

    // Read, checks and delete run in one transaction holding the installment row lock, so a payment
    // recorded at the same time (which locks the same row) cannot slip in between check and delete.
    const client = await db.connect();
    try {
        await client.query('BEGIN');
        const checkRes = await client.query(`
            SELECT ri.id, ri.paid_amount, ri.branch_id, ri.contract_id, ri.installment_number,
                   d.branch_id as deal_branch_id, rc.branch_id as contract_branch_id,
                   rc.status as contract_status
            FROM re_installments ri
            LEFT JOIN deals d ON ri.deal_id = d.id
            LEFT JOIN re_contracts rc ON ri.contract_id = rc.id
            WHERE ri.id::text = $1::text AND ri.tenant_id::text = $2::text
            FOR UPDATE OF ri
        `, [id, tenant_id]);

        const reject = async (code, body) => {
            await client.query('ROLLBACK');
            return res.status(code).json(body);
        };

        if (checkRes.rows.length === 0) {
            return await reject(404, { status: 'error', message: 'Installment not found or unauthorized.' });
        }

        const row = checkRes.rows[0];
        const instBranch = row.branch_id || row.deal_branch_id || row.contract_branch_id;
        if (branch_id && instBranch && String(instBranch) !== String(branch_id)) {
            return await reject(404, { status: 'error', message: 'Installment not found or unauthorized.' });
        }

        const contractStatus = row.contract_status || 'Draft';
        if (['Completed', 'Cancelled'].includes(contractStatus)) {
            return await reject(400, {
                status: 'error',
                message: `Cannot delete an installment from a '${contractStatus}' contract.`
            });
        }

        if (['Signed', 'Active'].includes(contractStatus) && req.user?.role !== 'admin') {
            return await reject(403, {
                status: 'error',
                message: `Cannot delete an installment from an approved contract (${contractStatus}). Requires admin authorization.`
            });
        }

        if (parseFloat(row.paid_amount) > 0) {
            return await reject(400, { status: 'error', message: 'Cannot delete an installment that has payments recorded.' });
        }

        // Check for official financial receipt vouchers (savepoint: older schemas may lack the column)
        await client.query('SAVEPOINT voucher_check');
        try {
            const voucherCheck = await client.query(`
                SELECT id FROM finance_vouchers
                WHERE installment_id::text = $1::text
                  AND tenant_id::text = $2::text
                  AND voucher_type = 'receipt'
                  AND (COALESCE(status, 'active') != 'cancelled')
                LIMIT 1
            `, [id, tenant_id]);
            await client.query('RELEASE SAVEPOINT voucher_check');
            if (voucherCheck.rows.length > 0) {
                return await reject(400, {
                    status: 'error',
                    message: 'Cannot delete an installment that has associated receipt vouchers.'
                });
            }
        } catch (vErr) {
            if (!vErr.message.includes('column') && !vErr.message.includes('does not exist')) {
                throw vErr;
            }
            await client.query('ROLLBACK TO SAVEPOINT voucher_check');
        }

        await client.query(`DELETE FROM re_installments WHERE id::text = $1::text AND tenant_id::text = $2::text`, [id, tenant_id]);
        await client.query('COMMIT');

        logDelete(req, 'Installment', id, { contract_id: row.contract_id, installment_number: row.installment_number });
        res.json({ status: 'success', message: 'Installment deleted successfully.' });
    } catch (err) {
        try { await client.query('ROLLBACK'); } catch (_) { /* already rolled back */ }
        console.error('[Delete Installment Error]:', err.message);
        res.status(500).json({ status: 'error', message: err.message });
    } finally {
        client.release();
    }
};
