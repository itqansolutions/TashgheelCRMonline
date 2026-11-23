// Scoped read-only capability groups. No repair or implicit enabling of features.
exports.validateGroup=async(db,group)=>{
 if(!['core','events','activity-reminders','contract-expiry','existing-background-workers'].includes(group))throw Error('Unknown prerequisite group');
 const required=require('./contracts/'+group+'.json'),c=await db.connect();
 try{
  await c.query('BEGIN READ ONLY');await c.query("SET LOCAL statement_timeout='5s'");
  const tables=[...new Set(required.columns.map(x=>x.table_name))];
  const rows=(await c.query("SELECT table_name,column_name,data_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' AND table_name=ANY($1::text[])",[tables])).rows;
  // Defaults are required where these capability paths omit values on INSERT.
  for(const e of required.columns){const r=rows.find(x=>x.table_name===e.table_name&&x.column_name===e.column_name);if(!r||r.data_type!==e.data_type||r.is_nullable!==e.is_nullable||(['id','created_at'].includes(e.column_name)&&e.column_default&&!r.column_default))throw Error('Prerequisite '+group+': '+e.table_name+'.'+e.column_name);}
  const constraints=(await c.query("SELECT cl.relname table_name,pg_get_constraintdef(co.oid) definition FROM pg_constraint co JOIN pg_class cl ON cl.oid=co.conrelid JOIN pg_namespace n ON n.oid=cl.relnamespace WHERE n.nspname='public' AND cl.relname=ANY($1::text[])",[tables])).rows;
  // Compare structure, not constraint names. Equivalent deparser casts not used by these PKs.
  for(const e of required.constraints)if(!constraints.some(r=>r.table_name===e.table_name&&r.definition===e.definition))throw Error('Prerequisite '+group+': '+e.table_name+' '+e.definition);
  for(const f of required.functions){const r=await c.query('SELECT to_regprocedure($1) IS NOT NULL AS present',[f]);if(!r.rows[0]?.present)throw Error('Prerequisite '+group+': '+f);}
  const normalize=s=>s.replace(/\s+/g,' ').trim();
  const indexes=(await c.query("SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' AND tablename=ANY($1::text[])",[tables])).rows;
  for(const e of required.indexes)if(!indexes.some(r=>r.tablename===e.tablename&&(normalize(r.indexdef)===normalize(e.indexdef)||normalize(r.indexdef)===normalize((require('./index-deparser-allowlist.json')[e.indexname]||'')))))throw Error('Prerequisite '+group+': required index');
  const triggers=await c.query("SELECT cl.relname,t.tgname FROM pg_trigger t JOIN pg_class cl ON cl.oid=t.tgrelid JOIN pg_namespace n ON n.oid=cl.relnamespace WHERE n.nspname='public' AND cl.relname=ANY($1::text[]) AND NOT t.tgisinternal",[tables]);
  if(triggers.rowCount)throw Error('Prerequisite '+group+': trigger requires review');
  // Trigger/RLS effects can change behavior; do not claim vetted if present on these scoped paths.
  const rls=await c.query("SELECT cl.relname FROM pg_class cl JOIN pg_namespace n ON n.oid=cl.relnamespace WHERE n.nspname='public' AND cl.relname=ANY($1::text[]) AND cl.relrowsecurity",[tables]);
  if(rls.rowCount)throw Error('Prerequisite '+group+': RLS requires review');
  await c.query('ROLLBACK');
 }catch(e){await c.query('ROLLBACK').catch(()=>{});throw e;}finally{c.release();}
};
