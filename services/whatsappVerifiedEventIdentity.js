'use strict';
const {createHash}=require('crypto');
function canonical(v){if(Array.isArray(v))return'['+v.map(canonical).join(',')+']';if(v&&typeof v==='object')return'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';return JSON.stringify(v);}
function identify(event){
 let immutable,key;
 if(event.kind==='message'){
  key='message:'+event.messageId;
  immutable={kind:event.kind,direction:event.direction,peer:event.peer,messageId:event.messageId,timestampSeconds:event.timestampSeconds,messageType:event.messageType,text:event.text,...(event.interactiveData?{interactiveData:event.interactiveData}:{})};
 }else if(event.kind==='message_status'){
  key='status:'+event.messageId+':'+event.status+':'+event.timestampSeconds;
  immutable=event;
 }else if(event.kind==='contact_state'){
  key='contact:'+event.peer.businessScopedId+':'+event.timestampSeconds;immutable=event;
 }else{immutable=event;key='quarantine:'+createHash('sha256').update(canonical(event)).digest('hex');}
 return{key,digest:createHash('sha256').update(canonical(immutable)).digest('hex')};
}
module.exports={identify};
