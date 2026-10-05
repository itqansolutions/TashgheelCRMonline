/**
 * reInstallmentsController.js
 * Controller for Phase 2.3: Real Estate Payment Plans & Installment Schedules.
 */

const db = require('../config/db');

// Helper to add months to a Date
function addMonths(date, months) {
    const d = new Date(date);
    d.setMonth(d.getMonth() + months);
    return d.toISOString().split('T')[0];
}

// @desc    Get installments for a contract or deal
// @route   GET /api/re-installments
exports.getInstallments = async (req, res) => {
    const tenant_id = String(req.user.tenant_id);
    const { contract_id, deal_id } = req.query;

    try {
        let whereClause = `WHERE ri.tenant_id::text = $1::text`;
        const params = [tenant_id];

        if (contract_id) {
            params.push(contract_id);
            whereClause += ` AND ri.contract_id::text = $${params.length}::text`;
        } else if (deal_id) {
            params.push(parseInt(deal_id));
            whereClause += ` AND ri.deal_id = $${params.length}`;
        }

        const result = await db.query(`
            SELECT 
                ri.*,
                rc.contract_number,
                rc.contract_value,
                rc.status as contract_status,
                (ri.amount - ri.paid_amount) as remaining_balance
            FROM re_installments ri
            JOIN re_contracts rc ON ri.contract_id = rc.id AND rc.tenant_id::text = ri.tenant_id::text
            ${whereClause}
            ORDER BY ri.installment_number ASC
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
        start_date 
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

        // 1. Fetch contract with FOR UPDATE
        const contractRes = await client.query(`
            SELECT id, deal_id, contract_value, status
            FROM re_contracts
            WHERE id::text = $1::text AND tenant_id::text = $2::text
            FOR UPDATE
        `, [contract_id, tenant_id]);

        if (contractRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ status: 'error', message: 'Contract not found or unauthorized.' });
        }

        const contract = contractRes.rows[0];
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

        if (parseInt(paidCheck.rows[0].count) > 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                status: 'error',
                message: 'Cannot regenerate schedule: one or more installments have already been partially or fully paid.'
            });
        }

        // 3. Clear existing unpaid installments for this contract
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
            `, [contract.id, contract.deal_id, 0, dpDate, dpAmount, tenant_id, branch_id]);
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
                branch_id
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

        res.status(201).json({
            status: 'success',
            message: `Generated schedule of ${numInstallments} installment(s).`,
            data: generatedInstallments
        });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('[Generate Schedule Error]:', err.message);
        res.status(500).json({ status: 'error', message: err.message });
    } finally {
        client.release();
    }
};

// @desc    Record a payment towards an installment
// @route   POST /api/re-installments/:id/pay
exports.recordPayment = async (req, res) => {
    const tenant_id = String(req.user.tenant_id);
    const { id } = req.params;
    const { amount, payment_date, notes } = req.body;

    const payAmount = parseFloat(amount);
    if (isNaN(payAmount) || payAmount <= 0) {
        return res.status(400).json({ status: 'error', message: 'Payment amount must be greater than 0.' });
    }

    const client = await db.connect();
    try {
        await client.query('BEGIN');

        // 1. Fetch and lock installment
        const instRes = await client.query(`
            SELECT * FROM re_installments
            WHERE id::text = $1::text AND tenant_id::text = $2::text
            FOR UPDATE
        `, [id, tenant_id]);

        if (instRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ status: 'error', message: 'Installment not found or unauthorized.' });
        }

        const inst = instRes.rows[0];
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

        // Ensure finance_vouchers has RE linkage columns
        await client.query(`ALTER TABLE finance_vouchers ADD COLUMN IF NOT EXISTS deal_id VARCHAR(255)`);
        await client.query(`ALTER TABLE finance_vouchers ADD COLUMN IF NOT EXISTS contract_id VARCHAR(255)`);
        await client.query(`ALTER TABLE finance_vouchers ADD COLUMN IF NOT EXISTS installment_id VARCHAR(255)`);
        await client.query(`ALTER TABLE re_installments ADD COLUMN IF NOT EXISTS last_voucher_id INTEGER`);

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

        // 2. Authoritative Finance Receipt Voucher creation (money movement single source of truth)
        const voucherRes = await client.query(`
            INSERT INTO finance_vouchers (
                voucher_number, voucher_type, party_type, party_name,
                customer_id, deal_id, contract_id, installment_id,
                amount, payment_method, notes, voucher_date,
                created_by, tenant_id, branch_id
            ) VALUES ($1, 'receipt', 'customer', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
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
            req.branchId || null
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

        // 4. Sync with re_payments_mvp for backward compatibility
        if (inst.deal_id) {
            await client.query(`
                UPDATE re_payments_mvp SET
                    paid_amount = COALESCE(paid_amount, 0) + $1,
                    updated_at = NOW()
                WHERE deal_id::text = $2::text AND tenant_id::text = $3::text
            `, [payAmount, String(inst.deal_id), tenant_id]);
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
        res.status(500).json({ status: 'error', message: err.message });
    } finally {
        client.release();
    }
};

// @desc    Delete an unpaid installment
// @route   DELETE /api/re-installments/:id
exports.deleteInstallment = async (req, res) => {
    const tenant_id = String(req.user.tenant_id);
    const { id } = req.params;

    try {
        const checkRes = await db.query(`
            SELECT id, paid_amount FROM re_installments
            WHERE id::text = $1::text AND tenant_id::text = $2::text
        `, [id, tenant_id]);

        if (checkRes.rows.length === 0) {
            return res.status(404).json({ status: 'error', message: 'Installment not found or unauthorized.' });
        }

        if (parseFloat(checkRes.rows[0].paid_amount) > 0) {
            return res.status(400).json({ status: 'error', message: 'Cannot delete an installment that has payments recorded.' });
        }

        await db.query(`DELETE FROM re_installments WHERE id::text = $1::text AND tenant_id::text = $2::text`, [id, tenant_id]);

        res.json({ status: 'success', message: 'Installment deleted successfully.' });
    } catch (err) {
        console.error('[Delete Installment Error]:', err.message);
        res.status(500).json({ status: 'error', message: err.message });
    }
};
