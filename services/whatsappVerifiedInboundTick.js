'use strict';
// Explicit bounded operator tick, no cron, timer or import-time work. Not enabled
// by mounting capture. A separate reviewed runtime integration is still needed.
function createVerifiedInboundTick({pool,env}){
 const {createInboxStager}=require('./whatsappVerifiedInboxStager');
 const {createEventWorkQueue}=require('./whatsappVerifiedEventWorkQueue');
 const {createSidecarConsumer}=require('./whatsappVerifiedSidecarConsumer');
 const {applyCurrentPhoneEvent}=require('./whatsappVerifiedCurrentPhoneApply');
 const stage=createInboxStager({pool}),queue=createEventWorkQueue({pool});
 const consume=createSidecarConsumer({pool,applyProjection:applyCurrentPhoneEvent});
 return async function tick(){
  if(env.WHATSAPP_WEBHOOK_PROCESSING_SUSPENDED==='true'||env.WHATSAPP_VERIFIED_ONBOARDING!=='true'||env.WHATSAPP_VERIFIED_INBOUND_CAPTURE!=='true')return{disabled:true};
  const staged=await stage(),work=await queue.claim();
  if(!work)return{staged,work:null};
  if(work.quarantined)return{staged,workId:work.id,state:'quarantined',claimedReview:true};
  try{return{staged,workId:work.id,...await consume({id:work.id,leaseToken:work.leaseToken})};}
  catch(error){
   // Projection is DB-only and transaction rolled back. Remain conservative on
   // unknown commit outcome: do not automatically retry or resend.
   await queue.settle({id:work.id,leaseToken:work.leaseToken,outcome:'uncertain'});
   return{staged,workId:work.id,state:'quarantined',reason:'CURRENT_PHONE_APPLY_REQUIRES_REVIEW'};
  }
 };
}
module.exports={createVerifiedInboundTick};
