const db = require('../config/db');
const movementService = require('../services/movementService');

// Self-healing schema guard for lightweight warehouse and keeper extensions
let schemaChecked = false;
async function ensureWarehouseSchema() {
    if (schemaChecked) return;
    try {
        await db.query(`
            ALTER TABLE warehouses ADD COLUMN IF NOT EXISTS code VARCHAR(50);
            ALTER TABLE warehouses ADD COLUMN IF NOT EXISTS location TEXT;
            ALTER TABLE warehouses ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

            CREATE TABLE IF NOT EXISTS warehouse_keepers (
                id SERIAL PRIMARY KEY,
                warehouse_id INTEGER REFERENCES warehouses(id) ON DELETE CASCADE,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE (warehouse_id, user_id)
            );
            CREATE INDEX IF NOT EXISTS idx_wh_keepers_wh ON warehouse_keepers(warehouse_id);
            CREATE INDEX IF NOT EXISTS idx_wh_keepers_user ON warehouse_keepers(user_id);
        `);
        schemaChecked = true;
    } catch (e) {
        console.error('[Warehouse Schema Guard Error]:', e.message);
    }
}

// @desc    Get all movements (Ledger view)
// @route   GET /api/inventory/movements
// @access  Private
exports.getMovements = async (req, res) => {
    const tenant_id = req.user.tenant_id;
    const branch_id = req.branchId;

    try {
        const result = await db.query(`
            SELECT m.*, p.name as product_name, p.sku as product_sku, p.unit as product_unit,
                   wf.name as from_warehouse_name, wt.name as to_warehouse_name
            FROM stock_movements m
            JOIN products p ON m.product_id = p.id
            LEFT JOIN warehouses wf ON m.from_warehouse_id = wf.id
            LEFT JOIN warehouses wt ON m.to_warehouse_id = wt.id
            WHERE m.tenant_id::text = $1::text AND (m.branch_id::text = $2::text OR $2 IS NULL)
            ORDER BY m.created_at DESC
        `, [tenant_id, branch_id || null]);

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
        const result = await db.query(`
            SELECT 
                p.id as product_id,
                p.name as product_name,
                p.sku as product_sku,
                p.unit as product_unit,
                p.cost_price,
                p.selling_price,
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
            WHERE m.tenant_id::text = $1::text AND (m.branch_id::text = $2::text OR $2 IS NULL) AND m.status = 'approved'
            GROUP BY p.id
        `, [tenant_id, branch_id || null]);

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

// ── WAREHOUSES & KEEPERS (PHASE 2) ─────────────────────────

// @desc    Get Warehouses with Keepers
// @route   GET /api/inventory/warehouses
// @access  Private
exports.getWarehouses = async (req, res) => {
    const tenant_id = req.user.tenant_id;
    const branch_id = req.branchId;

    try {
        await ensureWarehouseSchema();
        const result = await db.query(`
            SELECT 
                w.id,
                w.name,
                w.code,
                w.location,
                COALESCE(w.is_active, true) as is_active,
                w.created_at,
                COALESCE(
                    (
                        SELECT json_agg(json_build_object('id', u.id, 'name', u.name, 'email', u.email))
                        FROM warehouse_keepers wk
                        JOIN users u ON wk.user_id = u.id
                        WHERE wk.warehouse_id = w.id
                    ),
                    '[]'::json
                ) as keepers
            FROM warehouses w
            WHERE w.tenant_id::text = $1::text AND (w.branch_id::text = $2::text OR $2 IS NULL)
            ORDER BY w.name ASC
        `, [tenant_id, branch_id || null]);

        res.json({ status: 'success', data: result.rows });
    } catch (err) {
        console.error('getWarehouses error:', err.message);
        res.status(500).json({ status: 'error', message: 'Failed to fetch warehouses' });
    }
};

// @desc    Create Warehouse with Keepers
// @route   POST /api/inventory/warehouses
// @access  Private
exports.createWarehouse = async (req, res) => {
    const tenant_id = req.user.tenant_id;
    const branch_id = req.branchId || null;
    const { name, code, location, is_active, keeper_ids } = req.body;

    if (!name || !name.trim()) {
        return res.status(400).json({ status: 'error', message: 'Warehouse name is required' });
    }

    try {
        await ensureWarehouseSchema();

        const insertRes = await db.query(`
            INSERT INTO warehouses (name, code, location, is_active, tenant_id, branch_id)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *
        `, [name.trim(), code || null, location || null, is_active !== false, tenant_id, branch_id]);

        const warehouse = insertRes.rows[0];

        // Assign keepers if provided
        if (Array.isArray(keeper_ids) && keeper_ids.length > 0) {
            for (const userId of keeper_ids) {
                if (userId) {
                    await db.query(`
                        INSERT INTO warehouse_keepers (warehouse_id, user_id, tenant_id)
                        VALUES ($1, $2, $3)
                        ON CONFLICT (warehouse_id, user_id) DO NOTHING
                    `, [warehouse.id, userId, tenant_id]);
                }
            }
        }

        // Fetch back complete warehouse object with keepers
        const fullRes = await db.query(`
            SELECT 
                w.*,
                COALESCE(
                    (
                        SELECT json_agg(json_build_object('id', u.id, 'name', u.name, 'email', u.email))
                        FROM warehouse_keepers wk
                        JOIN users u ON wk.user_id = u.id
                        WHERE wk.warehouse_id = w.id
                    ),
                    '[]'::json
                ) as keepers
            FROM warehouses w WHERE w.id = $1
        `, [warehouse.id]);

        res.status(201).json({ status: 'success', data: fullRes.rows[0], message: 'Warehouse created successfully' });
    } catch (err) {
        console.error('createWarehouse error:', err.message);
        res.status(500).json({ status: 'error', message: err.message || 'Failed to create warehouse' });
    }
};

// @desc    Update Warehouse
// @route   PUT /api/inventory/warehouses/:id
// @access  Private
exports.updateWarehouse = async (req, res) => {
    const tenant_id = req.user.tenant_id;
    const branch_id = req.branchId || null;
    const warehouseId = req.params.id;
    const { name, code, location, is_active, keeper_ids } = req.body;

    if (!name || !name.trim()) {
        return res.status(400).json({ status: 'error', message: 'Warehouse name is required' });
    }

    try {
        await ensureWarehouseSchema();

        const updateRes = await db.query(`
            UPDATE warehouses
            SET name = $1, code = $2, location = $3, is_active = $4
            WHERE id = $5 AND tenant_id::text = $6::text
            RETURNING *
        `, [name.trim(), code || null, location || null, is_active !== false, warehouseId, tenant_id]);

        if (updateRes.rows.length === 0) {
            return res.status(404).json({ status: 'error', message: 'Warehouse not found' });
        }

        // Update keepers if keeper_ids array was passed
        if (Array.isArray(keeper_ids)) {
            await db.query(`DELETE FROM warehouse_keepers WHERE warehouse_id = $1`, [warehouseId]);
            for (const userId of keeper_ids) {
                if (userId) {
                    await db.query(`
                        INSERT INTO warehouse_keepers (warehouse_id, user_id, tenant_id)
                        VALUES ($1, $2, $3)
                        ON CONFLICT (warehouse_id, user_id) DO NOTHING
                    `, [warehouseId, userId, tenant_id]);
                }
            }
        }

        const fullRes = await db.query(`
            SELECT 
                w.*,
                COALESCE(
                    (
                        SELECT json_agg(json_build_object('id', u.id, 'name', u.name, 'email', u.email))
                        FROM warehouse_keepers wk
                        JOIN users u ON wk.user_id = u.id
                        WHERE wk.warehouse_id = w.id
                    ),
                    '[]'::json
                ) as keepers
            FROM warehouses w WHERE w.id = $1
        `, [warehouseId]);

        res.json({ status: 'success', data: fullRes.rows[0], message: 'Warehouse updated successfully' });
    } catch (err) {
        console.error('updateWarehouse error:', err.message);
        res.status(500).json({ status: 'error', message: err.message || 'Failed to update warehouse' });
    }
};

// @desc    Delete or Deactivate Warehouse
// @route   DELETE /api/inventory/warehouses/:id
// @access  Private
exports.deleteWarehouse = async (req, res) => {
    const tenant_id = req.user.tenant_id;
    const warehouseId = req.params.id;

    try {
        await ensureWarehouseSchema();

        // Check if movements reference this warehouse
        const movesCheck = await db.query(`
            SELECT id FROM stock_movements 
            WHERE (from_warehouse_id = $1 OR to_warehouse_id = $1) AND tenant_id::text = $2::text 
            LIMIT 1
        `, [warehouseId, tenant_id]);

        if (movesCheck.rows.length > 0) {
            // Cannot hard-delete if historical movements exist; deactivate instead
            await db.query(`UPDATE warehouses SET is_active = false WHERE id = $1 AND tenant_id::text = $2::text`, [warehouseId, tenant_id]);
            return res.json({ status: 'success', message: 'Warehouse has movement history and was deactivated instead of deleted.' });
        }

        // Delete keepers & warehouse safely
        await db.query(`DELETE FROM warehouse_keepers WHERE warehouse_id = $1`, [warehouseId]);
        const delRes = await db.query(`DELETE FROM warehouses WHERE id = $1 AND tenant_id::text = $2::text RETURNING id`, [warehouseId, tenant_id]);

        if (delRes.rows.length === 0) {
            return res.status(404).json({ status: 'error', message: 'Warehouse not found' });
        }

        res.json({ status: 'success', message: 'Warehouse deleted successfully' });
    } catch (err) {
        console.error('deleteWarehouse error:', err.message);
        res.status(500).json({ status: 'error', message: err.message || 'Failed to delete warehouse' });
    }
};

// ── WAREHOUSE STOCK BALANCES (PHASE 3) ─────────────────────

// @desc    Get real-time product stock for a specific warehouse
// @route   GET /api/inventory/warehouses/:id/stock
// @access  Private
exports.getWarehouseStock = async (req, res) => {
    const tenant_id = req.user.tenant_id;
    const warehouseId = parseInt(req.params.id);

    if (isNaN(warehouseId)) {
        return res.status(400).json({ status: 'error', message: 'Invalid warehouse ID' });
    }

    try {
        // Query products with dynamic ledger balance for this warehouse
        const result = await db.query(`
            SELECT 
                p.id as product_id,
                p.name as product_name,
                p.sku,
                COALESCE(p.unit, 'piece') as unit,
                COALESCE(p.cost_price, 0) as cost_price,
                COALESCE(p.selling_price, 0) as selling_price,
                p.category,
                (
                    COALESCE(SUM(
                        CASE 
                            WHEN m.type IN ('in', 'adjustment') AND m.to_warehouse_id = $1 THEN m.quantity
                            WHEN m.type = 'transfer' AND m.to_warehouse_id = $1 THEN m.quantity
                            ELSE 0 
                        END
                    ), 0) -
                    COALESCE(SUM(
                        CASE 
                            WHEN m.type IN ('out', 'adjustment') AND m.from_warehouse_id = $1 THEN m.quantity
                            WHEN m.type = 'transfer' AND m.from_warehouse_id = $1 THEN m.quantity
                            ELSE 0 
                        END
                    ), 0)
                )::numeric as quantity
            FROM products p
            LEFT JOIN stock_movements m 
                ON p.id = m.product_id 
                AND m.status = 'approved' 
                AND m.tenant_id::text = $2::text
                AND (m.to_warehouse_id = $1 OR m.from_warehouse_id = $1)
            WHERE p.tenant_id::text = $2::text
            GROUP BY p.id
            ORDER BY p.name ASC
        `, [warehouseId, tenant_id]);

        const rowsWithValuation = result.rows.map(row => {
            const qty = parseFloat(row.quantity) || 0;
            const cost = parseFloat(row.cost_price) || 0;
            return {
                ...row,
                quantity: qty,
                cost_price: cost,
                selling_price: parseFloat(row.selling_price) || 0,
                total_value: qty * cost
            };
        });

        res.json({ status: 'success', data: rowsWithValuation });
    } catch (err) {
        console.error('getWarehouseStock error:', err.message);
        res.status(500).json({ status: 'error', message: 'Failed to fetch warehouse stock' });
    }
};

// ── SIMPLE DIRECT TRANSFER (PHASE 4) ───────────────────────

// @desc    Direct warehouse-to-warehouse transfer
// @route   POST /api/inventory/transfers
// @access  Private
exports.createTransfer = async (req, res) => {
    const tenant_id = req.user.tenant_id;
    const branch_id = req.branchId || null;
    const { from_warehouse_id, to_warehouse_id, product_id, quantity, notes } = req.body;

    const qty = parseFloat(quantity);
    if (!qty || qty <= 0) {
        return res.status(400).json({ status: 'error', message: 'Quantity must be greater than 0' });
    }

    if (!from_warehouse_id || !to_warehouse_id) {
        return res.status(400).json({ status: 'error', message: 'Source and destination warehouses are required' });
    }

    if (String(from_warehouse_id) === String(to_warehouse_id)) {
        return res.status(400).json({ status: 'error', message: 'Source and destination warehouses must be different' });
    }

    if (!product_id) {
        return res.status(400).json({ status: 'error', message: 'Product is required' });
    }

    try {
        // 1. Check source stock
        const currentSourceStock = await movementService.getStock(tenant_id, branch_id, product_id, from_warehouse_id);
        if (currentSourceStock < qty) {
            return res.status(400).json({
                status: 'error',
                message: `Insufficient stock in source warehouse. Available: ${currentSourceStock}, Requested: ${qty}`
            });
        }

        // 2. Insert approved transfer movement directly (ACID movement)
        const moveRes = await db.query(`
            INSERT INTO stock_movements
                (tenant_id, branch_id, product_id, from_warehouse_id, to_warehouse_id, type, quantity, reference_type, reference_id, created_by, approved_by, status)
            VALUES ($1, $2, $3, $4, $5, 'transfer', $6, 'direct_transfer', $7, $8, $8, 'approved')
            RETURNING *
        `, [
            tenant_id,
            branch_id,
            product_id,
            from_warehouse_id,
            to_warehouse_id,
            qty,
            notes || `Transfer to WH #${to_warehouse_id}`,
            req.user.id
        ]);

        res.status(201).json({
            status: 'success',
            message: 'Stock transferred successfully',
            data: moveRes.rows[0]
        });
    } catch (err) {
        console.error('createTransfer error:', err.message);
        res.status(500).json({ status: 'error', message: err.message || 'Transfer failed' });
    }
};

// ── SIMPLE STOCK TAKING / ADJUSTMENT (PHASE 5) ─────────────

// @desc    Perform inventory count and apply discrepancy adjustments
// @route   POST /api/inventory/stock-take
// @access  Private
exports.recordStockTake = async (req, res) => {
    const tenant_id = req.user.tenant_id;
    const branch_id = req.branchId || null;
    const { warehouse_id, items, notes } = req.body;

    if (!warehouse_id) {
        return res.status(400).json({ status: 'error', message: 'Warehouse is required' });
    }

    if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ status: 'error', message: 'Items list cannot be empty' });
    }

    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');

        let adjustmentsCount = 0;

        for (const item of items) {
            const productId = item.product_id;
            const actualQty = parseFloat(item.actual_quantity);

            if (isNaN(actualQty) || actualQty < 0) continue;

            // Compute system quantity inside transaction
            const stockRes = await client.query(`
                SELECT 
                    COALESCE(SUM(
                        CASE 
                            WHEN type IN ('in', 'adjustment') AND to_warehouse_id = $1 THEN quantity
                            WHEN type = 'transfer' AND to_warehouse_id = $1 THEN quantity
                            ELSE 0 
                        END
                    ), 0) -
                    COALESCE(SUM(
                        CASE 
                            WHEN type IN ('out', 'adjustment') AND from_warehouse_id = $1 THEN quantity
                            WHEN type = 'transfer' AND from_warehouse_id = $1 THEN quantity
                            ELSE 0 
                        END
                    ), 0) as current_stock
                FROM stock_movements
                WHERE product_id = $2 AND tenant_id::text = $3::text AND status = 'approved'
            `, [warehouse_id, productId, tenant_id]);

            const systemQty = parseFloat(stockRes.rows[0]?.current_stock) || 0;
            const diff = actualQty - systemQty;

            if (diff > 0.0001) {
                // Stock In Adjustment (Surplus)
                await client.query(`
                    INSERT INTO stock_movements
                        (tenant_id, branch_id, product_id, from_warehouse_id, to_warehouse_id, type, quantity, reference_type, reference_id, created_by, approved_by, status)
                    VALUES ($1, $2, $3, NULL, $4, 'adjustment', $5, 'stock_take', $6, $7, $7, 'approved')
                `, [tenant_id, branch_id, productId, warehouse_id, diff, notes || 'Stock count surplus', req.user.id]);
                adjustmentsCount++;
            } else if (diff < -0.0001) {
                // Stock Out Adjustment (Deficit / Shrinkage)
                const absDiff = Math.abs(diff);
                await client.query(`
                    INSERT INTO stock_movements
                        (tenant_id, branch_id, product_id, from_warehouse_id, to_warehouse_id, type, quantity, reference_type, reference_id, created_by, approved_by, status)
                    VALUES ($1, $2, $3, $4, NULL, 'adjustment', $5, 'stock_take', $6, $7, $7, 'approved')
                `, [tenant_id, branch_id, productId, warehouse_id, absDiff, notes || 'Stock count deficit', req.user.id]);
                adjustmentsCount++;
            }
        }

        await client.query('COMMIT');
        res.json({
            status: 'success',
            message: `Stock count processed. ${adjustmentsCount} adjustment movement(s) applied to live ledger.`
        });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('recordStockTake error:', err.message);
        res.status(500).json({ status: 'error', message: err.message || 'Stock take failed' });
    } finally {
        client.release();
    }
};
