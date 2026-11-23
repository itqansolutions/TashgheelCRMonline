// Resolve new receipts only. Never backfill or re-route existing vouchers.
async function resolveCollectionTreasury(client, { tenant_id, branch_id, treasury_account_id, payment_method }) {
    const method = String(payment_method || 'cash').toLowerCase();
    const allowed = ['cash', 'bank_transfer', 'bank', 'card', 'check', 'cheque'];
    const fail = message => { const e = new Error(message); e.status = 400; throw e; };
    if (!allowed.includes(method)) fail('Unsupported payment method');
    const requiredType = method === 'cash' ? 'cash' : 'bank';
    if (treasury_account_id !== undefined && treasury_account_id !== null && treasury_account_id !== '') {
        if (!/^\d+$/.test(String(treasury_account_id))) fail('Invalid treasury account');
        const found = await client.query(`SELECT id, name, type FROM treasury_accounts
            WHERE id = $1 AND tenant_id::text = $2::text AND is_active = true
              AND ($3::text IS NULL OR branch_id::text = $3::text OR branch_id IS NULL)
            FOR SHARE`, [treasury_account_id, tenant_id, branch_id || null]);
        if (!found.rows.length) fail('Treasury account not found, inactive or outside this branch');
        if (found.rows[0].type !== requiredType) fail('Treasury account type does not match payment method');
        return found.rows[0];
    }
    if (['card', 'check', 'cheque'].includes(method)) fail('Select an explicit settlement treasury account');
    const found = await client.query(`SELECT id, name, type FROM treasury_accounts
        WHERE tenant_id::text = $1::text AND is_active = true AND is_default = true
          AND type = $3 AND ($2::text IS NULL OR branch_id::text = $2::text OR branch_id IS NULL)
        ORDER BY (CASE WHEN branch_id::text = $2::text THEN 0 ELSE 1 END), id
        LIMIT 1 FOR SHARE`, [tenant_id, branch_id || null, requiredType]);
    if (!found.rows.length) fail('Select a treasury account or configure an active default for this branch');
    return found.rows[0];
}
module.exports = { resolveCollectionTreasury };
