/**
 * InventoryStockService — Centralized Warehouse & Inventory Ledger Engine (Phase 3.1)
 *
 * Responsibilities:
 *  - Calculates real-time stock balances dynamically from `stock_movements` (Immutable Event-Sourced Ledger).
 *  - Distinguishes Trackable (goods) vs Non-Trackable (services/non-stock) products via `products.is_inventory_item`.
 *  - Computes warehouse-level, branch-level (via warehouse branch ownership), and tenant-level inventory balances.
 *  - Provides ACID concurrency protection via `SELECT ... FROM products ... FOR UPDATE` row locking.
 *  - Executes safe, atomic inter-branch and intra-branch warehouse transfers.
 */

const db = require('../config/db');

class InventoryStockService {
    /**
     * Lock a product row to serialize concurrent inventory modifications for this SKU.
     * Prevents race conditions, over-dispensation, and phantom updates.
     *
     * @param {Object} client - Active pg PoolClient inside a transaction block
     * @param {number|string} productId
     * @param {string} tenantId
     * @returns {Promise<Object>} The locked product row
     */
    async lockProductForUpdate(client, productId, tenantId) {
        const res = await client.query(`
            SELECT id, name, sku, is_inventory_item
            FROM products
            WHERE id = $1 AND (tenant_id::text = $2::text OR ($2 IS NULL AND tenant_id IS NULL))
            FOR UPDATE
        `, [productId, tenantId ? String(tenantId) : null]);

        if (res.rows.length === 0) {
            throw new Error(`Product ${productId} not found for this tenant.`);
        }
        return res.rows[0];
    }

    /**
     * Get stock balance for a product at a specific warehouse, branch, or company-wide.
     * If the product is non-trackable (is_inventory_item === false), returns non-trackable status with unlimited availability.
     *
     * @param {string} tenantId
     * @param {number} productId
     * @param {Object} options
     * @param {number} [options.warehouseId] - Specific warehouse ID
     * @param {string} [options.branchId] - Specific branch ID
     * @param {Object} [options.client] - Optional active transaction client
     * @returns {Promise<{ is_inventory_item: boolean, current_stock: number, status: string }>}
     */
    async getProductStock(tenantId, productId, { warehouseId = null, branchId = null, client = null } = {}) {
        const queryRunner = client || db;

        // 1. Fetch product tracking status
        const pRes = await queryRunner.query(`
            SELECT id, name, COALESCE(is_inventory_item, true) as is_inventory_item
            FROM products
            WHERE id = $1 AND (tenant_id::text = $2::text OR ($2 IS NULL AND tenant_id IS NULL))
        `, [productId, tenantId ? String(tenantId) : null]);

        if (pRes.rows.length === 0) {
            throw new Error(`Product ${productId} not found.`);
        }

        const product = pRes.rows[0];
        if (product.is_inventory_item === false) {
            return {
                is_inventory_item: false,
                current_stock: Infinity,
                status: 'non_trackable'
            };
        }

        // 2. Specific Warehouse Level
        if (warehouseId) {
            const res = await queryRunner.query(`
                SELECT COALESCE(SUM(
                    CASE 
                        WHEN to_warehouse_id = $1 AND type IN ('in', 'adjustment', 'transfer') THEN quantity
                        WHEN from_warehouse_id = $1 AND type IN ('out', 'adjustment', 'transfer') THEN -quantity
                        ELSE 0
                    END
                ), 0) AS current_stock
                FROM stock_movements
                WHERE product_id = $2
                  AND (tenant_id::text = $3::text OR ($3 IS NULL AND tenant_id IS NULL))
                  AND status = 'approved'
            `, [warehouseId, productId, tenantId ? String(tenantId) : null]);

            return {
                is_inventory_item: true,
                current_stock: parseFloat(res.rows[0]?.current_stock) || 0,
                status: 'tracked'
            };
        }

        // 3. Branch Level (Aggregating all warehouses belonging to this branch)
        if (branchId) {
            const res = await queryRunner.query(`
                SELECT COALESCE(SUM(
                    (CASE WHEN wt.branch_id::text = $1::text AND m.type IN ('in', 'adjustment', 'transfer') THEN m.quantity ELSE 0 END)
                    -
                    (CASE WHEN wf.branch_id::text = $1::text AND m.type IN ('out', 'adjustment', 'transfer') THEN m.quantity ELSE 0 END)
                ), 0) AS current_stock
                FROM stock_movements m
                LEFT JOIN warehouses wt ON m.to_warehouse_id = wt.id
                LEFT JOIN warehouses wf ON m.from_warehouse_id = wf.id
                WHERE m.product_id = $2
                  AND (m.tenant_id::text = $3::text OR ($3 IS NULL AND m.tenant_id IS NULL))
                  AND m.status = 'approved'
            `, [String(branchId), productId, tenantId ? String(tenantId) : null]);

            return {
                is_inventory_item: true,
                current_stock: parseFloat(res.rows[0]?.current_stock) || 0,
                status: 'tracked'
            };
        }

        // 4. Company-Wide / Tenant Total
        const res = await queryRunner.query(`
            SELECT COALESCE(SUM(
                CASE 
                    WHEN type = 'in' THEN quantity
                    WHEN type = 'out' THEN -quantity
                    WHEN type = 'adjustment' AND to_warehouse_id IS NOT NULL THEN quantity
                    WHEN type = 'adjustment' AND from_warehouse_id IS NOT NULL THEN -quantity
                    -- Internal transfers between warehouses of the same tenant do not alter company total
                    ELSE 0
                END
            ), 0) AS current_stock
            FROM stock_movements
            WHERE product_id = $1
              AND (tenant_id::text = $2::text OR ($2 IS NULL AND tenant_id IS NULL))
              AND status = 'approved'
        `, [productId, tenantId ? String(tenantId) : null]);

        return {
            is_inventory_item: true,
            current_stock: parseFloat(res.rows[0]?.current_stock) || 0,
            status: 'tracked'
        };
    }

    /**
     * Get stock aggregate list for a branch or company.
     * Uses LEFT JOIN on products so products with 0 movements appear correctly with stock 0.
     *
     * @param {string} tenantId
     * @param {string} [branchId]
     * @returns {Promise<Array>}
     */
    async getStockList(tenantId, branchId = null) {
        let query;
        let params;

        if (branchId) {
            query = `
                SELECT 
                    p.id as product_id,
                    p.name as product_name,
                    p.sku as product_sku,
                    COALESCE(p.unit, 'piece') as product_unit,
                    COALESCE(p.cost_price, 0) as cost_price,
                    COALESCE(p.selling_price, 0) as selling_price,
                    COALESCE(p.is_inventory_item, true) as is_inventory_item,
                    p.category,
                    COALESCE(SUM(
                        (CASE WHEN wt.branch_id::text = $2::text AND m.type IN ('in', 'adjustment', 'transfer') THEN m.quantity ELSE 0 END)
                        -
                        (CASE WHEN wf.branch_id::text = $2::text AND m.type IN ('out', 'adjustment', 'transfer') THEN m.quantity ELSE 0 END)
                    ), 0)::numeric as current_stock
                FROM products p
                LEFT JOIN stock_movements m 
                    ON p.id = m.product_id 
                    AND m.status = 'approved' 
                    AND (m.tenant_id::text = $1::text OR ($1 IS NULL AND m.tenant_id IS NULL))
                LEFT JOIN warehouses wt ON m.to_warehouse_id = wt.id
                LEFT JOIN warehouses wf ON m.from_warehouse_id = wf.id
                WHERE (p.tenant_id::text = $1::text OR ($1 IS NULL AND p.tenant_id IS NULL))
                  AND (p.is_inventory_item = true OR p.is_inventory_item IS NULL)
                GROUP BY p.id
                ORDER BY p.name ASC
            `;
            params = [tenantId ? String(tenantId) : null, String(branchId)];
        } else {
            query = `
                SELECT 
                    p.id as product_id,
                    p.name as product_name,
                    p.sku as product_sku,
                    COALESCE(p.unit, 'piece') as product_unit,
                    COALESCE(p.cost_price, 0) as cost_price,
                    COALESCE(p.selling_price, 0) as selling_price,
                    COALESCE(p.is_inventory_item, true) as is_inventory_item,
                    p.category,
                    COALESCE(SUM(
                        CASE 
                            WHEN m.type = 'in' THEN m.quantity
                            WHEN m.type = 'out' THEN -m.quantity
                            WHEN m.type = 'adjustment' AND m.to_warehouse_id IS NOT NULL THEN m.quantity
                            WHEN m.type = 'adjustment' AND m.from_warehouse_id IS NOT NULL THEN -m.quantity
                            ELSE 0 
                        END
                    ), 0)::numeric as current_stock
                FROM products p
                LEFT JOIN stock_movements m 
                    ON p.id = m.product_id 
                    AND m.status = 'approved' 
                    AND (m.tenant_id::text = $1::text OR ($1 IS NULL AND m.tenant_id IS NULL))
                WHERE (p.tenant_id::text = $1::text OR ($1 IS NULL AND p.tenant_id IS NULL))
                  AND (p.is_inventory_item = true OR p.is_inventory_item IS NULL)
                GROUP BY p.id
                ORDER BY p.name ASC
            `;
            params = [tenantId ? String(tenantId) : null];
        }

        const res = await db.query(query, params);
        return res.rows.map(row => ({
            ...row,
            current_stock: parseFloat(row.current_stock) || 0,
            cost_price: parseFloat(row.cost_price) || 0,
            selling_price: parseFloat(row.selling_price) || 0
        }));
    }

    /**
     * Get real-time stock balances and valuation for a specific warehouse.
     *
     * @param {string} tenantId
     * @param {number} warehouseId
     * @returns {Promise<Array>}
     */
    async getWarehouseStockList(tenantId, warehouseId) {
        const query = `
            SELECT 
                p.id as product_id,
                p.name as product_name,
                p.sku,
                COALESCE(p.unit, 'piece') as unit,
                COALESCE(p.cost_price, 0) as cost_price,
                COALESCE(p.selling_price, 0) as selling_price,
                p.category,
                COALESCE(p.is_inventory_item, true) as is_inventory_item,
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
                AND (m.tenant_id::text = $2::text OR ($2 IS NULL AND m.tenant_id IS NULL))
                AND (m.to_warehouse_id = $1 OR m.from_warehouse_id = $1)
            WHERE (p.tenant_id::text = $2::text OR ($2 IS NULL AND p.tenant_id IS NULL))
              AND (p.is_inventory_item = true OR p.is_inventory_item IS NULL)
            GROUP BY p.id
            ORDER BY p.name ASC
        `;

        const res = await db.query(query, [warehouseId, tenantId ? String(tenantId) : null]);
        return res.rows.map(row => {
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
    }

    /**
     * Execute an atomic warehouse transfer with strict concurrency locking and validation.
     * Rejects non-inventory items, checks available source warehouse stock, and inserts approved transfer movement.
     *
     * @param {Object} params
     * @param {string} params.tenantId
     * @param {string} [params.branchId]
     * @param {number} params.fromWarehouseId
     * @param {number} params.toWarehouseId
     * @param {number} params.productId
     * @param {number} params.quantity
     * @param {string} [params.notes]
     * @param {number} params.userId
     * @returns {Promise<Object>}
     */
    async executeTransfer({ tenantId, branchId, fromWarehouseId, toWarehouseId, productId, quantity, notes, userId }) {
        const qty = parseFloat(quantity);
        if (!qty || qty <= 0) {
            throw new Error('Quantity must be greater than 0');
        }
        if (!fromWarehouseId || !toWarehouseId) {
            throw new Error('Source and destination warehouses are required');
        }
        if (String(fromWarehouseId) === String(toWarehouseId)) {
            throw new Error('Source and destination warehouses must be different');
        }
        if (!productId) {
            throw new Error('Product is required');
        }

        const client = await db.pool.connect();
        try {
            await client.query('BEGIN');

            // 1. Lock product row to serialize concurrent movements for this SKU
            const product = await this.lockProductForUpdate(client, productId, tenantId);

            // 2. Reject non-inventory items
            if (product.is_inventory_item === false) {
                throw new Error(`Product "${product.name}" is a non-inventory item and cannot be transferred.`);
            }

            // 3. Verify warehouse existence and tenant ownership
            const whRes = await client.query(`
                SELECT id, branch_id FROM warehouses
                WHERE id IN ($1, $2) AND (tenant_id::text = $3::text OR ($3 IS NULL AND tenant_id IS NULL))
            `, [fromWarehouseId, toWarehouseId, tenantId ? String(tenantId) : null]);

            if (whRes.rows.length < 2) {
                throw new Error('One or both warehouses were not found for this tenant.');
            }

            // 4. Calculate available source stock inside the transaction lock
            const stockResult = await this.getProductStock(tenantId, productId, { warehouseId: fromWarehouseId, client });
            const availableStock = stockResult.current_stock;

            if (availableStock < qty) {
                throw new Error(`Insufficient stock in source warehouse. Available: ${availableStock}, Requested: ${qty}`);
            }

            // 5. Insert approved transfer movement directly
            const moveRes = await client.query(`
                INSERT INTO stock_movements
                    (tenant_id, branch_id, product_id, from_warehouse_id, to_warehouse_id, type, quantity, reference_type, reference_id, created_by, approved_by, status)
                VALUES ($1, $2, $3, $4, $5, 'transfer', $6, 'direct_transfer', $7, $8, $8, 'approved')
                RETURNING *
            `, [
                tenantId ? String(tenantId) : null,
                branchId ? String(branchId) : null,
                productId,
                fromWarehouseId,
                toWarehouseId,
                qty,
                notes || `Transfer from WH #${fromWarehouseId} to WH #${toWarehouseId}`,
                userId
            ]);

            await client.query('COMMIT');
            return moveRes.rows[0];

        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    }

    /**
     * Item Movement Card: chronological approved ledger for one product with running balance.
     * Direction rules MIRROR the established balance logic (getProductStock / getStockList /
     * getWarehouseStockList) so the card total equals Stock Balances for the same scope:
     *  - Warehouse scope: +qty if to_warehouse = w AND type IN (in, adjustment, transfer);
     *                     -qty if from_warehouse = w AND type IN (out, adjustment, transfer).
     *  - Branch scope:    same, matching warehouses.branch_id (transfers between branches move stock).
     *  - Company scope:   in(+), out(-), adjustment by to/from warehouse, transfer = 0.
     * Only status = 'approved' movements are counted.
     * NOTE: stock_movements has no per-movement cost. `cost_price` is the product's STORED cost
     * (not a verified weighted average) and is used only as an indicative valuation rate.
     *
     * @param {string} tenantId
     * @param {number|string} productId  (validated integer by caller)
     * @param {{warehouseId?: number|null, branchId?: string|null, from?: Date|null, to?: Date|null}} opts
     * @returns {Promise<Object|null>} null when the product does not belong to the tenant
     */
    async getItemCard(tenantId, productId, { warehouseId = null, branchId = null, from = null, to = null } = {}) {
        const tid = tenantId ? String(tenantId) : null;
        const pRes = await db.query(`
            SELECT id, name, sku, category, unit, cost_price,
                   COALESCE(is_inventory_item, true) AS is_inventory_item
            FROM products
            WHERE id = $1 AND tenant_id::text = $2::text
        `, [productId, tid]);
        if (pRes.rows.length === 0) return null;
        const product = pRes.rows[0];
        const costPrice = product.cost_price === null || product.cost_price === undefined
            ? null : parseFloat(product.cost_price);

        if (product.is_inventory_item === false) {
            return { product, is_inventory_item: false, current_stock: null, cost_price: costPrice, movements: [] };
        }

        const mRes = await db.query(`
            SELECT m.id, m.type, m.quantity, m.reference_type, m.reference_id, m.created_at,
                   m.from_warehouse_id, m.to_warehouse_id,
                   wf.name AS from_warehouse_name, wt.name AS to_warehouse_name,
                   wf.branch_id AS from_branch_id, wt.branch_id AS to_branch_id
            FROM stock_movements m
            LEFT JOIN warehouses wf ON m.from_warehouse_id = wf.id
            LEFT JOIN warehouses wt ON m.to_warehouse_id = wt.id
            WHERE m.product_id = $1 AND m.tenant_id::text = $2::text AND m.status = 'approved'
            ORDER BY m.created_at ASC, m.id ASC
        `, [productId, tid]);

        const wid = warehouseId ? Number(warehouseId) : null;
        const bid = !wid && branchId ? String(branchId) : null;
        const IN_TYPES = ['in', 'adjustment', 'transfer'];
        const OUT_TYPES = ['out', 'adjustment', 'transfer'];

        let balance = 0;
        const rows = [];
        for (const m of mRes.rows) {
            const q = parseFloat(m.quantity) || 0;
            let qtyIn = 0, qtyOut = 0;
            if (wid) {
                if (Number(m.to_warehouse_id) === wid && IN_TYPES.includes(m.type)) qtyIn = q;
                if (Number(m.from_warehouse_id) === wid && OUT_TYPES.includes(m.type)) qtyOut = q;
            } else if (bid) {
                if (m.to_branch_id && String(m.to_branch_id) === bid && IN_TYPES.includes(m.type)) qtyIn = q;
                if (m.from_branch_id && String(m.from_branch_id) === bid && OUT_TYPES.includes(m.type)) qtyOut = q;
            } else if (m.type === 'in') qtyIn = q;
            else if (m.type === 'out') qtyOut = q;
            else if (m.type === 'adjustment') {
                if (m.to_warehouse_id) qtyIn = q; else if (m.from_warehouse_id) qtyOut = q;
            }
            if ((wid || bid) && qtyIn === 0 && qtyOut === 0) continue; // outside this scope
            balance += qtyIn - qtyOut;
            rows.push({
                id: m.id,
                date: m.created_at,
                doc_no: m.reference_id ? `${m.reference_type || 'DOC'}-${m.reference_id}` : `MOV-${m.id}`,
                type: m.type,
                reference_type: m.reference_type,
                warehouse: [m.from_warehouse_name, m.to_warehouse_name].filter(Boolean).join(' → ') || '—',
                qty_in: qtyIn,
                qty_out: qtyOut,
                balance,
                unit_price: costPrice,
                total_val: costPrice === null ? null : balance * costPrice
            });
        }

        // Date filter applies to displayed rows only; running balance still includes prior history.
        const fromTs = from ? from.getTime() : null;
        const toTs = to ? to.getTime() + 86399999 : null;
        const movements = rows.filter(r => {
            const t = new Date(r.date).getTime();
            return (fromTs === null || t >= fromTs) && (toTs === null || t <= toTs);
        });

        return { product, is_inventory_item: true, current_stock: balance, cost_price: costPrice, movements };
    }

}

module.exports = new InventoryStockService();
