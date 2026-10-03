/**
 * purchaseRequestsController.js — Phase 5B.1
 * Internal Purchase Requests & Approval Workflow
 *
 * Core Principles:
 *  - Internal request only: DOES NOT touch inventory, payables, or treasury.
 *  - SERIAL INTEGER IDs with strict tenant & branch scoping.
 *  - ACID transaction safety with FOR UPDATE concurrency lock on approvals.
 */

const db = require('../config/db');

// ─── Helper: Generate Next PR Number ──────────────────────────────────────────
async function generateRequestNumber(client, tenantId) {
    const yearShort = new Date().getFullYear().toString().slice(-2); // e.g. "26"
    const prefix = `PR-${yearShort}-`;

    const res = await client.query(`
        SELECT request_number FROM purchase_requests
        WHERE tenant_id::text = $1::text AND request_number LIKE $2
        ORDER BY id DESC LIMIT 1
    `, [tenantId, `${prefix}%`]);

    let seq = 1;
    if (res.rows.length > 0) {
        const lastNum = res.rows[0].request_number;
        const parts = lastNum.split('-');
        if (parts.length === 3) {
            const parsed = parseInt(parts[2], 10);
            if (!isNaN(parsed)) seq = parsed + 1;
        }
    }
    return `${prefix}${String(seq).padStart(4, '0')}`;
}

// @desc    Get all purchase requests (with filters & search)
// @route   GET /api/purchase-requests
// @access  Private
exports.getPurchaseRequests = async (req, res) => {
    const tenant_id = req.user.tenant_id;
    let branch_id = req.query.branch_id || req.branchId || req.user?.branch_id || null;
    if (branch_id === 'null' || branch_id === 'undefined' || branch_id === 'all' || !String(branch_id || '').trim()) {
        branch_id = null;
    }

    const { status, priority, search, date_from, date_to } = req.query;

    try {
        let whereClauses = [`pr.tenant_id::text = $1::text`];
        let queryParams = [tenant_id];

        if (branch_id) {
            queryParams.push(String(branch_id));
            whereClauses.push(`(pr.branch_id::text = $${queryParams.length}::text OR pr.branch_id IS NULL)`);
        }
        if (status && status !== 'all') {
            queryParams.push(status);
            whereClauses.push(`pr.status = $${queryParams.length}`);
        }
        if (priority && priority !== 'all') {
            queryParams.push(priority);
            whereClauses.push(`pr.priority = $${queryParams.length}`);
        }
        if (date_from) {
            queryParams.push(date_from);
            whereClauses.push(`pr.created_at::date >= $${queryParams.length}::date`);
        }
        if (date_to) {
            queryParams.push(date_to);
            whereClauses.push(`pr.created_at::date <= $${queryParams.length}::date`);
        }
        if (search && search.trim()) {
            queryParams.push(`%${search.trim()}%`);
            whereClauses.push(`(pr.request_number ILIKE $${queryParams.length} OR pr.department ILIKE $${queryParams.length} OR u.name ILIKE $${queryParams.length})`);
        }

        const query = `
            SELECT 
                pr.*,
                u.name AS requester_name,
                approver.name AS approver_name,
                w.name AS warehouse_name,
                COALESCE(COUNT(pri.id), 0)::int AS items_count,
                COALESCE(SUM(pri.quantity * pri.estimated_unit_price), 0)::numeric AS estimated_total
            FROM purchase_requests pr
            LEFT JOIN users u ON u.id = pr.requested_by
            LEFT JOIN users approver ON approver.id = pr.approved_by
            LEFT JOIN warehouses w ON w.id = pr.warehouse_id
            LEFT JOIN purchase_request_items pri ON pri.request_id = pr.id
            WHERE ${whereClauses.join(' AND ')}
            GROUP BY pr.id, u.name, approver.name, w.name
            ORDER BY pr.id DESC
        `;

        const result = await db.query(query, queryParams);
        res.json({ status: 'success', data: result.rows, count: result.rows.length });
    } catch (err) {
        console.error('getPurchaseRequests Error:', err.message);
        res.status(500).json({ status: 'error', message: err.message || 'Failed to fetch purchase requests' });
    }
};

// @desc    Get single purchase request by ID with items
// @route   GET /api/purchase-requests/:id
// @access  Private
exports.getPurchaseRequestById = async (req, res) => {
    const tenant_id = req.user.tenant_id;
    const { id } = req.params;

    try {
        const headerRes = await db.query(`
            SELECT 
                pr.*,
                u.name AS requester_name,
                approver.name AS approver_name,
                w.name AS warehouse_name
            FROM purchase_requests pr
            LEFT JOIN users u ON u.id = pr.requested_by
            LEFT JOIN users approver ON approver.id = pr.approved_by
            LEFT JOIN warehouses w ON w.id = pr.warehouse_id
            WHERE pr.id = $1 AND pr.tenant_id::text = $2::text
        `, [id, tenant_id]);

        if (headerRes.rows.length === 0) {
            return res.status(404).json({ status: 'error', message: 'Purchase request not found' });
        }

        const itemsRes = await db.query(`
            SELECT 
                pri.*,
                p.name AS product_name,
                p.sku AS product_sku,
                p.unit AS product_unit
            FROM purchase_request_items pri
            JOIN products p ON p.id = pri.product_id
            WHERE pri.request_id = $1
            ORDER BY pri.id ASC
        `, [id]);

        const request = headerRes.rows[0];
        request.items = itemsRes.rows;

        res.json({ status: 'success', data: request });
    } catch (err) {
        console.error('getPurchaseRequestById Error:', err.message);
        res.status(500).json({ status: 'error', message: err.message || 'Failed to fetch request details' });
    }
};

// @desc    Create a new Purchase Request (as Draft)
// @route   POST /api/purchase-requests
// @access  Private
exports.createPurchaseRequest = async (req, res) => {
    const tenant_id = req.user.tenant_id;
    let branch_id = req.body.branch_id || req.branchId || req.user?.branch_id || null;
    if (branch_id === 'null' || branch_id === 'undefined' || !String(branch_id || '').trim()) branch_id = null;

    const { department, warehouse_id, priority, required_date, notes, items } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ status: 'error', message: 'At least one item is required in the purchase request' });
    }

    // Validate item quantities and products
    for (const item of items) {
        const qty = parseFloat(item.quantity);
        if (!item.product_id || isNaN(qty) || qty <= 0) {
            return res.status(400).json({ status: 'error', message: 'Each item must have a valid product and quantity (> 0)' });
        }
    }

    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');

        // Generate unique server-side request number
        const request_number = await generateRequestNumber(client, tenant_id);

        const headerRes = await client.query(`
            INSERT INTO purchase_requests
                (request_number, requested_by, department, branch_id, warehouse_id, priority, required_date, notes, status, tenant_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'draft', $9)
            RETURNING *
        `, [
            request_number,
            req.user.id,
            department || null,
            branch_id ? String(branch_id) : null,
            warehouse_id ? parseInt(warehouse_id) : null,
            priority || 'normal',
            required_date || null,
            notes || null,
            tenant_id
        ]);

        const request = headerRes.rows[0];

        // Insert Items
        for (const item of items) {
            await client.query(`
                INSERT INTO purchase_request_items
                    (request_id, product_id, description, quantity, estimated_unit_price)
                VALUES ($1, $2, $3, $4, $5)
            `, [
                request.id,
                parseInt(item.product_id),
                item.description || null,
                parseFloat(item.quantity),
                parseFloat(item.estimated_unit_price || 0)
            ]);
        }

        await client.query('COMMIT');
        res.status(201).json({ status: 'success', data: request, message: 'Purchase request draft created successfully' });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('createPurchaseRequest Error:', err.message);
        res.status(500).json({ status: 'error', message: err.message || 'Failed to create purchase request' });
    } finally {
        client.release();
    }
};

// @desc    Update a Purchase Request (Drafts only)
// @route   PUT /api/purchase-requests/:id
// @access  Private
exports.updatePurchaseRequest = async (req, res) => {
    const tenant_id = req.user.tenant_id;
    const { id } = req.params;
    const { department, warehouse_id, priority, required_date, notes, items } = req.body;

    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');

        // Lock row and verify draft state
        const existingRes = await client.query(`
            SELECT * FROM purchase_requests 
            WHERE id = $1 AND tenant_id::text = $2::text 
            FOR UPDATE
        `, [id, tenant_id]);

        if (existingRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ status: 'error', message: 'Purchase request not found' });
        }

        const current = existingRes.rows[0];
        if (current.status !== 'draft') {
            await client.query('ROLLBACK');
            return res.status(400).json({ status: 'error', message: `Cannot modify a request with status '${current.status}'. Only drafts can be updated.` });
        }

        // Update header
        const updatedHeader = await client.query(`
            UPDATE purchase_requests SET
                department   = COALESCE($1, department),
                warehouse_id = COALESCE($2, warehouse_id),
                priority     = COALESCE($3, priority),
                required_date = COALESCE($4, required_date),
                notes        = COALESCE($5, notes),
                updated_at   = CURRENT_TIMESTAMP
            WHERE id = $6 AND tenant_id::text = $7::text
            RETURNING *
        `, [
            department !== undefined ? department : null,
            warehouse_id !== undefined ? (warehouse_id ? parseInt(warehouse_id) : null) : null,
            priority || null,
            required_date || null,
            notes !== undefined ? notes : null,
            id,
            tenant_id
        ]);

        // If items are provided, replace items
        if (items && Array.isArray(items)) {
            if (items.length === 0) {
                await client.query('ROLLBACK');
                return res.status(400).json({ status: 'error', message: 'At least one item is required' });
            }

            await client.query(`DELETE FROM purchase_request_items WHERE request_id = $1`, [id]);

            for (const item of items) {
                const qty = parseFloat(item.quantity);
                if (!item.product_id || isNaN(qty) || qty <= 0) {
                    await client.query('ROLLBACK');
                    return res.status(400).json({ status: 'error', message: 'All items must have a valid product and quantity (> 0)' });
                }

                await client.query(`
                    INSERT INTO purchase_request_items
                        (request_id, product_id, description, quantity, estimated_unit_price)
                    VALUES ($1, $2, $3, $4, $5)
                `, [
                    id,
                    parseInt(item.product_id),
                    item.description || null,
                    qty,
                    parseFloat(item.estimated_unit_price || 0)
                ]);
            }
        }

        await client.query('COMMIT');
        res.json({ status: 'success', data: updatedHeader.rows[0], message: 'Purchase request updated successfully' });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('updatePurchaseRequest Error:', err.message);
        res.status(500).json({ status: 'error', message: err.message || 'Failed to update purchase request' });
    } finally {
        client.release();
    }
};

// @desc    Submit Purchase Request for Approval (Draft -> Submitted)
// @route   POST /api/purchase-requests/:id/submit
// @access  Private
exports.submitPurchaseRequest = async (req, res) => {
    const tenant_id = req.user.tenant_id;
    const { id } = req.params;

    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');

        const existingRes = await client.query(`
            SELECT * FROM purchase_requests
            WHERE id = $1 AND tenant_id::text = $2::text
            FOR UPDATE
        `, [id, tenant_id]);

        if (existingRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ status: 'error', message: 'Purchase request not found' });
        }

        const pr = existingRes.rows[0];
        if (pr.status !== 'draft') {
            await client.query('ROLLBACK');
            return res.status(400).json({ status: 'error', message: `Only draft requests can be submitted. Current status: '${pr.status}'` });
        }

        const countRes = await client.query(`
            SELECT COUNT(*)::int AS count FROM purchase_request_items WHERE request_id = $1
        `, [id]);
        const itemsCount = countRes.rows[0].count;

        if (itemsCount === 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ status: 'error', message: 'Cannot submit a purchase request with no items' });
        }

        const updateRes = await client.query(`
            UPDATE purchase_requests
            SET status = 'submitted', updated_at = CURRENT_TIMESTAMP
            WHERE id = $1 AND tenant_id::text = $2::text
            RETURNING *
        `, [id, tenant_id]);

        await client.query('COMMIT');
        res.json({ status: 'success', data: updateRes.rows[0], message: 'Purchase request submitted for approval' });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('submitPurchaseRequest Error:', err.message);
        res.status(500).json({ status: 'error', message: err.message || 'Failed to submit request' });
    } finally {
        client.release();
    }
};

// @desc    Approve Purchase Request (Submitted -> Approved)
// @route   POST /api/purchase-requests/:id/approve
// @access  Private
exports.approvePurchaseRequest = async (req, res) => {
    const tenant_id = req.user.tenant_id;
    const { id } = req.params;

    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');

        // Concurrency Lock: FOR UPDATE prevents double approval
        const checkRes = await client.query(`
            SELECT * FROM purchase_requests
            WHERE id = $1 AND tenant_id::text = $2::text
            FOR UPDATE
        `, [id, tenant_id]);

        if (checkRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ status: 'error', message: 'Purchase request not found' });
        }

        const pr = checkRes.rows[0];
        if (pr.status !== 'submitted') {
            await client.query('ROLLBACK');
            return res.status(400).json({ status: 'error', message: `Only submitted requests can be approved. Current status: '${pr.status}'` });
        }

        const result = await client.query(`
            UPDATE purchase_requests
            SET 
                status = 'approved',
                approved_by = $1,
                approved_at = CURRENT_TIMESTAMP,
                rejection_reason = NULL,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $2 AND tenant_id::text = $3::text
            RETURNING *
        `, [req.user.id, id, tenant_id]);

        await client.query('COMMIT');
        res.json({ status: 'success', data: result.rows[0], message: 'Purchase request approved successfully' });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('approvePurchaseRequest Error:', err.message);
        res.status(500).json({ status: 'error', message: err.message || 'Failed to approve request' });
    } finally {
        client.release();
    }
};

// @desc    Reject Purchase Request (Submitted -> Rejected)
// @route   POST /api/purchase-requests/:id/reject
// @access  Private
exports.rejectPurchaseRequest = async (req, res) => {
    const tenant_id = req.user.tenant_id;
    const { id } = req.params;
    const { rejection_reason } = req.body;

    if (!rejection_reason || !rejection_reason.trim()) {
        return res.status(400).json({ status: 'error', message: 'Rejection reason is required' });
    }

    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');

        const checkRes = await client.query(`
            SELECT * FROM purchase_requests
            WHERE id = $1 AND tenant_id::text = $2::text
            FOR UPDATE
        `, [id, tenant_id]);

        if (checkRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ status: 'error', message: 'Purchase request not found' });
        }

        const pr = checkRes.rows[0];
        if (pr.status !== 'submitted') {
            await client.query('ROLLBACK');
            return res.status(400).json({ status: 'error', message: `Only submitted requests can be rejected. Current status: '${pr.status}'` });
        }

        const result = await client.query(`
            UPDATE purchase_requests
            SET 
                status = 'rejected',
                rejection_reason = $1,
                approved_by = $2,
                approved_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $3 AND tenant_id::text = $4::text
            RETURNING *
        `, [rejection_reason.trim(), req.user.id, id, tenant_id]);

        await client.query('COMMIT');
        res.json({ status: 'success', data: result.rows[0], message: 'Purchase request rejected' });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('rejectPurchaseRequest Error:', err.message);
        res.status(500).json({ status: 'error', message: err.message || 'Failed to reject request' });
    } finally {
        client.release();
    }
};

// @desc    Cancel Purchase Request (Draft or Submitted -> Cancelled)
// @route   POST /api/purchase-requests/:id/cancel
// @access  Private
exports.cancelPurchaseRequest = async (req, res) => {
    const tenant_id = req.user.tenant_id;
    const { id } = req.params;

    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');

        const checkRes = await client.query(`
            SELECT * FROM purchase_requests
            WHERE id = $1 AND tenant_id::text = $2::text
            FOR UPDATE
        `, [id, tenant_id]);

        if (checkRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ status: 'error', message: 'Purchase request not found' });
        }

        const pr = checkRes.rows[0];
        if (['approved', 'cancelled', 'converted_to_rfq'].includes(pr.status)) {
            await client.query('ROLLBACK');
            return res.status(400).json({ status: 'error', message: `Cannot cancel a request that is already '${pr.status}'` });
        }

        const result = await client.query(`
            UPDATE purchase_requests
            SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
            WHERE id = $1 AND tenant_id::text = $2::text
            RETURNING *
        `, [id, tenant_id]);

        await client.query('COMMIT');
        res.json({ status: 'success', data: result.rows[0], message: 'Purchase request cancelled' });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('cancelPurchaseRequest Error:', err.message);
        res.status(500).json({ status: 'error', message: err.message || 'Failed to cancel request' });
    } finally {
        client.release();
    }
};
