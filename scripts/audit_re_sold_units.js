const db = require('../config/db');

async function checkSoldUnits() {
  try {
    const res = await db.query(`
      SELECT 
        u.id, u.name, u.unit_number, u.status, u.tenant_id,
        c.id as contract_id, c.contract_number, c.status as contract_status,
        h.id as handover_id, h.status as handover_status,
        d.id as deal_id, d.title as deal_title, d.pipeline_stage as deal_stage
      FROM re_units u
      LEFT JOIN re_contracts c ON c.unit_id::text = u.id::text AND c.tenant_id::text = u.tenant_id::text
      LEFT JOIN re_handovers h ON h.unit_id::text = u.id::text AND h.tenant_id::text = u.tenant_id::text
      LEFT JOIN deals d ON d.unit_id::text = u.id::text AND d.tenant_id::text = u.tenant_id::text
      WHERE LOWER(u.status) = 'sold'
    `);
    console.log('TOTAL_SOLD_COUNT:', res.rows.length);
    console.log(JSON.stringify(res.rows, null, 2));

    const allUnits = await db.query(`
      SELECT status, COUNT(*) as count
      FROM re_units
      GROUP BY status
    `);
    console.log('ALL_UNIT_STATUSES:', JSON.stringify(allUnits.rows, null, 2));
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

checkSoldUnits();
