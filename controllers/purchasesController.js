const db = require('../config/db');

// Self-healing schema guard for CRM Purchase Invoices & Items
let purchasesSchemaReady = false;
async function ensurePurchasesSchema() {
    if (purchasesSchemaReady) return;
    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS purchase_invoices (
                id SERIAL PRIMARY KEY,
                invoice_number VARCHAR(100) NOT NULL,
                vendor_id INTEGER REFERENCES vendors(id) ON DELETE RESTRICT,
                warehouse_id INTEGER REFERENCES warehouses(id) ON DELETE RESTRICT,
                invoice_date DATE DEFAULT CURRENT_DATE,
                total_amount DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                paid_amount DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                status VARCHAR(50) DEFAULT 'unpaid',
                notes TEXT,
                tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
                branch_id VARCHAR(255),
                created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_pinv_tenant ON purchase_invoices(tenant_id);
            CREATE INDEX IF NOT EXISTS idx_pinv_vendor ON purchase_invoices(vendor_id);

            CREATE TABLE IF NOT EXISTS purchase_invoice_items (
                id SERIAL PRIMARY KEY,
                purchase_invoice_id INTEGER REFERENCES purchase_invoices(id) ON DELETE CASCADE,
                product_id INTEGER REFERENCES products(id) ON DELETE RESTRICT,
                quantity DECIMAL(12, 3) NOT NULL,
                unit_price DECIMAL(12, 2) NOT NULL,
                subtotal DECIMAL(15, 2) NOT NULL,
                tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_pinv_items ON purchase_invoice_items(purchase_invoice_id);

            CREATE TABLE IF NOT EXISTS finance_vouchers (
                id SERIAL PRIMARY KEY,
                voucher_number VARCHAR(100) NOT NULL,
                voucher_type VARCHAR(20) NOT NULL,
                party_type VARCHAR(50) DEFAULT 'customer',
                party_name VARCHAR(255) NOT NULL,
                customer_id VARCHAR(255),
                vendor_id VARCHAR(255),
                invoice_id INTEGER,
                amount DECIMAL(15, 2) NOT NULL,
                payment_method VARCHAR(50) DEFAULT 'cash',
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
        purchasesSchemaReady = true;
    } catch (err) {
        console.error('[Purchases Schema Guard Error]:', err.message);
    }
}

// @desc    Get all purchase invoices
// @route   GET /api/purchases
// @access  Private
exports.getPurchaseInvoices = async (req, res) => {
    const tenant_id = req.user.tenant_id;
    const branch_id = req.branchId;

    try {
        await ensurePurchasesSchema();
        const result = await db.query(`
            SELECT 
                pi.id,
                pi.invoice_number,
                pi.invoice_date,
                pi.total_amount,
                pi.paid_amount,
                (pi.total_amount - pi.paid_amount) as balance,
                pi.status,
                pi.notes,
                pi.created_at,
                v.id as vendor_id,
                v.name as vendor_name,
                v.phone as vendor_phone,
                w.id as warehouse_id,
                w.name as warehouse_name,
                COALESCE(
                    (
                        SELECT json_agg(json_build_object(
                            'id', pii.id,
                            'product_id', pii.product_id,
                            'product_name', p.name,
                            'product_sku', p.sku,
                            'unit', COALESCE(p.unit, 'piece'),
                            'quantity', pii.quantity,
                            'unit_price', pii.unit_price,
                            'subtotal', pii.subtotal
                        ))
                        FROM purchase_invoice_items pii
                        JOIN products p ON pii.product_id = p.id
                        WHERE pii.purchase_invoice_id = pi.id
                    ),
                    '[]'::json
                ) as items
            FROM purchase_invoices pi
            JOIN vendors v ON pi.vendor_id = v.id
            JOIN warehouses w ON pi.warehouse_id = w.id
            WHERE pi.tenant_id::text = $1::text AND (pi.branch_id::text = $2::text OR $2 IS NULL)
            ORDER BY pi.invoice_date DESC, pi.created_at DESC
        `, [tenant_id, branch_id || null]);

        res.json({ status: 'success', data: result.rows });
    } catch (err) {
        console.error('getPurchaseInvoices error:', err.message);
        res.status(500).json({ status: 'error', message: 'Failed to fetch purchases' });
    }
};

// @desc    Create a simple Purchase Invoice with direct stock reception
// @route   POST /api/purchases
// @access  Private
exports.createPurchaseInvoice = async (req, res) => {
    const tenant_id = req.user.tenant_id;
    const branch_id = req.branchId || null;
    const { vendor_id, warehouse_id, invoice_date, items, notes } = req.body;

    if (!vendor_id) {
        return res.status(400).json({ status: 'error', message: 'Vendor is required' });
    }
    if (!warehouse_id) {
        return res.status(400).json({ status: 'error', message: 'Destination warehouse is required' });
    }
    if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ status: 'error', message: 'Purchase must contain at least one product' });
    }

    const client = await db.pool.connect();
    try {
        await ensurePurchasesSchema();
        await client.query('BEGIN');

        // 1. Calculate total purchase amount
        let totalAmount = 0;
        const validItems = [];
        for (const item of items) {
            const qty = parseFloat(item.quantity);
            const price = parseFloat(item.unit_price);
            if (!item.product_id || isNaN(qty) || qty <= 0 || isNaN(price) || price < 0) {
                throw new Error('All products must have a valid quantity (> 0) and purchase price (>= 0)');
            }
            const subtotal = qty * price;
            totalAmount += subtotal;
            validItems.push({
                product_id: item.product_id,
                quantity: qty,
                unit_price: price,
                subtotal
            });
        }

        // 2. Generate unique invoice number
        const invNumber = `PINV-${Date.now().toString().slice(-6)}`;

        // 3. Create purchase invoice
        const invRes = await client.query(`
            INSERT INTO purchase_invoices 
                (invoice_number, vendor_id, warehouse_id, invoice_date, total_amount, paid_amount, status, notes, tenant_id, branch_id, created_by)
            VALUES ($1, $2, $3, $4, $5, 0, 'unpaid', $6, $7, $8, $9)
            RETURNING *
        `, [
            invNumber,
            vendor_id,
            warehouse_id,
            invoice_date || new Date().toISOString().split('T')[0],
            totalAmount,
            notes || null,
            tenant_id,
            branch_id,
            req.user.id
        ]);

        const invoice = invRes.rows[0];

        // 4. Create items & automatically record approved IN movements into destination warehouse
        for (const item of validItems) {
            await client.query(`
                INSERT INTO purchase_invoice_items 
                    (purchase_invoice_id, product_id, quantity, unit_price, subtotal, tenant_id)
                VALUES ($1, $2, $3, $4, $5, $6)
            `, [invoice.id, item.product_id, item.quantity, item.unit_price, item.subtotal, tenant_id]);

            // Automatic APPROVED IN stock movement (Immediate physical stock arrival)
            await client.query(`
                INSERT INTO stock_movements
                    (tenant_id, branch_id, product_id, from_warehouse_id, to_warehouse_id, type, quantity, reference_type, reference_id, created_by, approved_by, status)
                VALUES ($1, $2, $3, NULL, $4, 'in', $5, 'purchase_invoice', $6, $7, $7, 'approved')
            `, [
                tenant_id,
                branch_id,
                item.product_id,
                warehouse_id,
                item.quantity,
                String(invoice.id),
                req.user.id
            ]);

            // Keep product purchase price updated
            await client.query(`
                UPDATE products 
                SET cost_price = $1, updated_at = CURRENT_TIMESTAMP 
                WHERE id = $2 AND tenant_id::text = $3::text
            `, [item.unit_price, item.product_id, tenant_id]);
        }

        await client.query('COMMIT');

        res.status(201).json({
            status: 'success',
            message: 'Purchase recorded and stock received into warehouse successfully',
            data: invoice
        });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('createPurchaseInvoice error:', err.message);
        res.status(400).json({ status: 'error', message: err.message || 'Failed to create purchase invoice' });
    } finally {
        client.release();
    }
};

// ── VENDOR BALANCE & STATEMENT (PHASE 7 & 8) ───────────────

// @desc    Get Vendor Statement & Balance (Purchases vs Payments ledger)
// @route   GET /api/purchases/vendors/:id/statement
// @access  Private
exports.getVendorStatement = async (req, res) => {
    const tenant_id = req.user.tenant_id;
    const vendorId = req.params.id;

    try {
        await ensurePurchasesSchema();

        // 1. Get vendor details
        const vRes = await db.query(
            `SELECT id, name, phone, address, tax_no, reg_no, created_at FROM vendors WHERE id = $1 AND tenant_id::text = $2::text`,
            [vendorId, tenant_id]
        );
        if (vRes.rows.length === 0) {
            return res.status(404).json({ status: 'error', message: 'Vendor not found' });
        }
        const vendor = vRes.rows[0];

        // 2. Fetch all purchases for this vendor
        const pRes = await db.query(`
            SELECT id, invoice_number, invoice_date, total_amount, paid_amount, status, notes
            FROM purchase_invoices 
            WHERE vendor_id = $1 AND tenant_id::text = $2::text
            ORDER BY invoice_date ASC, created_at ASC
        `, [vendorId, tenant_id]);

        // 3. Fetch all payments from existing finance_vouchers (One source of truth!)
        const payRes = await db.query(`
            SELECT id, voucher_number, voucher_date, amount, payment_method, notes
            FROM finance_vouchers 
            WHERE vendor_id::text = $1::text AND voucher_type = 'payment' AND tenant_id::text = $2::text
            ORDER BY voucher_date ASC, created_at ASC
        `, [vendorId, tenant_id]);

        // 4. Calculate totals
        const totalPurchases = pRes.rows.reduce((sum, inv) => sum + parseFloat(inv.total_amount || 0), 0);
        const totalPaid = payRes.rows.reduce((sum, pay) => sum + parseFloat(pay.amount || 0), 0);
        const outstandingBalance = totalPurchases - totalPaid;

        // 5. Combine and sort chronological ledger
        const ledger = [];

        pRes.rows.forEach(inv => {
            ledger.push({
                id: `inv-${inv.id}`,
                date: inv.invoice_date,
                type: 'Purchase Invoice / فاتورة مشتريات',
                reference: inv.invoice_number,
                debit: parseFloat(inv.total_amount), // Increases vendor credit/our debt
                credit: 0,
                notes: inv.notes || `Invoice #${inv.invoice_number}`
            });
        });

        payRes.rows.forEach(pay => {
            ledger.push({
                id: `pay-${pay.id}`,
                date: pay.voucher_date,
                type: 'Payment Voucher / سند صرف',
                reference: pay.voucher_number,
                debit: 0,
                credit: parseFloat(pay.amount), // Decreases our debt
                notes: pay.notes || pay.payment_method || 'Payment'
            });
        });

        // Sort chronologically
        ledger.sort((a, b) => new Date(a.date) - new Date(b.date));

        // Calculate running balance
        let runningBalance = 0;
        const ledgerWithBalance = ledger.map(entry => {
            runningBalance += (entry.debit - entry.credit);
            return {
                ...entry,
                running_balance: runningBalance
            };
        });

        res.json({
            status: 'success',
            data: {
                vendor,
                summary: {
                    total_purchases: totalPurchases,
                    total_paid: totalPaid,
                    outstanding_balance: outstandingBalance
                },
                transactions: ledgerWithBalance
            }
        });
    } catch (err) {
        console.error('getVendorStatement error:', err.message);
        res.status(500).json({ status: 'error', message: 'Failed to generate vendor statement' });
    }
};

// ── VENDOR PAYMENT (PHASE 10 - REUSING finance_vouchers) ───

// @desc    Record a payment to a vendor (Stores in finance_vouchers & updates invoice)
// @route   POST /api/purchases/vendors/:id/payments
// @access  Private
exports.recordVendorPayment = async (req, res) => {
    const tenant_id = req.user.tenant_id;
    const branch_id = req.branchId || null;
    const vendorId = req.params.id;
    const { amount, payment_method, purchase_invoice_id, notes, voucher_date } = req.body;

    const paymentAmount = parseFloat(amount);
    if (!paymentAmount || paymentAmount <= 0) {
        return res.status(400).json({ status: 'error', message: 'Payment amount must be greater than 0' });
    }

    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');

        // Verify vendor
        const vRes = await client.query('SELECT name FROM vendors WHERE id = $1 AND tenant_id::text = $2::text', [vendorId, tenant_id]);
        if (vRes.rows.length === 0) {
            throw new Error('Vendor not found');
        }
        const vendorName = vRes.rows[0].name;

        // Generate voucher number
        const voucherNumber = `PV-${Date.now().toString().slice(-6)}`;

        // Insert into finance_vouchers (REUSING EXISTING WORKING SYSTEM)
        const vchRes = await client.query(`
            INSERT INTO finance_vouchers (
                voucher_number, voucher_type, party_type, party_name, vendor_id,
                invoice_id, amount, payment_method, treasury_account, reference_no,
                notes, voucher_date, created_by, tenant_id, branch_id
            ) VALUES ($1, 'payment', 'vendor', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            RETURNING *
        `, [
            voucherNumber,
            vendorName,
            String(vendorId),
            purchase_invoice_id ? parseInt(purchase_invoice_id) : null,
            paymentAmount,
            payment_method || 'cash',
            'Main Cash / الخزينة الرئيسية',
            null,
            notes || `Payment to vendor ${vendorName}`,
            voucher_date || new Date().toISOString().split('T')[0],
            req.user.id,
            tenant_id,
            branch_id
        ]);

        // If a specific purchase invoice was linked, update its paid_amount & status
        if (purchase_invoice_id) {
            const invRes = await client.query(
                `SELECT total_amount, paid_amount FROM purchase_invoices WHERE id = $1 AND tenant_id::text = $2::text FOR UPDATE`,
                [purchase_invoice_id, tenant_id]
            );
            if (invRes.rows.length > 0) {
                const newPaid = parseFloat(invRes.rows[0].paid_amount || 0) + paymentAmount;
                const total = parseFloat(invRes.rows[0].total_amount || 0);
                const newStatus = newPaid >= total ? 'paid' : 'partial';

                await client.query(
                    `UPDATE purchase_invoices SET paid_amount = $1, status = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3`,
                    [newPaid, newStatus, purchase_invoice_id]
                );
            }
        }

        await client.query('COMMIT');

        res.status(201).json({
            status: 'success',
            message: 'Vendor payment recorded successfully',
            data: vchRes.rows[0]
        });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('recordVendorPayment error:', err.message);
        res.status(400).json({ status: 'error', message: err.message || 'Payment failed' });
    } finally {
        client.release();
    }
};
