const db = require('../config/db');
const movementService = require('../services/movementService');

// @desc    Get all movements (Ledger view)
// @route   GET /api/inventory/movements
// @access  Private
exports.getMovements = async (req, res) => {
    const tenant_id = req.user.tenant_id;
    const branch_id = req.branchId;

    try {
        const result = await db.query(`
            SELECT m.*, p.name as product_name, p.sku as product_sku, wf.name as from_warehouse_name, wt.name as to_warehouse_name
            FROM stock_movements m
            JOIN products p ON m.product_id = p.id
            LEFT JOIN warehouses wf ON m.from_warehouse_id = wf.id
            LEFT JOIN warehouses wt ON m.to_warehouse_id = wt.id
            WHERE m.tenant_id = $1 AND m.branch_id = $2
            ORDER BY m.created_at DESC
        `, [tenant_id, branch_id]);

        res.json({ status: 'success', data: result.rows });
    } catch (err) {
        console.error('getMovements error:', err);
        res.status(500).json({ status: 'error', message: 'Failed to fetch inventory ledger' });
    }
};

// @desc    Get Stock aggregate list for the branch
// @route   GET /api/inventory/stock
// @access  Private
exports.getStockList = async (req, res) => {
    const tenant_id = req.user.tenant_id;
    const branch_id = req.branchId;

    try {
        // Fast dynamic ledger aggregation across the entire branch
        const result = await db.query(`
            SELECT 
                p.id as product_id,
                p.name as product_name,
                p.sku as product_sku,
                COALESCE(SUM(
                    CASE 
                        WHEN type IN ('in', 'adjustment') THEN quantity
                        WHEN type = 'transfer' THEN quantity
                        ELSE 0 
                    END
                ), 0) -
                COALESCE(SUM(
                    CASE 
                        WHEN type IN ('out', 'adjustment') THEN quantity
                        WHEN type = 'transfer' THEN quantity
                        ELSE 0 
                    END
                ), 0) as current_stock
            FROM stock_movements m
            JOIN products p ON m.product_id = p.id
            WHERE m.tenant_id = $1 AND m.branch_id = $2 AND m.status = 'approved'
            GROUP BY p.id
        `, [tenant_id, branch_id]);

        res.json({ status: 'success', data: result.rows });
    } catch (err) {
        console.error('getStock error:', err);
        res.status(500).json({ status: 'error', message: 'Failed to measure active stock.' });
    }
};

// @desc    Create a new stock movement
// @route   POST /api/inventory/movements
// @access  Private
exports.createMovement = async (req, res) => {
    try {
        const payload = {
            tenant_id: req.user.tenant_id,
            branch_id: req.branchId,
            ...req.body
        };

        const movement = await movementService.createMovement(payload, req.user.id);
        res.status(201).json({ status: 'success', message: 'Movement queued successfully.', data: movement });
    } catch (err) {
        console.error('createMovement error:', err);
        res.status(400).json({ status: 'error', message: err.message });
    }
};

// @desc    Approve an existing movement
// @route   PUT /api/inventory/movements/:id/approve
// @access  Private
exports.approveMovement = async (req, res) => {
    try {
        const approvedMovement = await movementService.approveMovement(req.params.id, req.user.tenant_id, req.user.id);
        res.json({ status: 'success', message: 'Movement Approved & Stock Updated.', data: approvedMovement });
    } catch (err) {
        console.error('approveMovement error:', err);
        res.status(400).json({ status: 'error', message: err.message });
    }
};

// @desc    Get Branch Warehouses
// @route   GET /api/inventory/warehouses
// @access  Private
exports.getWarehouses = async (req, res) => {
    const tenant_id = req.user.tenant_id;
    const branch_id = req.branchId;

    try {
        const result = await db.query(`SELECT * FROM warehouses WHERE tenant_id = $1 AND branch_id = $2 ORDER BY name ASC`, [tenant_id, branch_id]);
        res.json({ status: 'success', data: result.rows });
    } catch (err) {
        res.status(500).json({ status: 'error', message: 'Failed to fetch warehouses' });
    }
};
