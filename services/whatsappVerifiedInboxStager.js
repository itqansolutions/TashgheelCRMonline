'use strict';
const {identify}=require('./whatsappVerifiedEventIdentity');
const {project}=require('./whatsappVerifiedWebhookProjection');
// Durable work staging only, no bot invocation or provider requests. Queue rows
// are not marked applied merely because they were projected.
function createInboxStager({pool}){
 return async function stage(){
  const c=await pool.connect();
  try{
   await c.query('BEGIN');
   await c.query("SET LOCAL lock_timeout='3s'");
   await c.query("SET LOCAL statement_timeout='15s'");
   const r=await c.query("SELECT * FROM whatsapp_verified_webhook_inbox WHERE state='captured' ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED");
   if(!r.rowCount){await c.query('COMMIT');return{staged:false};}
   const row=r.rows[0];
   if(row.schema_version!==1){await c.query("UPDATE whatsapp_verified_webhook_inbox SET state='quarantined',quarantine_reason='INBOX_SCHEMA_UNSUPPORTED',quarantined_at=now() WHERE id=$1",[row.id]);await c.query('COMMIT');return{staged:false,inboxId:row.id,quarantined:true};}
   await c.query('SAVEPOINT stage_events');
   let count=0;
   for(let i=0;i<row.operations.length;i++){
    const op=row.operations[i];
    if(op.schemaVersion!==1){await c.query('ROLLBACK TO SAVEPOINT stage_events');await c.query("UPDATE whatsapp_verified_webhook_inbox SET state='quarantined',quarantine_reason='OPERATION_SCHEMA_UNSUPPORTED',quarantined_at=now() WHERE id=$1",[row.id]);await c.query('COMMIT');return{staged:false,inboxId:row.id,quarantined:true};}
    const verified=await c.query("SELECT c.phone_number_id FROM whatsapp_phone_claims c JOIN whatsapp_accounts a ON a.phone_number_id=c.phone_number_id AND a.tenant_id=c.tenant_id WHERE c.phone_number_id=$1 AND c.tenant_id=$2 AND c.app_id=$3 AND c.waba_id=$4 AND c.generation=$5 AND c.state='linked' AND a.id=$6 AND a.branch_id IS NOT DISTINCT FROM $7 AND a.is_active=true AND a.connection_type='coexistence' AND a.coexistence_status='linked' AND c.token_sha256=encode(sha256(convert_to(coalesce(a.access_token,''),'UTF8')),'hex') AND EXISTS(SELECT 1 FROM branches b WHERE b.id::text=a.branch_id AND b.tenant_id=a.tenant_id) FOR SHARE OF c,a",[op.phoneId,op.tenantId,op.appId,op.wabaId,op.generation,op.accountId,op.branchId]);
    if(verified.rowCount!==1){await c.query('ROLLBACK TO SAVEPOINT stage_events');await c.query("UPDATE whatsapp_verified_webhook_inbox SET state='quarantined',quarantine_reason='TARGET_CONTEXT_CHANGED',quarantined_at=now() WHERE id=$1",[row.id]);await c.query('COMMIT');return{staged:false,inboxId:row.id,quarantined:true,reason:'TARGET_GENERATION_CHANGED'};}
    const branch=await c.query('SELECT id FROM branches WHERE id::text=$1::text AND tenant_id=$2 FOR SHARE',[op.branchId,op.tenantId]);
    if(branch.rowCount!==1){await c.query('ROLLBACK TO SAVEPOINT stage_events');await c.query("UPDATE whatsapp_verified_webhook_inbox SET state='quarantined',quarantine_reason='TARGET_CONTEXT_CHANGED',quarantined_at=now() WHERE id=$1",[row.id]);await c.query('COMMIT');return{staged:false,inboxId:row.id,quarantined:true,reason:'BRANCH_CHANGED'};}
    let events;
    try{events=project(op);}catch{events=[{kind:'quarantine',reason:'UNSUPPORTED_PROVIDER_PROJECTION',rawValue:op.value}];}
    for(let j=0;j<events.length;j++){
     const identity=identify(events[j]);
     const work=await c.query("INSERT INTO whatsapp_verified_event_work(tenant_id,account_id,branch_id,phone_number_id,claim_generation,event_key,event_digest,event,state,app_id,waba_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(tenant_id,account_id,event_key) DO NOTHING RETURNING id",[op.tenantId,op.accountId,op.branchId,op.phoneId,op.generation,identity.key,identity.digest,JSON.stringify(events[j]),['message','message_status','contact_state'].includes(events[j].kind)?'pending':'quarantined',op.appId,op.wabaId]);
     if(!work.rowCount){const prior=await c.query('SELECT id,event_digest,claim_generation,app_id,waba_id,branch_id,phone_number_id FROM whatsapp_verified_event_work WHERE tenant_id=$1 AND account_id=$2 AND event_key=$3',[op.tenantId,op.accountId,identity.key]);if(prior.rowCount!==1||prior.rows[0].event_digest!==identity.digest||String(prior.rows[0].claim_generation)!==String(op.generation)||prior.rows[0].app_id!==op.appId||prior.rows[0].waba_id!==op.wabaId||prior.rows[0].branch_id!==op.branchId||prior.rows[0].phone_number_id!==op.phoneId){await c.query('ROLLBACK TO SAVEPOINT stage_events');await c.query("UPDATE whatsapp_verified_webhook_inbox SET state='quarantined',quarantine_reason='EVENT_IDENTITY_CONFLICT',quarantined_at=now() WHERE id=$1",[row.id]);await c.query('COMMIT');return{staged:false,inboxId:row.id,quarantined:true,reason:'EVENT_IDENTITY_CONFLICT'};}}
     if(events[j].kind==='message'){
      const persisted=await c.query('SELECT id FROM whatsapp_verified_event_work WHERE tenant_id=$1 AND account_id=$2 AND event_key=$3',[op.tenantId,op.accountId,identity.key]);
      await c.query('INSERT INTO whatsapp_verified_work_origins(work_id,source) VALUES($1,$2) ON CONFLICT DO NOTHING',[persisted.rows[0].id,events[j].source]);
     }
     await c.query('INSERT INTO whatsapp_verified_inbox_events(inbox_id,operation_index,event_index,tenant_id,account_id,branch_id,phone_number_id,claim_generation,field,event) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT DO NOTHING',[row.id,i,j,op.tenantId,op.accountId,op.branchId,op.phoneId,op.generation,op.field,JSON.stringify(events[j])]);count++;
    }
   }
   await c.query("UPDATE whatsapp_verified_webhook_inbox SET state='staged' WHERE id=$1",[row.id]);
   await c.query('COMMIT');return{staged:true,inboxId:row.id,eventCount:count};
  }catch(error){await c.query('ROLLBACK');throw error;}finally{c.release();}
 };
}
module.exports={createInboxStager};
