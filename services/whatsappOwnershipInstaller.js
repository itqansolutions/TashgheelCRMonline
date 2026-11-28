'use strict';
const fs=require('fs'),path=require('path'),{createHash}=require('crypto');
// Candidate install helper. Never invoked on import; no credentials here.
// Production execution requires explicit DDL approval, reviewed preflight and
// verified backup/rollback plan. Does NOT trust/backfill existing tenant data.
async function fingerprint(client){
 const tables=['whatsapp_verified_contact_facts','whatsapp_verified_contact_state','whatsapp_conversations','whatsapp_messages','branches','whatsapp_verified_webhook_inbox','whatsapp_verified_inbox_events','whatsapp_verified_event_work','whatsapp_verified_work_origins','whatsapp_verified_message_records','whatsapp_verified_status_facts','whatsapp_delivery_journal','whatsapp_phone_claims','whatsapp_onboarding_attempts','whatsapp_accounts','whatsapp_settings'];
 const rows=await client.query(`SELECT 'column' AS kind,table_name||'.'||column_name AS name,data_type||':'||udt_name||':'||is_nullable||':'||coalesce(column_default,'')||':'||coalesce(character_maximum_length::text,'')||':'||coalesce(numeric_precision::text,'')||':'||coalesce(numeric_scale::text,'')||':'||coalesce(datetime_precision::text,'')||':'||coalesce(collation_name,'')||':'||coalesce(is_identity,'')||':'||coalesce(identity_generation,'')||':'||coalesce(is_generated,'')||':'||coalesce(generation_expression,'') AS definition FROM information_schema.columns WHERE table_schema='public' AND table_name=ANY($1::text[]) UNION ALL SELECT 'constraint',c.relname||'.'||con.conname,pg_get_constraintdef(con.oid) FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=ANY($1::text[]) UNION ALL SELECT 'index',tablename||'.'||indexname,indexdef FROM pg_indexes WHERE schemaname='public' AND tablename=ANY($1::text[]) UNION ALL SELECT 'trigger',c.relname||'.'||t.tgname,pg_get_triggerdef(t.oid)||':'||t.tgenabled::text FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=ANY($1::text[]) AND NOT t.tgisinternal UNION ALL SELECT 'function',p.proname,pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='guard_whatsapp_binding_candidate' ORDER BY 1,2,3`,[tables]);
 return createHash('sha256').update(JSON.stringify(rows.rows)).digest('hex');
}
async function install({pool,schemaDirectory}) {
 const parts=['whatsapp-claims-proposal.sql','all-writer-guard-proposal.sql','whatsapp-delivery-journal.sql','whatsapp-inbox-proposal.sql','whatsapp-inbox-events-proposal.sql','whatsapp-event-work-proposal.sql','whatsapp-consumer-sidecar-proposal.sql','whatsapp-contact-state-proposal.sql'].map(f=>fs.readFileSync(path.join(schemaDirectory,f),'utf8'));
 const digest=createHash('sha256').update(parts.join('\n')).digest('hex');
 const c=await pool.connect();
 try{
  await c.query('BEGIN');
  await c.query("SET LOCAL search_path=public,pg_catalog");
  await c.query("SET LOCAL lock_timeout='5s'");
  await c.query("SET LOCAL statement_timeout='30s'");
  await c.query("SELECT pg_advisory_xact_lock(674832910)");
  const version=await c.query("SELECT current_setting('server_version_num')::int AS version");
  if(version.rows[0].version<140000)throw Error('POSTGRES_VERSION_REQUIRES_REVIEW');
  const exists=await c.query("SELECT to_regclass('public.whatsapp_ownership_schema_version') IS NOT NULL AS exists");
  if(exists.rows[0].exists){
   const prior=await c.query('SELECT digest,artifact_fingerprint FROM public.whatsapp_ownership_schema_version WHERE id=1');
   if(prior.rows[0]?.digest!==digest)throw Error('INSTALLED_SCHEMA_VERSION_MISMATCH');
   if(prior.rows[0].artifact_fingerprint!==await fingerprint(c))throw Error('INSTALLED_SCHEMA_INTEGRITY_DRIFT');
   // Repeated execution is a no-op only if critical artifacts still exist.
   const check=await c.query("SELECT to_regclass('public.whatsapp_phone_claims') IS NOT NULL AND to_regclass('public.whatsapp_onboarding_attempts') IS NOT NULL AS intact");
   if(!check.rows[0].intact)throw Error('INSTALLED_SCHEMA_INCOMPLETE');
   await c.query('COMMIT');return{status:'already_installed',digest};
  }
  const unexpected=await c.query("SELECT to_regclass('public.whatsapp_delivery_journal') IS NOT NULL OR to_regclass('public.whatsapp_phone_claims') IS NOT NULL OR to_regclass('public.whatsapp_onboarding_attempts') IS NOT NULL AS exists");
  if(unexpected.rows[0].exists)throw Error('UNVERSIONED_SCHEMA_REQUIRES_REVIEW');
  await c.query('LOCK TABLE public.whatsapp_accounts,public.whatsapp_settings IN SHARE ROW EXCLUSIVE MODE');
  // Fail closed on legacy cross-tenant collisions. Never delete/merge/reassign.
  const collisions=await c.query(`WITH all_records AS(SELECT tenant_id::text AS tenant,btrim(phone_number_id) AS phone FROM whatsapp_accounts UNION ALL SELECT tenant_id::text,btrim(phone_number_id) FROM whatsapp_settings) SELECT 1 FROM all_records WHERE phone IS NOT NULL AND phone<>'' GROUP BY phone HAVING count(DISTINCT tenant)>1 LIMIT 1`);
  if(collisions.rowCount)throw Error('LEGACY_OWNERSHIP_COLLISION');
  for(const sql of parts)await c.query(sql);
  await c.query('ALTER FUNCTION public.guard_whatsapp_binding_candidate() SET search_path=pg_catalog,public');
  await c.query('CREATE TABLE whatsapp_ownership_schema_version(id integer PRIMARY KEY CHECK(id=1),digest text NOT NULL,artifact_fingerprint text NOT NULL,installed_at timestamptz NOT NULL DEFAULT now())');
  await c.query('INSERT INTO whatsapp_ownership_schema_version(id,digest,artifact_fingerprint) VALUES(1,$1,$2)',[digest,await fingerprint(c)]);
  await c.query('COMMIT');return{status:'installed',digest};
 }catch(error){await c.query('ROLLBACK');throw error;}finally{c.release();}
}
// Read-only startup compatibility, never invokes installer or schema repair.
async function verifyInstalledCore(client){
 const parts=['whatsapp-claims-proposal.sql','all-writer-guard-proposal.sql','whatsapp-delivery-journal.sql','whatsapp-inbox-proposal.sql','whatsapp-inbox-events-proposal.sql','whatsapp-event-work-proposal.sql','whatsapp-consumer-sidecar-proposal.sql','whatsapp-contact-state-proposal.sql'].map(f=>fs.readFileSync(path.join(__dirname,'../ops/proposals',f),'utf8'));
 const digest=createHash('sha256').update(parts.join('\n')).digest('hex');
 const present=await client.query("SELECT to_regclass('public.whatsapp_ownership_schema_version') IS NOT NULL AS present");
 if(!present.rows[0]?.present)throw Error('CORE_SCHEMA_UNVERIFIED');
 const prior=await client.query('SELECT digest,artifact_fingerprint FROM public.whatsapp_ownership_schema_version WHERE id=1');
 const liveFp=await fingerprint(client);if(prior.rows[0]?.digest!==digest||prior.rows[0]?.artifact_fingerprint!==liveFp){console.error('[CoreSchema] digestMatch='+(prior.rows[0]?.digest===digest)+' stored='+prior.rows[0]?.artifact_fingerprint+' live='+liveFp);throw Error('CORE_SCHEMA_UNVERIFIED');}
}
module.exports={install,verifyInstalledCore};
