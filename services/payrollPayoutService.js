// Payroll -> Finance posting. Expense is recognised at actual payout, never at finalize.
// One payment voucher per payslip (net salary), all in one transaction, one treasury account per batch.
const db = require('../config/db');
const { resolveCollectionTreasury } = require('./resolveCollectionTreasury');
const { generateVoucherNumber } = require('./voucherNumbering');

let ensured = false;
async function ensurePayoutTable(client) {
    if (ensured) return;
    await (client || db).query(`
        CREATE TABLE IF NOT EXISTS hr_payroll_payouts (
            id SERIAL PRIMARY KEY, tenant_id VARCHAR(255) NOT NULL, branch_id VARCHAR(255),
            payroll_id INTEGER NOT NULL, user_id INTEGER NOT NULL, payroll_month INTEGER NOT NULL, payroll_year INTEGER NOT NULL,
            amount NUMERIC(15,2) NOT NULL, voucher_id INTEGER, voucher_number VARCHAR(100), treasury_account_id INTEGER,
            payment_method VARCHAR(50) DEFAULT 'cash', batch_ref VARCHAR(100), status VARCHAR(20) NOT NULL DEFAULT 'paid',
            paid_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP, paid_by INTEGER,
            reversed_at TIMESTAMP WITH TIME ZONE, reversed_by INTEGER, reversal_reason TEXT
        );
        CREATE UNIQUE INDEX IF NOT EXISTS uq_hr_payroll_payouts_active ON hr_payroll_payouts (payroll_id) WHERE status = 'paid';
        CREATE INDEX IF NOT EXISTS idx_hr_payroll_payouts_tenant ON hr_payroll_payouts (tenant_id, payroll_year, payroll_month);
    `);
    ensured = true;
}

// Pay every finalized, not-yet-paid slip of a month for the caller's branch. Whole sheet or nothing.
async function payoutSheet({ tenant_id, branch_id, user_id, month, year, treasury_account_id, payment_method, payment_date }) {
    const m = Number(month), y = Number(year);
    if (!Number.isInteger(m) || m < 1 || m > 12 || !Number.isInteger(y) || y < 1900 || y > 9999) {
        const e = new Error('Valid month and year are required'); e.status = 400; throw e;
    }
    const client = await db.pool.connect();
    try {
        await ensurePayoutTable(client);
        await client.query('BEGIN');
        const slips = await client.query(`
            SELECT p.id, p.user_id, p.net_salary, p.status, p.branch_id, u.name AS employee_name
            FROM hr_payroll p JOIN users u ON u.id = p.user_id
            WHERE p.tenant_id::text = $1::text AND p.branch_id::text = $2::text
              AND p.payroll_month = $3 AND p.payroll_year = $4
            ORDER BY p.id FOR UPDATE OF p`, [tenant_id, branch_id, m, y]);
        if (!slips.rows.length) { const e = new Error('No payroll slips for this month'); e.status = 404; throw e; }
        const notFinal = slips.rows.filter(s => s.status !== 'finalized');
        if (notFinal.length) {
            const e = new Error(`Finalize all payroll slips before payout (${notFinal.length} still draft)`); e.status = 400; throw e;
        }
        const paidRows = await client.query(`SELECT payroll_id FROM hr_payroll_payouts WHERE tenant_id = $1 AND status = 'paid' AND payroll_id = ANY($2::int[])`,
            [String(tenant_id), slips.rows.map(s => s.id)]);
        const alreadyPaid = new Set(paidRows.rows.map(r => r.payroll_id));
        const todo = slips.rows.filter(s => !alreadyPaid.has(s.id) && Number(s.net_salary) > 0);
        if (!todo.length) { const e = new Error('Everything for this month is already paid out'); e.status = 409; throw e; }

        const treasury = await resolveCollectionTreasury(client, { tenant_id, branch_id: String(branch_id), treasury_account_id, payment_method: payment_method || 'cash' });
        const batch = `PAYROLL-${y}-${String(m).padStart(2, '0')}-${Date.now()}`;
        const vDate = payment_date || new Date().toISOString().split('T')[0];
        const out = [];
        for (const s of todo) {
            const amount = Number(Number(s.net_salary).toFixed(2));
            const voucherNumber = await generateVoucherNumber(tenant_id, branch_id, 'payment', client);
            const v = await client.query(`
                INSERT INTO finance_vouchers (voucher_number, voucher_type, party_type, party_name, amount, payment_method,
                    treasury_account, treasury_account_id, reference_no, notes, voucher_date, created_by, tenant_id, branch_id, status)
                VALUES ($1,'payment','employee',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'active') RETURNING id, voucher_number`,
                [voucherNumber, s.employee_name, amount, payment_method || 'cash', treasury.name, treasury.id,
                 `${batch}-${s.id}`, `صرف مرتب ${m}/${y} - ${s.employee_name}`, vDate, user_id, tenant_id, String(branch_id)]);
            const p = await client.query(`
                INSERT INTO hr_payroll_payouts (tenant_id, branch_id, payroll_id, user_id, payroll_month, payroll_year, amount,
                    voucher_id, voucher_number, treasury_account_id, payment_method, batch_ref, paid_by)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
                [String(tenant_id), String(branch_id), s.id, s.user_id, m, y, amount, v.rows[0].id, v.rows[0].voucher_number,
                 treasury.id, payment_method || 'cash', batch, user_id]);
            out.push({ ...p.rows[0], employee_name: s.employee_name });
        }
        await client.query('COMMIT');
        return { batch, treasury: treasury.name, count: out.length, total: out.reduce((a, r) => a + Number(r.amount), 0), payouts: out };
    } catch (err) {
        try { await client.query('ROLLBACK'); } catch (_) {}
        throw err;
    } finally { client.release(); }
}

// Reverse one payout: voucher is cancelled (kept for audit), payout row marked reversed. Treasury balance restores
// because treasury sums only active payment vouchers.
async function reversePayout({ tenant_id, branch_id, user_id, payout_id, reason }) {
    if (!String(reason || '').trim()) { const e = new Error('Reversal reason is required'); e.status = 400; throw e; }
    const client = await db.pool.connect();
    try {
        await ensurePayoutTable(client);
        await client.query('BEGIN');
        const r = await client.query(`SELECT * FROM hr_payroll_payouts WHERE id = $1 AND tenant_id = $2 AND branch_id = $3 FOR UPDATE`,
            [payout_id, String(tenant_id), String(branch_id)]);
        if (!r.rows.length) { const e = new Error('Payout not found'); e.status = 404; throw e; }
        if (r.rows[0].status !== 'paid') { const e = new Error('Payout is already reversed'); e.status = 409; throw e; }
        await client.query(`UPDATE finance_vouchers SET status='cancelled', cancelled_at=NOW(), cancelled_by=$1, cancellation_reason=$2
            WHERE id = $3 AND tenant_id::text = $4::text`, [String(user_id), `عكس صرف مرتب: ${String(reason).trim()}`, r.rows[0].voucher_id, tenant_id]);
        const u = await client.query(`UPDATE hr_payroll_payouts SET status='reversed', reversed_at=NOW(), reversed_by=$1, reversal_reason=$2 WHERE id=$3 RETURNING *`,
            [user_id, String(reason).trim(), payout_id]);
        await client.query('COMMIT');
        return u.rows[0];
    } catch (err) {
        try { await client.query('ROLLBACK'); } catch (_) {}
        throw err;
    } finally { client.release(); }
}

module.exports = { ensurePayoutTable, payoutSheet, reversePayout };
