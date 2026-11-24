'use strict';
const {randomUUID}=require('crypto');
// Queue mechanics only. Not a dispatcher, no provider/CRM/bot handler is imported.
function createEventWorkQueue({pool}){
 async function claim(){
  const token=randomUUID();
  const c=await pool.connect();
  try{
   await c.query('BEGIN');
   await c.query("SET LOCAL lock_timeout='3s'");
   await c.query("SET LOCAL statement_timeout='15s'");
   // A worker may have produced effects before losing its lease. Never auto-replay.
   await c.query("UPDATE whatsapp_verified_event_work SET state='quarantined',error_code='LEASE_EXPIRED_OUTCOME_UNKNOWN',lease_token=NULL WHERE id IN (SELECT id FROM whatsapp_verified_event_work WHERE state='processing' AND lease_expires_at<=clock_timestamp() ORDER BY id LIMIT 100 FOR UPDATE SKIP LOCKED)");
   const picked=await c.query("SELECT * FROM whatsapp_verified_event_work WHERE state='pending' AND available_at<=now() ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED");
   if(!picked.rowCount){await c.query('COMMIT');return null;}
   const row=picked.rows[0];
   const allowed=await c.query("SELECT c.phone_number_id FROM whatsapp_phone_claims c JOIN whatsapp_accounts a ON a.phone_number_id=c.phone_number_id AND a.tenant_id=c.tenant_id JOIN branches b ON b.id::text=a.branch_id AND b.tenant_id=a.tenant_id WHERE c.phone_number_id=$1 AND c.tenant_id=$2 AND c.generation=$3 AND c.app_id=$6 AND c.waba_id=$7 AND c.state='linked' AND a.id=$4 AND a.branch_id=$5 AND a.is_active=true AND a.connection_type='coexistence' AND a.coexistence_status='linked' AND c.token_sha256=encode(sha256(convert_to(coalesce(a.access_token,''),'UTF8')),'hex') FOR SHARE OF c,a,b",[row.phone_number_id,row.tenant_id,row.claim_generation,row.account_id,row.branch_id,row.app_id,row.waba_id]);
   if(allowed.rowCount!==1){await c.query("UPDATE whatsapp_verified_event_work SET state='quarantined',error_code='TARGET_CHANGED' WHERE id=$1",[row.id]);await c.query('COMMIT');return{quarantined:true,id:row.id};}
   const updated=await c.query("UPDATE whatsapp_verified_event_work SET state='processing',attempts=attempts+1,lease_token=$2,lease_expires_at=now()+interval '60 seconds' WHERE id=$1 RETURNING *",[row.id,token]);
   await c.query('COMMIT');return{...updated.rows[0],leaseToken:token};
  }catch(error){await c.query('ROLLBACK');throw error;}finally{c.release();}
 }
 async function settle({id,leaseToken,outcome}){
  if(!['busy_no_effects','applied','uncertain'].includes(outcome))throw Error('WORK_OUTCOME_INVALID');
  const state=outcome==='busy_no_effects'?'pending':outcome==='applied'?'applied':'quarantined';
  const r=await pool.query("UPDATE whatsapp_verified_event_work SET state=$3,available_at=CASE WHEN $3='pending' THEN now()+interval '5 seconds' ELSE available_at END,error_code=$4,lease_token=NULL,lease_expires_at=NULL WHERE id=$1 AND state='processing' AND lease_token=$2 AND lease_expires_at>clock_timestamp() RETURNING id",[id,leaseToken,state,outcome==='uncertain'?'HANDLER_OUTCOME_UNKNOWN':null]);
  if(r.rowCount!==1)throw Error('WORK_LEASE_CHANGED_OR_EXPIRED');
  return{state};
 }
 return{claim,settle};
}
module.exports={createEventWorkQueue};
