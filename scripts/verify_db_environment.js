const db = require('../config/db');

async function main() {
  console.log('=== DATABASE ENVIRONMENT AUDIT ===');
  
  // 1. Current DB & Connection Metadata
  const infoRes = await db.query(`
    SELECT 
      current_database() as db_name,
      current_user as db_user,
      version() as pg_version,
      inet_server_addr() as server_ip,
      inet_server_port() as server_port
  `);
  console.log('Connection Info:', infoRes.rows[0]);

  // 2. List of all databases on this PostgreSQL instance
  const dbList = await db.query(`
    SELECT datname, pg_size_pretty(pg_database_size(datname)) as size 
    FROM pg_database 
    WHERE datistemplate = false 
    ORDER BY datname;
  `);
  console.log('Available Databases:', dbList.rows);

  // 3. Check for any leftover records from our test tenant UUIDs
  const testTenants = [
    '98765432-1234-4321-8765-123456789abc',
    '11111111-2222-3333-4444-555555555555',
    '77777777-8888-9999-aaaa-bbbbccccdddd',
    '22222222-3333-4444-5555-666677778888'
  ];
  console.log('\n=== RESIDUAL TEST DATA CHECK ===');
  for (const t of testTenants) {
    const tCheck = await db.query('SELECT count(*) FROM tenants WHERE id = $1', [t]);
    const uCheck = await db.query('SELECT count(*) FROM users WHERE tenant_id = $1', [t]);
    const dCheck = await db.query('SELECT count(*) FROM deals WHERE tenant_id::text = $1', [t]);
    const unCheck = await db.query('SELECT count(*) FROM re_units WHERE tenant_id::text = $1', [t]);
    const cCheck = await db.query('SELECT count(*) FROM re_contracts WHERE tenant_id::text = $1', [t]);
    const iCheck = await db.query('SELECT count(*) FROM re_installments WHERE tenant_id::text = $1', [t]);
    const hCheck = await db.query('SELECT count(*) FROM re_handovers WHERE tenant_id::text = $1', [t]);
    console.log(`Tenant ${t}:`, {
      tenants: Number(tCheck.rows[0].count),
      users: Number(uCheck.rows[0].count),
      deals: Number(dCheck.rows[0].count),
      units: Number(unCheck.rows[0].count),
      contracts: Number(cCheck.rows[0].count),
      installments: Number(iCheck.rows[0].count),
      handovers: Number(hCheck.rows[0].count),
    });
  }

  // 4. Verify Retained QA Records (from Nov 21 Functional Audit)
  console.log('\n=== RETAINED QA RECORDS INTEGRITY CHECK ===');
  // QA Contract REC-2026-00001
  const qaContract = await db.query(`
    SELECT id, contract_number, contract_value, down_payment, status, updated_at
    FROM re_contracts
    WHERE contract_number = 'REC-2026-00001'
  `);
  console.log('QA Contract REC-2026-00001:', qaContract.rows);

  // QA Unit U-102
  const qaUnit = await db.query(`
    SELECT id, unit_number, name, status, reservation_expires_at, updated_at
    FROM re_units
    WHERE unit_number = 'U-102'
  `);
  console.log('QA Unit U-102:', qaUnit.rows);

  // QA Deals (Deal 2022 and Deal 2023 or titles)
  const qaDeals = await db.query(`
    SELECT id, title, pipeline_stage, unit_id, value, custom_fields, updated_at
    FROM deals
    WHERE title ILIKE '%2022%' OR title ILIKE '%2023%' OR id IN (2022, 2023)
  `);
  console.log('QA Deals:', qaDeals.rows);

  process.exit(0);
}

main().catch(err => {
  console.error('Audit script error:', err);
  process.exit(1);
});
