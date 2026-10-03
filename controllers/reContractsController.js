const db = require('../config/db');

/**
 * Real Estate Contracts Controller (Phase 2.2)
 * Manages lightweight sales contracts tied to Won Real Estate Deals
 */

const ALLOWED_STATUSES = ['Draft', 'Generated', 'Signed', 'Active', 'Completed', 'Cancelled'];

const VALID_TRANSITIONS = {
    'Draft': ['Generated', 'Cancelled'],
    'Generated': ['Signed', 'Cancelled'],
    'Signed': ['Active', 'Cancelled'],
    'Active': ['Completed', 'Cancelled'],
    'Completed': [],
    'Cancelled': []
};

// Generate human-readable contract number: REC-YYYYMM-XXXX
function generateContractNumber() {
    const d = new Date();
    const yyyymm = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
    const rand = Math.floor(1000 + Math.random() * 9000);
    return `REC-${yyyymm}-${rand}`;
}

// @desc    Get all real estate contracts
// @route   GET /api/re-contracts
exports.getContracts = async (req, res) => {
    const tenant_id = String(req.user.tenant_id);
    const branch_id = req.branchId || req.user?.branch_id || null;
    const { status, deal_id, customer_id, unit_id } = req.query;

    try {
        let query = `
            SELECT 
                rc.*,
                d.title as deal_title,
                d.pipeline_stage as deal_stage,
                c.name as customer_name,
                c.phone as customer_phone,
                c.email as customer_email,
                ru.name as unit_name,
                ru.unit_number,
                ru.project_name,
                ru.status as unit_status
            FROM re_contracts rc
            JOIN deals d ON rc.deal_id = d.id AND d.tenant_id::text = rc.tenant_id::text
            LEFT JOIN customers c ON rc.customer_id = c.id
            LEFT JOIN re_units ru ON rc.unit_id::text = ru.id::text AND ru.tenant_id::text = rc.tenant_id::text
            WHERE rc.tenant_id::text = $1::text
            AND ($2::text IS NULL OR rc.branch_id::text = $2::text OR rc.branch_id IS NULL)
        `;
        const params = [tenant_id, branch_id ? String(branch_id) : null];

        if (status) {
            params.push(status);
            query += ` AND rc.status = $${params.length}`;
        }
        if (deal_id) {
            params.push(deal_id);
            query += ` AND rc.deal_id = $${params.length}`;
        }
        if (customer_id) {
            params.push(customer_id);
            query += ` AND rc.customer_id = $${params.length}`;
        }
        if (unit_id) {
            params.push(String(unit_id));
            query += ` AND rc.unit_id::text = $${params.length}::text`;
        }

        query += ` ORDER BY rc.created_at DESC`;

        const result = await db.query(query, params);
        res.json({ status: 'success', data: result.rows });
    } catch (err) {
        console.error('[Get Contracts Error]:', err.message);
        res.status(500).json({ status: 'error', message: err.message });
    }
};

// @desc    Get contract by ID
// @route   GET /api/re-contracts/:id
exports.getContractById = async (req, res) => {
    const tenant_id = String(req.user.tenant_id);
    const { id } = req.params;

    try {
        const result = await db.query(`
            SELECT 
                rc.*,
                d.title as deal_title,
                d.pipeline_stage as deal_stage,
                c.name as customer_name,
                c.phone as customer_phone,
                c.email as customer_email,
                ru.name as unit_name,
                ru.unit_number,
                ru.project_name,
                ru.status as unit_status
            FROM re_contracts rc
            JOIN deals d ON rc.deal_id = d.id AND d.tenant_id::text = rc.tenant_id::text
            LEFT JOIN customers c ON rc.customer_id = c.id
            LEFT JOIN re_units ru ON rc.unit_id::text = ru.id::text AND ru.tenant_id::text = rc.tenant_id::text
            WHERE rc.id::text = $1::text AND rc.tenant_id::text = $2::text
        `, [id, tenant_id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ status: 'error', message: 'Contract not found or unauthorized.' });
        }

        res.json({ status: 'success', data: result.rows[0] });
    } catch (err) {
        console.error('[Get Contract By ID Error]:', err.message);
        res.status(500).json({ status: 'error', message: err.message });
    }
};

// @desc    Create contract for a deal
// @route   POST /api/re-contracts
exports.createContract = async (req, res) => {
    const tenant_id = String(req.user.tenant_id);
    const branch_id = req.branchId || req.user?.branch_id || null;
    const { deal_id, contract_date, contract_value, down_payment, notes } = req.body;

    if (!deal_id) {
        return res.status(400).json({ status: 'error', message: 'Deal ID is required.' });
    }

    try {
        // 1. Fetch and validate Deal
        const dealRes = await db.query(`
            SELECT id, title, value, pipeline_stage, client_id, unit_id, branch_id
            FROM deals
            WHERE id = $1 AND tenant_id::text = $2::text
        `, [parseInt(deal_id), tenant_id]);

        if (dealRes.rows.length === 0) {
            return res.status(404).json({ status: 'error', message: 'Deal not found or unauthorized.' });
        }

        const deal = dealRes.rows[0];

        // 2. Prevent duplicate contract for same deal
        const existingRes = await db.query(`
            SELECT id, contract_number, status FROM re_contracts WHERE deal_id = $1 AND tenant_id::text = $2::text
        `, [deal.id, tenant_id]);

        if (existingRes.rows.length > 0) {
            return res.status(409).json({
                status: 'error',
                message: `A contract already exists for this deal (${existingRes.rows[0].contract_number}, status: ${existingRes.rows[0].status}).`
            });
        }

        // 3. Calculate Financials
        const totalValue = contract_value !== undefined && !isNaN(Number(contract_value))
            ? Number(Number(contract_value).toFixed(2))
            : Number(Number(deal.value || 0).toFixed(2));

        let dp = 0;
        if (down_payment !== undefined && !isNaN(Number(down_payment))) {
            dp = Number(Number(down_payment).toFixed(2));
        } else {
            // Check re_payments_mvp if down payment was recorded
            const payRes = await db.query(`SELECT down_payment FROM re_payments_mvp WHERE deal_id::text = $1::text`, [String(deal.id)]);
            if (payRes.rows.length > 0 && payRes.rows[0].down_payment) {
                dp = Number(Number(payRes.rows[0].down_payment).toFixed(2));
            }
        }

        const remaining = Math.max(0, Number((totalValue - dp).toFixed(2)));
        const contractNumber = generateContractNumber();
        const dateVal = contract_date || new Date().toISOString().split('T')[0];

        const insertRes = await db.query(`
            INSERT INTO re_contracts (
                contract_number, deal_id, customer_id, unit_id, contract_date,
                contract_value, down_payment, remaining_amount, status, notes,
                tenant_id, branch_id, created_by
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'Draft', $9, $10, $11, $12)
            RETURNING *
        `, [
            contractNumber,
            deal.id,
            deal.client_id || null,
            deal.unit_id || null,
            dateVal,
            totalValue,
            dp,
            remaining,
            notes || null,
            tenant_id,
            deal.branch_id || branch_id || null,
            req.user?.name || req.user?.id || 'SYSTEM'
        ]);

        res.status(201).json({ status: 'success', data: insertRes.rows[0] });
    } catch (err) {
        console.error('[Create Contract Error]:', err.message);
        res.status(500).json({ status: 'error', message: err.message });
    }
};

// @desc    Update contract status (lifecycle transition)
// @route   PATCH /api/re-contracts/:id/status
exports.updateContractStatus = async (req, res) => {
    const tenant_id = String(req.user.tenant_id);
    const { id } = req.params;
    const { status: targetStatus } = req.body;

    if (!targetStatus || !ALLOWED_STATUSES.includes(targetStatus)) {
        return res.status(400).json({
            status: 'error',
            message: `Invalid status. Allowed values: ${ALLOWED_STATUSES.join(', ')}`
        });
    }

    try {
        const curRes = await db.query(`
            SELECT id, status, contract_number, deal_id, unit_id
            FROM re_contracts
            WHERE id::text = $1::text AND tenant_id::text = $2::text
        `, [id, tenant_id]);

        if (curRes.rows.length === 0) {
            return res.status(404).json({ status: 'error', message: 'Contract not found or unauthorized.' });
        }

        const contract = curRes.rows[0];
        const currentStatus = contract.status;

        // Check if same status
        if (currentStatus === targetStatus) {
            return res.json({ status: 'success', data: contract, message: 'Status unchanged.' });
        }

        // Validate transition
        const allowedNext = VALID_TRANSITIONS[currentStatus] || [];
        if (!allowedNext.includes(targetStatus)) {
            return res.status(400).json({
                status: 'error',
                message: `Invalid lifecycle transition from '${currentStatus}' to '${targetStatus}'. Allowed: [${allowedNext.join(', ')}]`
            });
        }

        const updateRes = await db.query(`
            UPDATE re_contracts
            SET status = $1, updated_at = CURRENT_TIMESTAMP
            WHERE id::text = $2::text AND tenant_id::text = $3::text
            RETURNING *
        `, [targetStatus, id, tenant_id]);

        res.json({
            status: 'success',
            data: updateRes.rows[0],
            message: `Contract ${contract.contract_number} transitioned to ${targetStatus}.`
        });
    } catch (err) {
        console.error('[Update Contract Status Error]:', err.message);
        res.status(500).json({ status: 'error', message: err.message });
    }
};

// @desc    Update contract details (notes, contract_date, down_payment)
// @route   PUT /api/re-contracts/:id
exports.updateContract = async (req, res) => {
    const tenant_id = String(req.user.tenant_id);
    const { id } = req.params;
    const { notes, contract_date, down_payment, contract_value } = req.body;

    try {
        const curRes = await db.query(`
            SELECT id, contract_value, down_payment, status
            FROM re_contracts
            WHERE id::text = $1::text AND tenant_id::text = $2::text
        `, [id, tenant_id]);

        if (curRes.rows.length === 0) {
            return res.status(404).json({ status: 'error', message: 'Contract not found or unauthorized.' });
        }

        const cur = curRes.rows[0];
        if (['Completed', 'Cancelled'].includes(cur.status)) {
            return res.status(400).json({ status: 'error', message: `Cannot edit a contract in '${cur.status}' status.` });
        }

        const newVal = contract_value !== undefined && !isNaN(Number(contract_value)) ? Number(Number(contract_value).toFixed(2)) : Number(cur.contract_value);
        const newDp = down_payment !== undefined && !isNaN(Number(down_payment)) ? Number(Number(down_payment).toFixed(2)) : Number(cur.down_payment);
        const newRemaining = Math.max(0, Number((newVal - newDp).toFixed(2)));

        const updateRes = await db.query(`
            UPDATE re_contracts
            SET contract_value = $1,
                down_payment = $2,
                remaining_amount = $3,
                notes = COALESCE($4, notes),
                contract_date = COALESCE($5, contract_date),
                updated_at = CURRENT_TIMESTAMP
            WHERE id::text = $6::text AND tenant_id::text = $7::text
            RETURNING *
        `, [newVal, newDp, newRemaining, notes !== undefined ? notes : null, contract_date || null, id, tenant_id]);

        res.json({ status: 'success', data: updateRes.rows[0] });
    } catch (err) {
        console.error('[Update Contract Error]:', err.message);
        res.status(500).json({ status: 'error', message: err.message });
    }
};
