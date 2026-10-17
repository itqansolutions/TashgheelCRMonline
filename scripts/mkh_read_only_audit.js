const db = require('../config/db');

async function runAudit() {
  const meta = await db.query('SELECT current_database(), inet_server_addr(), inet_server_port(), version()');
  console.log('=== DB IDENTITY ===');
  console.log(JSON.stringify(meta.rows[0], null, 2));

  const tenants = await db.query('SELECT * FROM tenants ORDER BY id ASC');
  console.log('=== TENANTS ===');
  console.log(JSON.stringify(tenants.rows, null, 2));

  // Find MKH or active tenants
  for (const tenant of tenants.rows) {
    console.log(`\n========================================`);
    console.log(`TELEMETRY AUDIT FOR TENANT: ${tenant.name} (${tenant.id})`);
    console.log(`========================================`);

    const dealsStats = await db.query(`
      SELECT 
        COUNT(*) as total_deals,
        COUNT(CASE WHEN value IS NULL OR value = 0 THEN 1 END) as zero_value_deals,
        COUNT(CASE WHEN unit_id IS NOT NULL THEN 1 END) as deals_with_unit,
        COUNT(CASE WHEN (value IS NULL OR value = 0) AND unit_id IS NOT NULL THEN 1 END) as zero_value_with_unit,
        COUNT(CASE WHEN assigned_to IS NULL THEN 1 END) as unassigned_deals,
        COUNT(CASE WHEN source_type = 'property_finder' THEN 1 END) as pf_deals
      FROM deals WHERE tenant_id::text = $1::text
    `, [tenant.id]);
    console.log('Deals Stats:', dealsStats.rows[0]);

    const customersStats = await db.query(`
      SELECT 
        COUNT(*) as total_customers,
        COUNT(CASE WHEN assigned_to IS NULL THEN 1 END) as unassigned_customers,
        COUNT(CASE WHEN branch_id IS NULL THEN 1 END) as no_branch_customers
      FROM customers WHERE tenant_id::text = $1::text
    `, [tenant.id]);
    console.log('Customers Stats:', customersStats.rows[0]);

    const unitsStats = await db.query(`
      SELECT 
        COUNT(*) as total_units,
        COUNT(CASE WHEN branch_id IS NULL THEN 1 END) as no_branch_units,
        COUNT(CASE WHEN LOWER(status) = 'available' THEN 1 END) as available_units,
        COUNT(CASE WHEN LOWER(status) = 'reserved' THEN 1 END) as reserved_units
      FROM re_units WHERE tenant_id::text = $1::text
    `, [tenant.id]);
    console.log('Units Stats:', unitsStats.rows[0]);
  }

  process.exit(0);
}

runAudit().catch(err => {
  console.error('[Audit Error]', err);
  process.exit(1);
});
