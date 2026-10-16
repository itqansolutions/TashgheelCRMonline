const crypto = require('crypto');
/**
 * reCommissionsController.js
 * Controller for Phase 2.4: Real Estate Agent / Broker Commissions
 */

const db = require('../config/db');
const accessScopeService = require('../services/accessScopeService');

// @desc    Get commissions list with summary
// @route   GET /api/re-commissions
exports.getCommissions = async (req, res) => {
    const tenant_id = String(req.user.tenant_id);
    const userRole = req.user.role;
    const { deal_id, contract_id, beneficiary_user_id, status } = req.query;

    try {
        let whereClause = `WHERE rc.tenant_id::text = $1::text`;
        const params = [tenant_id];

        // 1. RBAC Check on requested beneficiary_user_id
        if (beneficiary_user_id) {
            const targetBeneficiaryId = parseInt(beneficiary_user_id, 10);
            if (['sales', 'agent', 'employee'].includes(userRole) && targetBeneficiaryId !== req.user.id) {
                return res.status(403).json({
                    status: 'error',
                    message: 'Unauthorized: You can only view your own commissions.'
                });
            } else if (userRole !== 'admin' && targetBeneficiaryId !== req.user.id) {
                const accessibleDeptIds = await accessScopeService.getAccessibleDepartmentIds(req.user);
                const uRes = await db.query(
                    'SELECT department_id FROM users WHERE id = $1 AND tenant_id::text = $2::text',
                    [targetBeneficiaryId, tenant_id]
                );
                if (uRes.rows.length === 0 || !accessibleDeptIds || !accessibleDeptIds.includes(uRes.rows[0].department_id)) {
                    return res.status(403).json({
                        status: 'error',
                        message: 'You are not authorized to view commissions for this user.'
                    });
                }
            }
            params.push(targetBeneficiaryId);
            whereClause += ` AND rc.beneficiary_user_id = $${params.length}`;
        }

        // 2. Strict Branch Scope for Non-Admin
        if (userRole !== 'admin') {
            const enforcedBranchId = req.branchId || req.user?.branch_id || null;
            if (enforcedBranchId) {
                params.push(String(enforcedBranchId));
                whereClause += ` AND (rc.branch_id::text = $${params.length}::text OR rc.branch_id IS NULL)`;
            }
        }

        if (deal_id) {
            params.push(parseInt(deal_id));
            whereClause += ` AND rc.deal_id = $${params.length}`;
        }
        if (contract_id) {
            params.push(contract_id);
            whereClause += ` AND rc.contract_id::text = $${params.length}::text`;
        }
        if (status) {
            params.push(status);
            whereClause += ` AND rc.status = $${params.length}`;
        }

        // Row-level scope: deal visibility, or the current user is the beneficiary
        const scope = await accessScopeService.buildScopePredicate({
            user: req.user, tableAlias: 'd', assigneeCol: 'assigned_to', paramIndex: params.length + 1
        });
        params.push(...scope.params);
        params.push(String(req.user.id));
        whereClause += ` AND ((${scope.sql}) OR rc.beneficiary_user_id::text = $${params.length}::text)`;

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
        trigger_event = 'contract_signing', // 'contract_signing', 'down_payment', 'installment_collection'
        notes
    } = req.body;

    if (!deal_id) {
        return res.status(400).json({ status: 'error', message: 'deal_id is required.' });
    }

    const validTriggers = ['contract_signing', 'down_payment', 'installment_collection'];
    const finalTrigger = validTriggers.includes(trigger_event) ? trigger_event : 'contract_signing';

    try {
        await db.query(`ALTER TABLE re_commissions ADD COLUMN IF NOT EXISTS trigger_event VARCHAR(100) DEFAULT 'contract_signing';`);

        // 1. Verify Deal
        const dealRes = await db.query(`
            SELECT id, title, value, assigned_to, branch_id
            FROM deals
            WHERE id = $1 AND tenant_id::text = $2::text
        `, [parseInt(deal_id), tenant_id]);

        if (dealRes.rows.length === 0) {
            return res.status(404).json({ status: 'error', message: 'Deal not found or unauthorized.' });
        }

        const deal = dealRes.rows[0];
        const effectiveBranch = branch_id || deal.branch_id || null;
        if (req.user?.role !== 'admin' && branch_id && deal.branch_id && String(deal.branch_id) !== String(branch_id)) {
            return res.status(404).json({ status: 'error', message: 'Deal not found or unauthorized.' });
        }

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

        // 2.5. Idempotency Check: Prevent duplicate active commission for same deal, beneficiary, and trigger
        const existingRes = await db.query(`
            SELECT id, calculated_amount, status, trigger_event, beneficiary_name FROM re_commissions
            WHERE deal_id = $1 AND tenant_id::text = $2::text
              AND (
                  (beneficiary_user_id IS NOT NULL AND beneficiary_user_id = $3)
                  OR (beneficiary_user_id IS NULL AND beneficiary_name = $4)
              )
              AND trigger_event = $5
              AND status NOT IN ('Cancelled', 'Clawback')
            LIMIT 1
        `, [deal.id, tenant_id, userId, name, finalTrigger]);

        if (existingRes.rows.length > 0) {
            return res.status(200).json({
                status: 'success',
                message: `Commission record already exists for ${name} under trigger '${finalTrigger}'.`,
                data: existingRes.rows[0]
            });
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
                calculated_amount, paid_amount, status, trigger_event, notes, tenant_id, branch_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 0, 'Pending', $10, $11, $12, $13)
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
            finalTrigger,
            notes,
            tenant_id,
            effectiveBranch
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

// @desc    Update commission status (Approve, Earned, Cancel, Clawback)
// @route   PATCH /api/re-commissions/:id/status
exports.updateCommissionStatus = async (req, res) => {
    const tenant_id = String(req.user.tenant_id);
    const { id } = req.params;
    const { status, reason, notes, treasury_account_id, reverse_voucher } = req.body;

    // 1. Direct status update to Paid or Partially Paid is forbidden
    if (status === 'Paid' || status === 'Partially Paid') {
        return res.status(400).json({
            status: 'error',
            message: "Direct status transition to 'Paid' is prohibited. Use the payout endpoint (POST /api/re-commissions/:id/pay)."
        });
    }

    const allowed = ['Pending', 'Earned', 'Approved', 'Cancelled', 'Clawback'];
    if (!status || !allowed.includes(status)) {
        return res.status(400).json({ status: 'error', message: `Invalid status. Allowed: ${allowed.join(', ')}` });
    }

    try {
        const commRes = await db.query(`
            SELECT id, status, paid_amount, calculated_amount, trigger_event, contract_id, deal_id, branch_id, beneficiary_name, beneficiary_type
            FROM re_commissions
            WHERE id::text = $1::text AND tenant_id::text = $2::text
        `, [id, tenant_id]);

        if (commRes.rows.length === 0) {
            return res.status(404).json({ status: 'error', message: 'Commission not found or unauthorized.' });
        }

        const comm = commRes.rows[0];

        // 1. Direct status update to Paid or Partially Paid is forbidden
        if (status === 'Paid' || status === 'Partially Paid') {
            return res.status(400).json({
                status: 'error',
                message: "Direct status transition to 'Paid' is prohibited. Use the payout endpoint (POST /api/re-commissions/:id/pay)."
            });
        }

        // 2. Terminal states check
        if (comm.status === 'Cancelled' || comm.status === 'Clawback') {
            return res.status(400).json({
                status: 'error',
                message: `Cannot modify a commission in '${comm.status}' status.`
            });
        }

        // 3. Paid commissions can only transition to 'Clawback'
        const hasPayments = parseFloat(comm.paid_amount) > 0;
        if (hasPayments && status !== 'Clawback') {
            return res.status(400).json({
                status: 'error',
                message: `Cannot transition a commission with recorded payments to '${status}'. Only 'Clawback' is permitted.`
            });
        }

        // 4. Handle Clawback Transition
        if (status === 'Clawback') {
            if (!hasPayments) {
                return res.status(400).json({
                    status: 'error',
                    message: "Unpaid commission should be marked 'Cancelled', not 'Clawback'."
                });
            }
            const clawbackReason = reason || notes || '';
            if (!clawbackReason.trim()) {
                return res.status(400).json({
                    status: 'error',
                    message: 'Clawback requires a documented reason.'
                });
            }

            let reversalVoucher = null;
            if (reverse_voucher === true) {
                const client = await db.connect();
                try {
                    await client.query('BEGIN');
                    await client.query(`SELECT pg_advisory_xact_lock(hashtext('re_comm_claw:' || $1::text))`, [String(comm.id)]);

                    const refNo = `CLAWBACK-COMM-${comm.id}`;
                    const existingV = await client.query(`
                        SELECT id, voucher_number, amount, status FROM finance_vouchers
                        WHERE tenant_id::text = $1::text AND reference_no = $2 AND voucher_type = 'receipt'
                        LIMIT 1
                    `, [tenant_id, refNo]);

                    if (existingV.rows.length > 0) {
                        reversalVoucher = existingV.rows[0];
                    } else {
                        let resolvedTaId = treasury_account_id || null;
                        let resolvedTaName = null;
                        if (resolvedTaId) {
                            const taCheck = await client.query(`
                                SELECT id, name FROM treasury_accounts
                                WHERE id = $1 AND tenant_id::text = $2::text AND is_active = true
                            `, [resolvedTaId, tenant_id]);
                            if (taCheck.rows.length) {
                                resolvedTaId = taCheck.rows[0].id;
                                resolvedTaName = taCheck.rows[0].name;
                            }
                        }
                        if (!resolvedTaId) {
                            const defaultTa = await client.query(`
                                SELECT id, name FROM treasury_accounts
                                WHERE tenant_id::text = $1::text AND is_default = true AND is_active = true
                                LIMIT 1
                            `, [tenant_id]);
                            if (defaultTa.rows.length) {
                                resolvedTaId = defaultTa.rows[0].id;
                                resolvedTaName = defaultTa.rows[0].name;
                            }
                        }

                        const { generateVoucherNumber } = require('../services/voucherNumbering');
                        const vNum = await generateVoucherNumber(tenant_id, comm.branch_id, 'receipt', client);

                        const vRes = await client.query(`
                            INSERT INTO finance_vouchers (
                                voucher_number, voucher_type, party_type, party_name,
                                deal_id, contract_id, amount, payment_method,
                                treasury_account, treasury_account_id, reference_no,
                                notes, voucher_date, created_by, tenant_id, branch_id, status
                            ) VALUES ($1, 'receipt', $2, $3, $4, $5, $6, 'cash', $7, $8, $9, $10, CURRENT_DATE, $11, $12, $13, 'active')
                            RETURNING *
                        `, [
                            vNum,
                            comm.beneficiary_type === 'broker' ? 'broker' : 'employee',
                            comm.beneficiary_name || 'Agent',
                            comm.deal_id ? String(comm.deal_id) : null,
                            comm.contract_id ? String(comm.contract_id) : null,
                            parseFloat(comm.paid_amount),
                            resolvedTaName,
                            resolvedTaId,
                            refNo,
                            `Clawback reversal: ${clawbackReason}`,
                            req.user.id,
                            tenant_id,
                            comm.branch_id ? String(comm.branch_id) : null
                        ]);
                        reversalVoucher = vRes.rows[0];
                    }

                    await client.query(`
                        UPDATE re_commissions SET
                            status = 'Clawback',
                            notes = COALESCE(notes, '') || ' [Clawback: ' || $1 || ']',
                            updated_at = NOW()
                        WHERE id = $2 AND tenant_id::text = $3::text
                    `, [clawbackReason, comm.id, tenant_id]);

                    await client.query('COMMIT');
                } catch (e) {
                    await client.query('ROLLBACK');
                    throw e;
                } finally {
                    client.release();
                }
            } else {
                await db.query(`
                    UPDATE re_commissions SET
                        status = 'Clawback',
                        notes = COALESCE(notes, '') || ' [Clawback: ' || $1 || ']',
                        updated_at = NOW()
                    WHERE id = $2 AND tenant_id::text = $3::text
                `, [clawbackReason, comm.id, tenant_id]);
            }

            const updatedComm = await db.query(`SELECT * FROM re_commissions WHERE id = $1`, [comm.id]);
            return res.json({
                status: 'success',
                message: `Commission marked as Clawback (${clawbackReason}).`,
                data: updatedComm.rows[0],
                voucher: reversalVoucher
            });
        }

        // 5. Verify trigger conditions before marking as Approved or Earned
        if (status === 'Approved' || status === 'Earned') {
            if (comm.contract_id) {
                const contractRes = await db.query(`
                    SELECT id, contract_value, down_payment, status FROM re_contracts
                    WHERE id = $1 AND tenant_id::text = $2::text
                `, [comm.contract_id, tenant_id]);

                if (contractRes.rows.length === 0) {
                    return res.status(404).json({ status: 'error', message: 'Associated contract not found.' });
                }

                const contract = contractRes.rows[0];
                const cStatus = contract.status;

                if (comm.trigger_event === 'contract_signing') {
                    if (!['Signed', 'Active', 'Completed'].includes(cStatus)) {
                        return res.status(400).json({
                            status: 'error',
                            message: `Contract signing trigger condition not met. Contract status is '${cStatus}', must be Signed, Active, or Completed.`
                        });
                    }
                } else if (comm.trigger_event === 'down_payment') {
                    const requiredDp = parseFloat(contract.down_payment) || 0;
                    // Check verified collections from authoritative finance_vouchers
                    const voucherRes = await db.query(`
                        SELECT COALESCE(SUM(amount), 0) as total_vouchers
                        FROM finance_vouchers
                        WHERE tenant_id::text = $1::text
                          AND voucher_type = 'receipt'
                          AND (COALESCE(status, 'active') != 'cancelled')
                          AND (contract_id::text = $2::text OR deal_id::text = $3::text)
                    `, [tenant_id, String(contract.id), String(comm.deal_id)]);
                    const totalVouchers = parseFloat(voucherRes.rows[0].total_vouchers) || 0;
                    if (totalVouchers < requiredDp) {
                        return res.status(400).json({
                            status: 'error',
                            message: `Down payment trigger condition not met. Required down payment: ${requiredDp} EGP, Verified collections: ${totalVouchers} EGP.`
                        });
                    }
                } else if (comm.trigger_event === 'installment_collection') {
                    // Check actual cash collected via verified receipt vouchers
                    const voucherRes = await db.query(`
                        SELECT COALESCE(SUM(amount), 0) as total_collected
                        FROM finance_vouchers
                        WHERE tenant_id::text = $1::text
                          AND voucher_type = 'receipt'
                          AND (COALESCE(status, 'active') != 'cancelled')
                          AND (contract_id::text = $2::text OR deal_id::text = $3::text)
                    `, [tenant_id, String(contract.id), String(comm.deal_id)]);
                    const totalCollected = parseFloat(voucherRes.rows[0].total_collected) || 0;
                    if (totalCollected <= 0) {
                        return res.status(400).json({
                            status: 'error',
                            message: 'Installment collection trigger not met: no verified payments collected yet.'
                        });
                    }
                }
            } else if (comm.trigger_event === 'contract_signing' || comm.trigger_event === 'down_payment') {
                return res.status(400).json({
                    status: 'error',
                    message: `Cannot approve commission under trigger '${comm.trigger_event}' without an associated contract.`
                });
            }
        }

        const approvalDate = (status === 'Approved' || status === 'Earned') ? new Date().toISOString().split('T')[0] : null;

        const updateRes = await db.query(`
            UPDATE re_commissions SET
                status = $1,
                approval_date = COALESCE($2, approval_date),
                notes = COALESCE($3, notes),
                updated_at = NOW()
            WHERE id = $4 AND tenant_id::text = $5::text
            RETURNING *
        `, [status, approvalDate, notes, comm.id, tenant_id]);

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
    const {
        amount,
        payment_date,
        notes,
        payment_method = 'cash',
        treasury_account_id,
        idempotency_key,
        reference_no
    } = req.body;

    const payAmt = parseFloat(amount);
    if (isNaN(payAmt) || payAmt <= 0) {
        return res.status(400).json({ status: 'error', message: 'Payment amount must be greater than 0.' });
    }

    const client = await db.connect();
    try {
        await client.query('BEGIN');

        // Advisory transaction lock to serialize payout on this commission
        await client.query(`SELECT pg_advisory_xact_lock(hashtext('re_comm_pay:' || $1::text))`, [String(id)]);

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

        if (comm.status !== 'Approved' && comm.status !== 'Earned' && comm.status !== 'Partially Paid') {
            await client.query('ROLLBACK');
            return res.status(400).json({
                status: 'error',
                message: `Commission must be in 'Approved' or 'Earned' status to record payment (current: ${comm.status}).`
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

        // Trigger condition check for proportional installment collection
        if (comm.trigger_event === 'installment_collection' && comm.contract_id) {
            const contractRes = await client.query(`
                SELECT contract_value FROM re_contracts WHERE id = $1 AND tenant_id::text = $2::text
            `, [comm.contract_id, tenant_id]);

            if (contractRes.rows.length > 0) {
                const contractVal = parseFloat(contractRes.rows[0].contract_value) || 0;
                if (contractVal > 0) {
                    const voucherRes = await client.query(`
                        SELECT COALESCE(SUM(amount), 0) as total_collected
                        FROM finance_vouchers
                        WHERE tenant_id::text = $1::text
                          AND voucher_type = 'receipt'
                          AND (COALESCE(status, 'active') != 'cancelled')
                          AND (contract_id::text = $2::text OR deal_id::text = $3::text)
                    `, [tenant_id, String(comm.contract_id), String(comm.deal_id)]);
                    const totalCollected = parseFloat(voucherRes.rows[0].total_collected) || 0;
                    const ratio = Math.min(1.0, totalCollected / contractVal);
                    const maxEligible = Number((totalCalculated * ratio).toFixed(2));

                    if (newPaidTotal > maxEligible + 0.01) {
                        await client.query('ROLLBACK');
                        return res.status(400).json({
                            status: 'error',
                            message: `Payment amount (${newPaidTotal} EGP) exceeds currently earned proportional amount (${maxEligible} EGP) based on verified collections (${totalCollected} / ${contractVal} EGP).`
                        });
                    }
                }
            }
        }

        // Idempotency check: Client-supplied key or deterministic unique operation token
        const rawClientKey = idempotency_key || req.headers?.['idempotency-key'] || reference_no || null;
        const refNo = rawClientKey
            ? (String(rawClientKey).startsWith('COMM-PAY-') ? String(rawClientKey) : `COMM-PAY-${rawClientKey}`)
            : `COMM-PAY-${comm.id}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

        // Verify if voucher already recorded for this reference_no
        const existingVoucherRes = await client.query(`
            SELECT id, voucher_number, amount, status FROM finance_vouchers
            WHERE tenant_id::text = $1::text
              AND voucher_type = 'payment'
              AND reference_no = $2
              AND (COALESCE(status, 'active') != 'cancelled')
            LIMIT 1
        `, [tenant_id, refNo]);

        if (existingVoucherRes.rows.length > 0) {
            await client.query('ROLLBACK');
            return res.status(200).json({
                status: 'success',
                message: 'Commission payout was already recorded; returning existing voucher without duplicate charges.',
                data: comm,
                voucher: existingVoucherRes.rows[0]
            });
        }

        // Resolve Treasury Account
        let resolvedTreasuryId = null;
        let resolvedTreasuryName = null;
        if (treasury_account_id) {
            const taCheck = await client.query(`
                SELECT id, name, branch_id FROM treasury_accounts
                WHERE id = $1 AND tenant_id::text = $2::text AND is_active = true
            `, [treasury_account_id, tenant_id]);
            if (taCheck.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(400).json({ status: 'error', message: 'Selected treasury account is invalid or inactive.' });
            }
            if (comm.branch_id && taCheck.rows[0].branch_id && String(taCheck.rows[0].branch_id) !== String(comm.branch_id)) {
                await client.query('ROLLBACK');
                return res.status(403).json({ status: 'error', message: 'Unauthorized access to the selected treasury account branch.' });
            }
            resolvedTreasuryId = taCheck.rows[0].id;
            resolvedTreasuryName = taCheck.rows[0].name;
        }

        if (!resolvedTreasuryId) {
            const accType = (payment_method === 'bank_transfer' || payment_method === 'card' || payment_method === 'check') ? 'bank' : 'cash';
            const defaultTa = await client.query(`
                SELECT id, name FROM treasury_accounts
                WHERE tenant_id::text = $1::text
                  AND ($2::text IS NULL OR branch_id::text = $2::text OR branch_id IS NULL)
                  AND type = $3 AND is_default = true AND is_active = true
                LIMIT 1
            `, [tenant_id, comm.branch_id ? String(comm.branch_id) : null, accType]);
            if (defaultTa.rows.length > 0) {
                resolvedTreasuryId = defaultTa.rows[0].id;
                resolvedTreasuryName = defaultTa.rows[0].name;
            }
        }

        const { generateVoucherNumber } = require('../services/voucherNumbering');
        const voucherNumber = await generateVoucherNumber(tenant_id, comm.branch_id, 'payment', client);

        // Insert official payment voucher in finance_vouchers
        const vRes = await client.query(`
            INSERT INTO finance_vouchers (
                voucher_number, voucher_type, party_type, party_name,
                deal_id, contract_id, amount, payment_method,
                treasury_account, treasury_account_id, reference_no,
                notes, voucher_date, created_by, tenant_id, branch_id, status
            ) VALUES (
                $1, 'payment', $2, $3,
                $4, $5, $6, $7,
                $8, $9, $10,
                $11, $12, $13, $14, $15, 'active'
            ) RETURNING *
        `, [
            voucherNumber,
            comm.beneficiary_type === 'broker' ? 'broker' : 'employee',
            comm.beneficiary_name || 'Commission Beneficiary',
            comm.deal_id ? String(comm.deal_id) : null,
            comm.contract_id ? String(comm.contract_id) : null,
            payAmt,
            payment_method || 'cash',
            resolvedTreasuryName,
            resolvedTreasuryId,
            refNo,
            notes || `صرف عمولة صفقة #${comm.deal_id} للمستفيد ${comm.beneficiary_name}`,
            payment_date || new Date().toISOString().split('T')[0],
            req.user.id,
            tenant_id,
            comm.branch_id ? String(comm.branch_id) : null
        ]);

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

        res.status(201).json({
            status: 'success',
            message: `Commission payment of ${payAmt} EGP recorded successfully (${newStatus}).`,
            data: updatedRes.rows[0],
            voucher: vRes.rows[0]
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
            SELECT id, paid_amount, status FROM re_commissions
            WHERE id::text = $1::text AND tenant_id::text = $2::text
        `, [id, tenant_id]);

        if (checkRes.rows.length === 0) {
            return res.status(404).json({ status: 'error', message: 'Commission not found or unauthorized.' });
        }

        const comm = checkRes.rows[0];

        if (comm.status === 'Clawback') {
            return res.status(400).json({
                status: 'error',
                message: 'Cannot delete a clawbacked commission; historical audit record must be preserved.'
            });
        }

        if (comm.status === 'Paid' || parseFloat(comm.paid_amount) > 0) {
            return res.status(400).json({
                status: 'error',
                message: 'Cannot delete commission with payments recorded.'
            });
        }

        // Check if any payment vouchers exist
        const voucherRes = await db.query(`
            SELECT id FROM finance_vouchers
            WHERE reference_no LIKE 'COMM-PAY-' || $1 || '%'
              AND tenant_id::text = $2::text
              AND voucher_type = 'payment'
              AND (COALESCE(status, 'active') != 'cancelled')
            LIMIT 1
        `, [id, tenant_id]);

        if (voucherRes.rows.length > 0) {
            return res.status(400).json({
                status: 'error',
                message: 'Cannot delete commission with associated payment vouchers.'
            });
        }

        await db.query(`DELETE FROM re_commissions WHERE id::text = $1::text AND tenant_id::text = $2::text`, [id, tenant_id]);

        res.json({ status: 'success', message: 'Commission deleted successfully.' });
    } catch (err) {
        console.error('[Delete Commission Error]:', err.message);
        res.status(500).json({ status: 'error', message: err.message });
    }
};
