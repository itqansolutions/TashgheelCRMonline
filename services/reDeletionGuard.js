/**
 * reDeletionGuard.js
 * Dependency checks for deleting real estate inventory records.
 * A unit that has ever been linked to a deal, contract, cancellation, handover, payment record,
 * invoice or quotation must not be deleted, whatever its status. Hierarchy nodes (developer, project,
 * phase, building) must not be deleted while they contain units or child nodes, and never when any unit
 * under them has such a link. Nothing is archived or cascaded: a blocked delete changes nothing.
 * All functions take a pg client that is inside a transaction.
 */

const CORE_UNIT_LINKS = [
    ['deals', 'deals', 'unit_id'],
    ['contracts', 're_contracts', 'unit_id'],
    ['cancellations', 're_cancellations', 'unit_id'],
    ['handovers', 're_handovers', 'unit_id']
];
const OPTIONAL_UNIT_LINKS = [
    ['payments', 're_payments_mvp', 'unit_id'],
    ['invoices', 'invoices', 'unit_id'],
    ['quotations', 'quotations', 'unit_id']
];

async function hasColumn(client, table, column) {
    const r = await client.query(
        `SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1 AND column_name = $2 LIMIT 1`,
        [table, column]
    );
    return r.rows.length > 0;
}

/**
 * Counts of linked records for the given unit ids (text), scoped to the owning tenant so a denial
 * never reveals another tenant's rows. Core tables fail closed (errors propagate).
 */
async function countUnitLinks(client, unitIds, tenantId) {
    if (tenantId == null) throw new Error('Tenant scope is required for deletion checks');
    const ids = unitIds.map(String);
    const out = {};
    if (ids.length === 0) return out;
    const countLinks = async (key, table, col) => {
        const r = await client.query(
            `SELECT count(*)::int AS n FROM ${table}
             WHERE ${col}::text = ANY($1::text[]) AND tenant_id::text = $2::text`,
            [ids, String(tenantId)]
        );
        if (r.rows[0].n > 0) out[key] = r.rows[0].n;
    };
    for (const [key, table, col] of CORE_UNIT_LINKS) await countLinks(key, table, col);
    for (const [key, table, col] of OPTIONAL_UNIT_LINKS) {
        if (!(await hasColumn(client, table, col))) continue; // table or column does not exist: no records can exist
        await countLinks(key, table, col);
    }
    return out;
}

// Units under a hierarchy node, found through every link the schema has (direct and through children).
// Hierarchy tables carry tenant_id NOT NULL (hierarchy migration); the filters below fail closed
// with a runtime error on a schema missing them rather than widening across tenants.
const UNIT_SCOPE_SQL = {
    developer: `u.developer_id::text = $1 OR u.project_id IN (SELECT id FROM re_projects WHERE developer_id::text = $1 AND tenant_id::text = $2::text)
        OR u.phase_id IN (SELECT ph.id FROM re_phases ph JOIN re_projects p ON p.id = ph.project_id WHERE p.developer_id::text = $1 AND ph.tenant_id::text = $2::text)
        OR u.building_id IN (SELECT b.id FROM re_buildings b JOIN re_projects p ON p.id = b.project_id WHERE p.developer_id::text = $1 AND b.tenant_id::text = $2::text)`,
    project: `u.project_id::text = $1 OR u.phase_id IN (SELECT id FROM re_phases WHERE project_id::text = $1 AND tenant_id::text = $2::text)
        OR u.building_id IN (SELECT id FROM re_buildings WHERE project_id::text = $1 AND tenant_id::text = $2::text)`,
    phase: `u.phase_id::text = $1 OR u.building_id IN (SELECT id FROM re_buildings WHERE phase_id::text = $1 AND tenant_id::text = $2::text)`,
    building: `u.building_id::text = $1`
};
const CHILD_SQL = {
    developer: [['projects', `SELECT count(*)::int n FROM re_projects WHERE developer_id::text = $1 AND tenant_id::text = $2::text`]],
    project: [['phases', `SELECT count(*)::int n FROM re_phases WHERE project_id::text = $1 AND tenant_id::text = $2::text`],
              ['buildings', `SELECT count(*)::int n FROM re_buildings WHERE project_id::text = $1 AND tenant_id::text = $2::text`]],
    phase: [['buildings', `SELECT count(*)::int n FROM re_buildings WHERE phase_id::text = $1 AND tenant_id::text = $2::text`]],
    building: []
};
const NODE_TABLE = { developer: 're_developers', project: 're_projects', phase: 're_phases', building: 're_buildings' };

/**
 * Locks the node row and every unit under it (in id order, same order unit deletes and deal/contract
 * creation use per unit), then returns { found, blocked, linked, contains }.
 * Concurrent deal or contract creation locks the unit row first, so a link committed before our lock
 * is seen by the checks below.
 */
async function checkHierarchyDelete(client, kind, id, tenantId) {
    const node = await client.query(`SELECT id FROM ${NODE_TABLE[kind]} WHERE id::text = $1::text AND tenant_id::text = $2::text FOR UPDATE`, [String(id), tenantId]);
    if (node.rows.length === 0) return { found: false };
    const units = await client.query(
        `SELECT u.id FROM re_units u WHERE u.tenant_id::text = $2::text AND (${UNIT_SCOPE_SQL[kind]}) ORDER BY u.id FOR UPDATE`,
        [String(id), tenantId]
    );
    const unitIds = units.rows.map(r => r.id);
    const linked = await countUnitLinks(client, unitIds, tenantId);
    const contains = {};
    if (unitIds.length > 0) contains.units = unitIds.length;
    for (const [key, sql] of CHILD_SQL[kind]) {
        const r = await client.query(sql, [String(id), tenantId]);
        if (r.rows[0].n > 0) contains[key] = r.rows[0].n;
    }
    return { found: true, blocked: Object.keys(linked).length > 0 || Object.keys(contains).length > 0, linked, contains };
}

module.exports = { countUnitLinks, checkHierarchyDelete };
