// Creates one default active cash treasury for a tenant that has none. Never touches existing accounts.
async function ensureDefaultTreasury(db, tenantId, branchId) {
    try {
        await db.query(
            `INSERT INTO treasury_accounts (name, type, opening_balance, is_default, is_active, tenant_id, branch_id)
             SELECT $1, 'cash', 0, true, true, $2::uuid, $3
             WHERE NOT EXISTS (SELECT 1 FROM treasury_accounts WHERE tenant_id::text = $2::text AND type = 'cash' AND is_active = true)`,
            ['الخزينة الرئيسية', String(tenantId), branchId ? String(branchId) : null]
        );
    } catch (e) {
        console.warn('[ensureDefaultTreasury] non-fatal:', e.message);
    }
}
module.exports = { ensureDefaultTreasury };
