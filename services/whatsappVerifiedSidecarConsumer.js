'use strict';
function createSidecarConsumer({pool,applyProjection=null}){
 return async function apply({id,leaseToken}){
  const c=await pool.connect();
  try{
   await c.query('BEGIN');
   await c.query("SET LOCAL lock_timeout='3s'");await c.query("SET LOCAL statement_timeout='15s'");
   const found=await c.query("SELECT * FROM whatsapp_verified_event_work WHERE id=$1 AND state='processing' AND lease_token=$2 AND lease_expires_at>clock_timestamp() FOR UPDATE",[id,leaseToken]);
   if(found.rowCount!==1)throw Error('SIDECAR_LEASE_CHANGED');
   const work=found.rows[0],event=work.event;
   const binding=await c.query("SELECT c.phone_number_id FROM whatsapp_phone_claims c JOIN whatsapp_accounts a ON a.phone_number_id=c.phone_number_id AND a.tenant_id=c.tenant_id JOIN branches b ON b.id::text=a.branch_id AND b.tenant_id=a.tenant_id WHERE c.phone_number_id=$1 AND c.tenant_id=$2 AND c.generation=$3 AND c.app_id=$4 AND c.waba_id=$5 AND c.state='linked' AND a.id=$6 AND a.branch_id=$7 AND a.is_active=true AND a.connection_type='coexistence' AND a.coexistence_status='linked' AND c.token_sha256=encode(sha256(convert_to(coalesce(a.access_token,''),'UTF8')),'hex') FOR SHARE OF c,a,b",[work.phone_number_id,work.tenant_id,work.claim_generation,work.app_id,work.waba_id,work.account_id,work.branch_id]);
   const quarantine=async(reason)=>{await c.query("UPDATE whatsapp_verified_event_work SET state='quarantined',error_code=$2,lease_token=NULL,lease_expires_at=NULL WHERE id=$1",[id,reason]);await c.query('COMMIT');return{state:'quarantined',reason};};
   if(binding.rowCount!==1)return await quarantine('TARGET_CHANGED_AT_APPLY');
   if(event.kind==='message'){
    await c.query('INSERT INTO whatsapp_verified_message_records(tenant_id,account_id,message_id,branch_id,phone_number_id,app_id,waba_id,claim_generation,direction,peer,message_type,body,timestamp_seconds,immutable_digest) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) ON CONFLICT DO NOTHING',[work.tenant_id,work.account_id,event.messageId,work.branch_id,work.phone_number_id,work.app_id,work.waba_id,work.claim_generation,event.direction,JSON.stringify(event.peer),event.messageType,event.text,event.timestampSeconds,work.event_digest]);
    const prior=await c.query('SELECT immutable_digest,branch_id,phone_number_id,claim_generation FROM whatsapp_verified_message_records WHERE tenant_id=$1 AND account_id=$2 AND message_id=$3',[work.tenant_id,work.account_id,event.messageId]);
    if(prior.rowCount!==1||prior.rows[0].immutable_digest!==work.event_digest||prior.rows[0].branch_id!==work.branch_id||prior.rows[0].phone_number_id!==work.phone_number_id||String(prior.rows[0].claim_generation)!==String(work.claim_generation))throw Error('SIDECAR_MESSAGE_CONTEXT_CONFLICT');
   }else if(event.kind==='message_status'){
    await c.query('INSERT INTO whatsapp_verified_status_facts(tenant_id,account_id,event_key,message_id,status,timestamp_seconds,fact) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING',[work.tenant_id,work.account_id,work.event_key,event.messageId,event.status,event.timestampSeconds,JSON.stringify(event)]);
   }else if(event.kind==='contact_state'){
    await c.query('INSERT INTO whatsapp_verified_contact_facts(tenant_id,account_id,event_key,user_id,action,timestamp_seconds,fact,event_digest,branch_id,claim_generation,app_id,waba_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT DO NOTHING',[work.tenant_id,work.account_id,work.event_key,event.peer.businessScopedId,event.action,event.timestampSeconds,JSON.stringify(event),work.event_digest,work.branch_id,work.claim_generation,work.app_id,work.waba_id]);
    const prior=await c.query('SELECT event_digest FROM whatsapp_verified_contact_facts WHERE tenant_id=$1 AND account_id=$2 AND event_key=$3 AND branch_id=$4 AND claim_generation=$5',[work.tenant_id,work.account_id,work.event_key,work.branch_id,work.claim_generation]);
    if(prior.rowCount!==1||prior.rows[0].event_digest!==work.event_digest)throw Error('CONTACT_FACT_CONTEXT_CONFLICT');
    // State is an address-book projection only. Removal never deletes a CRM
    // customer, conversation, phone alias, message or historical fact.
    await c.query(`INSERT INTO whatsapp_verified_contact_state(tenant_id,account_id,user_id,phone_number,full_name,first_name,username,parent_user_id,is_removed,timestamp_seconds,event_key,branch_id,claim_generation,app_id,waba_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) ON CONFLICT(tenant_id,account_id,branch_id,claim_generation,user_id) DO UPDATE SET phone_number=EXCLUDED.phone_number,full_name=EXCLUDED.full_name,first_name=EXCLUDED.first_name,username=EXCLUDED.username,parent_user_id=EXCLUDED.parent_user_id,is_removed=EXCLUDED.is_removed,timestamp_seconds=EXCLUDED.timestamp_seconds,event_key=EXCLUDED.event_key WHERE whatsapp_verified_contact_state.timestamp_seconds<EXCLUDED.timestamp_seconds`,[work.tenant_id,work.account_id,event.peer.businessScopedId,event.peer.phone,event.fullName,event.firstName,event.username,event.parentUserId,event.action==='remove',event.timestampSeconds,work.event_key,work.branch_id,work.claim_generation,work.app_id,work.waba_id]);
   }else return await quarantine('SIDECAR_EVENT_UNSUPPORTED');
   const projected=applyProjection?await applyProjection({client:c,work,event}):null;
   // Sidecar writes and queue acknowledgement commit together. No external send.
   const settled=await c.query("UPDATE whatsapp_verified_event_work SET state=$3,available_at=CASE WHEN $3='pending' THEN clock_timestamp()+interval '30 seconds' ELSE available_at END,error_code=$4,lease_token=NULL,lease_expires_at=NULL WHERE id=$1 AND state='processing' AND lease_token=$2 AND lease_expires_at>clock_timestamp() RETURNING id",[id,leaseToken,projected?.deferred?'pending':'applied',projected?.deferred?projected.reason:null]);
   if(settled.rowCount!==1)throw Error('SIDECAR_LEASE_EXPIRED_DURING_APPLY');
   await c.query('COMMIT');return{state:projected?.deferred?'pending':'applied',...(projected?.deferred?{reason:projected.reason}:{})};
  }catch(error){await c.query('ROLLBACK');throw error;}finally{c.release();}
 };
}
module.exports={createSidecarConsumer};
