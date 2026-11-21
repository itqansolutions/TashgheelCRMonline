const db = require('../config/db');

const TEST_TENANT_IDS = [
  '98765432-1234-4321-8765-123456789abc',
  '11111111-2222-3333-4444-555555555555',
  '77777777-8888-9999-aaaa-bbbbccccdddd',
  '22222222-3333-4444-5555-666677778888'
];

async function run() {
  console.log('=== FAST MULTI-TABLE COMPREHENSIVE RESIDUAL AUDIT ===\n');

  // 1. Find all public tables with a tenant_id column
  const tablesRes = await db.query(`
    SELECT DISTINCT table_name 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND column_name = 'tenant_id'
    ORDER BY table_name;
  `);

  const tables = tablesRes.rows.map(r => r.table_name);
  console.log(`Auditing ${tables.length} tables having tenant_id column...`);

  // Build a single UNION ALL query for high speed
  const tenantIdList = TEST_TENANT_IDS.map(id => `'${id}'`).join(', ');

  const unionParts = tables.map(t => 
    `SELECT '${t}' as table_name, count(*) as cnt FROM "${t}" WHERE tenant_id::text IN (${tenantIdList})`
  );

  // Add tenants table itself
  unionParts.push(`SELECT 'tenants' as table_name, count(*) as cnt FROM tenants WHERE id::text IN (${tenantIdList})`);

  // Add system_logs table
  unionParts.push(`SELECT 'system_logs' as table_name, count(*) as cnt FROM system_logs WHERE (tenant_id IS NOT NULL AND tenant_id::text IN (${tenantIdList})) OR details::text LIKE '%98765432-1234-4321-8765-123456789abc%' OR details::text LIKE '%77777777-8888-9999-aaaa-bbbbccccdddd%'`);

  const finalSql = unionParts.join('\nUNION ALL\n') + ';';

  const t0 = Date.now();
  const res = await db.query(finalSql);
  const elapsed = Date.now() - t0;

  console.log(`Executed unified multi-table scan in ${elapsed}ms across ${res.rows.length} tables.\n`);

  let dirtyCount = 0;
  const cleanTables = [];
  const dirtyTables = [];

  for (const row of res.rows) {
    const cnt = Number(row.cnt);
    if (cnt > 0) {
      dirtyCount += cnt;
      dirtyTables.push({ table: row.table_name, count: cnt });
    } else {
      cleanTables.push(row.table_name);
    }
  }

  console.log('CLEAN TABLES (0 records found):');
  console.log(cleanTables.join(', '));

  if (dirtyTables.length > 0) {
    console.log('\nDIRTY TABLES:');
    console.log(dirtyTables);
  } else {
    console.log(`\nALL ${res.rows.length} TABLES ARE 100% CLEAN! Zero residual test rows found.`);
  }

  console.log(`\nTotal residual rows across all tables: ${dirtyCount}`);
  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
