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
                voucher_number VARCHAR(100) NOT NULL,
                voucher_type VARCHAR(20) NOT NULL, -- 'receipt' (قبض) | 'payment' (صرف)
                party_type VARCHAR(50) DEFAULT 'customer', -- 'customer', 'vendor', 'employee', 'other'
                party_name VARCHAR(255) NOT NULL,
                customer_id VARCHAR(255),
                vendor_id VARCHAR(255),
                invoice_id INTEGER,
                amount DECIMAL(15, 2) NOT NULL,
                payment_method VARCHAR(50) DEFAULT 'cash', -- 'cash', 'bank_transfer', 'check', 'card'
                treasury_account VARCHAR(100) DEFAULT 'Main Cash / الخزينة الرئيسية',
                reference_no VARCHAR(100),
                notes TEXT,
                voucher_date DATE DEFAULT CURRENT_DATE,
                created_by INTEGER,
                tenant_id UUID,
                branch_id VARCHAR(255),
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_finance_vouchers_tenant_branch ON finance_vouchers(tenant_id, branch_id);
            CREATE INDEX IF NOT EXISTS idx_finance_vouchers_type ON finance_vouchers(voucher_type);
        `);

        // Safely ensure columns exist if table was created previously with older schema
        await db.query(`ALTER TABLE finance_vouchers ADD COLUMN IF NOT EXISTS party_type VARCHAR(50) DEFAULT 'customer';`);
        await db.query(`ALTER TABLE finance_vouchers ADD COLUMN IF NOT EXISTS party_name VARCHAR(255);`);
        await db.query(`ALTER TABLE finance_vouchers ADD COLUMN IF NOT EXISTS customer_id VARCHAR(255);`);
        await db.query(`ALTER TABLE finance_vouchers ADD COLUMN IF NOT EXISTS vendor_id VARCHAR(255);`);
        await db.query(`ALTER TABLE finance_vouchers ADD COLUMN IF NOT EXISTS invoice_id INTEGER;`);
        await db.query(`ALTER TABLE finance_vouchers ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50) DEFAULT 'cash';`);
        await db.query(`ALTER TABLE finance_vouchers ADD COLUMN IF NOT EXISTS treasury_account VARCHAR(100) DEFAULT 'Main Cash / الخزينة الرئيسية';`);
        await db.query(`ALTER TABLE finance_vouchers ADD COLUMN IF NOT EXISTS reference_no VARCHAR(100);`);
        await db.query(`ALTER TABLE finance_vouchers ADD COLUMN IF NOT EXISTS notes TEXT;`);
        await db.query(`ALTER TABLE finance_vouchers ADD COLUMN IF NOT EXISTS voucher_date DATE DEFAULT CURRENT_DATE;`);
        await db.query(`ALTER TABLE finance_vouchers ADD COLUMN IF NOT EXISTS created_by INTEGER;`);
        await db.query(`ALTER TABLE finance_vouchers ADD COLUMN IF NOT EXISTS tenant_id UUID;`);
        await db.query(`ALTER TABLE finance_vouchers ADD COLUMN IF NOT EXISTS branch_id VARCHAR(255);`);
        vouchersTableReady = true;
    } catch (err) {
        console.error('[Finance] Error ensuring finance_vouchers table:', err.message);
    }
};

// Ensure invoices & invoice_items tables & columns exist with multi-tenant safety
let invoicesTableReady = false;
const ensureInvoicesTable = async () => {
    if (invoicesTableReady) return;
    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS invoices (
                id SERIAL PRIMARY KEY,
                quotation_id INTEGER,
                invoice_number VARCHAR(100) NOT NULL,
                total_amount DECIMAL(15, 2) DEFAULT 0.00,
                due_date DATE,
                status VARCHAR(50) DEFAULT 'unpaid',
                tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Add missing columns to invoices safely
        await db.query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS client_id VARCHAR(255);`);
        await db.query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS customer_id VARCHAR(255);`);
        await db.query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS deal_id VARCHAR(255);`);
        await db.query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS unit_id VARCHAR(255);`);
        await db.query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS branch_id VARCHAR(255);`);
        await db.query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS notes TEXT;`);
        await db.query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS accounting_status VARCHAR(20) DEFAULT 'unposted';`);
        await db.query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS journal_entry_id UUID;`);

        // Ensure invoice_items table and columns exist
        await db.query(`
            CREATE TABLE IF NOT EXISTS invoice_items (
                id SERIAL PRIMARY KEY,
                invoice_id INTEGER REFERENCES invoices(id) ON DELETE CASCADE,
                product_id INTEGER,
                quantity NUMERIC DEFAULT 1,
                unit_price DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                subtotal DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await db.query(`ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS tenant_id UUID;`);
        await db.query(`ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS branch_id VARCHAR(255);`);
        await db.query(`ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS description TEXT;`);
        await db.query(`ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS product_id INTEGER;`);
        await db.query(`ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS quantity NUMERIC DEFAULT 1;`);
        await db.query(`ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS unit_price DECIMAL(15, 2) DEFAULT 0.00;`);
        await db.query(`ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS subtotal DECIMAL(15, 2) DEFAULT 0.00;`);

        // Ensure payments and expenses have tenant_id and branch_id
        await db.query(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS tenant_id UUID;`);
        await db.query(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS branch_id VARCHAR(255);`);
        await db.query(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50) DEFAULT 'cash';`);
        await db.query(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS notes TEXT;`);

        await db.query(`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS tenant_id UUID;`);
        await db.query(`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS branch_id VARCHAR(255);`);

        // Drop legacy global UNIQUE constraint on invoices(invoice_number) that breaks multi-tenancy
        try {
            const constraints = await db.query(`
                SELECT conname 
                FROM pg_constraint 
                WHERE conrelid = 'invoices'::regclass 
                  AND contype = 'u'
                  AND conname != 'unique_invoice_per_tenant';
            `);
            for (const row of constraints.rows) {
                try {
                    await db.query(`ALTER TABLE invoices DROP CONSTRAINT IF EXISTS "${row.conname}";`);
                    console.log(`[Finance] Dropped legacy unique constraint: ${row.conname}`);
                } catch (e) {}
            }
        } catch (e) {
            console.warn('[Finance] Constraint check note:', e.message);
        }

        // Add composite index for tenant + invoice_number
        try {
            await db.query(`
                CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_tenant_number 
                ON invoices(tenant_id, invoice_number);
            `);
        } catch (e) {
            console.warn('[Finance] idx_invoices_tenant_number note:', e.message);
        }

        invoicesTableReady = true;
    } catch (err) {
        console.error('[Finance] Error ensuring invoices schema:', err.message);
    }
};

// Helper to generate Invoice Number (collision-free & multi-tenant safe)
const generateInvoiceNumber = async (tenant_id, branch_id) => {
    await ensureInvoicesTable();
    let prefix = 'INV-';

    if (branch_id) {
        try {
            const branchRes = await db.query(
                'SELECT invoice_prefix FROM branches WHERE id::text = $1::text AND tenant_id::text = $2::text',
                [branch_id, tenant_id]
            );
            if (branchRes.rows.length && branchRes.rows[0].invoice_prefix) {
                const p = branchRes.rows[0].invoice_prefix.trim();
                if (p) prefix = p.endsWith('-') ? p : `${p}-`;
            }
        } catch (err) {
            console.warn('[Finance] Branch invoice prefix lookup notice:', err.message);
        }
    }

    // Get the maximum sequential number for this prefix in this tenant
    let maxSeq = 0;
    try {
        const seqRes = await db.query(
            `SELECT invoice_number FROM invoices 
             WHERE tenant_id::text = $1::text AND invoice_number LIKE $2
             ORDER BY id DESC LIMIT 100`,
            [tenant_id, `${prefix}%`]
        );
        for (const row of seqRes.rows) {
            const numPart = row.invoice_number.slice(prefix.length);
            const parsed = parseInt(numPart, 10);
            if (!isNaN(parsed) && parsed > maxSeq) {
                maxSeq = parsed;
            }
        }
    } catch (e) {
        console.warn('[Finance] seq query notice:', e.message);
    }

    let candidate = maxSeq + 1;
    let invoiceNumber = `${prefix}${String(candidate).padStart(4, '0')}`;

    // Loop check to guarantee absolute uniqueness (no duplicate key exception ever)
    let attempts = 0;
    while (attempts < 100) {
        const exists = await db.query(
            `SELECT id FROM invoices WHERE tenant_id::text = $1::text AND invoice_number = $2 LIMIT 1`,
            [tenant_id, invoiceNumber]
        );
        if (exists.rows.length === 0) break;
        candidate++;
        invoiceNumber = `${prefix}${String(candidate).padStart(4, '0')}`;
        attempts++;
    }

    return invoiceNumber;
};

// Helper to generate Voucher Number
const generateVoucherNumber = async (tenant_id, branch_id, voucher_type) => {
    await ensureVouchersTable();
    const prefix = voucher_type === 'receipt' ? 'RV-' : 'PV-';
    let query = `SELECT COUNT(*) + 1 as next_id FROM finance_vouchers WHERE tenant_id::text = $1::text AND voucher_type = $2`;
    const params = [tenant_id, voucher_type];
    if (branch_id) {
        params.push(String(branch_id));
        query += ` AND (branch_id::text = $3::text OR branch_id IS NULL)`;
    }
    const seqRes = await db.query(query, params);
    const nextSeq = String(seqRes.rows[0]?.next_id || 1).padStart(4, '0');
    return `${prefix}${nextSeq}`;
};

// @desc    Get all invoices for Branch/Tenant
// @route   GET /api/finance/invoices
exports.getInvoices = async (req, res) => {
    const tenant_id = req.user.tenant_id;
    let branch_id = req.branchId || req.user?.branch_id || null;

    await ensureInvoicesTable();

    try {
        let query = `
            SELECT 
                i.*,
                COALESCE((SELECT SUM(amount) FROM payments p WHERE p.invoice_id::text = i.id::text), 0) as total_paid,
                (i.total_amount - COALESCE((SELECT SUM(amount) FROM payments p WHERE p.invoice_id::text = i.id::text), 0)) as remaining_balance,
                c.name as customer_name,
                u.unit_number, u.project_name
            FROM invoices i
            LEFT JOIN deals d ON i.deal_id::text = d.id::text AND i.tenant_id::text = d.tenant_id::text 
            LEFT JOIN customers c ON (
                (i.client_id IS NOT NULL AND i.client_id != '' AND i.client_id::text = c.id::text) OR 
                (i.customer_id IS NOT NULL AND i.customer_id != '' AND i.customer_id::text = c.id::text)
            )
            LEFT JOIN re_units u ON i.unit_id::text = u.id::text
            WHERE i.tenant_id::text = $1::text
        `;
        const params = [tenant_id];

        if (branch_id) {
            params.push(String(branch_id));
            query += ` AND (i.branch_id::text = $2::text OR i.branch_id IS NULL)`;
        }

        query += ` ORDER BY i.created_at DESC`;

        const result = await db.query(query, params);
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
    let branch_id = req.branchId || req.user?.branch_id || null;
    const { customer_id, client_id, deal_id, unit_id, due_date, items, notes } = req.body;
    const effectiveClientId = customer_id || client_id;

    await ensureInvoicesTable();

    // If branch_id is still not resolved, get default/first branch for this tenant
    if (!branch_id) {
        try {
            const bRes = await db.query('SELECT id FROM branches WHERE tenant_id::text = $1::text ORDER BY id ASC LIMIT 1', [tenant_id]);
            if (bRes.rows.length > 0) {
                branch_id = bRes.rows[0].id;
            }
        } catch (e) {}
    }

    try {
        await db.query('BEGIN');

        const invoiceNumber = await generateInvoiceNumber(tenant_id, branch_id);
        const validItems = Array.isArray(items) ? items : [];

        let total_amount = 0;
        const sanitizedItems = [];

        for (const item of validItems) {
            const qty = Math.max(1, parseFloat(item.quantity) || 1);
            const unitPrice = Math.max(0, parseFloat(item.unit_price) || 0);
            const subtotal = qty * unitPrice;
            total_amount += subtotal;

            let prodId = null;
            let itemDesc = (item.description || item.name || '').trim();
            if (item.product_id && item.product_id !== '' && item.product_id !== 'null' && item.product_id !== 'Custom') {
                const parsedPid = parseInt(item.product_id, 10);
                if (!isNaN(parsedPid)) {
                    try {
                        const prodCheck = await db.query(
                            'SELECT id, name FROM products WHERE id = $1',
                            [parsedPid]
                        );
                        if (prodCheck.rows.length > 0) {
                            prodId = prodCheck.rows[0].id;
                            if (!itemDesc) itemDesc = prodCheck.rows[0].name;
                        }
                    } catch (e) {}
                }
            }

            if (!itemDesc) {
                itemDesc = prodId ? `Product #${prodId}` : 'Service / Product Item';
            }

            sanitizedItems.push({
                product_id: prodId,
                quantity: qty,
                unit_price: unitPrice,
                subtotal: subtotal,
                description: itemDesc
            });
        }

        // Sanitize client_id / customer_id directly (never discard valid customer selection)
        let sanitizedClientId = null;
        if (effectiveClientId && effectiveClientId !== '' && effectiveClientId !== 'null' && effectiveClientId !== 'undefined') {
            sanitizedClientId = String(effectiveClientId).trim();
        }

        const sanitizedDealId = (deal_id && deal_id !== '' && deal_id !== 'null' && deal_id !== 'undefined' && deal_id !== 'N/A' && deal_id !== '#N/A') ? String(deal_id).trim() : null;
        const sanitizedUnitId = (unit_id && unit_id !== '' && unit_id !== 'null' && unit_id !== 'undefined') ? String(unit_id).trim() : null;

        const invRes = await db.query(`
            INSERT INTO invoices (invoice_number, total_amount, due_date, status, tenant_id, branch_id, client_id, customer_id, deal_id, unit_id, notes)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            RETURNING *
        `, [
            invoiceNumber, 
            total_amount, 
            due_date || null, 
            'unpaid', 
            tenant_id, 
            branch_id ? String(branch_id) : null, 
            sanitizedClientId, 
            sanitizedClientId,
            sanitizedDealId, 
            sanitizedUnitId,
            notes || null
        ]);
        
        const newInvoiceId = invRes.rows[0].id;

        for (const sItem of sanitizedItems) {
            await db.query(`
                INSERT INTO invoice_items (invoice_id, product_id, quantity, unit_price, subtotal, tenant_id, branch_id, description)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            `, [
                newInvoiceId, 
                sItem.product_id, 
                sItem.quantity, 
                sItem.unit_price, 
                sItem.subtotal, 
                tenant_id, 
                branch_id ? String(branch_id) : null, 
                sItem.description
            ]);
        }

        await db.query('COMMIT');
        logCreate(req, 'Invoice', newInvoiceId, { invoiceNumber, total_amount });

        res.status(201).json({ status: 'success', data: invRes.rows[0] });
    } catch (err) {
        await db.query('ROLLBACK');
        console.error('createInvoice Error:', err);
        res.status(500).json({ status: 'error', message: err.message || 'Failed to create invoice.' });
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
    await ensureInvoicesTable();
    const invRes = await db.query(
        'SELECT total_amount, invoice_number, client_id, customer_id FROM invoices WHERE id = $1 AND tenant_id::text = $2::text AND ($3::text IS NULL OR branch_id::text = $3::text OR branch_id IS NULL) FOR UPDATE',
        [invoice_id, tenant_id, branch_id ? String(branch_id) : null]
    );
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
    `, [invoice_id, amount, payment_method || 'cash', notes || null, tenant_id, branch_id ? String(branch_id) : null]);

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
        const targetCustId = invoice.customer_id || invoice.client_id;
        if (targetCustId) {
            const cRes = await db.query('SELECT name FROM customers WHERE id::text = $1::text', [String(targetCustId)]);
            if (cRes.rows.length > 0) clientName = cRes.rows[0].name;
        }

        const vRes = await db.query(`
            INSERT INTO finance_vouchers (
                voucher_number, voucher_type, party_type, party_name, customer_id, invoice_id,
                amount, payment_method, notes, voucher_date, created_by, tenant_id, branch_id
            ) VALUES ($1, 'receipt', 'customer', $2, $3, $4, $5, $6, $7, CURRENT_DATE, $8, $9, $10)
            RETURNING *
        `, [
            voucherNumber, clientName, targetCustId ? String(targetCustId) : null, invoice_id, amount,
            payment_method || 'cash', notes ? `${notes} (سداد فاتورة ${invoice.invoice_number})` : `سداد فاتورة رقم ${invoice.invoice_number}`,
            user_id || null, tenant_id, branch_id ? String(branch_id) : null
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
    let branch_id = req.branchId || req.user?.branch_id || null;
    const invoice_id = req.params.id;

    await ensureInvoicesTable();

    try {
        let invQuery = `
            SELECT i.*, u.unit_number as unit_no, u.project_name,
                   c.name as customer_name, c.email as customer_email, c.phone as customer_phone,
                   COALESCE(p.total_paid, 0) as total_paid, 
                   (i.total_amount - COALESCE(p.total_paid, 0)) as remaining_balance 
            FROM invoices i
            LEFT JOIN (SELECT invoice_id, SUM(amount) as total_paid FROM payments WHERE tenant_id::text = $1::text GROUP BY invoice_id) p ON i.id::text = p.invoice_id::text
            LEFT JOIN re_units u ON i.unit_id::text = u.id::text
            LEFT JOIN customers c ON (
                (i.client_id IS NOT NULL AND i.client_id != '' AND i.client_id::text = c.id::text) OR 
                (i.customer_id IS NOT NULL AND i.customer_id != '' AND i.customer_id::text = c.id::text)
            )
            WHERE i.id = $2 AND i.tenant_id::text = $1::text
        `;
        const invParams = [tenant_id, invoice_id];

        if (branch_id) {
            invParams.push(String(branch_id));
            invQuery += ` AND (i.branch_id::text = $3::text OR i.branch_id IS NULL)`;
        }

        const invRes = await db.query(invQuery, invParams);

        if (invRes.rows.length === 0) return res.status(404).json({ status: 'error', message: 'Invoice not found' });

        const itemsRes = await db.query(`
            SELECT 
                ii.*,
                COALESCE(NULLIF(ii.description, ''), p.name, 'Service / Product Item') as item_title,
                p.name as product_name
            FROM invoice_items ii
            LEFT JOIN products p ON ii.product_id = p.id
            WHERE ii.invoice_id = $1 
            ORDER BY ii.id ASC
        `, [invoice_id]);
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

// ==========================================
// VOUCHERS MANAGEMENT (سندات القبض والصرف)
// ==========================================

// @desc    Get all Vouchers (Receipt & Payment)
// @route   GET /api/finance/vouchers
exports.getVouchers = async (req, res) => {
    const tenant_id = req.user.tenant_id;
    let branch_id = req.branchId || req.user?.branch_id || null;
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
            WHERE v.tenant_id::text = $1::text 
              AND ($2::text IS NULL OR v.branch_id::text = $2::text OR v.branch_id IS NULL)
        `;
        const params = [tenant_id, branch_id ? String(branch_id) : null];

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
    let branch_id = req.branchId || req.user?.branch_id || null;
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
                const c = await db.query('SELECT name FROM customers WHERE id::text = $1::text', [String(customer_id)]);
                if (c.rows.length) effectivePartyName = c.rows[0].name;
            } else if (vendor_id) {
                const v = await db.query('SELECT name FROM vendors WHERE id::text = $1::text', [String(vendor_id)]);
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
            customer_id ? String(customer_id) : null,
            vendor_id ? String(vendor_id) : null,
            invoice_id || null,
            parseFloat(amount),
            payment_method || 'cash',
            treasury_account || 'Main Cash / الخزينة الرئيسية',
            reference_no || null,
            notes || null,
            voucher_date || new Date().toISOString().split('T')[0],
            req.user.id,
            tenant_id,
            branch_id ? String(branch_id) : null
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
    let branch_id = req.branchId || req.user?.branch_id || null;
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
            LEFT JOIN branches b ON v.branch_id::text = b.id::text
            WHERE v.id = $1 AND v.tenant_id::text = $2::text AND ($3::text IS NULL OR v.branch_id::text = $3::text OR v.branch_id IS NULL)
        `, [voucher_id, tenant_id, branch_id ? String(branch_id) : null]);

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
    let branch_id = req.branchId || req.user?.branch_id || null;
    const voucher_id = req.params.id;

    try {
        await ensureVouchersTable();
        const vRes = await db.query(
            `DELETE FROM finance_vouchers WHERE id = $1 AND tenant_id::text = $2::text AND ($3::text IS NULL OR branch_id::text = $3::text OR branch_id IS NULL) RETURNING *`,
            [voucher_id, tenant_id, branch_id ? String(branch_id) : null]
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
    let branch_id = req.branchId || req.user?.branch_id || null;

    try {
        await ensureInvoicesTable();
        const result = await db.query(
            `SELECT * FROM expenses 
             WHERE tenant_id::text = $1::text 
               AND ($2::text IS NULL OR branch_id::text = $2::text OR branch_id IS NULL) 
             ORDER BY expense_date DESC`,
            [tenant_id, branch_id ? String(branch_id) : null]
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
    let branch_id = req.branchId || req.user?.branch_id || null;
    const { title, amount, category, expense_date } = req.body;

    try {
        await ensureInvoicesTable();
        const result = await db.query(`
            INSERT INTO expenses (title, amount, category, expense_date, recorded_by, tenant_id, branch_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *
        `, [title, amount, category || 'General', expense_date || new Date().toISOString().split('T')[0], req.user.id, tenant_id, branch_id ? String(branch_id) : null]);

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
    let branch_id = req.branchId || req.user?.branch_id || null;

    try {
        await ensureInvoicesTable();
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
            LEFT JOIN customers c ON (
                (i.client_id IS NOT NULL AND i.client_id != '' AND i.client_id::text = c.id::text) OR 
                (i.customer_id IS NOT NULL AND i.customer_id != '' AND i.customer_id::text = c.id::text)
            )
            WHERE p.tenant_id::text = $1::text 
              AND ($2::text IS NULL OR p.branch_id::text = $2::text OR p.branch_id IS NULL)
            ORDER BY p.payment_date DESC
        `, [tenant_id, branch_id ? String(branch_id) : null]);

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
    let branch_id = req.branchId || req.user?.branch_id || null;

    try {
        await ensureInvoicesTable();

        const incomeRes = await db.query(
            `SELECT COALESCE(SUM(amount), 0) as total_income 
             FROM payments 
             WHERE tenant_id::text = $1::text 
               AND ($2::text IS NULL OR branch_id::text = $2::text OR branch_id IS NULL)`,
            [tenant_id, branch_id ? String(branch_id) : null]
        );

        const expenseRes = await db.query(
            `SELECT COALESCE(SUM(amount), 0) as total_expenses 
             FROM expenses 
             WHERE tenant_id::text = $1::text 
               AND ($2::text IS NULL OR branch_id::text = $2::text OR branch_id IS NULL)`,
            [tenant_id, branch_id ? String(branch_id) : null]
        );

        const invRes = await db.query(`
            SELECT 
                COALESCE(SUM(total_amount), 0) as total_invoiced,
                COALESCE(SUM(CASE WHEN status != 'paid' THEN (total_amount - COALESCE(p.paid, 0)) ELSE 0 END), 0) as total_outstanding,
                COUNT(*) as count_invoices
            FROM invoices i
            LEFT JOIN (SELECT invoice_id, SUM(amount) as paid FROM payments WHERE tenant_id::text = $1::text GROUP BY invoice_id) p ON i.id::text = p.invoice_id::text
            WHERE i.tenant_id::text = $1::text 
              AND ($2::text IS NULL OR i.branch_id::text = $2::text OR i.branch_id IS NULL)
        `, [tenant_id, branch_id ? String(branch_id) : null]);

        let receiptsCount = 0;
        let paymentsCount = 0;
        try {
            await ensureVouchersTable();
            const vouchersCountRes = await db.query(`
                SELECT 
                    COUNT(CASE WHEN voucher_type = 'receipt' THEN 1 END) as receipts_count,
                    COUNT(CASE WHEN voucher_type = 'payment' THEN 1 END) as payments_count
                FROM finance_vouchers
                WHERE tenant_id::text = $1::text 
                  AND ($2::text IS NULL OR branch_id::text = $2::text OR branch_id IS NULL)
            `, [tenant_id, branch_id ? String(branch_id) : null]);
            receiptsCount = parseInt(vouchersCountRes.rows[0]?.receipts_count || 0);
            paymentsCount = parseInt(vouchersCountRes.rows[0]?.payments_count || 0);
        } catch (vErr) {
            console.warn('[Finance Summary] Vouchers count fallback:', vErr.message);
        }

        const totalIncome = parseFloat(incomeRes.rows[0]?.total_income || 0);
        const totalExpenses = parseFloat(expenseRes.rows[0]?.total_expenses || 0);
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
                receiptsCount,
                paymentsCount
            }
        });
    } catch (err) {
        console.error('getSummary Error:', err.message);
        res.status(500).json({ status: 'error', message: 'Failed to retrieve finance summary' });
    }
};

