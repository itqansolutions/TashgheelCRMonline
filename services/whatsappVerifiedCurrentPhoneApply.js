'use strict';
const {canonicalPhone,findPhoneConversation}=require('./whatsappVerifiedPhoneIdentity');
// Transaction participant only. Never starts/commits a transaction or sends.
// Current-phone text projection; no customer lookup/merge, no BSUID conversion,
// media/edit replacement, unread inflation or bot/session dispatch.
async function applyCurrentPhoneEvent({client:c,work,event}){
 if(event.kind==='message_status'){
  await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['wa-message:'+event.messageId]);
  const r=await c.query('SELECT m.id,m.status,m.direction,v.branch_id FROM whatsapp_messages m JOIN whatsapp_conversations v ON v.id=m.conversation_id AND v.tenant_id=m.tenant_id AND v.account_id=m.account_id WHERE m.meta_message_id=$1 AND m.tenant_id=$2 AND m.account_id=$3 FOR UPDATE OF m,v',[event.messageId,work.tenant_id,work.account_id]);
  if(r.rowCount===0){
   const collision=await c.query('SELECT 1 FROM whatsapp_messages WHERE meta_message_id=$1',[event.messageId]);
   if(collision.rowCount)throw Error('CRM_STATUS_FOREIGN_OR_ORPHAN_TARGET');
   return{deferred:true,reason:'STATUS_AWAITING_EXACT_OUTBOUND_TARGET'};
  }
  if(r.rowCount!==1||r.rows[0].branch_id!==work.branch_id||r.rows[0].direction!=='outbound')throw Error('CRM_STATUS_TARGET_REQUIRES_RECONCILIATION');
  const prior=r.rows[0],rank={sent:1,delivered:2,read:3};
  // Failures/deletions stay durable facts, not invented destructive semantics.
  if(rank[event.status]&&rank[event.status]>(rank[prior.status]||0))await c.query('UPDATE whatsapp_messages SET status=$2 WHERE id=$1',[prior.id,event.status]);
  return{projected:true};
 }
 if(event.kind==='contact_state')return{projected:false,sidecarOnly:true};
 if(event.kind!=='message'||!['text','interactive'].includes(event.messageType))throw Error('CRM_EVENT_NOT_QUALIFIED');
 const phone=canonicalPhone(event.peer?.phone);
 await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['wa-message:'+event.messageId]);
 const resolved=await findPhoneConversation({client:c,tenantId:work.tenant_id,accountId:work.account_id,branchId:work.branch_id,phone});
 let conversationId=resolved.conversation?.id;
 if(!conversationId){const inserted=await c.query("INSERT INTO whatsapp_conversations(tenant_id,branch_id,account_id,phone_number,contact_name,last_message_body,last_message_at,last_message_direction,unread_count) VALUES($1,$2,$3,$4,$4,$5,to_timestamp($6),$7,0) RETURNING id",[work.tenant_id,work.branch_id,work.account_id,phone,event.text,event.timestampSeconds,event.direction]);conversationId=inserted.rows[0].id;}
 const prior=await c.query('SELECT conversation_id,tenant_id,account_id,direction,message_type,body FROM whatsapp_messages WHERE meta_message_id=$1',[event.messageId]);
 if(prior.rowCount){const p=prior.rows[0];if(p.conversation_id!==conversationId||p.tenant_id!==work.tenant_id||p.account_id!==work.account_id||p.direction!==event.direction||p.message_type!==event.messageType||p.body!==event.text)throw Error('CRM_MESSAGE_CONTEXT_CONFLICT');return{projected:true,replayed:true,conversationId};}
 await c.query("INSERT INTO whatsapp_messages(conversation_id,tenant_id,account_id,meta_message_id,direction,sender_type,message_type,body,status,created_at) VALUES($1,$2,$3,$4,$5,$6,$10,$7,$8,to_timestamp($9))",[conversationId,work.tenant_id,work.account_id,event.messageId,event.direction,event.direction==='inbound'?'customer':'system',event.text,event.direction==='inbound'?'received':'sent',event.timestampSeconds,event.messageType]);
 await c.query('UPDATE whatsapp_conversations SET last_message_body=$2,last_message_at=to_timestamp($3),last_message_direction=$4,updated_at=now() WHERE id=$1 AND (last_message_at IS NULL OR last_message_at<=to_timestamp($3))',[conversationId,event.text,event.timestampSeconds,event.direction]);
 return{projected:true,conversationId};
}
module.exports={applyCurrentPhoneEvent};
