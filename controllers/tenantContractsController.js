const db = require('../config/db');

/**
 * 🏛️ Tenant Commercial Contracts Controller
 * Phase 4.2.6-B — Commercial Contracts: Value & Duration Ledger
 * 
 * Strict Architectural Guarantees:
 * - Reference ledger only; zero coupling with runtime technical entitlement checks.
 * - Contract expiration never alters tenant_overrides, system access, or module availability.
 * - Multiple historical contracts per tenant are strictly preserved chronologically.
 * - Previous contract records are never overwritten; update operations preserve full audit trail.
 * - Error fallback applies ONLY to PostgreSQL 42P01 (undefined_table).
 */

const SYSTEM_DEFAULT_TENANT = '00000000-0000-0000-0000-000000000000';

/**
 * Calculate dynamic contract status based on date ranges
 */
const calculateContractStatus = (startDateStr, endDateStr) => {
    if (!startDateStr || !endDateStr) return 'unknown';

    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const start = String(startDateStr).slice(0, 10);
    const end = String(endDateStr).slice(0, 10);

    const msPerDay = 1000 * 60 * 60 * 24;
    const endDateObj = new Date(end);
    const nowDateObj = new Date(todayStr);
    const daysRemaining = Math.ceil((endDateObj - nowDateObj) / msPerDay);

    if (todayStr >= start && todayStr <= end) {
        if (daysRemaining <= 30 && daysRemaining >= 0) {
            return { code: 'expiring_soon', label: 'Expiring Soon', daysRemaining };
        }
        return { code: 'active', label: 'Active', daysRemaining };
    }

    if (todayStr < start) {
        const daysUntilStart = Math.ceil((new Date(start) - nowDateObj) / msPerDay);
        return { code: 'upcoming', label: 'Upcoming', daysRemaining: daysUntilStart };
    }

    // todayStr > end
    const daysExpiredAgo = Math.abs(daysRemaining);
    return { code: 'expired', label: 'Expired', daysRemaining: 0, daysExpiredAgo };
};

/**
 * Detect date overlaps among multiple contracts
 */
const detectOverlaps = (contracts) => {
    if (!Array.isArray(contracts) || contracts.length < 2) return false;

    for (let i = 0; i < contracts.length; i++) {
        const c1Start = String(contracts[i].start_date).slice(0, 10);
        const c1End = String(contracts[i].end_date).slice(0, 10);

        for (let j = i + 1; j < contracts.length; j++) {
            const c2Start = String(contracts[j].start_date).slice(0, 10);
            const c2End = String(contracts[j].end_date).slice(0, 10);

            // Overlap condition: c1Start <= c2End && c1End >= c2Start
            if (c1Start <= c2End && c1End >= c2Start) {
                return true;
            }
        }
    }
    return false;
};

// ── 1. GET ALL CONTRACTS FOR A TENANT ───────────────────────────
exports.getTenantContracts = async (req, res) => {
    const { tenant_id } = req.params;

    try {
        // 1. Verify tenant existence
        const tRes = await db.query(
            'SELECT id, name FROM tenants WHERE id::text = $1::text',
            [tenant_id]
        );
        if (tRes.rows.length === 0) {
            return res.status(404).json({ status: 'error', message: 'Tenant organization not found.' });
        }

        // 2. Fetch contracts ordered by start date desc
        const query = `
            SELECT 
                c.id, c.tenant_id, c.contract_value, c.currency,
                c.start_date, c.end_date, c.notes,
                c.created_at, c.updated_at,
                u_c.name as created_by_name,
                u_u.name as updated_by_name
            FROM tenant_contracts c
            LEFT JOIN users u_c ON c.created_by = u_c.id
            LEFT JOIN users u_u ON c.updated_by = u_u.id
            WHERE c.tenant_id::text = $1::text
            ORDER BY c.start_date DESC, c.created_at DESC
        `;
        const result = await db.query(query, [tenant_id]);
        const contracts = result.rows.map(row => {
            const statusInfo = calculateContractStatus(row.start_date, row.end_date);
            return {
                ...row,
                contract_value: Number(row.contract_value),
                status: statusInfo.code,
                status_label: statusInfo.label,
                days_remaining: statusInfo.daysRemaining,
                days_expired_ago: statusInfo.daysExpiredAgo || null
            };
        });

        // 3. Determine active contract
        // Priority 1: Currently active or expiring soon
        // Priority 2: Latest upcoming
        // Priority 3: Most recently expired
        let activeContract = contracts.find(c => c.status === 'active' || c.status === 'expiring_soon') || null;
        if (!activeContract && contracts.length > 0) {
            activeContract = contracts[0]; // Most recent chronologically
        }

        const hasOverlap = detectOverlaps(contracts);

        return res.json({
            status: 'success',
            data: {
                tenant_id,
                tenant_name: tRes.rows[0].name,
                active_contract: activeContract,
                contracts,
                has_overlap: hasOverlap,
                overlap_warning: hasOverlap ? 'Multiple contracts have overlapping date intervals.' : null
            }
        });

    } catch (err) {
        // STRICT ERROR HANDLING: Graceful fallback ONLY for PostgreSQL 42P01 (undefined_table)
        if (err.code === '42P01') {
            return res.json({
                status: 'success',
                data: {
                    tenant_id,
                    active_contract: null,
                    contracts: [],
                    has_overlap: false
                },
                notice: 'Commercial contracts table is pending migration (42P01).'
            });
        }

        // For all other errors, log and return explicit HTTP 500
        console.error('[tenantContractsController.getTenantContracts] Database Error:', err);
        return res.status(500).json({
            status: 'error',
            message: 'Database error occurred while retrieving commercial contracts: ' + err.message
        });
    }
};

// ── 2. CREATE A NEW COMMERCIAL CONTRACT ─────────────────────────
exports.createTenantContract = async (req, res) => {
    const { tenant_id } = req.params;
    let { contract_value, currency, start_date, end_date, notes, reason } = req.body;

    // 1. Validate tenant existence
    try {
        const tRes = await db.query(
            'SELECT id, name FROM tenants WHERE id::text = $1::text',
            [tenant_id]
        );
        if (tRes.rows.length === 0) {
            return res.status(404).json({ status: 'error', message: 'Tenant organization not found.' });
        }
    } catch (err) {
        return res.status(500).json({ status: 'error', message: 'Failed to verify tenant existence.' });
    }

    // 2. Validate input fields
    if (contract_value === undefined || contract_value === null || contract_value === '') {
        return res.status(400).json({ status: 'error', message: 'Contract Total Value is required.' });
    }
    const numValue = Number(contract_value);
    if (isNaN(numValue) || numValue < 0) {
        return res.status(400).json({ status: 'error', message: 'Contract Total Value must be a valid non-negative number.' });
    }

    if (!start_date || !end_date) {
        return res.status(400).json({ status: 'error', message: 'Start date and end date are both required.' });
    }

    const startStr = String(start_date).slice(0, 10);
    const endStr = String(end_date).slice(0, 10);

    if (isNaN(new Date(startStr).getTime()) || isNaN(new Date(endStr).getTime())) {
        return res.status(400).json({ status: 'error', message: 'Start and end dates must be valid ISO date strings (YYYY-MM-DD).' });
    }

    if (startStr > endStr) {
        return res.status(400).json({ status: 'error', message: 'End date must be greater than or equal to start date.' });
    }

    const cleanCurrency = (currency && String(currency).trim()) ? String(currency).trim().toUpperCase() : 'EGP';
    const cleanNotes = (notes && String(notes).trim()) ? String(notes).trim() : null;
    const adminUserId = req.user?.id || null;
    const ipAddress = req.ip || null;

    // 3. Dedicated Client Checkout for Atomic Transaction
    const client = await (db.connect ? db.connect() : db.pool.connect());

    try {
        await client.query('BEGIN');

        // Step A: Insert contract
        const insertSql = `
            INSERT INTO tenant_contracts (
                tenant_id, contract_value, currency, start_date, end_date, notes, created_by, updated_by
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
            RETURNING *
        `;
        const result = await client.query(insertSql, [
            tenant_id, numValue, cleanCurrency, startStr, endStr, cleanNotes, adminUserId
        ]);
        const newContract = result.rows[0];

        // Step B: Insert audit record using the same transaction client
        const auditSql = `
            INSERT INTO tenant_contract_audit_logs (
                contract_id, tenant_id, action, changed_by, previous_data, new_data, reason, ip_address
            ) VALUES ($1, $2, $3, $4, NULL, $5, $6, $7)
        `;
        await client.query(auditSql, [
            newContract.id,
            tenant_id,
            'CREATE',
            adminUserId,
            JSON.stringify(newContract),
            reason || 'Initial contract recording',
            ipAddress
        ]);

        // Step C: Commit ONLY after both operations succeed
        await client.query('COMMIT');

        const statusInfo = calculateContractStatus(newContract.start_date, newContract.end_date);

        return res.status(201).json({
            status: 'success',
            message: 'Commercial contract recorded successfully.',
            data: {
                ...newContract,
                contract_value: Number(newContract.contract_value),
                status: statusInfo.code,
                status_label: statusInfo.label,
                days_remaining: statusInfo.daysRemaining
            }
        });

    } catch (err) {
        // Atomic Rollback on ANY failure
        try {
            await client.query('ROLLBACK');
        } catch (rbErr) {
            console.error('[tenantContractsController.createTenantContract] Rollback error:', rbErr.message);
        }

        if (err.code === '42P01') {
            return res.status(503).json({
                status: 'error',
                code: 'TABLE_NOT_MIGRATED',
                message: 'Commercial contracts or audit table is not yet migrated in database (42P01).'
            });
        }

        console.error('[tenantContractsController.createTenantContract] Transaction Error:', err);
        return res.status(500).json({
            status: 'error',
            message: 'Failed to record commercial contract: ' + err.message
        });
    } finally {
        client.release();
    }
};

// ── 3. UPDATE AN EXISTING COMMERCIAL CONTRACT ───────────────────
exports.updateTenantContract = async (req, res) => {
    const { tenant_id, contract_id } = req.params;
    let { contract_value, currency, start_date, end_date, notes, reason } = req.body;

    // 1. Validate input fields
    if (contract_value === undefined || contract_value === null || contract_value === '') {
        return res.status(400).json({ status: 'error', message: 'Contract Total Value is required.' });
    }
    const numValue = Number(contract_value);
    if (isNaN(numValue) || numValue < 0) {
        return res.status(400).json({ status: 'error', message: 'Contract Total Value must be a valid non-negative number.' });
    }

    if (!start_date || !end_date) {
        return res.status(400).json({ status: 'error', message: 'Start date and end date are both required.' });
    }

    const startStr = String(start_date).slice(0, 10);
    const endStr = String(end_date).slice(0, 10);

    if (isNaN(new Date(startStr).getTime()) || isNaN(new Date(endStr).getTime())) {
        return res.status(400).json({ status: 'error', message: 'Start and end dates must be valid ISO date strings (YYYY-MM-DD).' });
    }

    if (startStr > endStr) {
        return res.status(400).json({ status: 'error', message: 'End date must be greater than or equal to start date.' });
    }

    const adminUserId = req.user?.id || null;
    const ipAddress = req.ip || null;

    // 2. Dedicated Client Checkout for Atomic Transaction
    const client = await (db.connect ? db.connect() : db.pool.connect());

    try {
        await client.query('BEGIN');

        // Step A: Lock and fetch existing contract within transaction
        const existingRes = await client.query(
            'SELECT * FROM tenant_contracts WHERE id::text = $1::text AND tenant_id::text = $2::text FOR UPDATE',
            [contract_id, tenant_id]
        );

        if (existingRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({
                status: 'error',
                message: 'Contract not found for the specified organization.'
            });
        }

        const previousData = existingRes.rows[0];
        const cleanCurrency = (currency && String(currency).trim()) ? String(currency).trim().toUpperCase() : previousData.currency || 'EGP';
        const cleanNotes = notes !== undefined ? (notes ? String(notes).trim() : null) : previousData.notes;

        // Step B: Update contract using same transaction client
        const updateSql = `
            UPDATE tenant_contracts SET
                contract_value = $1,
                currency = $2,
                start_date = $3,
                end_date = $4,
                notes = $5,
                updated_by = $6,
                updated_at = CURRENT_TIMESTAMP
            WHERE id::text = $7::text AND tenant_id::text = $8::text
            RETURNING *
        `;
        const updateResult = await client.query(updateSql, [
            numValue, cleanCurrency, startStr, endStr, cleanNotes, adminUserId, contract_id, tenant_id
        ]);
        const updatedContract = updateResult.rows[0];

        // Step C: Insert audit log preserving previous data using same transaction client
        const auditSql = `
            INSERT INTO tenant_contract_audit_logs (
                contract_id, tenant_id, action, changed_by, previous_data, new_data, reason, ip_address
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `;
        await client.query(auditSql, [
            contract_id,
            tenant_id,
            'UPDATE',
            adminUserId,
            JSON.stringify(previousData),
            JSON.stringify(updatedContract),
            reason || 'Contract terms updated',
            ipAddress
        ]);

        // Step D: Commit ONLY after both operations succeed
        await client.query('COMMIT');

        const statusInfo = calculateContractStatus(updatedContract.start_date, updatedContract.end_date);

        return res.json({
            status: 'success',
            message: 'Commercial contract updated successfully.',
            data: {
                ...updatedContract,
                contract_value: Number(updatedContract.contract_value),
                status: statusInfo.code,
                status_label: statusInfo.label,
                days_remaining: statusInfo.daysRemaining
            }
        });

    } catch (err) {
        // Atomic Rollback on ANY failure
        try {
            await client.query('ROLLBACK');
        } catch (rbErr) {
            console.error('[tenantContractsController.updateTenantContract] Rollback error:', rbErr.message);
        }

        if (err.code === '42P01') {
            return res.status(503).json({
                status: 'error',
                code: 'TABLE_NOT_MIGRATED',
                message: 'Commercial contracts or audit table is not yet migrated in database (42P01).'
            });
        }

        console.error('[tenantContractsController.updateTenantContract] Transaction Error:', err);
        return res.status(500).json({
            status: 'error',
            message: 'Failed to update commercial contract: ' + err.message
        });
    } finally {
        client.release();
    }
};

// ── 4. GET CONTRACT AUDIT LOGS ──────────────────────────────────
exports.getTenantContractAuditLogs = async (req, res) => {
    const { tenant_id } = req.params;

    try {
        const query = `
            SELECT 
                a.id, a.contract_id, a.tenant_id, a.action,
                a.previous_data, a.new_data, a.reason, a.ip_address, a.created_at,
                u.name as admin_name, u.email as admin_email
            FROM tenant_contract_audit_logs a
            LEFT JOIN users u ON a.changed_by = u.id
            WHERE a.tenant_id::text = $1::text
            ORDER BY a.created_at DESC
            LIMIT 50
        `;
        const result = await db.query(query, [tenant_id]);
        return res.json({
            status: 'success',
            data: result.rows
        });
    } catch (err) {
        if (err.code === '42P01') {
            return res.json({
                status: 'success',
                data: [],
                notice: 'Contract audit log table pending migration (42P01).'
            });
        }

        console.error('[tenantContractsController.getTenantContractAuditLogs] Error:', err);
        return res.status(500).json({
            status: 'error',
            message: 'Failed to fetch contract audit logs: ' + err.message
        });
    }
};

// Export helpers for testing
exports._calculateContractStatus = calculateContractStatus;
exports._detectOverlaps = detectOverlaps;
