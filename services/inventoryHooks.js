const movementService = require('./movementService');
const notificationService = require('./notificationService');
const db = require('../config/db');

/**
 * Enterprise Inventory Hooks Layer
 * Detaches the physical Inventory operations from the Controllers, ensuring the ERP stays loosely coupled.
 */
class InventoryHooks {

    /**
     * Triggered when an Invoice is fully or partially paid, finalizing a physical exit of stock out of the branch.
     * Extracts items dynamically and pipelines them to the Inventory Ledger.
     */
    async onInvoicePaid(invoice_id, tenant_id, branch_id, acting_user_id) {
        try {
            // Get all actual items tied to the invoice
            const itemsRes = await db.query(`SELECT product_id, quantity FROM invoice_items WHERE invoice_id = $1 AND product_id IS NOT NULL`, [invoice_id]);
            
            if (itemsRes.rows.length === 0) return; // No tangible products (possibly a service), nothing to ship out in Inventory

            for (let item of itemsRes.rows) {
                // Generate a System OUT movement inherently auto-approved
                await movementService.createMovement({
                    tenant_id,
                    branch_id,
                    product_id: item.product_id,
                    type: 'out',
                    quantity: parseFloat(item.quantity),
                    from_warehouse_id: null, // Pulls from global branch stock dynamically
                    to_warehouse_id: null,
                    reference_type: 'invoice',
                    reference_id: String(invoice_id),
                    source: 'system' // System movements auto-approve
                }, acting_user_id);
            }

            // Phase 6 System Intelligence: Inform Managers of Payment & Logistics Dispatch
            await notificationService.notifyRole({
                role: 'manager',
                type: 'INVOICE_PAID',
                title: 'Payment Received & Stock Dispatched',
                message: `Invoice #${invoice_id} has been strictly tied to a successful payment. Linked logistics stock was autonomously deducted.`,
                tenant_id,
                branch_id,
                link: '/finance/invoices'
            });

        } catch (err) {
            console.error('InventoryHook (onInvoicePaid) Failed:', err.message);
            // Non-blocking fail-safe: We log but do not crash the payment transaction
        }
    }

    /**
     * Triggered if an Invoice is canceled/refunded.
     * Safely pipelines a reversal movement bringing stock back IN.
     */
    async onInvoiceVoided(invoice_id, tenant_id, branch_id, acting_user_id) {
        try {
            const itemsRes = await db.query(`SELECT product_id, quantity FROM invoice_items WHERE invoice_id = $1 AND product_id IS NOT NULL`, [invoice_id]);
            
            for (let item of itemsRes.rows) {
                await movementService.createMovement({
                    tenant_id,
                    branch_id,
                    product_id: item.product_id,
                    type: 'in', // Returning stock to inventory pool
                    quantity: parseFloat(item.quantity),
                    from_warehouse_id: null, 
                    to_warehouse_id: null, // Pushing into global branch stock globally
                    reference_type: 'invoice_reversal',
                    reference_id: String(invoice_id),
                    source: 'system'
                }, acting_user_id);
            }
        } catch (err) {
            console.error('InventoryHook (onInvoiceVoided) Failed:', err.message);
        }
    }

}

module.exports = new InventoryHooks();
