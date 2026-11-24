'use strict';
const {randomUUID}=require('crypto');
const {canonicalPhone}=require('./whatsappVerifiedPhoneIdentity');
// Provider send is at most once per invocation, NOT exactly-once across crashes.
// Prepared/unknown are deliberately never auto-resent. Repair is history only.
function createVerifiedDelivery({pool,mirror}){
 async function repair(id){
  const r=await pool.query("SELECT * FROM whatsapp_delivery_journal WHERE id=$1 AND state IN ('accepted','mirrored')",[id]);
  if(r.rowCount!==1)throw Error('DELIVERY_NOT_ACCEPTED_FOR_HISTORY_REPAIR');
  const row=r.rows[0];
  const result=await mirror({...row.mirror_context,messageId:row.provider_message_id});
  if(row.mirror_context.campaignId){
   const audit=await pool.connect();
   try{
    await audit.query('BEGIN');
    await audit.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['wa-campaign-audit:'+id]);
    const ctx=row.mirror_context;
    await audit.query(`INSERT INTO whatsapp_campaign_recipients(campaign_id,customer_id,customer_name,phone,status,message_id,sent_at) SELECT $1,$2,$3,$4,'sent',$5,now() WHERE NOT EXISTS(SELECT 1 FROM whatsapp_campaign_recipients WHERE campaign_id=$1 AND message_id=$5)`,[ctx.campaignId,ctx.customerId||null,ctx.contactName||'',ctx.recipientPhone,row.provider_message_id]);
    await audit.query('COMMIT');
   }catch(e){await audit.query('ROLLBACK');throw e;}finally{audit.release();}
  }
  if(row.mirror_context.notificationJobId){
   const jobId=row.mirror_context.notificationJobId;
   const linked=await pool.connect();
   try{await linked.query('BEGIN');
   await linked.query("UPDATE notification_jobs SET error_message=NULL,updated_at=now() WHERE id=$1 AND tenant_id=$2 AND status='completed' AND error_message=$3",[jobId,row.tenant_id,'HISTORY_PENDING journal='+id+'; provider accepted, never resend.']);
   await linked.query("UPDATE notification_logs SET error_code=NULL,error_message=NULL,updated_at=now() WHERE job_id=$1 AND error_code='HISTORY_PENDING' AND error_message=$2",[jobId,'HISTORY_PENDING journal='+id+'; provider accepted, never resend.']);
   await linked.query('COMMIT');}catch(error){await linked.query('ROLLBACK');throw error;}finally{linked.release();}
  }
  const u=await pool.query("UPDATE whatsapp_delivery_journal SET state='mirrored',conversation_id=$2,updated_at=now() WHERE id=$1 AND state='accepted' RETURNING id",[id,result.conversationId]);
  if(u.rowCount!==1){const existing=await pool.query("SELECT conversation_id FROM whatsapp_delivery_journal WHERE id=$1 AND state='mirrored'",[id]);if(existing.rowCount!==1||String(existing.rows[0].conversation_id)!==String(result.conversationId))throw Error('DELIVERY_REPAIR_CONTEXT_CHANGED');}
  return result;
 }
 async function deliver(context,send){
  context={...context,recipientPhone:canonicalPhone(context.recipientPhone)};
  const id=randomUUID();
  await pool.query("INSERT INTO whatsapp_delivery_journal(id,tenant_id,account_id,branch_id,mirror_context,state) VALUES($1,$2,$3,$4,$5,'prepared')",[id,context.tenantId,context.accountId,context.branchId,JSON.stringify(context)]);
  let result;
  try{result=await send();}catch(error){await pool.query("UPDATE whatsapp_delivery_journal SET state='unknown',updated_at=now() WHERE id=$1 AND state='prepared'",[id]).catch(()=>{});return{success:false,deliveryUnknown:true,repairId:id,error:'Provider outcome unknown; do not retry automatically.'};}
  if(result.deliveryUnknown){await pool.query("UPDATE whatsapp_delivery_journal SET state='unknown',updated_at=now() WHERE id=$1 AND state='prepared'",[id]).catch(()=>{});return{...result,repairId:id};}
  if(!result.success){await pool.query("UPDATE whatsapp_delivery_journal SET state='rejected',updated_at=now() WHERE id=$1 AND state='prepared'",[id]);return{...result,repairId:id};}
  let acceptancePersisted=false;
  try{
   if(!result.messageId)throw Error('PROVIDER_MESSAGE_ID_MISSING');
   const saved=await pool.query("UPDATE whatsapp_delivery_journal SET state='accepted',provider_message_id=$2,updated_at=now() WHERE id=$1 AND state='prepared' RETURNING id",[id,result.messageId]);
   if(saved.rowCount!==1)throw Error('DELIVERY_ACCEPTANCE_NOT_PERSISTED');
   acceptancePersisted=true;
   const mirrored=await repair(id);
   return{...result,conversationId:mirrored.conversationId,repairId:id,historyPending:false};
  }catch{return{...result,repairId:id,historyPending:acceptancePersisted,acceptanceReconciliationRequired:!acceptancePersisted};}
 }
 return{deliver,repair};
}
module.exports={createVerifiedDelivery};
