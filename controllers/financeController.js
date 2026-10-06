const db = require('../config/db');
const { logCreate, logUpdate, logDelete, logAction, ACTIONS, LOG_LEVELS } = require('../services/loggerService');

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
        await db.query(`ALTER TABLE finance_vouchers ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'active';`);
        await db.query(`ALTER TABLE finance_vouchers ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP WITH TIME ZONE;`);
        await db.query(`ALTER TABLE finance_vouchers ADD COLUMN IF NOT EXISTS cancelled_by VARCHAR(255);`);
        await db.query(`ALTER TABLE finance_vouchers ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;`);
        await db.query(`ALTER TABLE finance_vouchers ADD COLUMN IF NOT EXISTS installment_id VARCHAR(255);`);
        await db.query(`ALTER TABLE finance_vouchers ADD COLUMN IF NOT EXISTS deal_id VARCHAR(255);`);
        await db.query(`ALTER TABLE finance_vouchers ADD COLUMN IF NOT EXISTS contract_id VARCHAR(255);`);

        // Create indexes safely after ensuring columns exist
        await db.query(`CREATE INDEX IF NOT EXISTS idx_finance_vouchers_status ON finance_vouchers(status);`);
        await db.query(`CREATE INDEX IF NOT EXISTS idx_finance_vouchers_installment ON finance_vouchers(installment_id);`);
        await db.query(`CREATE INDEX IF NOT EXISTS idx_finance_vouchers_deal ON finance_vouchers(deal_id);`);
        try {
            await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_finance_vouchers_tenant_number ON finance_vouchers(tenant_id, voucher_number);`);
        } catch (idxErr) {
            console.error('❌ [CRITICAL] Failed to create unique index on finance_vouchers(tenant_id, voucher_number). Pre-existing duplicates detected:', idxErr.message);
        }

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
        const safeAlter = async (sql) => {
            try { await db.query(sql); } catch (e) {}
        };

        // 1. Invoices Table
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
        await safeAlter(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS client_id VARCHAR(255);`);
        await safeAlter(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS customer_id VARCHAR(255);`);
        await safeAlter(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS deal_id VARCHAR(255);`);
        await safeAlter(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS unit_id VARCHAR(255);`);
        await safeAlter(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS branch_id VARCHAR(255);`);
        await safeAlter(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS notes TEXT;`);
        await safeAlter(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS accounting_status VARCHAR(20) DEFAULT 'unposted';`);
        await safeAlter(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS journal_entry_id UUID;`);

        // 2. Invoice Items Table
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

        await safeAlter(`ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS tenant_id UUID;`);
        await safeAlter(`ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS branch_id VARCHAR(255);`);
        await safeAlter(`ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS description TEXT;`);
        await safeAlter(`ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS product_id INTEGER;`);
        await safeAlter(`ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS quantity NUMERIC DEFAULT 1;`);
        await safeAlter(`ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS unit_price DECIMAL(15, 2) DEFAULT 0.00;`);
        await safeAlter(`ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS subtotal DECIMAL(15, 2) DEFAULT 0.00;`);

        // 3. Payments Table (must exist for total_paid calculations)
        await db.query(`
            CREATE TABLE IF NOT EXISTS payments (
                id SERIAL PRIMARY KEY,
                invoice_id INTEGER,
                amount DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                payment_method VARCHAR(50) DEFAULT 'cash',
                payment_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                notes TEXT,
                tenant_id UUID,
                branch_id VARCHAR(255),
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        await safeAlter(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS tenant_id UUID;`);
        await safeAlter(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS branch_id VARCHAR(255);`);
        await safeAlter(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50) DEFAULT 'cash';`);
        await safeAlter(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS notes TEXT;`);
        await safeAlter(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'active';`);
        await safeAlter(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS voucher_id INTEGER;`);
        await safeAlter(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP WITH TIME ZONE;`);
        await safeAlter(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS cancelled_by VARCHAR(255);`);
        await safeAlter(`CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);`);
        await safeAlter(`CREATE INDEX IF NOT EXISTS idx_payments_voucher ON payments(voucher_id);`);

        // 4. Expenses Table
        await db.query(`
            CREATE TABLE IF NOT EXISTS expenses (
                id SERIAL PRIMARY KEY,
                title VARCHAR(255),
                amount DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                category VARCHAR(100) DEFAULT 'General',
                expense_date DATE DEFAULT CURRENT_DATE,
                recorded_by INTEGER,
                tenant_id UUID,
                branch_id VARCHAR(255),
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        await safeAlter(`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS tenant_id UUID;`);
        await safeAlter(`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS branch_id VARCHAR(255);`);

        // 5. Dependent join tables: re_units & deals
        await db.query(`
            CREATE TABLE IF NOT EXISTS re_units (
                id SERIAL PRIMARY KEY,
                unit_number VARCHAR(100),
                project_name VARCHAR(255),
                status VARCHAR(50) DEFAULT 'Available',
                tenant_id UUID,
                branch_id VARCHAR(255),
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await db.query(`
            CREATE TABLE IF NOT EXISTS deals (
                id SERIAL PRIMARY KEY,
                title VARCHAR(255),
                value DECIMAL(15, 2) DEFAULT 0.00,
                client_id VARCHAR(255),
                unit_id VARCHAR(255),
                tenant_id UUID,
                branch_id VARCHAR(255),
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

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

// Helper to generate Voucher Number (delegates to concurrency-safe services/voucherNumbering.js)
const { generateVoucherNumber: sharedGenerateVoucherNumber } = require('../services/voucherNumbering');
const generateVoucherNumber = async (tenant_id, branch_id, voucher_type, queryExecutor = null) => {
    await ensureVouchersTable();
    if (queryExecutor) {
        return sharedGenerateVoucherNumber(tenant_id, branch_id, voucher_type, queryExecutor);
    }
    const client = db.connect ? await db.connect() : await db.pool.connect();
    try {
        await client.query('BEGIN');
        const num = await sharedGenerateVoucherNumber(tenant_id, branch_id, voucher_type, client);
        await client.query('COMMIT');
        return num;
    } catch (err) {
        try { await client.query('ROLLBACK'); } catch (_) {}
        throw err;
    } finally {
        client.release();
    }
};

// @desc    Get all invoices for Branch/Tenant
// @route   GET /api/finance/invoices
exports.getInvoices = async (req, res) => {
    const tenant_id = req.user.tenant_id;
    let branch_id = req.branchId || req.user?.branch_id || null;
    if (branch_id === 'null' || branch_id === 'undefined' || !String(branch_id || '').trim()) {
        branch_id = null;
    }

    await ensureInvoicesTable();

    try {
        let query = `
            SELECT 
                i.*,
                COALESCE((SELECT SUM(amount) FROM payments p WHERE p.invoice_id::text = i.id::text AND (p.tenant_id IS NULL OR p.tenant_id::text = $1::text) AND (COALESCE(p.status, 'active') != 'cancelled')), 0) as total_paid,
                (i.total_amount - COALESCE((SELECT SUM(amount) FROM payments p WHERE p.invoice_id::text = i.id::text AND (p.tenant_id IS NULL OR p.tenant_id::text = $1::text) AND (COALESCE(p.status, 'active') != 'cancelled')), 0)) as remaining_balance,
                c.name as customer_name,
                u.unit_number, u.project_name,
                d.title as deal_title
            FROM invoices i
            LEFT JOIN deals d ON (NULLIF(i.deal_id::text, '') IS NOT NULL AND i.deal_id::text = d.id::text AND (d.tenant_id IS NULL OR d.tenant_id::text = i.tenant_id::text))
            LEFT JOIN customers c ON (
                (NULLIF(i.client_id::text, '') IS NOT NULL AND i.client_id::text = c.id::text) OR 
                (NULLIF(i.customer_id::text, '') IS NOT NULL AND i.customer_id::text = c.id::text)
            )
            LEFT JOIN re_units u ON (NULLIF(i.unit_id::text, '') IS NOT NULL AND i.unit_id::text = u.id::text)
            WHERE i.tenant_id::text = $1::text
        `;
        const params = [tenant_id];

        if (branch_id) {
            params.push(String(branch_id));
            query += ` AND (i.branch_id::text = $${params.length}::text OR i.branch_id IS NULL)`;
        }

        query += ` ORDER BY i.created_at DESC`;

        const result = await db.query(query, params);
        res.json({ status: 'success', data: result.rows });
    } catch (err) {
        console.error('getInvoices Error:', err.message);
        res.status(500).json({ status: 'error', message: err.message || 'Failed to retrieve invoices.' });
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

        // Idempotency check: Return existing active invoice for this deal if one already exists
        const existingInv = await db.query(
            `SELECT * FROM invoices 
             WHERE deal_id::text = $1::text 
               AND tenant_id::text = $2::text 
               AND (status IS NULL OR status != 'cancelled')
             LIMIT 1`,
            [deal.id, tenant_id]
        );

        if (existingInv.rows.length > 0) {
            await db.query('COMMIT');
            return res.status(200).json({
                status: 'success',
                message: 'Invoice already exists for this deal',
                data: existingInv.rows[0]
            });
        }

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

        // Finance records the invoice and financial transaction. Unit status is governed by Real Estate contracts/handovers.
        if (deal.unit_id && String(deal.unit_id).length > 10) {
            try {
                const payCheck = await db.query('SELECT id FROM re_payments_mvp WHERE deal_id::text = $1::text AND tenant_id::text = $2::text', [deal.id, tenant_id]);
                if (payCheck.rows.length === 0) {
                    await db.query(`
                        INSERT INTO re_payments_mvp (tenant_id, branch_id, deal_id, total_amount, status)
                        VALUES ($1, $2, $3, $4, 'Pending')
                    `, [tenant_id, branch_id, deal.id, deal.value]);
                }
            } catch (reErr) {
                console.error('[Finance Automation Warning]: Real Estate payment tracking failed:', reErr.message);
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
const recordPaymentInternal = async ({ tenant_id, branch_id, invoice_id, amount, payment_method, notes, user_id, req, treasury_account_id, existing_voucher_id }) => {
    await ensureInvoicesTable();
    const invRes = await db.query(
        'SELECT total_amount, invoice_number, client_id, customer_id FROM invoices WHERE id = $1 AND tenant_id::text = $2::text AND ($3::text IS NULL OR branch_id::text = $3::text OR branch_id IS NULL) FOR UPDATE',
        [invoice_id, tenant_id, branch_id ? String(branch_id) : null]
    );
    if (invRes.rows.length === 0) throw new Error('Invoice not found or unauthorized');
    
    const invoice = invRes.rows[0];
    const invoiceTotal = parseFloat(invoice.total_amount);

    const paidRes = await db.query("SELECT COALESCE(SUM(amount), 0) as total_paid FROM payments WHERE invoice_id = $1 AND tenant_id::text = $2::text AND (COALESCE(status, 'active') != 'cancelled')", [invoice_id, tenant_id]);
    const currentlyPaid = parseFloat(paidRes.rows[0].total_paid);
    const newTotalPaid = currentlyPaid + parseFloat(amount);

    if (newTotalPaid > (invoiceTotal + 0.01)) {
        throw new Error(`Payment amount exceeds remaining balance. Max allowed: ${(invoiceTotal - currentlyPaid).toFixed(2)}`);
    }

    // Resolve treasury_account_id: use provided value, else fallback to default for this method
    let resolvedTreasuryId = treasury_account_id || null;
    if (!resolvedTreasuryId) {
        try {
            const accountType = (payment_method === 'bank_transfer' || payment_method === 'card' || payment_method === 'check')
                ? 'bank' : 'cash';
            const taRes = await db.query(`
                SELECT id FROM treasury_accounts
                WHERE tenant_id::text = $1::text
                  AND ($2::text IS NULL OR branch_id::text = $2::text OR branch_id IS NULL)
                  AND type = $3
                  AND is_default = true
                  AND is_active = true
                LIMIT 1
            `, [tenant_id, branch_id ? String(branch_id) : null, accountType]);
            if (taRes.rows.length > 0) resolvedTreasuryId = taRes.rows[0].id;
        } catch (_) { /* treasury_accounts table may not exist yet — degrade gracefully */ }
    }

    const payRes = await db.query(`
        INSERT INTO payments (invoice_id, amount, payment_method, notes, tenant_id, branch_id, treasury_account_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *
    `, [invoice_id, amount, payment_method || 'cash', notes || null, tenant_id, branch_id ? String(branch_id) : null, resolvedTreasuryId]);


    let newStatus = 'unpaid';
    if (newTotalPaid >= (invoiceTotal - 0.01)) {
        newStatus = 'paid';
    } else if (newTotalPaid > 0) {
        newStatus = 'partial';
    }

    await db.query(`UPDATE invoices SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`, [newStatus, invoice_id]);

    // Link to voucher: if existing_voucher_id was passed, link directly; otherwise auto-generate receipt voucher
    let voucherData = null;
    if (existing_voucher_id && payRes.rows.length > 0) {
        await db.query(`UPDATE payments SET voucher_id = $1 WHERE id = $2`, [existing_voucher_id, payRes.rows[0].id]);
    } else {
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
            if (voucherData && payRes.rows.length > 0) {
                await db.query(`UPDATE payments SET voucher_id = $1 WHERE id = $2`, [voucherData.id, payRes.rows[0].id]);
            }
        } catch (vErr) {
            console.warn('[Auto Voucher Warning]: Could not auto-create receipt voucher:', vErr.message);
        }
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
    if (branch_id === 'null' || branch_id === 'undefined' || !String(branch_id || '').trim()) {
        branch_id = null;
    }
    const invoice_id = req.params.id;

    await ensureInvoicesTable();

    try {
        let invQuery = `
            SELECT i.*, u.unit_number as unit_no, u.project_name,
                   c.name as customer_name, c.email as customer_email, c.phone as customer_phone,
                   COALESCE(p.total_paid, 0) as total_paid, 
                   (i.total_amount - COALESCE(p.total_paid, 0)) as remaining_balance 
            FROM invoices i
            LEFT JOIN (SELECT invoice_id, SUM(amount) as total_paid FROM payments WHERE tenant_id::text = $1::text AND (COALESCE(status, 'active') != 'cancelled') GROUP BY invoice_id) p ON i.id::text = p.invoice_id::text
            LEFT JOIN re_units u ON (NULLIF(i.unit_id::text, '') IS NOT NULL AND i.unit_id::text = u.id::text)
            LEFT JOIN customers c ON (
                (NULLIF(i.client_id::text, '') IS NOT NULL AND i.client_id::text = c.id::text) OR 
                (NULLIF(i.customer_id::text, '') IS NOT NULL AND i.customer_id::text = c.id::text)
            )
            WHERE i.id::text = $2::text AND i.tenant_id::text = $1::text
        `;
        const invParams = [tenant_id, invoice_id];

        if (branch_id) {
            invParams.push(String(branch_id));
            invQuery += ` AND (i.branch_id::text = $${invParams.length}::text OR i.branch_id IS NULL)`;
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
            WHERE ii.invoice_id::text = $1::text 
            ORDER BY ii.id ASC
        `, [invoice_id]);
        const paymentsRes = await db.query("SELECT * FROM payments WHERE invoice_id::text = $1::text AND tenant_id::text = $2::text AND (COALESCE(status, 'active') != 'cancelled') ORDER BY payment_date DESC", [invoice_id, tenant_id]);

        res.json({
            status: 'success',
            data: {
                invoice: invRes.rows[0],
                items: itemsRes.rows,
                payments: paymentsRes.rows
            }
        });
    } catch (err) {
        console.error('getInvoiceDetails Error:', err.message);
        res.status(500).json({ status: 'error', message: err.message || 'Failed to retrieve invoice details.' });
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
              AND (COALESCE(v.status, 'active') != 'cancelled')
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
                req,
                existing_voucher_id: voucher.id
            });
        }

        // If it's an operating payment voucher (NOT vendor settlement), record an expense entry
        if (voucher_type === 'payment' && party_type !== 'vendor') {
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

// @desc    Delete / Cancel Voucher (With RE Installment & Invoice Payment Reversals)
// @route   DELETE /api/finance/vouchers/:id
exports.deleteVoucher = async (req, res) => {
    const tenant_id = req.user.tenant_id;
    let branch_id = req.branchId || req.user?.branch_id || null;
    const voucher_id = req.params.id;
    const { reason } = req.body || {};

    // 1. Require a non-empty cancellation reason for financial audit trail
    if (!reason || typeof reason !== 'string' || !reason.trim()) {
        return res.status(400).json({
            status: 'error',
            message: 'A non-empty cancellation reason is required to cancel a financial voucher.'
        });
    }

    const client = db.connect ? await db.connect() : await db.pool.connect();

    try {
        await ensureVouchersTable();
        await client.query('BEGIN');

        // 2. Fetch voucher FOR UPDATE scoped to tenant
        const vRes = await client.query(
            `SELECT * FROM finance_vouchers 
             WHERE id::text = $1::text 
               AND tenant_id::text = $2::text 
               AND ($3::text IS NULL OR branch_id::text = $3::text OR branch_id IS NULL)
             FOR UPDATE`,
            [voucher_id, tenant_id, branch_id ? String(branch_id) : null]
        );

        if (vRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ status: 'error', message: 'Voucher not found' });
        }

        const voucher = vRes.rows[0];

        // 3. Prevent double cancellation
        if (voucher.status === 'cancelled') {
            await client.query('ROLLBACK');
            return res.status(400).json({ status: 'error', message: 'Voucher is already cancelled' });
        }

        const voucherAmount = parseFloat(voucher.amount) || 0;

        // 4. Mark voucher as cancelled
        await client.query(
            `UPDATE finance_vouchers 
             SET status = 'cancelled', 
                 cancelled_at = NOW(), 
                 cancelled_by = $1, 
                 cancellation_reason = $2 
             WHERE id = $3 AND tenant_id::text = $4::text`,
            [req.user.id, reason.trim(), voucher.id, tenant_id]
        );

        // 5. Reverse Real Estate linkages if receipt voucher
        if (voucher.voucher_type === 'receipt') {
            // A. If linked to an installment, reverse paid_amount with FOR UPDATE guard
            if (voucher.installment_id) {
                const instRes = await client.query(
                    `SELECT id, amount, paid_amount, due_date, status FROM re_installments 
                     WHERE id::text = $1::text AND tenant_id::text = $2::text 
                     FOR UPDATE`,
                    [String(voucher.installment_id), tenant_id]
                );

                if (instRes.rows.length > 0) {
                    const inst = instRes.rows[0];
                    const currentPaid = parseFloat(inst.paid_amount) || 0;
                    const instAmount = parseFloat(inst.amount) || 0;
                    const newPaid = Number(Math.max(0, currentPaid - voucherAmount).toFixed(2));

                    // Recompute status matching canonical Tashgheel installment workflow:
                    // 'Paid' | 'Partially Paid' | 'Overdue' (if due_date < today) | 'Pending'
                    let newStatus = 'Pending';
                    const isDuePast = inst.due_date && new Date(inst.due_date) < new Date(new Date().setHours(0,0,0,0));

                    if (newPaid >= instAmount - 0.01) {
                        newStatus = 'Paid';
                    } else if (newPaid > 0) {
                        newStatus = 'Partially Paid';
                    } else if (isDuePast) {
                        newStatus = 'Overdue';
                    } else {
                        newStatus = 'Pending';
                    }

                    await client.query(
                        `UPDATE re_installments 
                         SET paid_amount = $1,
                             status = $2,
                             paid_at = CASE WHEN $1 <= 0 THEN NULL ELSE paid_at END,
                             updated_at = NOW()
                         WHERE id = $3 AND tenant_id::text = $4::text`,
                        [newPaid, newStatus, inst.id, tenant_id]
                    );
                }
            }

            // B. If linked to deal, reverse re_payments_mvp.paid_amount
            if (voucher.deal_id) {
                await client.query(
                    `UPDATE re_payments_mvp 
                     SET paid_amount = GREATEST(0, COALESCE(paid_amount, 0) - $1),
                         updated_at = NOW()
                     WHERE deal_id::text = $2::text AND tenant_id::text = $3::text`,
                    [voucherAmount, String(voucher.deal_id), tenant_id]
                );
            }

            // C. General Template: If linked to an invoice, reverse invoice payment without hard-deletion
            if (voucher.invoice_id) {
                // Strictly look for payment explicitly linked by voucher_id (No legacy fuzzy guessing)
                const directPayRes = await client.query(
                    `SELECT id FROM payments 
                     WHERE voucher_id = $1 AND tenant_id::text = $2::text AND (COALESCE(status, 'active') != 'cancelled')
                     LIMIT 1`,
                    [voucher.id, tenant_id]
                );

                if (directPayRes.rows.length === 0) {
                    await client.query('ROLLBACK');
                    return res.status(400).json({
                        status: 'error',
                        message: 'Cannot cancel this invoice receipt voucher: no active payment record explicitly linked via voucher_id was found.'
                    });
                }

                const targetPaymentId = directPayRes.rows[0].id;

                // Mark payment as cancelled (Audit-safe, zero hard delete)
                await client.query(
                    `UPDATE payments 
                     SET status = 'cancelled', 
                         cancelled_at = NOW(), 
                         cancelled_by = $1 
                     WHERE id = $2 AND tenant_id::text = $3::text`,
                    [req.user.id, targetPaymentId, tenant_id]
                );

                // Recompute invoice paid_amount and status
                const invRes = await client.query(
                    `SELECT id, total_amount FROM invoices 
                     WHERE id = $1 AND tenant_id::text = $2::text 
                     FOR UPDATE`,
                    [voucher.invoice_id, tenant_id]
                );

                if (invRes.rows.length > 0) {
                    const inv = invRes.rows[0];
                    const invTotal = parseFloat(inv.total_amount) || 0;

                    const newPaidSumRes = await client.query(
                        `SELECT COALESCE(SUM(amount), 0) as total_paid 
                         FROM payments 
                         WHERE invoice_id = $1 
                           AND tenant_id::text = $2::text 
                           AND (COALESCE(status, 'active') != 'cancelled')`,
                        [voucher.invoice_id, tenant_id]
                    );
                    const remainingPaid = parseFloat(newPaidSumRes.rows[0]?.total_paid || 0);

                    let newInvStatus = 'unpaid';
                    if (remainingPaid >= invTotal - 0.01) {
                        newInvStatus = 'paid';
                    } else if (remainingPaid > 0) {
                        newInvStatus = 'partial';
                    }

                    await client.query(
                        `UPDATE invoices SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND tenant_id::text = $3::text`,
                        [newInvStatus, voucher.invoice_id, tenant_id]
                    );
                }
            }
        } else if (voucher.voucher_type === 'payment') {
            // D. Vendor Settlement Reversal: If linked to a purchase_invoice, reverse paid_amount & status
            if (voucher.invoice_id) {
                const pinvRes = await client.query(
                    `SELECT id, total_amount, paid_amount FROM purchase_invoices 
                     WHERE id = $1 AND tenant_id::text = $2::text 
                     FOR UPDATE`,
                    [voucher.invoice_id, tenant_id]
                );

                if (pinvRes.rows.length > 0) {
                    const pinv = pinvRes.rows[0];
                    const pinvTotal = parseFloat(pinv.total_amount) || 0;
                    const currentPaid = parseFloat(pinv.paid_amount) || 0;
                    const newPaid = Number(Math.max(0, currentPaid - voucherAmount).toFixed(2));
                    const newPinvStatus = newPaid >= (pinvTotal - 0.01) ? 'paid' : (newPaid > 0 ? 'partial' : 'pending');

                    await client.query(
                        `UPDATE purchase_invoices 
                         SET paid_amount = $1, status = $2, updated_at = CURRENT_TIMESTAMP 
                         WHERE id = $3 AND tenant_id::text = $4::text`,
                        [newPaid, newPinvStatus, voucher.invoice_id, tenant_id]
                    );
                }
            }
        }

        await client.query('COMMIT');

        // Post-commit logging: isolated so logging error does not trigger rollback of committed cancel
        try {
            logAction({
                req,
                action: ACTIONS.UPDATE,
                entityType: 'Finance Voucher',
                entityId: voucher.id,
                details: { action: 'cancelled', voucher_number: voucher.voucher_number, amount: voucherAmount },
                level: LOG_LEVELS.WARN
            });
        } catch (logErr) {
            console.warn('[Finance] Cancel voucher audit log notice (non-fatal):', logErr.message);
        }

        res.json({
            status: 'success',
            message: 'Voucher cancelled successfully and balances reversed.',
            data: { id: voucher.id, status: 'cancelled' }
        });
    } catch (err) {
        try {
            await client.query('ROLLBACK');
        } catch (rbErr) {}
        console.error('deleteVoucher Error:', err.message);
        res.status(500).json({ status: 'error', message: 'Failed to cancel voucher: ' + err.message });
    } finally {
        client.release();
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
    const { title, amount, category, expense_date, payment_method, treasury_account_id } = req.body;

    try {
        await ensureInvoicesTable();

        // Resolve treasury_account_id: provided → default cash → null (graceful degrade)
        let resolvedTreasuryId = treasury_account_id || null;
        if (!resolvedTreasuryId) {
            try {
                const accType = (payment_method === 'bank_transfer' || payment_method === 'card' || payment_method === 'check')
                    ? 'bank' : 'cash';
                const taRes = await db.query(`
                    SELECT id FROM treasury_accounts
                    WHERE tenant_id::text = $1::text
                      AND ($2::text IS NULL OR branch_id::text = $2::text OR branch_id IS NULL)
                      AND type = $3 AND is_default = true AND is_active = true
                    LIMIT 1
                `, [tenant_id, branch_id ? String(branch_id) : null, accType]);
                if (taRes.rows.length > 0) resolvedTreasuryId = taRes.rows[0].id;
            } catch (_) { /* degrade gracefully if table doesn't exist yet */ }
        }

        const result = await db.query(`
            INSERT INTO expenses
              (title, amount, category, expense_date, payment_method, treasury_account_id, recorded_by, tenant_id, branch_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *
        `, [
            title, amount,
            category || 'General',
            expense_date || new Date().toISOString().split('T')[0],
            payment_method || 'cash',
            resolvedTreasuryId,
            req.user.id,
            tenant_id,
            branch_id ? String(branch_id) : null,
        ]);

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
                (NULLIF(i.client_id::text, '') IS NOT NULL AND i.client_id::text = c.id::text) OR 
                (NULLIF(i.customer_id::text, '') IS NOT NULL AND i.customer_id::text = c.id::text)
            )
            WHERE p.tenant_id::text = $1::text 
              AND ($2::text IS NULL OR p.branch_id::text = $2::text OR p.branch_id IS NULL)
              AND (COALESCE(p.status, 'active') != 'cancelled')
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
               AND ($2::text IS NULL OR branch_id::text = $2::text OR branch_id IS NULL)
               AND (COALESCE(status, 'active') != 'cancelled')`,
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
            LEFT JOIN (SELECT invoice_id, SUM(amount) as paid FROM payments WHERE tenant_id::text = $1::text AND (COALESCE(status, 'active') != 'cancelled') GROUP BY invoice_id) p ON i.id::text = p.invoice_id::text
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
                  AND (COALESCE(status, 'active') != 'cancelled')
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

// ==========================================
// CUSTOMER ACCOUNTS — Phase 2
// Derived financial views. No new tables.
// Source: invoices + payments + customers
// ==========================================

// @desc    List all customers with financial activity + totals + aging summary
// @route   GET /api/finance/customers
exports.getCustomerAccounts = async (req, res) => {
    const tenant_id = req.user.tenant_id;
    let branch_id = req.branchId || req.user?.branch_id || null;
    if (branch_id === 'null' || branch_id === 'undefined' || !String(branch_id || '').trim()) branch_id = null;

    await ensureInvoicesTable();

    try {
        // One query: per-customer aggregation from invoices + payments
        // Overdue = unpaid/partial invoices where due_date < today
        const result = await db.query(`
            SELECT
                c.id                                                        AS customer_id,
                c.name                                                      AS customer_name,
                c.phone                                                     AS customer_phone,
                c.email                                                     AS customer_email,

                -- Totals derived from invoices
                COALESCE(SUM(i.total_amount), 0)                            AS total_invoiced,

                -- Total paid: sum of all payments linked to this customer's invoices
                COALESCE(SUM(p_agg.paid), 0)                                AS total_paid,

                -- Outstanding = invoiced - paid (only unpaid/partial)
                COALESCE(SUM(CASE WHEN i.status != 'paid' THEN i.total_amount - COALESCE(p_agg.paid, 0) ELSE 0 END), 0) AS outstanding,

                -- Overdue = outstanding where due_date < today
                COALESCE(SUM(
                    CASE
                        WHEN i.status != 'paid'
                         AND i.due_date IS NOT NULL
                         AND i.due_date < CURRENT_DATE
                        THEN i.total_amount - COALESCE(p_agg.paid, 0)
                        ELSE 0
                    END
                ), 0) AS overdue,

                -- Last transaction = latest of invoice created_at or last payment
                GREATEST(
                    MAX(i.created_at),
                    MAX(p_agg.last_payment_date)
                )                                                           AS last_transaction,

                COUNT(i.id)                                                 AS invoice_count,

                -- Account status: 'overdue' > 'outstanding' > 'clear'
                CASE
                    WHEN COALESCE(SUM(CASE WHEN i.status != 'paid' AND i.due_date IS NOT NULL AND i.due_date < CURRENT_DATE THEN i.total_amount - COALESCE(p_agg.paid, 0) ELSE 0 END), 0) > 0 THEN 'overdue'
                    WHEN COALESCE(SUM(CASE WHEN i.status != 'paid' THEN i.total_amount - COALESCE(p_agg.paid, 0) ELSE 0 END), 0) > 0 THEN 'outstanding'
                    ELSE 'clear'
                END                                                         AS account_status

            FROM customers c
            INNER JOIN invoices i ON (
                i.client_id::text = c.id::text OR i.customer_id::text = c.id::text
            )
            LEFT JOIN (
                SELECT
                    inv.client_id,
                    inv.customer_id,
                    inv.id AS invoice_id,
                    COALESCE(SUM(py.amount), 0) AS paid,
                    MAX(py.payment_date)         AS last_payment_date
                FROM invoices inv
                LEFT JOIN payments py ON py.invoice_id::text = inv.id::text
                    AND py.tenant_id::text = $1::text
                    AND (COALESCE(py.status, 'active') != 'cancelled')
                WHERE inv.tenant_id::text = $1::text
                  AND ($2::text IS NULL OR inv.branch_id::text = $2::text OR inv.branch_id IS NULL)
                GROUP BY inv.id, inv.client_id, inv.customer_id
            ) p_agg ON p_agg.invoice_id = i.id

            WHERE c.tenant_id::text = $1::text
              AND i.tenant_id::text = $1::text
              AND ($2::text IS NULL OR i.branch_id::text = $2::text OR i.branch_id IS NULL)

            GROUP BY c.id, c.name, c.phone, c.email
            HAVING COALESCE(SUM(i.total_amount), 0) > 0

            ORDER BY outstanding DESC, total_invoiced DESC
        `, [tenant_id, branch_id ? String(branch_id) : null]);

        // KPI totals across all customers
        const kpi = result.rows.reduce((acc, row) => {
            acc.totalReceivables   += parseFloat(row.outstanding   || 0);
            acc.totalOverdue       += parseFloat(row.overdue       || 0);
            acc.totalInvoiced      += parseFloat(row.total_invoiced || 0);
            acc.totalPaid          += parseFloat(row.total_paid     || 0);
            if (parseFloat(row.outstanding || 0) > 0) acc.customersWithOutstanding++;
            return acc;
        }, { totalReceivables: 0, totalOverdue: 0, totalInvoiced: 0, totalPaid: 0, customersWithOutstanding: 0 });

        // Due this month = outstanding invoices with due_date in current calendar month
        try {
            const monthRes = await db.query(`
                SELECT COALESCE(SUM(i.total_amount - COALESCE(p_agg.paid, 0)), 0) AS due_this_month
                FROM invoices i
                LEFT JOIN (
                    SELECT invoice_id, COALESCE(SUM(amount), 0) AS paid
                    FROM payments WHERE tenant_id::text = $1::text AND (COALESCE(status, 'active') != 'cancelled') GROUP BY invoice_id
                ) p_agg ON p_agg.invoice_id::text = i.id::text
                WHERE i.tenant_id::text = $1::text
                  AND ($2::text IS NULL OR i.branch_id::text = $2::text OR i.branch_id IS NULL)
                  AND i.status != 'paid'
                  AND date_trunc('month', i.due_date) = date_trunc('month', CURRENT_DATE)
            `, [tenant_id, branch_id ? String(branch_id) : null]);
            kpi.dueThisMonth = parseFloat(monthRes.rows[0]?.due_this_month || 0);
        } catch (e) {
            kpi.dueThisMonth = 0;
        }

        res.json({ status: 'success', data: result.rows, kpi });
    } catch (err) {
        console.error('getCustomerAccounts Error:', err.message);
        res.status(500).json({ status: 'error', message: err.message || 'Failed to retrieve customer accounts' });
    }
};

// @desc    Customer Statement: chronological debit/credit ledger + aging
// @route   GET /api/finance/customers/:id/statement
exports.getCustomerStatement = async (req, res) => {
    const tenant_id = req.user.tenant_id;
    let branch_id = req.branchId || req.user?.branch_id || null;
    if (branch_id === 'null' || branch_id === 'undefined' || !String(branch_id || '').trim()) branch_id = null;

    const customer_id = req.params.id;
    const { date_from, date_to, type } = req.query; // optional filters

    await ensureInvoicesTable();

    try {
        // 1. Customer info
        const custRes = await db.query(
            'SELECT id, name, phone, email, address FROM customers WHERE id::text = $1::text AND tenant_id::text = $2::text',
            [customer_id, tenant_id]
        );
        if (custRes.rows.length === 0) {
            return res.status(404).json({ status: 'error', message: 'Customer not found' });
        }
        const customer = custRes.rows[0];

        // 2. Invoices for this customer → DEBIT entries
        let invWhere = `
            WHERE i.tenant_id::text = $1::text
              AND ($2::text IS NULL OR i.branch_id::text = $2::text OR i.branch_id IS NULL)
              AND (i.client_id::text = $3::text OR i.customer_id::text = $3::text)
        `;
        const invParams = [tenant_id, branch_id ? String(branch_id) : null, customer_id];

        if (date_from) { invParams.push(date_from); invWhere += ` AND i.created_at::date >= $${invParams.length}`; }
        if (date_to)   { invParams.push(date_to);   invWhere += ` AND i.created_at::date <= $${invParams.length}`; }

        const invoicesRes = await db.query(`
            SELECT
                i.created_at::date                 AS txn_date,
                'Invoice'                          AS txn_type,
                i.invoice_number                   AS reference,
                i.total_amount                     AS debit,
                0                                  AS credit,
                i.due_date,
                i.status,
                i.id                               AS source_id
            FROM invoices i
            ${invWhere}
            ${type && type !== 'all' ? `AND 'Invoice' = $${invParams.length + 1}` : ''}
            ORDER BY i.created_at ASC
        `, invParams);

        // 3. Payments for this customer's invoices → CREDIT entries
        let payWhere = `
            WHERE p.tenant_id::text = $1::text
              AND ($2::text IS NULL OR p.branch_id::text = $2::text OR p.branch_id IS NULL)
              AND (i.client_id::text = $3::text OR i.customer_id::text = $3::text)
              AND (COALESCE(p.status, 'active') != 'cancelled')
        `;
        const payParams = [tenant_id, branch_id ? String(branch_id) : null, customer_id];

        if (date_from) { payParams.push(date_from); payWhere += ` AND p.payment_date::date >= $${payParams.length}`; }
        if (date_to)   { payParams.push(date_to);   payWhere += ` AND p.payment_date::date <= $${payParams.length}`; }

        const paymentsRes = await db.query(`
            SELECT
                p.payment_date::date               AS txn_date,
                'Receipt'                          AS txn_type,
                COALESCE(
                    (SELECT fv.voucher_number
                     FROM finance_vouchers fv
                     WHERE fv.invoice_id = i.id
                       AND fv.voucher_type = 'receipt'
                       AND fv.tenant_id::text = $1::text
                       AND ABS(fv.amount - p.amount) < 0.01
                       AND fv.voucher_date = p.payment_date::date
                     ORDER BY fv.id DESC LIMIT 1),
                    'PMT-' || p.id::text
                )                                  AS reference,
                0                                  AS debit,
                p.amount                           AS credit,
                i.invoice_number                   AS linked_invoice,
                p.payment_method,
                p.id                               AS source_id
            FROM payments p
            JOIN invoices i ON p.invoice_id::text = i.id::text
            ${payWhere}
            ORDER BY p.payment_date ASC
        `, payParams);

        // 4. Merge & sort chronologically, compute running balance
        const allTxns = [
            ...invoicesRes.rows.map(r => ({ ...r, debit: parseFloat(r.debit), credit: 0 })),
            ...paymentsRes.rows.map(r => ({ ...r, debit: 0, credit: parseFloat(r.credit) })),
        ].sort((a, b) => new Date(a.txn_date) - new Date(b.txn_date) || (a.txn_type === 'Invoice' ? -1 : 1));

        let runningBalance = 0;
        const statement = allTxns.map(txn => {
            runningBalance += txn.debit - txn.credit;
            return { ...txn, balance: runningBalance };
        });

        // 5. Summary totals (always full range, ignoring date filters)
        const summaryRes = await db.query(`
            SELECT
                COALESCE(SUM(i.total_amount), 0)                            AS total_invoiced,
                COALESCE(SUM(p_agg.paid), 0)                                AS total_paid,
                COALESCE(SUM(CASE WHEN i.status != 'paid' THEN i.total_amount - COALESCE(p_agg.paid, 0) ELSE 0 END), 0) AS outstanding,
                COALESCE(SUM(
                    CASE WHEN i.status != 'paid' AND i.due_date IS NOT NULL AND i.due_date < CURRENT_DATE
                    THEN i.total_amount - COALESCE(p_agg.paid, 0) ELSE 0 END
                ), 0) AS overdue
            FROM invoices i
            LEFT JOIN (
                SELECT invoice_id, COALESCE(SUM(amount), 0) AS paid
                FROM payments WHERE tenant_id::text = $1::text AND (COALESCE(status, 'active') != 'cancelled') GROUP BY invoice_id
            ) p_agg ON p_agg.invoice_id::text = i.id::text
            WHERE i.tenant_id::text = $1::text
              AND ($2::text IS NULL OR i.branch_id::text = $2::text OR i.branch_id IS NULL)
              AND (i.client_id::text = $3::text OR i.customer_id::text = $3::text)
        `, [tenant_id, branch_id ? String(branch_id) : null, customer_id]);

        const summary = summaryRes.rows[0];

        res.json({
            status: 'success',
            customer,
            summary: {
                total_invoiced:  parseFloat(summary.total_invoiced  || 0),
                total_paid:      parseFloat(summary.total_paid      || 0),
                outstanding:     parseFloat(summary.outstanding     || 0),
                overdue:         parseFloat(summary.overdue         || 0),
            },
            statement,
        });
    } catch (err) {
        console.error('getCustomerStatement Error:', err.message);
        res.status(500).json({ status: 'error', message: err.message || 'Failed to retrieve customer statement' });
    }
};

// @desc    Customer Aging — 5 buckets computed from due_date
// @route   GET /api/finance/customers/:id/aging
exports.getCustomerAging = async (req, res) => {
    const tenant_id = req.user.tenant_id;
    let branch_id = req.branchId || req.user?.branch_id || null;
    if (branch_id === 'null' || branch_id === 'undefined' || !String(branch_id || '').trim()) branch_id = null;

    const customer_id = req.params.id;

    await ensureInvoicesTable();

    try {
        const result = await db.query(`
            SELECT
                -- Remaining balance per invoice
                i.invoice_number,
                i.due_date,
                i.total_amount - COALESCE(p_agg.paid, 0) AS remaining,
                CASE
                    WHEN i.due_date IS NULL OR i.due_date >= CURRENT_DATE              THEN 'current'
                    WHEN CURRENT_DATE - i.due_date BETWEEN 1  AND 30                  THEN '1_30'
                    WHEN CURRENT_DATE - i.due_date BETWEEN 31 AND 60                  THEN '31_60'
                    WHEN CURRENT_DATE - i.due_date BETWEEN 61 AND 90                  THEN '61_90'
                    ELSE '90_plus'
                END AS aging_bucket
            FROM invoices i
            LEFT JOIN (
                SELECT invoice_id, COALESCE(SUM(amount), 0) AS paid
                FROM payments WHERE tenant_id::text = $1::text AND (COALESCE(status, 'active') != 'cancelled') GROUP BY invoice_id
            ) p_agg ON p_agg.invoice_id::text = i.id::text
            WHERE i.tenant_id::text = $1::text
              AND ($2::text IS NULL OR i.branch_id::text = $2::text OR i.branch_id IS NULL)
              AND (i.client_id::text = $3::text OR i.customer_id::text = $3::text)
              AND i.status != 'paid'
              AND (i.total_amount - COALESCE(p_agg.paid, 0)) > 0
        `, [tenant_id, branch_id ? String(branch_id) : null, customer_id]);

        const buckets = { current: 0, '1_30': 0, '31_60': 0, '61_90': 0, '90_plus': 0 };
        for (const row of result.rows) {
            buckets[row.aging_bucket] += parseFloat(row.remaining || 0);
        }

        const total = Object.values(buckets).reduce((a, b) => a + b, 0);

        res.json({
            status: 'success',
            aging: {
                current:  buckets['current'],
                days_1_30:  buckets['1_30'],
                days_31_60: buckets['31_60'],
                days_61_90: buckets['61_90'],
                days_90_plus: buckets['90_plus'],
                total,
            },
            detail: result.rows,
        });
    } catch (err) {
        console.error('getCustomerAging Error:', err.message);
        res.status(500).json({ status: 'error', message: err.message || 'Failed to retrieve aging' });
    }
};

// ==========================================
// TREASURY — Phase 3
// CRM-level cash/bank account management.
// No GL. No journal entries. No treasury_transactions.
// Balance = opening_balance + SUM(payments) - SUM(expenses)
// All queries: strictly tenant + branch scoped.
// ==========================================

// @desc    List treasury accounts + computed balance for each
// @route   GET /api/finance/treasury/accounts
exports.getTreasuryAccounts = async (req, res) => {
    const tenant_id = req.user.tenant_id;
    let branch_id = req.branchId || req.user?.branch_id || null;
    if (branch_id === 'null' || branch_id === 'undefined' || !String(branch_id || '').trim()) branch_id = null;

    try {
        // Guard: return empty if treasury_accounts table doesn't exist yet (pre-migration)
        try {
            await db.query(`SELECT 1 FROM treasury_accounts LIMIT 1`);
        } catch (tableErr) {
            if (tableErr.message && tableErr.message.includes('does not exist')) {
                return res.json({
                    status: 'success',
                    data: [],
                    totals: { total_balance: 0, total_cash: 0, total_bank: 0, month_incoming: 0, month_outgoing: 0 },
                    _warning: 'treasury_accounts table not yet created — run migrations/001_create_treasury_accounts.sql',
                });
            }
            throw tableErr;
        }

        // Get all active treasury accounts for this tenant+branch
        const accountsRes = await db.query(`
            SELECT
                ta.*,
                -- Incoming: sum of payments linked to this account
                COALESCE((
                    SELECT SUM(p.amount)
                    FROM payments p
                    WHERE p.treasury_account_id = ta.id
                      AND p.tenant_id::text = ta.tenant_id::text
                      AND ($2::text IS NULL OR p.branch_id::text = $2::text OR p.branch_id IS NULL)
                      AND (COALESCE(p.status, 'active') != 'cancelled')
                ), 0) AS total_incoming,

                -- Outgoing: sum of expenses + vendor payments linked to this account
                COALESCE((
                    SELECT SUM(e.amount)
                    FROM expenses e
                    WHERE e.treasury_account_id = ta.id
                      AND e.tenant_id::text = ta.tenant_id::text
                      AND ($2::text IS NULL OR e.branch_id::text = $2::text OR e.branch_id IS NULL)
                ), 0) +
                COALESCE((
                    SELECT SUM(fv.amount)
                    FROM finance_vouchers fv
                    WHERE fv.treasury_account_id = ta.id
                      AND fv.voucher_type = 'payment'
                      AND fv.tenant_id::text = ta.tenant_id::text
                      AND ($2::text IS NULL OR fv.branch_id::text = $2::text OR fv.branch_id IS NULL)
                      AND (COALESCE(fv.status, 'active') != 'cancelled')
                ), 0) AS total_outgoing,

                -- This month incoming
                COALESCE((
                    SELECT SUM(p.amount)
                    FROM payments p
                    WHERE p.treasury_account_id = ta.id
                      AND p.tenant_id::text = ta.tenant_id::text
                      AND ($2::text IS NULL OR p.branch_id::text = $2::text OR p.branch_id IS NULL)
                      AND (COALESCE(p.status, 'active') != 'cancelled')
                      AND date_trunc('month', p.payment_date) = date_trunc('month', CURRENT_DATE)
                ), 0) AS month_incoming,

                -- This month outgoing (expenses + vendor payments)
                COALESCE((
                    SELECT SUM(e.amount)
                    FROM expenses e
                    WHERE e.treasury_account_id = ta.id
                      AND e.tenant_id::text = ta.tenant_id::text
                      AND ($2::text IS NULL OR e.branch_id::text = $2::text OR e.branch_id IS NULL)
                      AND date_trunc('month', e.expense_date) = date_trunc('month', CURRENT_DATE)
                ), 0) +
                COALESCE((
                    SELECT SUM(fv.amount)
                    FROM finance_vouchers fv
                    WHERE fv.treasury_account_id = ta.id
                      AND fv.voucher_type = 'payment'
                      AND fv.tenant_id::text = ta.tenant_id::text
                      AND ($2::text IS NULL OR fv.branch_id::text = $2::text OR fv.branch_id IS NULL)
                      AND (COALESCE(fv.status, 'active') != 'cancelled')
                      AND date_trunc('month', fv.voucher_date) = date_trunc('month', CURRENT_DATE)
                ), 0) AS month_outgoing

            FROM treasury_accounts ta
            WHERE ta.tenant_id::text = $1::text
              AND ($2::text IS NULL OR ta.branch_id::text = $2::text OR ta.branch_id IS NULL)
              AND ta.is_active = true
            ORDER BY ta.is_default DESC, ta.type ASC, ta.name ASC
        `, [tenant_id, branch_id ? String(branch_id) : null]);

        // Compute current_balance = opening_balance + incoming - outgoing
        const accounts = accountsRes.rows.map(acc => ({
            ...acc,
            total_incoming:  parseFloat(acc.total_incoming  || 0),
            total_outgoing:  parseFloat(acc.total_outgoing  || 0),
            month_incoming:  parseFloat(acc.month_incoming  || 0),
            month_outgoing:  parseFloat(acc.month_outgoing  || 0),
            opening_balance: parseFloat(acc.opening_balance || 0),
            current_balance:
                parseFloat(acc.opening_balance || 0) +
                parseFloat(acc.total_incoming  || 0) -
                parseFloat(acc.total_outgoing  || 0),
        }));

        // Totals across all accounts
        const totals = accounts.reduce((acc, a) => {
            acc.total_balance   += a.current_balance;
            acc.total_cash      += a.type === 'cash' ? a.current_balance : 0;
            acc.total_bank      += a.type === 'bank' ? a.current_balance : 0;
            acc.month_incoming  += a.month_incoming;
            acc.month_outgoing  += a.month_outgoing;
            return acc;
        }, { total_balance: 0, total_cash: 0, total_bank: 0, month_incoming: 0, month_outgoing: 0 });

        res.json({ status: 'success', data: accounts, totals });
    } catch (err) {
        console.error('getTreasuryAccounts Error:', err.message);
        res.status(500).json({ status: 'error', message: err.message || 'Failed to load treasury accounts' });
    }
};

// @desc    Create a treasury account (cashbox or bank account)
// @route   POST /api/finance/treasury/accounts
exports.createTreasuryAccount = async (req, res) => {
    const tenant_id = req.user.tenant_id;
    let branch_id = req.branchId || req.user?.branch_id || null;
    if (branch_id === 'null' || branch_id === 'undefined' || !String(branch_id || '').trim()) branch_id = null;

    const { name, type, bank_name, account_number, opening_balance, is_default } = req.body;

    if (!name || !type) {
        return res.status(400).json({ status: 'error', message: 'name and type (cash|bank) are required' });
    }
    if (!['cash', 'bank'].includes(type)) {
        return res.status(400).json({ status: 'error', message: "type must be 'cash' or 'bank'" });
    }

    try {
        // Guard: table must exist before we can insert
        try { await db.query(`SELECT 1 FROM treasury_accounts LIMIT 1`); }
        catch (e) {
            if (e.message?.includes('does not exist'))
                return res.status(503).json({ status: 'error', message: 'Run migration first: node migrate.js' });
            throw e;
        }

        // If setting as default, unset any existing default of the same type in this tenant+branch
        if (is_default) {
            await db.query(`
                UPDATE treasury_accounts
                SET is_default = false
                WHERE tenant_id::text = $1::text
                  AND ($2::text IS NULL OR branch_id::text = $2::text OR branch_id IS NULL)
                  AND type = $3
                  AND is_default = true
            `, [tenant_id, branch_id ? String(branch_id) : null, type]);
        }

        const result = await db.query(`
            INSERT INTO treasury_accounts
              (name, type, bank_name, account_number, opening_balance, is_default, tenant_id, branch_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *
        `, [
            name, type,
            bank_name        || null,
            account_number   || null,
            parseFloat(opening_balance || 0),
            is_default       || false,
            tenant_id,
            branch_id ? String(branch_id) : null,
        ]);

        logCreate(req, 'TreasuryAccount', result.rows[0].id, result.rows[0]);
        res.status(201).json({ status: 'success', data: result.rows[0] });
    } catch (err) {
        console.error('createTreasuryAccount Error:', err.message);
        if (err.message.includes('idx_treasury_one_default_per_type')) {
            return res.status(409).json({ status: 'error', message: `A default ${type} account already exists for this branch` });
        }
        res.status(500).json({ status: 'error', message: err.message || 'Failed to create treasury account' });
    }
};

// @desc    Update a treasury account (name, bank info, is_default, is_active)
// @route   PUT /api/finance/treasury/accounts/:id
// @note    opening_balance is intentionally NOT updatable through this endpoint.
exports.updateTreasuryAccount = async (req, res) => {
    const tenant_id = req.user.tenant_id;
    let branch_id = req.branchId || req.user?.branch_id || null;
    if (branch_id === 'null' || branch_id === 'undefined' || !String(branch_id || '').trim()) branch_id = null;

    const account_id = req.params.id;
    const { name, bank_name, account_number, is_default, is_active } = req.body;

    try {
        // Ownership check
        const existing = await db.query(`
            SELECT * FROM treasury_accounts
            WHERE id = $1 AND tenant_id::text = $2::text
              AND ($3::text IS NULL OR branch_id::text = $3::text OR branch_id IS NULL)
        `, [account_id, tenant_id, branch_id ? String(branch_id) : null]);

        if (existing.rows.length === 0) {
            return res.status(404).json({ status: 'error', message: 'Treasury account not found' });
        }

        const acc = existing.rows[0];

        // If promoting to default, demote any other default of the same type
        if (is_default && !acc.is_default) {
            await db.query(`
                UPDATE treasury_accounts SET is_default = false
                WHERE tenant_id::text = $1::text
                  AND ($2::text IS NULL OR branch_id::text = $2::text OR branch_id IS NULL)
                  AND type = $3 AND is_default = true
            `, [tenant_id, branch_id ? String(branch_id) : null, acc.type]);
        }

        const result = await db.query(`
            UPDATE treasury_accounts SET
                name           = COALESCE($1, name),
                bank_name      = COALESCE($2, bank_name),
                account_number = COALESCE($3, account_number),
                is_default     = COALESCE($4, is_default),
                is_active      = COALESCE($5, is_active),
                updated_at     = CURRENT_TIMESTAMP
            WHERE id = $6 AND tenant_id::text = $7::text
            RETURNING *
        `, [name || null, bank_name || null, account_number || null, is_default ?? null, is_active ?? null, account_id, tenant_id]);

        logAction({ req, action: ACTIONS.UPDATE, entityType: 'TreasuryAccount', entityId: account_id, details: req.body });
        res.json({ status: 'success', data: result.rows[0] });
    } catch (err) {
        console.error('updateTreasuryAccount Error:', err.message);
        res.status(500).json({ status: 'error', message: err.message || 'Failed to update treasury account' });
    }
};

// @desc    Transaction history for a specific treasury account
//          UNION of payments (IN) + expenses (OUT) — no treasury_transactions table.
// @route   GET /api/finance/treasury/accounts/:id/transactions
exports.getTreasuryAccountTransactions = async (req, res) => {
    const tenant_id = req.user.tenant_id;
    let branch_id = req.branchId || req.user?.branch_id || null;
    if (branch_id === 'null' || branch_id === 'undefined' || !String(branch_id || '').trim()) branch_id = null;

    const account_id = req.params.id;
    const { date_from, date_to } = req.query;

    try {
        // Ownership check
        const accRes = await db.query(`
            SELECT * FROM treasury_accounts
            WHERE id = $1 AND tenant_id::text = $2::text
              AND ($3::text IS NULL OR branch_id::text = $3::text OR branch_id IS NULL)
              AND is_active = true
        `, [account_id, tenant_id, branch_id ? String(branch_id) : null]);

        if (accRes.rows.length === 0) {
            return res.status(404).json({ status: 'error', message: 'Treasury account not found' });
        }

        const acc = accRes.rows[0];

        // Build date filter fragments
        let dateFilter = '';
        const dateParams = [account_id, tenant_id, branch_id ? String(branch_id) : null];
        if (date_from) { dateParams.push(date_from); dateFilter += ` AND txn_date >= $${dateParams.length}::date`; }
        if (date_to)   { dateParams.push(date_to);   dateFilter += ` AND txn_date <= $${dateParams.length}::date`; }

        // UNION: payments = IN, expenses = OUT
        const result = await db.query(`
            SELECT * FROM (
                -- INCOMING: Customer Payments
                SELECT
                    p.id::text                                              AS source_id,
                    'Payment'                                               AS txn_type,
                    'in'                                                    AS direction,
                    p.payment_date::date                                    AS txn_date,
                    COALESCE(fv.voucher_number, 'PMT-' || p.id::text)      AS reference,
                    CONCAT('Receipt — ', COALESCE(c.name, i.invoice_number, 'N/A')) AS description,
                    p.amount                                                AS amount,
                    p.payment_method,
                    p.notes
                FROM payments p
                LEFT JOIN invoices i   ON i.id::text  = p.invoice_id::text
                LEFT JOIN customers c  ON c.id::text  = COALESCE(i.customer_id, i.client_id)::text
                LEFT JOIN finance_vouchers fv
                    ON fv.invoice_id = i.id
                    AND fv.voucher_type = 'receipt'
                    AND fv.tenant_id::text = $2::text
                    AND ABS(fv.amount - p.amount) < 0.01
                    AND fv.voucher_date = p.payment_date::date
                WHERE p.treasury_account_id = $1
                  AND p.tenant_id::text = $2::text
                  AND ($3::text IS NULL OR p.branch_id::text = $3::text OR p.branch_id IS NULL)
                  AND (COALESCE(p.status, 'active') != 'cancelled')

                UNION ALL

                -- OUTGOING: Expenses
                SELECT
                    e.id::text                                              AS source_id,
                    'Expense'                                               AS txn_type,
                    'out'                                                   AS direction,
                    e.expense_date::date                                    AS txn_date,
                    'EXP-' || e.id::text                                   AS reference,
                    CONCAT(COALESCE(e.title, 'Expense'), ' — ', COALESCE(e.category, '')) AS description,
                    e.amount                                                AS amount,
                    COALESCE(e.payment_method, 'cash')                     AS payment_method,
                    NULL::text                                              AS notes
                FROM expenses e
                WHERE e.treasury_account_id = $1
                  AND e.tenant_id::text = $2::text
                  AND ($3::text IS NULL OR e.branch_id::text = $3::text OR e.branch_id IS NULL)

                UNION ALL

                -- OUTGOING: Vendor Payments
                SELECT
                    fv.id::text                                             AS source_id,
                    'Vendor Payment'                                        AS txn_type,
                    'out'                                                   AS direction,
                    fv.voucher_date::date                                   AS txn_date,
                    fv.voucher_number                                       AS reference,
                    CONCAT('Payment to Vendor — ', fv.party_name)           AS description,
                    fv.amount                                               AS amount,
                    COALESCE(fv.payment_method, 'cash')                     AS payment_method,
                    fv.notes
                FROM finance_vouchers fv
                WHERE fv.treasury_account_id = $1
                  AND fv.voucher_type = 'payment'
                  AND fv.party_type = 'vendor'
                  AND fv.tenant_id::text = $2::text
                  AND ($3::text IS NULL OR fv.branch_id::text = $3::text OR fv.branch_id IS NULL)
                  AND (COALESCE(fv.status, 'active') != 'cancelled')
            ) txns
            WHERE 1=1 ${dateFilter}
            ORDER BY txn_date DESC, direction ASC
        `, dateParams);

        // Compute current balance for this account
        const currentBalance =
            parseFloat(acc.opening_balance || 0) +
            result.rows.filter(t => t.direction === 'in').reduce((s, t) => s + parseFloat(t.amount), 0) -
            result.rows.filter(t => t.direction === 'out').reduce((s, t) => s + parseFloat(t.amount), 0);

        res.json({
            status: 'success',
            account: {
                ...acc,
                opening_balance: parseFloat(acc.opening_balance || 0),
                current_balance: currentBalance,
            },
            transactions: result.rows,
            count: result.rows.length,
        });
    } catch (err) {
        console.error('getTreasuryAccountTransactions Error:', err.message);
        res.status(500).json({ status: 'error', message: err.message || 'Failed to load transactions' });
    }
};

// ==========================================
// FINANCIAL INTELLIGENCE & REPORTS — Phase 4
// Pure Derived & Read-only views. Zero duplicate data.
// 5 Reports: Sales & Invoices, Collections, Expenses, Aging, Cash Flow
// ==========================================

// @desc    Get Financial Intelligence Reports & Analytics
// @route   GET /api/finance/reports
exports.getFinancialReports = async (req, res) => {
    const tenant_id = req.user.tenant_id;
    let branch_id = req.query.branch_id || req.branchId || req.user?.branch_id || null;
    if (branch_id === 'null' || branch_id === 'undefined' || branch_id === 'all' || !String(branch_id || '').trim()) {
        branch_id = null;
    }

    const { date_from, date_to } = req.query;

    await ensureInvoicesTable();

    try {
        const queryParams = [tenant_id, branch_id ? String(branch_id) : null];
        let invoiceDateFilter = '';
        let paymentDateFilter = '';
        let expenseDateFilter = '';

        if (date_from) {
            queryParams.push(date_from);
            const idx = queryParams.length;
            invoiceDateFilter += ` AND i.created_at::date >= $${idx}::date`;
            paymentDateFilter += ` AND p.payment_date::date >= $${idx}::date`;
            expenseDateFilter += ` AND e.expense_date::date >= $${idx}::date`;
        }
        if (date_to) {
            queryParams.push(date_to);
            const idx = queryParams.length;
            invoiceDateFilter += ` AND i.created_at::date <= $${idx}::date`;
            paymentDateFilter += ` AND p.payment_date::date <= $${idx}::date`;
            expenseDateFilter += ` AND e.expense_date::date <= $${idx}::date`;
        }

        // 1. OVERVIEW & INVOICES (Sales, Invoiced, Paid, Outstanding, Overdue)
        const invoicesAggRes = await db.query(`
            SELECT
                COUNT(i.id)::int                                                  AS total_invoices_count,
                COALESCE(SUM(i.total_amount), 0)                                  AS total_invoiced,
                COALESCE(SUM(COALESCE(p_agg.paid, 0)), 0)                         AS total_paid,
                COALESCE(SUM(CASE WHEN i.status != 'paid' THEN i.total_amount - COALESCE(p_agg.paid, 0) ELSE 0 END), 0) AS total_outstanding,
                COALESCE(SUM(
                    CASE 
                        WHEN i.status != 'paid' AND i.due_date IS NOT NULL AND i.due_date < CURRENT_DATE 
                        THEN i.total_amount - COALESCE(p_agg.paid, 0) 
                        ELSE 0 
                    END
                ), 0)                                                             AS total_overdue
            FROM invoices i
            LEFT JOIN (
                SELECT invoice_id, COALESCE(SUM(amount), 0) AS paid
                FROM payments
                WHERE tenant_id::text = $1::text
                  AND (COALESCE(status, 'active') != 'cancelled')
                GROUP BY invoice_id
            ) p_agg ON p_agg.invoice_id::text = i.id::text
            WHERE i.tenant_id::text = $1::text
              AND ($2::text IS NULL OR i.branch_id::text = $2::text OR i.branch_id IS NULL)
              ${invoiceDateFilter}
        `, queryParams);

        const invSummary = invoicesAggRes.rows[0] || {};

        // Invoices by Status Breakdown
        const invoicesStatusRes = await db.query(`
            SELECT 
                COALESCE(i.status, 'unpaid') AS status,
                COUNT(*)::int AS count,
                COALESCE(SUM(i.total_amount), 0) AS total_amount
            FROM invoices i
            WHERE i.tenant_id::text = $1::text
              AND ($2::text IS NULL OR i.branch_id::text = $2::text OR i.branch_id IS NULL)
              ${invoiceDateFilter}
            GROUP BY i.status
        `, queryParams);

        // 2. COLLECTIONS (Payments by Method, Trend, & List)
        const collectionsAggRes = await db.query(`
            SELECT
                COUNT(p.id)::int                   AS total_collections_count,
                COALESCE(SUM(p.amount), 0)         AS total_collected
            FROM payments p
            WHERE p.tenant_id::text = $1::text
              AND ($2::text IS NULL OR p.branch_id::text = $2::text OR p.branch_id IS NULL)
              AND (COALESCE(p.status, 'active') != 'cancelled')
              ${paymentDateFilter}
        `, queryParams);

        const collSummary = collectionsAggRes.rows[0] || {};

        // Collections by Payment Method
        const collectionsByMethodRes = await db.query(`
            SELECT
                COALESCE(p.payment_method, 'cash') AS method,
                COUNT(*)::int                      AS count,
                COALESCE(SUM(p.amount), 0)         AS total_amount
            FROM payments p
            WHERE p.tenant_id::text = $1::text
              AND ($2::text IS NULL OR p.branch_id::text = $2::text OR p.branch_id IS NULL)
              AND (COALESCE(p.status, 'active') != 'cancelled')
              ${paymentDateFilter}
            GROUP BY p.payment_method
            ORDER BY total_amount DESC
        `, queryParams);

        // Monthly / Daily Collections Trend (Last 6 Months or Filter Period)
        const collectionsTrendRes = await db.query(`
            SELECT
                TO_CHAR(p.payment_date, 'YYYY-MM') AS period,
                COUNT(*)::int                      AS count,
                COALESCE(SUM(p.amount), 0)         AS total_amount
            FROM payments p
            WHERE p.tenant_id::text = $1::text
              AND ($2::text IS NULL OR p.branch_id::text = $2::text OR p.branch_id IS NULL)
              AND (COALESCE(p.status, 'active') != 'cancelled')
              ${paymentDateFilter}
            GROUP BY TO_CHAR(p.payment_date, 'YYYY-MM')
            ORDER BY period ASC
            LIMIT 12
        `, queryParams);

        // 3. EXPENSES (Total, by Category, Trend)
        const expensesAggRes = await db.query(`
            SELECT
                COUNT(e.id)::int           AS total_expenses_count,
                COALESCE(SUM(e.amount), 0) AS total_expenses
            FROM expenses e
            WHERE e.tenant_id::text = $1::text
              AND ($2::text IS NULL OR e.branch_id::text = $2::text OR e.branch_id IS NULL)
              ${expenseDateFilter}
        `, queryParams);

        const expSummary = expensesAggRes.rows[0] || {};

        const expensesByCategoryRes = await db.query(`
            SELECT
                COALESCE(e.category, 'General') AS category,
                COUNT(*)::int                   AS count,
                COALESCE(SUM(e.amount), 0)      AS total_amount
            FROM expenses e
            WHERE e.tenant_id::text = $1::text
              AND ($2::text IS NULL OR e.branch_id::text = $2::text OR e.branch_id IS NULL)
              ${expenseDateFilter}
            GROUP BY e.category
            ORDER BY total_amount DESC
        `, queryParams);

        const expensesTrendRes = await db.query(`
            SELECT
                TO_CHAR(e.expense_date, 'YYYY-MM') AS period,
                COUNT(*)::int                      AS count,
                COALESCE(SUM(e.amount), 0)         AS total_amount
            FROM expenses e
            WHERE e.tenant_id::text = $1::text
              AND ($2::text IS NULL OR e.branch_id::text = $2::text OR e.branch_id IS NULL)
              ${expenseDateFilter}
            GROUP BY TO_CHAR(e.expense_date, 'YYYY-MM')
            ORDER BY period ASC
            LIMIT 12
        `, queryParams);

        // 4. RECEIVABLES & AGING (Across all customers with outstanding balances)
        const agingRes = await db.query(`
            SELECT
                c.id                                                        AS customer_id,
                c.name                                                      AS customer_name,
                c.phone                                                     AS customer_phone,
                i.invoice_number,
                i.due_date,
                (i.total_amount - COALESCE(p_agg.paid, 0))                  AS remaining,
                CASE
                    WHEN i.due_date IS NULL OR i.due_date >= CURRENT_DATE             THEN 'current'
                    WHEN CURRENT_DATE - i.due_date BETWEEN 1  AND 30                 THEN '1_30'
                    WHEN CURRENT_DATE - i.due_date BETWEEN 31 AND 60                 THEN '31_60'
                    WHEN CURRENT_DATE - i.due_date BETWEEN 61 AND 90                 THEN '61_90'
                    ELSE '90_plus'
                END AS aging_bucket
            FROM invoices i
            JOIN customers c ON (i.client_id::text = c.id::text OR i.customer_id::text = c.id::text)
            LEFT JOIN (
                SELECT invoice_id, COALESCE(SUM(amount), 0) AS paid
                FROM payments WHERE tenant_id::text = $1::text AND (COALESCE(status, 'active') != 'cancelled') GROUP BY invoice_id
            ) p_agg ON p_agg.invoice_id::text = i.id::text
            WHERE i.tenant_id::text = $1::text
              AND ($2::text IS NULL OR i.branch_id::text = $2::text OR i.branch_id IS NULL)
              AND i.status != 'paid'
              AND (i.total_amount - COALESCE(p_agg.paid, 0)) > 0
            ORDER BY remaining DESC
        `, [tenant_id, branch_id ? String(branch_id) : null]);

        const agingBuckets = { current: 0, days_1_30: 0, days_31_60: 0, days_61_90: 0, days_90_plus: 0, total: 0 };
        const topDebtorsMap = {};

        for (const row of agingRes.rows) {
            const rem = parseFloat(row.remaining || 0);
            agingBuckets.total += rem;
            if (row.aging_bucket === 'current') agingBuckets.current += rem;
            else if (row.aging_bucket === '1_30') agingBuckets.days_1_30 += rem;
            else if (row.aging_bucket === '31_60') agingBuckets.days_31_60 += rem;
            else if (row.aging_bucket === '61_90') agingBuckets.days_61_90 += rem;
            else agingBuckets.days_90_plus += rem;

            if (!topDebtorsMap[row.customer_id]) {
                topDebtorsMap[row.customer_id] = {
                    customer_id: row.customer_id,
                    customer_name: row.customer_name,
                    customer_phone: row.customer_phone,
                    total_outstanding: 0,
                    overdue_amount: 0,
                    invoice_count: 0,
                };
            }
            topDebtorsMap[row.customer_id].total_outstanding += rem;
            topDebtorsMap[row.customer_id].invoice_count += 1;
            if (row.aging_bucket !== 'current') {
                topDebtorsMap[row.customer_id].overdue_amount += rem;
            }
        }

        const topDebtors = Object.values(topDebtorsMap)
            .sort((a, b) => b.total_outstanding - a.total_outstanding)
            .slice(0, 15);

        // 5. PURCHASES & PAYABLES (Vendors, Purchase Invoices, Vendor Payments)
        let totalPurchases = 0;
        let totalPayables = 0;
        let totalOverduePayables = 0;
        let purchasesCount = 0;
        let totalVendorPayments = 0;

        try {
            let purchaseDateFilter = '';
            let voucherDateFilter = '';
            if (date_from) {
                purchaseDateFilter += ` AND pi.invoice_date >= $3::date`;
                voucherDateFilter  += ` AND fv.voucher_date >= $3::date`;
            }
            if (date_to) {
                purchaseDateFilter += ` AND pi.invoice_date <= $4::date`;
                voucherDateFilter  += ` AND fv.voucher_date <= $4::date`;
            }

            const pinvRes = await db.query(`
                SELECT
                    COUNT(pi.id)::int                                               AS count,
                    COALESCE(SUM(pi.total_amount), 0)                              AS total_purchases,
                    COALESCE(SUM(CASE WHEN pi.status != 'paid' THEN pi.total_amount - COALESCE(pi.paid_amount, 0) ELSE 0 END), 0) AS total_payables,
                    COALESCE(SUM(
                        CASE 
                            WHEN pi.status != 'paid' AND pi.due_date IS NOT NULL AND pi.due_date < CURRENT_DATE 
                            THEN pi.total_amount - COALESCE(pi.paid_amount, 0) 
                            ELSE 0 
                        END
                    ), 0)                                                           AS total_overdue_payables
                FROM purchase_invoices pi
                WHERE pi.tenant_id::text = $1::text
                  AND ($2::text IS NULL OR pi.branch_id::text = $2::text OR pi.branch_id IS NULL)
                  ${purchaseDateFilter}
            `, queryParams);

            if (pinvRes.rows.length > 0) {
                purchasesCount = parseInt(pinvRes.rows[0].count || 0);
                totalPurchases = parseFloat(pinvRes.rows[0].total_purchases || 0);
                totalPayables  = parseFloat(pinvRes.rows[0].total_payables || 0);
                totalOverduePayables = parseFloat(pinvRes.rows[0].total_overdue_payables || 0);
            }

            const vpmtRes = await db.query(`
                SELECT COALESCE(SUM(amount), 0) AS total_vendor_payments
                FROM finance_vouchers fv
                WHERE fv.tenant_id::text = $1::text
                  AND ($2::text IS NULL OR fv.branch_id::text = $2::text OR fv.branch_id IS NULL)
                  AND fv.voucher_type = 'payment'
                  AND fv.party_type = 'vendor'
                  ${voucherDateFilter}
            `, queryParams);

            if (vpmtRes.rows.length > 0) {
                totalVendorPayments = parseFloat(vpmtRes.rows[0].total_vendor_payments || 0);
            }
        } catch (_) {}

        // 6. CASH FLOW (Inflow vs Outflow, Net, and by Treasury Account)
        const totalInflow = parseFloat(collSummary.total_collected || 0);
        const operatingExpenses = parseFloat(expSummary.total_expenses || 0);
        const totalOutflow = operatingExpenses + totalVendorPayments;
        const netCashflow = totalInflow - totalOutflow;

        // Cashflow by Treasury Account (if table exists)
        let treasuryCashflow = [];
        try {
            let voucherFilterForTreasury = '';
            if (date_from) voucherFilterForTreasury += ` AND fv.voucher_date >= $3::date`;
            if (date_to)   voucherFilterForTreasury += ` AND fv.voucher_date <= $4::date`;

            const taRes = await db.query(`
                SELECT
                    ta.id, ta.name, ta.type, ta.bank_name,
                    COALESCE((
                        SELECT SUM(p.amount) FROM payments p
                        WHERE p.treasury_account_id = ta.id
                          AND p.tenant_id::text = ta.tenant_id::text
                          AND ($2::text IS NULL OR p.branch_id::text = $2::text OR p.branch_id IS NULL)
                          AND (COALESCE(p.status, 'active') != 'cancelled')
                          ${paymentDateFilter}
                    ), 0) AS total_inflow,
                    COALESCE((
                        SELECT SUM(e.amount) FROM expenses e
                        WHERE e.treasury_account_id = ta.id
                          AND e.tenant_id::text = ta.tenant_id::text
                          AND ($2::text IS NULL OR e.branch_id::text = $2::text OR e.branch_id IS NULL)
                          ${expenseDateFilter}
                    ), 0) +
                    COALESCE((
                        SELECT SUM(fv.amount) FROM finance_vouchers fv
                        WHERE fv.treasury_account_id = ta.id
                          AND fv.tenant_id::text = ta.tenant_id::text
                          AND ($2::text IS NULL OR fv.branch_id::text = $2::text OR fv.branch_id IS NULL)
                          AND fv.voucher_type = 'payment'
                          AND fv.party_type = 'vendor'
                          AND (COALESCE(fv.status, 'active') != 'cancelled')
                          ${voucherFilterForTreasury}
                    ), 0) AS total_outflow
                FROM treasury_accounts ta
                WHERE ta.tenant_id::text = $1::text
                  AND ($2::text IS NULL OR ta.branch_id::text = $2::text OR ta.branch_id IS NULL)
                  AND ta.is_active = true
            `, queryParams);

            treasuryCashflow = taRes.rows.map(r => ({
                id: r.id,
                name: r.name,
                type: r.type,
                bank_name: r.bank_name,
                inflow: parseFloat(r.total_inflow || 0),
                outflow: parseFloat(r.total_outflow || 0),
                net: parseFloat(r.total_inflow || 0) - parseFloat(r.total_outflow || 0),
            }));
        } catch (_) {
            treasuryCashflow = [];
        }

        const totalReceivables = parseFloat(invSummary.total_outstanding || 0);
        const netPosition = totalReceivables - totalPayables; // لينا ناقص علينا

        // Return Consolidated Intelligence Bundle
        res.json({
            status: 'success',
            filters: {
                date_from: date_from || null,
                date_to: date_to || null,
                branch_id: branch_id || null,
            },
            overview: {
                total_invoiced: parseFloat(invSummary.total_invoiced || 0),
                total_collected: totalInflow,
                total_receivables: totalReceivables,
                total_overdue_receivables: parseFloat(invSummary.total_overdue || 0),
                
                total_purchases: totalPurchases,
                total_payables: totalPayables,
                total_overdue_payables: totalOverduePayables,
                net_position: netPosition, // Financial Solvency Position

                total_expenses: operatingExpenses,
                total_vendor_payments: totalVendorPayments,
                total_outflow: totalOutflow,
                net_cashflow: netCashflow,

                invoices_count: parseInt(invSummary.total_invoices_count || 0),
                collections_count: parseInt(collSummary.total_collections_count || 0),
                expenses_count: parseInt(expSummary.total_expenses_count || 0),
                purchases_count: purchasesCount,
            },
            sales: {
                summary: invSummary,
                by_status: invoicesStatusRes.rows.map(r => ({ ...r, total_amount: parseFloat(r.total_amount || 0) })),
            },
            collections: {
                total_collected: totalInflow,
                count: parseInt(collSummary.total_collections_count || 0),
                by_method: collectionsByMethodRes.rows.map(r => ({ ...r, total_amount: parseFloat(r.total_amount || 0) })),
                trend: collectionsTrendRes.rows.map(r => ({ ...r, total_amount: parseFloat(r.total_amount || 0) })),
            },
            expenses: {
                total_expenses: operatingExpenses,
                count: parseInt(expSummary.total_expenses_count || 0),
                by_category: expensesByCategoryRes.rows.map(r => ({ ...r, total_amount: parseFloat(r.total_amount || 0) })),
                trend: expensesTrendRes.rows.map(r => ({ ...r, total_amount: parseFloat(r.total_amount || 0) })),
            },
            receivables_aging: {
                buckets: agingBuckets,
                top_debtors: topDebtors,
                total_debtors_count: Object.keys(topDebtorsMap).length,
            },
            cashflow: {
                inflow: totalInflow,
                operating_expenses: operatingExpenses,
                vendor_payments: totalVendorPayments,
                outflow: totalOutflow,
                net: netCashflow,
                by_treasury_account: treasuryCashflow,
            },
        });
    } catch (err) {
        console.error('getFinancialReports Error:', err.message);
        res.status(500).json({ status: 'error', message: err.message || 'Failed to generate financial reports' });
    }
};

// ==========================================
// VENDOR ACCOUNTS & PAYABLES — Phase 5A
// Pure Derived & Read-only views. Zero duplicate data.
// Source: vendors + purchase_invoices + finance_vouchers
// ==========================================

// @desc    List all vendors with financial activity + totals + aging summary
// @route   GET /api/finance/vendors
exports.getVendorAccounts = async (req, res) => {
    const tenant_id = req.user.tenant_id;
    let branch_id = req.branchId || req.user?.branch_id || null;
    if (branch_id === 'null' || branch_id === 'undefined' || !String(branch_id || '').trim()) branch_id = null;

    try {
        await ensureInvoicesTable();
        await ensureVouchersTable();
        const { ensurePurchasesSchema } = require('./purchasesController');
        if (ensurePurchasesSchema) await ensurePurchasesSchema();
        await db.query(`ALTER TABLE purchase_invoices ADD COLUMN IF NOT EXISTS due_date DATE;`).catch(() => {});

        const result = await db.query(`
            SELECT
                v.id                                                        AS vendor_id,
                v.name                                                      AS vendor_name,
                v.phone                                                     AS vendor_phone,
                v.address                                                   AS vendor_address,

                -- Totals derived from purchase_invoices
                COALESCE(pi_agg.total_purchases, 0)                         AS total_purchases,

                -- Total paid: derived directly from finance_vouchers (One single source of truth!)
                COALESCE(v_agg.total_paid, 0)                               AS total_paid,

                -- Outstanding = purchases - paid
                GREATEST(0, COALESCE(pi_agg.total_purchases, 0) - COALESCE(v_agg.total_paid, 0)) AS outstanding,

                -- Overdue derived from overdue invoices
                COALESCE(pi_agg.total_overdue, 0)                           AS overdue,

                -- Last transaction = latest purchase invoice or voucher
                GREATEST(
                    pi_agg.last_invoice_date,
                    v_agg.last_voucher_date
                )                                                           AS last_transaction,

                COALESCE(pi_agg.invoice_count, 0)                          AS invoice_count,

                -- Account status: 'overdue' > 'outstanding' > 'clear'
                CASE
                    WHEN COALESCE(pi_agg.total_overdue, 0) > 0 THEN 'overdue'
                    WHEN (COALESCE(pi_agg.total_purchases, 0) - COALESCE(v_agg.total_paid, 0)) > 0.01 THEN 'outstanding'
                    ELSE 'clear'
                END                                                         AS account_status

            FROM vendors v
            LEFT JOIN (
                SELECT
                    pi.vendor_id,
                    COUNT(pi.id)::int                                       AS invoice_count,
                    COALESCE(SUM(pi.total_amount), 0)                      AS total_purchases,
                    COALESCE(SUM(
                        CASE
                            WHEN pi.due_date IS NOT NULL AND pi.due_date < CURRENT_DATE
                            THEN pi.total_amount - COALESCE(pi.paid_amount, 0)
                            ELSE 0
                        END
                    ), 0)                                                   AS total_overdue,
                    MAX(pi.invoice_date)                                    AS last_invoice_date
                FROM purchase_invoices pi
                WHERE pi.tenant_id::text = $1::text
                  AND ($2::text IS NULL OR pi.branch_id::text = $2::text OR pi.branch_id IS NULL)
                GROUP BY pi.vendor_id
            ) pi_agg ON pi_agg.vendor_id = v.id
            LEFT JOIN (
                SELECT
                    fv.vendor_id,
                    COALESCE(SUM(fv.amount), 0)                             AS total_paid,
                    MAX(fv.voucher_date)                                    AS last_voucher_date
                FROM finance_vouchers fv
                WHERE fv.tenant_id::text = $1::text
                  AND fv.voucher_type = 'payment'
                  AND fv.party_type = 'vendor'
                  AND ($2::text IS NULL OR fv.branch_id::text = $2::text OR fv.branch_id IS NULL)
                  AND (COALESCE(fv.status, 'active') != 'cancelled')
                GROUP BY fv.vendor_id
            ) v_agg ON v_agg.vendor_id = v.id::text

            WHERE v.tenant_id::text = $1::text

            ORDER BY outstanding DESC, total_purchases DESC
        `, [tenant_id, branch_id ? String(branch_id) : null]);

        // KPI totals across all vendors
        const kpi = result.rows.reduce((acc, row) => {
            acc.totalPayables           += parseFloat(row.outstanding     || 0);
            acc.totalOverdue            += parseFloat(row.overdue         || 0);
            acc.totalPurchases          += parseFloat(row.total_purchases || 0);
            acc.totalPaid               += parseFloat(row.total_paid      || 0);
            if (parseFloat(row.outstanding || 0) > 0) acc.vendorsWithOutstanding++;
            return acc;
        }, { totalPayables: 0, totalOverdue: 0, totalPurchases: 0, totalPaid: 0, vendorsWithOutstanding: 0 });

        // Due this month = outstanding purchase invoices with due_date in current month
        try {
            const monthRes = await db.query(`
                SELECT COALESCE(SUM(pi.total_amount - COALESCE(pi.paid_amount, 0)), 0) AS due_this_month
                FROM purchase_invoices pi
                WHERE pi.tenant_id::text = $1::text
                  AND ($2::text IS NULL OR pi.branch_id::text = $2::text OR pi.branch_id IS NULL)
                  AND pi.status != 'paid'
                  AND date_trunc('month', pi.due_date) = date_trunc('month', CURRENT_DATE)
            `, [tenant_id, branch_id ? String(branch_id) : null]);
            kpi.dueThisMonth = parseFloat(monthRes.rows[0]?.due_this_month || 0);
        } catch (_) {
            kpi.dueThisMonth = 0;
        }

        res.json({ status: 'success', data: result.rows, kpi });
    } catch (err) {
        console.error('getVendorAccounts Error:', err.message);
        res.status(500).json({ status: 'error', message: err.message || 'Failed to retrieve vendor accounts' });
    }
};

// @desc    Vendor Aging — 5 buckets computed from due_date
// @route   GET /api/finance/vendors/:id/aging
exports.getVendorAging = async (req, res) => {
    const tenant_id = req.user.tenant_id;
    let branch_id = req.branchId || req.user?.branch_id || null;
    if (branch_id === 'null' || branch_id === 'undefined' || !String(branch_id || '').trim()) branch_id = null;

    const vendor_id = req.params.id;

    try {
        const result = await db.query(`
            SELECT
                pi.invoice_number,
                pi.due_date,
                pi.total_amount - COALESCE(pi.paid_amount, 0) AS remaining,
                CASE
                    WHEN pi.due_date IS NULL OR pi.due_date >= CURRENT_DATE             THEN 'current'
                    WHEN CURRENT_DATE - pi.due_date BETWEEN 1  AND 30                  THEN '1_30'
                    WHEN CURRENT_DATE - pi.due_date BETWEEN 31 AND 60                  THEN '31_60'
                    WHEN CURRENT_DATE - pi.due_date BETWEEN 61 AND 90                  THEN '61_90'
                    ELSE '90_plus'
                END AS aging_bucket
            FROM purchase_invoices pi
            WHERE pi.tenant_id::text = $1::text
              AND ($2::text IS NULL OR pi.branch_id::text = $2::text OR pi.branch_id IS NULL)
              AND pi.vendor_id = $3
              AND pi.status != 'paid'
              AND (pi.total_amount - COALESCE(pi.paid_amount, 0)) > 0
        `, [tenant_id, branch_id ? String(branch_id) : null, vendor_id]);

        const buckets = { current: 0, '1_30': 0, '31_60': 0, '61_90': 0, '90_plus': 0 };
        for (const row of result.rows) {
            buckets[row.aging_bucket] += parseFloat(row.remaining || 0);
        }

        const total = Object.values(buckets).reduce((a, b) => a + b, 0);

        res.json({
            status: 'success',
            aging: {
                current:  buckets['current'],
                days_1_30:  buckets['1_30'],
                days_31_60: buckets['31_60'],
                days_61_90: buckets['61_90'],
                days_90_plus: buckets['90_plus'],
                total,
            },
            detail: result.rows,
        });
    } catch (err) {
        console.error('getVendorAging Error:', err.message);
        res.status(500).json({ status: 'error', message: err.message || 'Failed to retrieve vendor aging' });
    }
};

exports.ensureInvoicesTable = ensureInvoicesTable;
exports.ensureVouchersTable = ensureVouchersTable;
exports.generateVoucherNumber = generateVoucherNumber;



