const db = require('../config/db');

/**
 * Enterprise Inventory Movement Engine
 * Strict, Event-Sourced stock calculation matrix. 
 */

class MovementService {
    
    /**
     * Get real-time stock balance calculated dynamically from movement ledger
     * @param {UUID} tenant_id 
     * @param {UUID} branch_id 
     * @param {Int} product_id 
     * @param {Int} warehouse_id (Optional: If null, calculates total global stock across branch)
     * @returns {Decimal} Total available quantity
     */
    async getStock(tenant_id, branch_id, product_id, warehouse_id = null) {
        const inventoryStockService = require('./inventoryStockService');
        const result = await inventoryStockService.getProductStock(tenant_id, product_id, {
            warehouseId: warehouse_id,
            branchId: branch_id
        });
        return result.current_stock;
    }

    /**
     * Create a Pending Movement Ticket
     */
    async createMovement(data, user_id) {
        const { tenant_id, branch_id, product_id, from_warehouse_id, to_warehouse_id, type, quantity, reference_type, reference_id, source } = data;

        if (quantity <= 0) throw new Error("Quantity must be greater than 0");

        // Verify product tracking: reject stock movements for non-inventory items
        const pRes = await db.query(
            `SELECT id, name, COALESCE(is_inventory_item, true) as is_inventory_item FROM products WHERE id = $1 AND (tenant_id::text = $2::text OR ($2 IS NULL AND tenant_id IS NULL))`,
            [product_id, tenant_id ? String(tenant_id) : null]
        );
        if (pRes.rows.length === 0) throw new Error("Product not found");
        if (pRes.rows[0].is_inventory_item === false) {
            throw new Error(`Product "${pRes.rows[0].name}" is a non-inventory item and cannot have stock movements.`);
        }

        // System movements are Auto-Approved. Manual movements require pending checks.
        const initialStatus = source === 'system' ? 'approved' : 'pending';

        const res = await db.query(`
            INSERT INTO stock_movements 
            (tenant_id, branch_id, product_id, from_warehouse_id, to_warehouse_id, type, quantity, reference_type, reference_id, created_by, status)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            RETURNING *
        `, [tenant_id, branch_id, product_id, from_warehouse_id || null, to_warehouse_id || null, type, quantity, reference_type || null, reference_id || null, user_id, initialStatus]);

        return res.rows[0];
    }

    /**
     * Approve and apply a movement to the ledger.
     * Prevents negative stock exceptions with ACID serialization.
     */
    async approveMovement(movement_id, tenant_id, user_id) {
        // Begin Transaction immediately to block race conditions
        const client = await db.pool.connect();

        try {
            await client.query('BEGIN');

            const moveRes = await client.query(`
                SELECT * FROM stock_movements WHERE id = $1 AND tenant_id = $2 FOR UPDATE
            `, [movement_id, tenant_id]);

            if (moveRes.rows.length === 0) throw new Error("Movement not found");
            const movement = moveRes.rows[0];

            if (movement.status === 'approved') throw new Error("Movement is already approved");

            // 1. Lock product row to serialize concurrent transactions for this SKU
            const pRes = await client.query(`
                SELECT id, name, COALESCE(is_inventory_item, true) as is_inventory_item, COALESCE(cost_price, 0) as cost_price
                FROM products
                WHERE id = $1 AND (tenant_id::text = $2::text OR ($2 IS NULL AND tenant_id IS NULL))
                FOR UPDATE
            `, [movement.product_id, tenant_id ? String(tenant_id) : null]);

            if (pRes.rows.length === 0) throw new Error("Product not found");
            const product = pRes.rows[0];

            if (product.is_inventory_item === false) {
                throw new Error(`Product "${product.name}" is a non-inventory item and cannot have stock movements.`);
            }

            // 2. Prevent negative stock strictly on out/transfer
            if (movement.type === 'out' || movement.type === 'transfer') {
                const sourceWarehouse = movement.from_warehouse_id || null;

                // Query safe stock WITHOUT FOR UPDATE on aggregate to avoid Postgres syntax error
                // Row serialization is already guaranteed by the SELECT ... FOR UPDATE on products above
                const inventoryStockService = require('./inventoryStockService');
                const stockResult = await inventoryStockService.getProductStock(tenant_id, movement.product_id, {
                    warehouseId: sourceWarehouse,
                    branchId: sourceWarehouse ? null : movement.branch_id,
                    client
                });

                const safeStock = stockResult.current_stock;

                if (safeStock < parseFloat(movement.quantity)) {
                    throw new Error(`Insufficient stock. You are trying to move ${movement.quantity} but only ${safeStock} available at the source location.`);
                }
            }

            // 3. Apply Approval
            const finalRes = await client.query(`
                UPDATE stock_movements 
                SET status = 'approved', approved_by = $1
                WHERE id = $2 RETURNING *
            `, [user_id, movement_id]);

            // 4. Gracefully post GL Journal Entry if COA is configured
            try {
                const InventoryValuationService = require('../src/domains/inventory/InventoryValuationService');
                const unitCost = Number(movement.unit_cost || product.cost_price || 0);
                await InventoryValuationService.postMovementJournal(client, finalRes.rows[0], unitCost, user_id);
            } catch (glErr) {
                // Non-fatal if accounting integration is not fully configured for this tenant
                console.warn('[InventoryMovement] Skipping GL journal posting:', glErr.message);
            }

            await client.query('COMMIT');
            return finalRes.rows[0];
            
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    }
}

module.exports = new MovementService();
