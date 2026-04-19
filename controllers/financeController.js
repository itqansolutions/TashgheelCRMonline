const db = require('../config/db');
const { logCreate, logUpdate, logAction, ACTIONS } = require('../services/loggerService');

// Helper to generate Invoice Number
const generateInvoiceNumber = async (tenant_id, branch_id) => {
    // 1. Get branch prefix
    const branchRes = await db.query('SELECT invoice_prefix FROM branches WHERE id = $1 AND tenant_id::text = $2::text', [branch_id, tenant_id]);
    const prefix = branchRes.rows.length && branchRes.rows[0].invoice_prefix ? branchRes.rows[0].invoice_prefix + '-' : 'INV-';

    // 2. Safely get the next sequence number for this tenant
    // Using a simple count + 1 approach or max() because PostgreSQL sequences per tenant are hard to manage dynamically.
    const seqRes = await db.query(`SELECT COUNT(*) + 1 as next_id FROM invoices WHERE tenant_id::text = $1::text`, [tenant_id]);
    const nextSeq = String(seqRes.rows[0].next_id).padStart(4, '0');

    return `${prefix}${nextSeq}`;
};

// @desc    Get all invoices for Branch/Tenant
// @route   GET /api/finance/invoices
// @access  Private
exports.getInvoices = async (req, res) => {
    const tenant_id = req.user.tenant_id;
    const branch_id = req.branchId;

    try {
        const result = await db.query(`
            SELECT 
                i.*,
                COALESCE((SELECT SUM(amount) FROM payments p WHERE p.invoice_id::text = i.id::text), 0) as total_paid,
                (i.total_amount - COALESCE((SELECT SUM(amount) FROM payments p WHERE p.invoice_id::text = i.id::text), 0)) as remaining_balance,
                c.name as customer_name
            FROM invoices i
            LEFT JOIN deals d ON .deal_id::text = .id::text AND .tenant_id::text = .tenant_id::text 
            LEFT JOIN customers c ON .client_id::text = .id::text AND .tenant_id::text = .tenant_id::text
            WHERE i.tenant_id::text = $1::text AND i.branch_id::text = $2::text
            ORDER BY i.created_at DESC
        `, [tenant_id, branch_id]);

        res.json({ status: 'success', data: result.rows });
    } catch (err) {
        console.error('getInvoices Error:', err.message);
        res.status(500).json({ status: 'error', message: 'Failed to retrieve invoices.' });
    }
};

// @desc    Create a new invoice
// @route   POST /api/finance/invoices
// @access  Private
exports.createInvoice = async (req, res) => {
    const tenant_id = req.user.tenant_id;
    const branch_id = req.branchId;
    const { customer_id, deal_id, due_date, items } = req.body;

    try {
        await db.query('BEGIN'); // Start Transaction

        const invoiceNumber = await generateInvoiceNumber(tenant_id, branch_id);
        
        let total_amount = items.reduce((sum, item) => sum + (parseFloat(item.unit_price) * parseInt(item.quantity)), 0);

        // Insert Invoice
        // We need to ensure columns exist. customer_id and deal_id were not explicitly in schema.sql invoices definition.
        // Let's add them dynamically if needed or just insert what we have. 
        // We will do a generic insert, assuming schema might need a patch for customer_id if it fails, or we patch it beforehand.
        const invRes = await db.query(`
            INSERT INTO invoices (invoice_number, total_amount, due_date, status, tenant_id, branch_id)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *
        `, [invoiceNumber, total_amount, due_date || null, 'unpaid', tenant_id, branch_id]);
        
        const newInvoiceId = invRes.rows[0].id;

        // Insert Items
        for (const item of items) {
            await db.query(`
                INSERT INTO invoice_items (invoice_id, product_id, quantity, unit_price, subtotal, tenant_id, branch_id)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
            `, [newInvoiceId, item.product_id || null, item.quantity, item.unit_price, (item.unit_price * item.quantity), tenant_id, branch_id]);
        }

        await db.query('COMMIT');

        logCreate(req, 'Invoice', newInvoiceId, { invoiceNumber, total_amount });

        res.status(201).json({ status: 'success', data: invRes.rows[0] });
    } catch (err) {
        await db.query('ROLLBACK');
        console.error('createInvoice Error:', err.message);
        res.status(500).json({ status: 'error', message: 'Failed to create invoice.' });
    }
};

// @desc    Convert a Deal into an Invoice (One-Click Billing)
// @route   POST /api/finance/invoices/from-deal/:dealId
exports.createInvoiceFromDeal = async (req, res) => {
    const tenant_id = req.user.tenant_id;
    const branch_id = req.branchId;
    const deal_id = req.params.dealId;

    try {
        await db.query('BEGIN');

        // Fetch Deal details
        const dealRes = await db.query('SELECT * FROM deals WHERE id = $1 AND tenant_id::text = $2::text AND branch_id::text = $3::text FOR UPDATE', [deal_id, tenant_id, branch_id]);
        if (dealRes.rows.length === 0) throw new Error('Deal not found or unauthorized');
        
        const deal = dealRes.rows[0];
        
        // Generate Invoice
        const invoiceNumber = await generateInvoiceNumber(tenant_id, branch_id);
        const invRes = await db.query(`
            INSERT INTO invoices (invoice_number, total_amount, status, tenant_id, branch_id, deal_id)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *
        `, [invoiceNumber, deal.value, 'unpaid', tenant_id, branch_id, deal.id]);
        
        const newInvoiceId = invRes.rows[0].id;

        // Fetch product if any, otherwise generic item
        let product_name = deal.title;
        let product_id = deal.product_id;
        
        if (product_id) {
             const prodRes = await db.query('SELECT name FROM products WHERE id = $1', [product_id]);
             if (prodRes.rows.length > 0) product_name = prodRes.rows[0].name;
        }

        // Insert Single Item
        await db.query(`
            INSERT INTO invoice_items (invoice_id, product_id, quantity, unit_price, subtotal, tenant_id, branch_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [newInvoiceId, product_id, 1, deal.value, deal.value, tenant_id, branch_id]);

        // Mark Deal as Won
        await db.query(`UPDATE deals SET pipeline_stage = 'won' WHERE id = $1`, [deal.id]);

        await db.query('COMMIT');

        logCreate(req, 'Invoice (from Deal)', newInvoiceId, { invoiceNumber, deal_id });

        res.status(201).json({ status: 'success', data: invRes.rows[0] });
    } catch (err) {
        await db.query('ROLLBACK');
        console.error('createInvoiceFromDeal Error:', err.message);
        res.status(500).json({ status: 'error', message: err.message });
    }
};

// @desc    Register a new payment against an invoice (Partial Payment Support)
// @route   POST /api/finance/payments
// @access  Private
exports.createPayment = async (req, res) => {
    const tenant_id = req.user.tenant_id;
    const branch_id = req.branchId;
    const { invoice_id, amount, payment_method, notes } = req.body;

    try {
        await db.query('BEGIN');

        // 1. Fetch Invoice
        const invRes = await db.query('SELECT total_amount FROM invoices WHERE id = $1 AND tenant_id::text = $2::text AND branch_id::text = $3::text FOR UPDATE', [invoice_id, tenant_id, branch_id]);
        if (invRes.rows.length === 0) throw new Error('Invoice not found or unauthorized');
        
        const invoiceTotal = parseFloat(invRes.rows[0].total_amount);

        // 2. Fetch existing payments
        const paidRes = await db.query('SELECT COALESCE(SUM(amount), 0) as total_paid FROM payments WHERE invoice_id = $1 AND tenant_id::text = $2::text', [invoice_id, tenant_id]);
        const currentlyPaid = parseFloat(paidRes.rows[0].total_paid);

        const newTotalPaid = currentlyPaid + parseFloat(amount);

        if (newTotalPaid > invoiceTotal) {
            throw new Error(`Payment amount exceeds remaining balance. Max allowed: ${invoiceTotal - currentlyPaid}`);
        }

        // 3. Insert Payment
        const payRes = await db.query(`
            INSERT INTO payments (invoice_id, amount, payment_method, notes, tenant_id, branch_id)
            VALUES ($1, $2, $3, $4, $5, $6) RETURNING *
        `, [invoice_id, amount, payment_method, notes, tenant_id, branch_id]);

        // 4. Update Invoice Status
        let newStatus = 'unpaid';
        if (newTotalPaid >= invoiceTotal) {
            newStatus = 'paid';
        } else if (newTotalPaid > 0) {
            newStatus = 'partial';
        }

        await db.query(`UPDATE invoices SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`, [newStatus, invoice_id]);

        await db.query('COMMIT');

        // Phase 5 Enterprise Concept: Fire the Hook Event OUTSIDE the transaction block
        if (newStatus === 'paid') {
            const inventoryHooks = require('../services/inventoryHooks');
            // Using setImmediate or direct await. Since Hooks are decoupled, we just await it to block cleanly (or void it).
            await inventoryHooks.onInvoicePaid(invoice_id, tenant_id, branch_id, req.user.id);
        }

        logAction({ req, action: ACTIONS.PAYMENT, entityType: 'Invoice', entityId: invoice_id, details: { amount, newStatus } });

        res.status(201).json({ status: 'success', data: payRes.rows[0], message: `Payment registered. Invoice status updated to ${newStatus}` });
    } catch (err) {
        await db.query('ROLLBACK');
        console.error('createPayment Error:', err.message);
        res.status(400).json({ status: 'error', message: err.message });
    }
};

// @desc    Get Detailed Invoice for PDF Preview
// @route   GET /api/finance/invoices/:id
// @access  Private
exports.getInvoiceDetails = async (req, res) => {
    const tenant_id = req.user.tenant_id;
    const branch_id = req.branchId;
    const invoice_id = req.params.id;

    try {
        const invRes = await db.query(`
            SELECT i.*, COALESCE(p.total_paid, 0) as total_paid, (i.total_amount - COALESCE(p.total_paid, 0)) as remaining_balance 
            FROM invoices i
            LEFT JOIN (SELECT invoice_id, SUM(amount) as total_paid FROM payments WHERE tenant_id::text = $1::text GROUP BY invoice_id) p ON i.id::text = p.invoice_id::text
            WHERE i.id = $2 AND i.tenant_id::text = $1::text AND i.branch_id::text = $3::text
        `, [tenant_id, invoice_id, branch_id]);

        if (invRes.rows.length === 0) return res.status(404).json({ status: 'error', message: 'Invoice not found' });

        const itemsRes = await db.query('SELECT * FROM invoice_items WHERE invoice_id = $1', [invoice_id]);
        const paymentsRes = await db.query('SELECT * FROM payments WHERE invoice_id = $1 ORDER BY payment_date DESC', [invoice_id]);

        res.json({
            status: 'success',
            data: {
                invoice: invRes.rows[0],
                items: itemsRes.rows,
                payments: paymentsRes.rows
            }
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ status: 'error', message: 'Failed to retrieve invoice details.' });
    }
};
