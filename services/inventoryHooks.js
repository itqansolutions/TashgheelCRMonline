const movementService = require('./movementService');
const notificationService = require('./notificationService');
const db = require('../config/db');

/**
 * Enterprise Inventory Hooks Layer (DEPRECATED FOR SALES STOCK OUT)
 *
 * ARCHITECTURAL RULE (Phase G-1):
 * Physical stock deductions are exclusively governed by DeliveryNoteService upon
 * delivery confirmation. Invoices are financial obligation documents; payments are
 * cash transactions. Neither may move physical warehouse stock.
 */
class InventoryHooks {

    /**
     * @deprecated Neutralized in Phase G-1 to prevent double stock deduction.
     * All outbound warehouse movements must originate from DeliveryNoteService.
     */
    async onInvoicePaid(invoice_id, tenant_id, branch_id, acting_user_id) {
        // Safe No-Op: Inventory deduction is authoritative only via Delivery Notes
        return;
    }

    /**
     * @deprecated Neutralized in Phase G-1.
     * Delivery returns must originate from Delivery Note reversal workflows.
     */
    async onInvoiceVoided(invoice_id, tenant_id, branch_id, acting_user_id) {
        // Safe No-Op: Inventory return is authoritative only via Delivery Returns
        return;
    }

}

module.exports = new InventoryHooks();
