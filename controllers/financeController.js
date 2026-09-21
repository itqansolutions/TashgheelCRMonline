const db = require('../config/db');
const { logCreate, logUpdate, logDelete, logAction, ACTIONS } = require('../services/loggerService');

// Ensure finance_vouchers table exists with multi-tenant safety
let vouchersTableReady = false;
const ensureVouchersTable = async () => {
    if (vouchersTableReady) return;
    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS finance_vouchers (
                id SERIAL PRIMARY KEY,
                voucher_number VARCHAR(50) NOT NULL,
                voucher_type VARCHAR(20) NOT NULL, -- 'receipt' (قبض) | 'payment' (صرف)
                party_type VARCHAR(50) DEFAULT 'customer', -- 'customer', 'vendor', 'employee', 'other'
                party_name VARCHAR(255) NOT NULL,
                customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
                vendor_id INTEGER REFERENCES vendors(id) ON DELETE SET NULL,
                invoice_id INTEGER REFERENCES invoices(id) ON DELETE SET NULL,
                amount DECIMAL(15, 2) NOT NULL,
                payment_method VARCHAR(50) DEFAULT 'cash', -- 'cash', 'bank_transfer', 'check', 'card'
                treasury_account VARCHAR(100) DEFAULT 'Main Cash / الخزينة الرئيسية',
                reference_no VARCHAR(100),
                notes TEXT,
                voucher_date DATE DEFAULT CURRENT_DATE,
                created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
                tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
                branch_id INTEGER REFERENCES branches(id) ON DELETE CASCADE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_finance_vouchers_tenant_branch ON finance_vouchers(tenant_id, branch_id);
            CREATE INDEX IF NOT EXISTS idx_finance_vouchers_type ON finance_vouchers(voucher_type);
        `);
        vouchersTableReady = true;
    } catch (err) {
        console.error('[Finance] Error ensuring finance_vouchers table:', err.message);
    }
};

// Helper to generate Invoice Number
const generateInvoiceNumber = async (tenant_id, branch_id) => {
    const branchRes = await db.query('SELECT invoice_prefix FROM branches WHERE id = $1 AND tenant_id::text = $2::text', [branch_id, tenant_id]);
    const prefix = branchRes.rows.length && branchRes.rows[0].invoice_prefix ? branchRes.rows[0].invoice_prefix + '-' : 'INV-';

    const seqRes = await db.query(`SELECT COUNT(*) + 1 as next_id FROM invoices WHERE tenant_id::text = $1::text AND branch_id::text = $2::text`, [tenant_id, branch_id]);
    const nextSeq = String(seqRes.rows[0].next_id).padStart(4, '0');

    return `${prefix}${nextSeq}`;
};

// Helper to generate Voucher Number
const generateVoucherNumber = async (tenant_id, branch_id, voucher_type) => {
    await ensureVouchersTable();
    const prefix = voucher_type === 'receipt' ? 'RV-' : 'PV-';
    const seqRes = await db.query(
        `SELECT COUNT(*) + 1 as next_id FROM finance_vouchers WHERE tenant_id::text = $1::text AND branch_id::text = $2::text AND voucher_type = $3`,
        [tenant_id, branch_id, voucher_type]
    );
    const nextSeq = String(seqRes.rows[0].next_id).padStart(4, '0');
    return `${prefix}${nextSeq}`;
};

// @desc    Get all invoices for Branch/Tenant
// @route   GET /api/finance/invoices
exports.getInvoices = async (req, res) => {
    const tenant_id = req.user.tenant_id;
    const branch_id = req.branchId;

    try {
        const result = await db.query(`
            SELECT 
                i.*,
                COALESCE((SELECT SUM(amount) FROM payments p WHERE p.invoice_id::text = i.id::text), 0) as total_paid,
                (i.total_amount - COALESCE((SELECT SUM(amount) FROM payments p WHERE p.invoice_id::text = i.id::text), 0)) as remaining_balance,
                c.name as customer_name,
                u.unit_number, u.project_name
            FROM invoices i
            LEFT JOIN deals d ON i.deal_id::text = d.id::text AND i.tenant_id::text = d.tenant_id::text 
            LEFT JOIN customers c ON i.client_id::text = c.id::text AND i.tenant_id::text = c.tenant_id::text
            LEFT JOIN re_units u ON i.unit_id::text = u.id::text
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
exports.createInvoice = async (req, res) => {
    const tenant_id = req.user.tenant_id;
    const branch_id = req.branchId;
    const { customer_id, client_id, deal_id, unit_id, due_date, items } = req.body;
    const effectiveClientId = customer_id || client_id;

    try {
        await db.query('BEGIN');

        const invoiceNumber = await generateInvoiceNumber(tenant_id, branch_id);
        const validItems = Array.isArray(items) ? items : [];
        let total_amount = validItems.reduce((sum, item) => sum + (parseFloat(item.unit_price || 0) * parseInt(item.quantity || 1)), 0);

        const invRes = await db.query(`
            INSERT INTO invoices (invoice_number, total_amount, due_date, status, tenant_id, branch_id, client_id, deal_id, unit_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING *
        `, [invoiceNumber, total_amount, due_date || null, 'unpaid', tenant_id, branch_id, effectiveClientId || null, deal_id || null, unit_id || null]);
        
        const newInvoiceId = invRes.rows[0].id;

        for (const item of validItems) {
            await db.query(`
                INSERT INTO invoice_items (invoice_id, product_id, quantity, unit_price, subtotal, tenant_id, branch_id, description)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            `, [newInvoiceId, item.product_id || null, item.quantity || 1, item.unit_price || 0, ((item.unit_price || 0) * (item.quantity || 1)), tenant_id, branch_id, item.description || '']);
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

        const dealRes = await db.query('SELECT * FROM deals WHERE id = $1 AND tenant_id::text = $2::text AND branch_id::text = $3::text FOR UPDATE', [deal_id, tenant_id, branch_id]);
        if (dealRes.rows.length === 0) throw new Error('Deal not found or unauthorized');
        
        const deal = dealRes.rows[0];
        const invoiceNumber = await generateInvoiceNumber(tenant_id, branch_id);
        const invRes = await db.query(`
            INSERT INTO invoices (invoice_number, total_amount, status, tenant_id, branch_id, deal_id, client_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *
        `, [invoiceNumber, deal.value, 'unpaid', tenant_id, branch_id, deal.id, deal.customer_id || null]);
        
        const newInvoiceId = invRes.rows[0].id;

        let product_id = deal.product_id;
        await db.query(`
            INSERT INTO invoice_items (invoice_id, product_id, quantity, unit_price, subtotal, tenant_id, branch_id, description)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [newInvoiceId, product_id, 1, deal.value, deal.value, tenant_id, branch_id, deal.title]);

        await db.query(`UPDATE deals SET pipeline_stage = 'won' WHERE id = $1`, [deal.id]);

        if (deal.unit_id && String(deal.unit_id).length > 10) {
            try {
                await db.query(`UPDATE re_units SET status = 'Sold' WHERE id = $1::uuid AND tenant_id::text = $2::text`, [deal.unit_id, tenant_id]);
                const payCheck = await db.query('SELECT id FROM re_payments_mvp WHERE deal_id::text = $1::text AND tenant_id::text = $2::text', [deal.id, tenant_id]);
                if (payCheck.rows.length === 0) {
                    await db.query(`
                        INSERT INTO re_payments_mvp (tenant_id, branch_id, deal_id, total_amount, status)
                        VALUES ($1, $2, $3, $4, 'Pending')
                    `, [tenant_id, branch_id, deal.id, deal.value]);
                }
            } catch (reErr) {
                console.error('[Finance Automation Warning]: Real Estate unit update failed:', reErr.message);
            }
        }

        await db.query('COMMIT');
        logCreate(req, 'Invoice (from Deal)', newInvoiceId, { invoiceNumber, deal_id });

        res.status(201).json({ status: 'success', data: invRes.rows[0] });
    } catch (err) {
        await db.query('ROLLBACK');
        console.error('createInvoiceFromDeal Error:', err.message);
        res.status(500).json({ status: 'error', message: err.message });
    }
};

// Internal reusable helper for payments
const recordPaymentInternal = async ({ tenant_id, branch_id, invoice_id, amount, payment_method, notes, user_id, req }) => {
    const invRes = await db.query('SELECT total_amount, invoice_number, client_id FROM invoices WHERE id = $1 AND tenant_id::text = $2::text AND branch_id::text = $3::text FOR UPDATE', [invoice_id, tenant_id, branch_id]);
    if (invRes.rows.length === 0) throw new Error('Invoice not found or unauthorized');
    
    const invoice = invRes.rows[0];
    const invoiceTotal = parseFloat(invoice.total_amount);

    const paidRes = await db.query('SELECT COALESCE(SUM(amount), 0) as total_paid FROM payments WHERE invoice_id = $1 AND tenant_id::text = $2::text', [invoice_id, tenant_id]);
    const currentlyPaid = parseFloat(paidRes.rows[0].total_paid);
    const newTotalPaid = currentlyPaid + parseFloat(amount);

    if (newTotalPaid > (invoiceTotal + 0.01)) {
        throw new Error(`Payment amount exceeds remaining balance. Max allowed: ${(invoiceTotal - currentlyPaid).toFixed(2)}`);
    }

    const payRes = await db.query(`
        INSERT INTO payments (invoice_id, amount, payment_method, notes, tenant_id, branch_id)
        VALUES ($1, $2, $3, $4, $5, $6) RETURNING *
    `, [invoice_id, amount, payment_method || 'cash', notes || null, tenant_id, branch_id]);

    let newStatus = 'unpaid';
    if (newTotalPaid >= (invoiceTotal - 0.01)) {
        newStatus = 'paid';
    } else if (newTotalPaid > 0) {
        newStatus = 'partial';
    }

    await db.query(`UPDATE invoices SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`, [newStatus, invoice_id]);

    // Also auto-generate a receipt voucher if one wasn't explicitly provided
    let voucherData = null;
    try {
        await ensureVouchersTable();
        const voucherNumber = await generateVoucherNumber(tenant_id, branch_id, 'receipt');
        
        let clientName = 'عميل';
        if (invoice.client_id) {
            const cRes = await db.query('SELECT name FROM customers WHERE id = $1', [invoice.client_id]);
            if (cRes.rows.length > 0) clientName = cRes.rows[0].name;
        }

        const vRes = await db.query(`
            INSERT INTO finance_vouchers (
                voucher_number, voucher_type, party_type, party_name, customer_id, invoice_id,
                amount, payment_method, notes, voucher_date, created_by, tenant_id, branch_id
            ) VALUES ($1, 'receipt', 'customer', $2, $3, $4, $5, $6, $7, CURRENT_DATE, $8, $9, $10)
            RETURNING *
        `, [
            voucherNumber, clientName, invoice.client_id, invoice_id, amount,
            payment_method || 'cash', notes ? `${notes} (سداد فاتورة ${invoice.invoice_number})` : `سداد فاتورة رقم ${invoice.invoice_number}`,
            user_id || null, tenant_id, branch_id
        ]);
        voucherData = vRes.rows[0];
    } catch (vErr) {
        console.warn('[Auto Voucher Warning]: Could not auto-create receipt voucher:', vErr.message);
    }

    if (newStatus === 'paid') {
        try {
            const inventoryHooks = require('../services/inventoryHooks');
            await inventoryHooks.onInvoicePaid(invoice_id, tenant_id, branch_id, user_id);
        } catch (hErr) {
            console.warn('[Inventory Hook Warning]:', hErr.message);
        }
    }

    if (req) {
        logAction({ req, action: ACTIONS.PAYMENT, entityType: 'Invoice', entityId: invoice_id, details: { amount, newStatus } });
    }

    return { payment: payRes.rows[0], newStatus, voucher: voucherData };
};

// @desc    Register a new payment against an invoice (Partial Payment Support)
// @route   POST /api/finance/payments
exports.createPayment = async (req, res) => {
    const tenant_id = req.user.tenant_id;
    const branch_id = req.branchId;
    const { invoice_id, amount, payment_method, notes } = req.body;

    try {
        await db.query('BEGIN');
        const result = await recordPaymentInternal({
            tenant_id,
            branch_id,
            invoice_id,
            amount,
            payment_method,
            notes,
            user_id: req.user.id,
            req
        });
        await db.query('COMMIT');

        res.status(201).json({
            status: 'success',
            data: result.payment,
            voucher: result.voucher,
            message: `Payment registered. Invoice status updated to ${result.newStatus}`
        });
    } catch (err) {
        await db.query('ROLLBACK');
        console.error('createPayment Error:', err.message);
        res.status(400).json({ status: 'error', message: err.message });
    }
};

// @desc    Register payment from nested route: POST /api/finance/invoices/:id/payments
exports.createInvoicePaymentDirect = async (req, res) => {
    const tenant_id = req.user.tenant_id;
    const branch_id = req.branchId;
    const invoice_id = req.params.id;
    const { amount, payment_method, notes } = req.body;

    try {
        await db.query('BEGIN');
        const result = await recordPaymentInternal({
            tenant_id,
            branch_id,
            invoice_id,
            amount,
            payment_method,
            notes,
            user_id: req.user.id,
            req
        });
        await db.query('COMMIT');

        res.status(201).json({
            status: 'success',
            data: result.payment,
            voucher: result.voucher,
            message: `Payment registered. Invoice status updated to ${result.newStatus}`
        });
    } catch (err) {
        await db.query('ROLLBACK');
        console.error('createInvoicePaymentDirect Error:', err.message);
        res.status(400).json({ status: 'error', message: err.message });
    }
};

// @desc    Get Detailed Invoice for PDF Preview
// @route   GET /api/finance/invoices/:id
exports.getInvoiceDetails = async (req, res) => {
    const tenant_id = req.user.tenant_id;
    const branch_id = req.branchId;
    const invoice_id = req.params.id;

    try {
        const invRes = await db.query(`
            SELECT i.*, u.unit_number as unit_no, u.project_name,
                   c.name as customer_name, c.email as customer_email, c.phone as customer_phone,
                   COALESCE(p.total_paid, 0) as total_paid, 
                   (i.total_amount - COALESCE(p.total_paid, 0)) as remaining_balance 
            FROM invoices i
            LEFT JOIN (SELECT invoice_id, SUM(amount) as total_paid FROM payments WHERE tenant_id::text = $1::text GROUP BY invoice_id) p ON i.id::text = p.invoice_id::text
            LEFT JOIN re_units u ON i.unit_id::text = u.id::text
            LEFT JOIN customers c ON i.client_id::text = c.id::text
            WHERE i.id = $2 AND i.tenant_id::text = $1::text AND i.branch_id::text = $3::text
        `, [tenant_id, invoice_id, branch_id]);

        if (invRes.rows.length === 0) return res.status(404).json({ status: 'error', message: 'Invoice not found' });

        const itemsRes = await db.query('SELECT * FROM invoice_items WHERE invoice_id = $1 AND tenant_id::text = $2::text AND branch_id::text = $3::text', [invoice_id, tenant_id, branch_id]);
        const paymentsRes = await db.query('SELECT * FROM payments WHERE invoice_id = $1 AND tenant_id::text = $2::text AND branch_id::text = $3::text ORDER BY payment_date DESC', [invoice_id, tenant_id, branch_id]);

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

// ==========================================
// VOUCHERS MANAGEMENT (سندات القبض والصرف)
// ==========================================

// @desc    Get all Vouchers (Receipt & Payment)
// @route   GET /api/finance/vouchers
exports.getVouchers = async (req, res) => {
    const tenant_id = req.user.tenant_id;
    const branch_id = req.branchId;
    const { type, party_type, start_date, end_date } = req.query;

    try {
        await ensureVouchersTable();
        let query = `
            SELECT 
                v.*,
                u.name as created_by_name,
                i.invoice_number as linked_invoice_number
            FROM finance_vouchers v
            LEFT JOIN users u ON v.created_by = u.id
            LEFT JOIN invoices i ON v.invoice_id = i.id
            WHERE v.tenant_id::text = $1::text AND v.branch_id::text = $2::text
        `;
        const params = [tenant_id, branch_id];

        if (type) {
            params.push(type);
            query += ` AND v.voucher_type = $${params.length}`;
        }
        if (party_type) {
            params.push(party_type);
            query += ` AND v.party_type = $${params.length}`;
        }
        if (start_date) {
            params.push(start_date);
            query += ` AND v.voucher_date >= $${params.length}`;
        }
        if (end_date) {
            params.push(end_date);
            query += ` AND v.voucher_date <= $${params.length}`;
        }

        query += ` ORDER BY v.voucher_date DESC, v.id DESC`;

        const result = await db.query(query, params);
        res.json({ status: 'success', data: result.rows });
    } catch (err) {
        console.error('getVouchers Error:', err.message);
        res.status(500).json({ status: 'error', message: 'Failed to retrieve vouchers.' });
    }
};

// @desc    Create a new Voucher (Receipt or Payment)
// @route   POST /api/finance/vouchers
exports.createVoucher = async (req, res) => {
    const tenant_id = req.user.tenant_id;
    const branch_id = req.branchId;
    const {
        voucher_type, // 'receipt' or 'payment'
        party_type,   // 'customer', 'vendor', 'employee', 'other'
        party_name,
        customer_id,
        vendor_id,
        invoice_id,
        amount,
        payment_method,
        treasury_account,
        reference_no,
        notes,
        voucher_date
    } = req.body;

    if (!voucher_type || !amount || parseFloat(amount) <= 0) {
        return res.status(400).json({ status: 'error', message: 'Voucher type and valid amount are required.' });
    }

    try {
        await ensureVouchersTable();
        await db.query('BEGIN');

        const voucherNumber = await generateVoucherNumber(tenant_id, branch_id, voucher_type);

        let effectivePartyName = party_name;
        if (!effectivePartyName) {
            if (customer_id) {
                const c = await db.query('SELECT name FROM customers WHERE id = $1', [customer_id]);
                if (c.rows.length) effectivePartyName = c.rows[0].name;
            } else if (vendor_id) {
                const v = await db.query('SELECT name FROM vendors WHERE id = $1', [vendor_id]);
                if (v.rows.length) effectivePartyName = v.rows[0].name;
            }
        }
        if (!effectivePartyName) {
            effectivePartyName = voucher_type === 'receipt' ? 'عميل نقدي' : 'جهة الصرف';
        }

        const vRes = await db.query(`
            INSERT INTO finance_vouchers (
                voucher_number, voucher_type, party_type, party_name, customer_id, vendor_id,
                invoice_id, amount, payment_method, treasury_account, reference_no,
                notes, voucher_date, created_by, tenant_id, branch_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
            RETURNING *
        `, [
            voucherNumber,
            voucher_type,
            party_type || (voucher_type === 'receipt' ? 'customer' : 'vendor'),
            effectivePartyName,
            customer_id || null,
            vendor_id || null,
            invoice_id || null,
            parseFloat(amount),
            payment_method || 'cash',
            treasury_account || 'Main Cash / الخزينة الرئيسية',
            reference_no || null,
            notes || null,
            voucher_date || new Date().toISOString().split('T')[0],
            req.user.id,
            tenant_id,
            branch_id
        ]);

        const voucher = vRes.rows[0];

        // If it's a receipt voucher linked to an invoice, record the payment against that invoice
        if (voucher_type === 'receipt' && invoice_id) {
            await recordPaymentInternal({
                tenant_id,
                branch_id,
                invoice_id,
                amount,
                payment_method,
                notes: notes ? `${notes} (سند قبض ${voucherNumber})` : `سند قبض رقم ${voucherNumber}`,
                user_id: req.user.id,
                req
            });
        }

        // If it's a payment voucher, also record an expense entry for completeness
        if (voucher_type === 'payment') {
            try {
                await db.query(`
                    INSERT INTO expenses (title, amount, category, expense_date, recorded_by, tenant_id, branch_id)
                    VALUES ($1, $2, $3, $4, $5, $6, $7)
                `, [
                    effectivePartyName ? `سند صرف ${voucherNumber} - ${effectivePartyName}` : `سند صرف ${voucherNumber}`,
                    parseFloat(amount),
                    notes || 'Payment Voucher / سند صرف',
                    voucher_date || new Date().toISOString().split('T')[0],
                    req.user.id,
                    tenant_id,
                    branch_id
                ]);
            } catch (expErr) {
                console.warn('[Payment Voucher] Expense recording warning:', expErr.message);
            }
        }

        await db.query('COMMIT');
        logCreate(req, 'Finance Voucher', voucher.id, { voucherNumber, voucher_type, amount });

        res.status(201).json({ status: 'success', data: voucher, message: 'Voucher created successfully' });
    } catch (err) {
        await db.query('ROLLBACK');
        console.error('createVoucher Error:', err.message);
        res.status(400).json({ status: 'error', message: err.message });
    }
};

// @desc    Get Voucher Details for Printable Voucher View
// @route   GET /api/finance/vouchers/:id
exports.getVoucherDetails = async (req, res) => {
    const tenant_id = req.user.tenant_id;
    const branch_id = req.branchId;
    const voucher_id = req.params.id;

    try {
        await ensureVouchersTable();
        const vRes = await db.query(`
            SELECT 
                v.*,
                u.name as created_by_name,
                i.invoice_number as linked_invoice_number,
                i.total_amount as linked_invoice_total,
                t.name as tenant_name, t.logo_url, t.tax_no, t.reg_no, t.phone as tenant_phone, t.address as tenant_address, t.currency,
                b.name as branch_name, b.phone as branch_phone, b.address as branch_address
            FROM finance_vouchers v
            LEFT JOIN users u ON v.created_by = u.id
            LEFT JOIN invoices i ON v.invoice_id = i.id
            LEFT JOIN tenants t ON v.tenant_id = t.id
            LEFT JOIN branches b ON v.branch_id = b.id
            WHERE v.id = $1 AND v.tenant_id::text = $2::text AND v.branch_id::text = $3::text
        `, [voucher_id, tenant_id, branch_id]);

        if (vRes.rows.length === 0) {
            return res.status(404).json({ status: 'error', message: 'Voucher not found or unauthorized' });
        }

        res.json({ status: 'success', data: vRes.rows[0] });
    } catch (err) {
        console.error('getVoucherDetails Error:', err.message);
        res.status(500).json({ status: 'error', message: 'Failed to retrieve voucher details.' });
    }
};

// @desc    Delete Voucher
// @route   DELETE /api/finance/vouchers/:id
exports.deleteVoucher = async (req, res) => {
    const tenant_id = req.user.tenant_id;
    const branch_id = req.branchId;
    const voucher_id = req.params.id;

    try {
        await ensureVouchersTable();
        const vRes = await db.query(
            `DELETE FROM finance_vouchers WHERE id = $1 AND tenant_id::text = $2::text AND branch_id::text = $3::text RETURNING *`,
            [voucher_id, tenant_id, branch_id]
        );
        if (vRes.rows.length === 0) {
            return res.status(404).json({ status: 'error', message: 'Voucher not found' });
        }

        logDelete(req, 'Finance Voucher', voucher_id, { voucher_number: vRes.rows[0].voucher_number });
        res.json({ status: 'success', message: 'Voucher deleted successfully' });
    } catch (err) {
        console.error('deleteVoucher Error:', err.message);
        res.status(500).json({ status: 'error', message: 'Failed to delete voucher.' });
    }
};

// ==========================================
// EXPENSES & INCOME BRIDGES FOR /finance
// ==========================================

// @desc    Get Expenses under Finance
// @route   GET /api/finance/expenses
exports.getExpenses = async (req, res) => {
    const tenant_id = req.user.tenant_id;
    const branch_id = req.branchId;

    try {
        const result = await db.query(
            `SELECT * FROM expenses WHERE tenant_id::text = $1::text AND branch_id::text = $2::text ORDER BY expense_date DESC`,
            [tenant_id, branch_id]
        );
        res.json({ status: 'success', data: result.rows });
    } catch (err) {
        console.error('getExpenses Error:', err.message);
        res.status(500).json({ status: 'error', message: 'Failed to retrieve expenses' });
    }
};

// @desc    Create Expense under Finance
// @route   POST /api/finance/expenses
exports.createExpense = async (req, res) => {
    const tenant_id = req.user.tenant_id;
    const branch_id = req.branchId;
    const { title, amount, category, expense_date } = req.body;

    try {
        const result = await db.query(`
            INSERT INTO expenses (title, amount, category, expense_date, recorded_by, tenant_id, branch_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *
        `, [title, amount, category || 'General', expense_date || new Date().toISOString().split('T')[0], req.user.id, tenant_id, branch_id]);

        logCreate(req, 'Expense', result.rows[0].id, result.rows[0]);
        res.status(201).json({ status: 'success', data: result.rows[0] });
    } catch (err) {
        console.error('createExpense Error:', err.message);
        res.status(500).json({ status: 'error', message: 'Failed to record expense' });
    }
};

// @desc    Get Income & Payments List
// @route   GET /api/finance/income
exports.getIncome = async (req, res) => {
    const tenant_id = req.user.tenant_id;
    const branch_id = req.branchId;

    try {
        const result = await db.query(`
            SELECT 
                p.id,
                p.amount,
                p.payment_method,
                p.payment_date,
                p.notes,
                i.invoice_number,
                c.name as customer_name
            FROM payments p
            JOIN invoices i ON p.invoice_id::text = i.id::text
            LEFT JOIN customers c ON i.client_id::text = c.id::text
            WHERE p.tenant_id::text = $1::text AND p.branch_id::text = $2::text
            ORDER BY p.payment_date DESC
        `, [tenant_id, branch_id]);

        res.json({ status: 'success', data: result.rows });
    } catch (err) {
        console.error('getIncome Error:', err.message);
        res.status(500).json({ status: 'error', message: 'Failed to retrieve income transactions' });
    }
};

// @desc    Financial KPI Summary (Receipts, Expenses, Outstanding AR)
// @route   GET /api/finance/summary
exports.getSummary = async (req, res) => {
    const tenant_id = req.user.tenant_id;
    const branch_id = req.branchId;

    try {
        const incomeRes = await db.query(
            `SELECT COALESCE(SUM(amount), 0) as total_income FROM payments WHERE tenant_id::text = $1::text AND branch_id::text = $2::text`,
            [tenant_id, branch_id]
        );

        const expenseRes = await db.query(
            `SELECT COALESCE(SUM(amount), 0) as total_expenses FROM expenses WHERE tenant_id::text = $1::text AND branch_id::text = $2::text`,
            [tenant_id, branch_id]
        );

        const invRes = await db.query(`
            SELECT 
                COALESCE(SUM(total_amount), 0) as total_invoiced,
                COALESCE(SUM(CASE WHEN status != 'paid' THEN (total_amount - COALESCE(p.paid, 0)) ELSE 0 END), 0) as total_outstanding,
                COUNT(*) as count_invoices
            FROM invoices i
            LEFT JOIN (SELECT invoice_id, SUM(amount) as paid FROM payments GROUP BY invoice_id) p ON i.id::text = p.invoice_id::text
            WHERE i.tenant_id::text = $1::text AND i.branch_id::text = $2::text
        `, [tenant_id, branch_id]);

        await ensureVouchersTable();
        const vouchersCountRes = await db.query(`
            SELECT 
                COUNT(CASE WHEN voucher_type = 'receipt' THEN 1 END) as receipts_count,
                COUNT(CASE WHEN voucher_type = 'payment' THEN 1 END) as payments_count
            FROM finance_vouchers
            WHERE tenant_id::text = $1::text AND branch_id::text = $2::text
        `, [tenant_id, branch_id]);

        const totalIncome = parseFloat(incomeRes.rows[0].total_income || 0);
        const totalExpenses = parseFloat(expenseRes.rows[0].total_expenses || 0);
        const totalInvoiced = parseFloat(invRes.rows[0]?.total_invoiced || 0);
        const totalOutstanding = parseFloat(invRes.rows[0]?.total_outstanding || 0);
        const netCashflow = totalIncome - totalExpenses;

        res.json({
            status: 'success',
            data: {
                totalIncome,
                totalExpenses,
                totalInvoiced,
                totalOutstanding,
                netCashflow,
                countInvoices: parseInt(invRes.rows[0]?.count_invoices || 0),
                receiptsCount: parseInt(vouchersCountRes.rows[0]?.receipts_count || 0),
                paymentsCount: parseInt(vouchersCountRes.rows[0]?.payments_count || 0)
            }
        });
    } catch (err) {
        console.error('getSummary Error:', err.message);
        res.status(500).json({ status: 'error', message: 'Failed to retrieve finance summary' });
    }
};

