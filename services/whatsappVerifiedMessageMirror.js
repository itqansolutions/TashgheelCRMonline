'use strict';
const {canonicalPhone,findPhoneConversation}=require('./whatsappVerifiedPhoneIdentity');
// Mirror only, never sends. Provider success and local transaction are not a
// distributed atomic commit. Callers must surface/record a mirror failure.
function createVerifiedMessageMirror({pool}) {
 return async function mirror({tenantId,branchId,accountId,recipientPhone,messageId,body,templateName,conversationId:expectedConversationId=null,messageType='template',customerId=null,contactName=null,userId=null}) {
  if(!tenantId||!branchId||!accountId||!recipientPhone||!messageId)throw Error('MIRROR_CONTEXT_REQUIRED');
  recipientPhone=canonicalPhone(recipientPhone);
  const c=await pool.connect();
  try{
   await c.query('BEGIN');
   await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['wa-message:'+messageId]);
   const account=await c.query(`SELECT a.id FROM whatsapp_accounts a JOIN whatsapp_phone_claims cl ON cl.phone_number_id=a.phone_number_id AND cl.tenant_id=a.tenant_id WHERE a.id=$1 AND a.tenant_id=$2 AND a.branch_id=$3 AND cl.state='linked' AND a.is_active=true FOR SHARE OF a,cl`,[accountId,tenantId,branchId]);
   if(account.rowCount!==1)throw Error('MIRROR_ACCOUNT_CONTEXT_CHANGED');
   const resolved=await findPhoneConversation({client:c,tenantId,accountId,branchId,phone:recipientPhone});
   if(expectedConversationId && (!resolved.conversation||String(resolved.conversation.id)!==String(expectedConversationId)))throw Error('MIRROR_EXPECTED_CONVERSATION_MISMATCH');
   let conversationId=resolved.conversation?.id;
   if(!conversationId){const r=await c.query(`INSERT INTO whatsapp_conversations(tenant_id,branch_id,account_id,phone_number,contact_name,customer_id,last_message_body,last_message_at,last_message_direction,unread_count,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,now(),'outbound',0,now(),now()) RETURNING id`,[tenantId,branchId,accountId,recipientPhone,contactName||recipientPhone,customerId,body]);conversationId=r.rows[0].id;}
   const existing=await c.query('SELECT conversation_id,tenant_id,account_id,body,template_name,message_type FROM whatsapp_messages WHERE meta_message_id=$1',[messageId]);
   if(existing.rowCount){
    const e=existing.rows[0];
    if(String(e.conversation_id)!==String(conversationId)||e.tenant_id!==tenantId||e.account_id!==accountId||e.body!==body||e.template_name!==templateName||e.message_type!==messageType)throw Error('MIRROR_MESSAGE_ID_CONTEXT_CONFLICT');
    await c.query('COMMIT');return{conversationId,replayed:true};
   }
   const updated=await c.query(`UPDATE whatsapp_conversations SET last_message_body=$1,last_message_at=now(),last_message_direction='outbound',updated_at=now() WHERE id=$2 AND tenant_id=$3 AND account_id=$4 AND branch_id=$5 RETURNING id`,[body,conversationId,tenantId,accountId,branchId]);
   if(updated.rowCount!==1)throw Error('MIRROR_CONTEXT_CHANGED');
   const inserted=await c.query(`INSERT INTO whatsapp_messages(conversation_id,tenant_id,account_id,meta_message_id,direction,sender_type,sender_id,message_type,body,template_name,status,created_at) VALUES($1,$2,$3,$4,'outbound','system',$5,$8,$6,$7,'sent',now()) ON CONFLICT(meta_message_id) DO NOTHING RETURNING id`,[conversationId,tenantId,accountId,messageId,userId,body,templateName,messageType]);
   if(inserted.rowCount!==1)throw Error('MIRROR_MESSAGE_ID_CONCURRENT_CONFLICT');
   await c.query('COMMIT');return{conversationId};
  }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
 };
}
module.exports={createVerifiedMessageMirror};
