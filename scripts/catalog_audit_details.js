const db = require('../config/db');

async function main() {
  console.log('=== EXACT POSTGRESQL CATALOG CLASSIFICATION AUDIT ===\n');

  // 1. Exact catalog enumeration of all relations in public schema
  const relRes = await db.query(`
    SELECT 
      c.relname,
      c.relkind,
      CASE c.relkind
        WHEN 'r' THEN 'table'
        WHEN 'v' THEN 'view'
        WHEN 'm' THEN 'materialized view'
        WHEN 'i' THEN 'index'
        WHEN 'S' THEN 'sequence'
        ELSE c.relkind::text
      END as relation_type
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'v', 'm')
    ORDER BY c.relkind, c.relname;
  `);

  const physicalTables = relRes.rows.filter(r => r.relkind === 'r').map(r => r.relname);
  const views = relRes.rows.filter(r => r.relkind === 'v').map(r => r.relname);

  console.log(`Total Physical Tables (relkind='r'): ${physicalTables.length}`);
  console.log(`Total Views (relkind='v'): ${views.length}`);
  console.log('Views list:', views);

  // 2. Exact SQL used in audit_comprehensive_cleanup.js and breakdown
  const infoSchemaRes = await db.query(`
    SELECT DISTINCT table_name 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND column_name = 'tenant_id'
    ORDER BY table_name;
  `);

  const rawInfoSchemaNames = infoSchemaRes.rows.map(r => r.table_name);
  console.log(`\nRaw information_schema objects with tenant_id: ${rawInfoSchemaNames.length}`);

  const physicalWithTenantId = rawInfoSchemaNames.filter(n => physicalTables.includes(n));
  const viewsWithTenantId = rawInfoSchemaNames.filter(n => views.includes(n));

  console.log(`-> Physical Tables with tenant_id: ${physicalWithTenantId.length}`);
  console.log(`-> Views with tenant_id: ${viewsWithTenantId.length} (${viewsWithTenantId.join(', ')})`);

  // 3. Identification of tables WITHOUT tenant_id
  const tablesWithoutTenantId = physicalTables.filter(t => !physicalWithTenantId.includes(t));
  console.log(`\nPhysical Tables WITHOUT tenant_id column: ${tablesWithoutTenantId.length}`);
  console.log('Tables without tenant_id:', tablesWithoutTenantId);

  // 4. Foreign Key dependencies from tables without tenant_id pointing to tenant tables
  const fkRes = await db.query(`
    SELECT 
      tc.table_name as child_table,
      kcu.column_name as child_column,
      ccu.table_name as parent_table,
      ccu.column_name as parent_column
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
    JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'public'
      AND tc.table_name = ANY($1::text[])
    ORDER BY tc.table_name;
  `, [tablesWithoutTenantId]);

  console.log('\nForeign Keys from non-tenant tables pointing to parent tables:', fkRes.rows);

  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
