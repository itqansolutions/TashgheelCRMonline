'use strict';
// Pure provider-shaped projection. No CRM writes, auto-replies, downloads or lifecycle actions.
// Retain original value in durable inbox. Unsupported variants remain explicit quarantine.
function project(op){
 const value=op.value||{},events=[];
 const identity=(phone,userId)=>({phone:typeof phone==='string'&&/^\+?\d+$/.test(phone)?phone:null,businessScopedId:typeof userId==='string'?userId:null});
 const message=(m,peer,source,direction)=>{
  if(!m||typeof m.id!=='string'||!peer.phone&&!peer.businessScopedId)throw Error('WEBHOOK_MESSAGE_IDENTITY_UNSUPPORTED');
  const timestamp=Number(m.timestamp);if(!Number.isSafeInteger(timestamp)||timestamp<=0)throw Error('WEBHOOK_TIMESTAMP_INVALID');
  const reply=m.type==='interactive'&&(m.interactive?.type==='button_reply'?m.interactive.button_reply:m.interactive?.type==='list_reply'?m.interactive.list_reply:null);
  const interactive=reply&&typeof reply.id==='string'&&typeof reply.title==='string';
  const supported=m.type==='text'&&typeof m.text?.body==='string'||interactive;
  events.push({kind:supported?'message':'quarantine',source,direction,peer,messageId:m.id,timestampSeconds:timestamp,messageType:m.type,text:interactive?reply.title:supported?m.text.body:null,...(interactive?{interactiveData:{id:reply.id,title:reply.title}}:{}),rawMessage:m});
 };
 if(op.field==='messages'){
  for(const m of value.messages||[])message(m,identity(m.from,m.from_user_id),'live_message','inbound');
  for(const status of value.statuses||[]){
   const timestamp=Number(status.timestamp);
   if(typeof status.id!=='string'||!['sent','delivered','read','failed','deleted'].includes(status.status)||!Number.isSafeInteger(timestamp)||timestamp<=0){events.push({kind:'quarantine',source:'message_status',rawStatus:status});continue;}
   events.push({kind:'message_status',messageId:status.id,status:status.status,timestampSeconds:timestamp,peer:identity(status.recipient_id,status.recipient_user_id),rawStatus:status});
  }
 }else if(op.field==='history'){
  for(const chunk of value.history||[]){
   if(Array.isArray(chunk.errors)){events.push({kind:'history_error',errors:chunk.errors});continue;}
   for(const thread of chunk.threads||[]){
    const peer=identity(thread.context?.wa_id||thread.id,thread.context?.user_id);
    for(const m of thread.messages||[]){
     const business=value.metadata?.display_phone_number;
     const direction=m.from_user_id?'inbound':m.from&&business&&m.from.replace(/^\+/,'')===business.replace(/^\+/,'')?'outbound':m.from&&peer.phone&&m.from.replace(/^\+/,'')===peer.phone.replace(/^\+/,'')?'inbound':null;
     if(!direction)throw Error('HISTORY_DIRECTION_UNPROVEN');
     message(m,peer,'history',direction);
    }
   }
  }
  // Separate media update shape is preserved, never treated as a live inbound event.
  for(const m of value.messages||[])events.push({kind:'quarantine',source:'history_media_update',rawMessage:m});
 }else if(op.field==='smb_message_echoes'){
  for(const m of value.message_echoes||[])message(m,identity(m.to,m.to_user_id),'business_app_echo','outbound');
 }else if(op.field==='smb_app_state_sync'){
  for(const state of value.state_sync||[]){
   const peer=identity(state.contact?.phone_number,state.contact?.user_id),timestamp=Number(state.metadata?.timestamp);
   if(state.type!=='contact'||!['add','remove'].includes(state.action)||!peer.businessScopedId||!Number.isSafeInteger(timestamp)||timestamp<=0){events.push({kind:'quarantine',source:'contact_state',rawState:state});continue;}
   const contact=state.contact;
   if(['full_name','first_name','username','parent_user_id'].some(k=>contact[k]!==undefined&&typeof contact[k]!=='string')){events.push({kind:'quarantine',source:'contact_state',rawState:state});continue;}
   events.push({kind:'contact_state',source:'business_app_address_book',action:state.action,peer,timestampSeconds:timestamp,fullName:contact.full_name||null,firstName:contact.first_name||null,username:contact.username||null,parentUserId:contact.parent_user_id||null,rawState:state});
  }
 }else events.push({kind:'quarantine',source:op.field,rawValue:value});
 if(!events.length)events.push({kind:'quarantine',source:op.field,rawValue:value});
 return events;
}
module.exports={project};
