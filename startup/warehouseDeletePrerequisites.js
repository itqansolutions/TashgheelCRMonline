// Scoped capability check, NOT global app readiness. No DDL or business-row reads.
exports.validateWarehouseDelete=async db=>{
 const required=require('./contracts/warehouse-delete.json'),c=await db.connect();
 try{
  await c.query('BEGIN READ ONLY');await c.query("SET LOCAL statement_timeout='5s'");
  const columns=(await c.query("SELECT table_name,column_name,data_type,is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name=ANY($1::text[])",[[...new Set(required.columns.map(x=>x.table_name))]])).rows;
  const constraints=(await c.query("SELECT cl.relname table_name,co.conname,pg_get_constraintdef(co.oid) definition FROM pg_constraint co JOIN pg_class cl ON cl.oid=co.conrelid JOIN pg_namespace n ON n.oid=cl.relnamespace WHERE n.nspname='public' AND co.conname=ANY($1::text[])",[required.constraints.map(x=>x.conname)])).rows;
  const indexes=(await c.query("SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' AND indexname=ANY($1::text[])",[required.indexes.map(x=>x.indexname)])).rows;
  for(const [key,observed]of [['columns',columns],['constraints',constraints],['indexes',indexes]])for(const expected of required[key]){
   const fields=key==='columns'?['table_name','column_name','data_type','is_nullable']:Object.keys(expected);
   if(!observed.some(row=>fields.every(f=>row[f]===expected[f])))throw Error('Warehouse delete prerequisite mismatch: '+key+':'+(expected.conname||expected.indexname||expected.table_name+'.'+expected.column_name));
  }
  await c.query('ROLLBACK');
 }catch(e){await c.query('ROLLBACK').catch(()=>{});throw e;}finally{c.release();}
};
