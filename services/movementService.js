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
        let query = `
            SELECT 
                COALESCE(SUM(
                    CASE 
                        WHEN type IN ('in', 'adjustment') AND (to_warehouse_id = $3 OR $3 IS NULL) THEN quantity
                        WHEN type = 'transfer' AND to_warehouse_id = $3 THEN quantity
                        ELSE 0 
                    END
                ), 0) -
                COALESCE(SUM(
                    CASE 
                        WHEN type IN ('out', 'adjustment') AND (from_warehouse_id = $3 OR $3 IS NULL) THEN quantity
                        WHEN type = 'transfer' AND from_warehouse_id = $3 THEN quantity
                        ELSE 0 
                    END
                ), 0) as current_stock
            FROM stock_movements 
            WHERE product_id = $1 AND tenant_id = $2 AND branch_id = $4 AND status = 'approved'
        `;

        const params = [product_id, tenant_id, warehouse_id, branch_id];

        // Ensure we isolate strictly by branch
        const res = await db.query(query, params);
        return parseFloat(res.rows[0].current_stock) || 0;
    }

    /**
     * Create a Pending Movement Ticket
     */
    async createMovement(data, user_id) {
        const { tenant_id, branch_id, product_id, from_warehouse_id, to_warehouse_id, type, quantity, reference_type, reference_id, source } = data;

        if (quantity <= 0) throw new Error("Quantity must be greater than 0");

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
     * Prevents negative stock exceptions.
     */
    async approveMovement(movement_id, tenant_id, user_id) {
        // Begin Transaction immediately to block race conditions
        const client = await db.pool.connect(); // use pool connect for raw transaction block

        try {
            await client.query('BEGIN');

            const moveRes = await client.query(`
                SELECT * FROM stock_movements WHERE id = $1 AND tenant_id = $2 FOR UPDATE
            `, [movement_id, tenant_id]);

            if (moveRes.rows.length === 0) throw new Error("Movement not found");
            const movement = moveRes.rows[0];

            if (movement.status === 'approved') throw new Error("Movement is already approved");

            // Prevent negative stock checks strictly on out/transfer
            if (movement.type === 'out' || movement.type === 'transfer') {
                // Determine source warehouse
                const sourceWarehouse = movement.from_warehouse_id || null;

                // We must use a direct SQL stock calc to ensure 100% ACID consistency inside the transaction lock
                const stockRes = await client.query(`
                    SELECT 
                        COALESCE(SUM(
                            CASE 
                                WHEN type IN ('in', 'adjustment') AND (to_warehouse_id = $3 OR $3 IS NULL) THEN quantity
                                WHEN type = 'transfer' AND to_warehouse_id = $3 THEN quantity
                                ELSE 0 
                            END
                        ), 0) -
                        COALESCE(SUM(
                            CASE 
                                WHEN type IN ('out', 'adjustment') AND (from_warehouse_id = $3 OR $3 IS NULL) THEN quantity
                                WHEN type = 'transfer' AND from_warehouse_id = $3 THEN quantity
                                ELSE 0 
                            END
                        ), 0) as safe_stock
                    FROM stock_movements 
                    WHERE product_id = $1 AND tenant_id = $2 AND branch_id = $4 AND status = 'approved'
                    FOR UPDATE
                `, [movement.product_id, tenant_id, sourceWarehouse, movement.branch_id]);

                const safeStock = parseFloat(stockRes.rows[0].safe_stock) || 0;

                if (safeStock < movement.quantity) {
                    throw new Error(`Insufficient stock. You are trying to move ${movement.quantity} but only ${safeStock} available at the source location.`);
                }

                // Phase 7 Workflow Engine: Low Stock → Auto-Purchase + Notify
                const newStock = safeStock - movement.quantity;
                if (newStock < 10) {
                    const workflowEngine = require('./workflowEngine');
                    // Fetch product name for better notification context
                    db.query('SELECT name FROM products WHERE id = $1', [movement.product_id])
                        .then(pRes => {
                            const product_name = pRes.rows[0]?.name;
                            // Hardcoded workflow
                            workflowEngine.onLowStock({
                                product_id: movement.product_id,
                                product_name,
                                current_stock: newStock,
                                tenant_id,
                                branch_id: movement.branch_id,
                                triggered_by: user_id
                            }).catch(e => console.error('[Workflow] Low Stock dispatch error:', e.message));

                            // Phase 3: DB-driven rules
                            const { runRules } = require('./ruleEngine');
                            runRules('LOW_STOCK', {
                                tenant_id,
                                branch_id: movement.branch_id,
                                product_id: movement.product_id,
                                product_name,
                                stock: newStock,
                                created_by: user_id,
                                _entity_type: 'products',
                                _entity_id: movement.product_id,
                                _summary: `Stock for "${product_name}" dropped to ${newStock} units.`,
                                _link: '/inventory/movements'
                            }).catch(e => console.error('[RuleEngine] LOW_STOCK error:', e.message));
                        })
                        .catch(e => console.error('[Workflow] Product fetch error:', e.message));
                }
            }

            // Apply Approval
            const finalRes = await client.query(`
                UPDATE stock_movements 
                SET status = 'approved', approved_by = $1
                WHERE id = $2 RETURNING *
            `, [user_id, movement_id]);

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
