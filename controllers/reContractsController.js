const db = require('../config/db');
const accessScopeService = require('../services/accessScopeService');

/**
 * Real Estate Contracts Controller (Phase 2.2)
 * Manages sales contracts originated from Real Estate Deals.
 * Standalone workspace: Real Estate → Contracts (keeps link to originating Deal).
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

// Days before end_date at which a contract is considered "expiring soon"
const EXPIRY_WARNING_DAYS = 30;

// Contract term columns (runtime guard – same pattern as ensureDealColumns)
let contractColumnsEnsured = false;
async function ensureContractColumns() {
    if (contractColumnsEnsured) return;
    const run = async (sql) => { try { await db.query(sql); } catch (e) { /* already exists / table missing */ } };
    await run(`ALTER TABLE re_contracts ADD COLUMN IF NOT EXISTS start_date DATE NULL`);
    await run(`ALTER TABLE re_contracts ADD COLUMN IF NOT EXISTS end_date DATE NULL`);
    await run(`ALTER TABLE re_contracts ADD COLUMN IF NOT EXISTS duration_months INTEGER NULL`);
    await run(`ALTER TABLE re_contracts ADD COLUMN IF NOT EXISTS expiry_reminder_sent_at TIMESTAMP NULL`);
    await run(`ALTER TABLE re_contracts ADD COLUMN IF NOT EXISTS expired_notified_at TIMESTAMP NULL`);
    contractColumnsEnsured = true;
}

// Generate human-readable contract number: REC-YYYYMM-XXXX
function generateContractNumber() {
    const d = new Date();
    const yyyymm = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
    const rand = Math.floor(1000 + Math.random() * 9000);
    return `REC-${yyyymm}-${rand}`;
}

const isValidDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}/.test(s) && !isNaN(new Date(s).getTime());

function addMonths(isoDate, months) {
    const [y, m, d] = isoDate.slice(0, 10).split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1 + months, d));
    // Clamp overflow (e.g. Jan 31 + 1 month)
    if (dt.getUTCDate() !== d) dt.setUTCDate(0);
    return dt.toISOString().slice(0, 10);
}

function monthsBetween(start, end) {
    const s = new Date(start), e = new Date(end);
    return Math.max(0, (e.getUTCFullYear() - s.getUTCFullYear()) * 12 + (e.getUTCMonth() - s.getUTCMonth()));
}

/**
 * Resolve contract term from any combination of start_date / end_date / duration_months.
 * Returns { start_date, end_date, duration_months } or { error }.
 */
function resolveTerm({ start_date, end_date, duration_months }, current = {}) {
    let start = start_date !== undefined ? (start_date || null) : (current.start_date || null);
    let end = end_date !== undefined ? (end_date || null) : (current.end_date || null);
    let months = duration_months !== undefined
        ? (duration_months === '' || duration_months === null ? null : parseInt(duration_months, 10))
        : (current.duration_months ?? null);

    if (start && !isValidDate(String(start))) return { error: 'Invalid start date.' };
    if (end && !isValidDate(String(end))) return { error: 'Invalid end date.' };
    if (months !== null && (isNaN(months) || months < 0 || months > 1200)) return { error: 'Invalid duration (months).' };

    start = start ? String(start).slice(0, 10) : null;
    end = end ? String(end).slice(0, 10) : null;

    // If duration was explicitly provided with a start, it drives the end date
    if (start && months !== null && duration_months !== undefined) {
        end = addMonths(start, months);
    } else if (start && end) {
        months = monthsBetween(start, end);
    } else if (start && months !== null && !end) {
        end = addMonths(start, months);
    }

    if (start && end && new Date(end) < new Date(start)) return { error: 'End date cannot be before start date.' };
    return { start_date: start, end_date: end, duration_months: months };
}

// Derive expiry state for UI/alerts
function decorateContract(row) {
    if (!row) return row;
    const daysRemaining = row.days_remaining === null || row.days_remaining === undefined ? null : Number(row.days_remaining);
    let expiry_state = 'no_term';
    if (['Completed', 'Cancelled'].includes(row.status)) expiry_state = 'closed';
    else if (daysRemaining !== null) {
        if (daysRemaining < 0) expiry_state = 'expired';
        else if (daysRemaining <= EXPIRY_WARNING_DAYS) expiry_state = 'expiring_soon';
        else expiry_state = 'active';
    }
    return { ...row, days_remaining: daysRemaining, expiry_state };
}

const CONTRACT_SELECT = `
    SELECT 
        rc.*,
        CASE WHEN rc.end_date IS NULL THEN NULL ELSE (rc.end_date - CURRENT_DATE) END AS days_remaining,
        d.title as deal_title,
        d.pipeline_stage as deal_stage,
        d.assigned_to as deal_owner_id,
        ou.name as deal_owner_name,
        c.name as customer_name,
        c.phone as customer_phone,
        c.email as customer_email,
        ru.name as unit_name,
        ru.unit_number,
        ru.project_name,
        ru.status as unit_status
    FROM re_contracts rc
    JOIN deals d ON rc.deal_id = d.id AND d.tenant_id::text = rc.tenant_id::text
    LEFT JOIN users ou ON ou.id::text = d.assigned_to::text
    LEFT JOIN customers c ON rc.customer_id = c.id
    LEFT JOIN re_units ru ON rc.unit_id::text = ru.id::text AND ru.tenant_id::text = rc.tenant_id::text
`;

// @desc    Get all real estate contracts (row-scoped to the originating deal owner)
// @route   GET /api/re-contracts
//          Query: status, deal_id, customer_id, unit_id, expiry=expiring_soon|expired|active
exports.getContracts = async (req, res) => {
    const tenant_id = String(req.user.tenant_id);
    const branch_id = req.branchId || req.user?.branch_id || null;
    const { status, deal_id, customer_id, unit_id, expiry } = req.query;

    try {
        await ensureContractColumns();
        let query = `${CONTRACT_SELECT}
            WHERE rc.tenant_id::text = $1::text
            AND ($2::text IS NULL OR rc.branch_id::text = $2::text OR rc.branch_id IS NULL)
        `;
        const params = [tenant_id, branch_id ? String(branch_id) : null];

        // Row-level scope: same visibility as the originating deal
        const scope = await accessScopeService.buildScopePredicate({
            user: req.user, tableAlias: 'd', assigneeCol: 'assigned_to', paramIndex: params.length + 1
        });
        query += ` AND (${scope.sql})`;
        params.push(...scope.params);

        if (status) {
            params.push(status);
            query += ` AND rc.status = $${params.length}`;
        }
        if (deal_id) {
            params.push(String(deal_id));
            query += ` AND rc.deal_id::text = $${params.length}::text`;
        }
        if (customer_id) {
            params.push(String(customer_id));
            query += ` AND rc.customer_id::text = $${params.length}::text`;
        }
        if (unit_id) {
            params.push(String(unit_id));
            query += ` AND rc.unit_id::text = $${params.length}::text`;
        }
        if (expiry === 'expiring_soon') {
            query += ` AND rc.end_date IS NOT NULL AND rc.end_date >= CURRENT_DATE AND rc.end_date <= CURRENT_DATE + ${EXPIRY_WARNING_DAYS}
                       AND rc.status NOT IN ('Completed','Cancelled')`;
        } else if (expiry === 'expired') {
            query += ` AND rc.end_date IS NOT NULL AND rc.end_date < CURRENT_DATE AND rc.status NOT IN ('Completed','Cancelled')`;
        } else if (expiry === 'active') {
            query += ` AND (rc.end_date IS NULL OR rc.end_date > CURRENT_DATE + ${EXPIRY_WARNING_DAYS}) AND rc.status NOT IN ('Completed','Cancelled')`;
        }

        query += ` ORDER BY rc.created_at DESC`;

        const result = await db.query(query, params);
        res.json({ status: 'success', data: result.rows.map(decorateContract) });
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
        await ensureContractColumns();
        const params = [id, tenant_id];
        const scope = await accessScopeService.buildScopePredicate({
            user: req.user, tableAlias: 'd', assigneeCol: 'assigned_to', paramIndex: 3
        });
        params.push(...scope.params);
        const result = await db.query(`${CONTRACT_SELECT}
            WHERE rc.id::text = $1::text AND rc.tenant_id::text = $2::text AND (${scope.sql})
        `, params);

        if (result.rows.length === 0) {
            return res.status(404).json({ status: 'error', message: 'Contract not found or unauthorized.' });
        }

        res.json({ status: 'success', data: decorateContract(result.rows[0]) });
    } catch (err) {
        console.error('[Get Contract By ID Error]:', err.message);
        res.status(500).json({ status: 'error', message: err.message });
    }
};

// @desc    Create contract for a deal (the Deal is the origin of the contract)
// @route   POST /api/re-contracts
exports.createContract = async (req, res) => {
    const tenant_id = String(req.user.tenant_id);
    const branch_id = req.branchId || req.user?.branch_id || null;
    const { deal_id, contract_date, contract_value, down_payment, notes } = req.body;

    if (!deal_id) {
        return res.status(400).json({ status: 'error', message: 'Deal ID is required.' });
    }

    try {
        await ensureContractColumns();

        // 1. Fetch and validate Deal (tenant + row scope)
        const params = [parseInt(deal_id), tenant_id];
        const scope = await accessScopeService.buildScopePredicate({
            user: req.user, tableAlias: 'd', assigneeCol: 'assigned_to', paramIndex: 3
        });
        params.push(...scope.params);
        const dealRes = await db.query(`
            SELECT d.id, d.title, d.value, d.pipeline_stage, d.client_id, d.unit_id, d.branch_id
            FROM deals d
            WHERE d.id = $1 AND d.tenant_id::text = $2::text AND (${scope.sql})
        `, params);

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

        // 3. Term
        const term = resolveTerm(req.body);
        if (term.error) return res.status(400).json({ status: 'error', message: term.error });

        // 4. Calculate Financials
        const totalValue = contract_value !== undefined && contract_value !== '' && !isNaN(Number(contract_value))
            ? Number(Number(contract_value).toFixed(2))
            : Number(Number(deal.value || 0).toFixed(2));

        let dp = 0;
        if (down_payment !== undefined && down_payment !== '' && !isNaN(Number(down_payment))) {
            dp = Number(Number(down_payment).toFixed(2));
        } else {
            // Legacy fallback: down payment recorded on the old payment registry cache
            try {
                const payRes = await db.query(`SELECT down_payment FROM re_payments_mvp WHERE deal_id::text = $1::text AND tenant_id::text = $2::text`, [String(deal.id), tenant_id]);
                if (payRes.rows.length > 0 && payRes.rows[0].down_payment) {
                    dp = Number(Number(payRes.rows[0].down_payment).toFixed(2));
                }
            } catch (e) { /* cache table optional */ }
        }

        const remaining = Math.max(0, Number((totalValue - dp).toFixed(2)));
        const contractNumber = generateContractNumber();
        const dateVal = contract_date || new Date().toISOString().split('T')[0];

        const insertRes = await db.query(`
            INSERT INTO re_contracts (
                contract_number, deal_id, customer_id, unit_id, contract_date,
                contract_value, down_payment, remaining_amount, status, notes,
                tenant_id, branch_id, created_by, start_date, end_date, duration_months
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'Draft', $9, $10, $11, $12, $13, $14, $15)
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
            req.user?.name || req.user?.id || 'SYSTEM',
            term.start_date,
            term.end_date,
            term.duration_months
        ]);

        res.status(201).json({ status: 'success', data: insertRes.rows[0] });
    } catch (err) {
        console.error('[Create Contract Error]:', err.message);
        res.status(500).json({ status: 'error', message: err.message });
    }
};

// Shared scoped fetch for mutations
async function fetchScopedContract(req, id) {
    const tenant_id = String(req.user.tenant_id);
    const params = [id, tenant_id];
    const scope = await accessScopeService.buildScopePredicate({
        user: req.user, tableAlias: 'd', assigneeCol: 'assigned_to', paramIndex: 3
    });
    params.push(...scope.params);
    const r = await db.query(`
        SELECT rc.*
        FROM re_contracts rc
        JOIN deals d ON rc.deal_id = d.id AND d.tenant_id::text = rc.tenant_id::text
        WHERE rc.id::text = $1::text AND rc.tenant_id::text = $2::text AND (${scope.sql})
    `, params);
    return r.rows[0] || null;
}

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
        await ensureContractColumns();
        const contract = await fetchScopedContract(req, id);
        if (!contract) {
            return res.status(404).json({ status: 'error', message: 'Contract not found or unauthorized.' });
        }

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

// @desc    Update contract details (notes, dates, term, down_payment, value)
// @route   PUT /api/re-contracts/:id
exports.updateContract = async (req, res) => {
    const tenant_id = String(req.user.tenant_id);
    const { id } = req.params;
    const { notes, contract_date, down_payment, contract_value } = req.body;

    try {
        await ensureContractColumns();
        const cur = await fetchScopedContract(req, id);
        if (!cur) {
            return res.status(404).json({ status: 'error', message: 'Contract not found or unauthorized.' });
        }

        if (['Completed', 'Cancelled'].includes(cur.status)) {
            return res.status(400).json({ status: 'error', message: `Cannot edit a contract in '${cur.status}' status.` });
        }

        // Commercial terms are frozen once the contract is Signed/Active
        const frozen = ['Signed', 'Active'].includes(cur.status);
        const wantsValueChange = contract_value !== undefined && contract_value !== '' && Number(contract_value) !== Number(cur.contract_value);
        const wantsDpChange = down_payment !== undefined && down_payment !== '' && Number(down_payment) !== Number(cur.down_payment);
        if (frozen && (wantsValueChange || wantsDpChange)) {
            return res.status(409).json({ status: 'error', message: `Contract value and down payment cannot change once the contract is ${cur.status}.` });
        }

        const term = resolveTerm(req.body, {
            start_date: cur.start_date ? new Date(cur.start_date).toISOString().slice(0, 10) : null,
            end_date: cur.end_date ? new Date(cur.end_date).toISOString().slice(0, 10) : null,
            duration_months: cur.duration_months
        });
        if (term.error) return res.status(400).json({ status: 'error', message: term.error });

        const newVal = contract_value !== undefined && contract_value !== '' && !isNaN(Number(contract_value)) ? Number(Number(contract_value).toFixed(2)) : Number(cur.contract_value);
        const newDp = down_payment !== undefined && down_payment !== '' && !isNaN(Number(down_payment)) ? Number(Number(down_payment).toFixed(2)) : Number(cur.down_payment);
        const newRemaining = Math.max(0, Number((newVal - newDp).toFixed(2)));

        // Reset reminder flags when the end date moves
        const curEnd = cur.end_date ? new Date(cur.end_date).toISOString().slice(0, 10) : null;
        const endChanged = curEnd !== term.end_date;

        const updateRes = await db.query(`
            UPDATE re_contracts
            SET contract_value = $1,
                down_payment = $2,
                remaining_amount = $3,
                notes = COALESCE($4, notes),
                contract_date = COALESCE($5, contract_date),
                start_date = $6,
                end_date = $7,
                duration_months = $8,
                expiry_reminder_sent_at = CASE WHEN $9::boolean THEN NULL ELSE expiry_reminder_sent_at END,
                expired_notified_at = CASE WHEN $9::boolean THEN NULL ELSE expired_notified_at END,
                updated_at = CURRENT_TIMESTAMP
            WHERE id::text = $10::text AND tenant_id::text = $11::text
            RETURNING *
        `, [newVal, newDp, newRemaining, notes !== undefined ? notes : null, contract_date || null,
            term.start_date, term.end_date, term.duration_months, endChanged, id, tenant_id]);

        res.json({ status: 'success', data: updateRes.rows[0] });
    } catch (err) {
        console.error('[Update Contract Error]:', err.message);
        res.status(500).json({ status: 'error', message: err.message });
    }
};

exports.ensureContractColumns = ensureContractColumns;
exports.EXPIRY_WARNING_DAYS = EXPIRY_WARNING_DAYS;
