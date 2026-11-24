'use strict';
// Explicit one-shot bounded worker entrypoint. No scheduler is installed here.
// One caller invocation processes at most 20 items. Requires reviewed schema,
// separate feature activation and containment OFF; currently all remain gated.
(async()=>{
 const env=process.env;
 if(env.WHATSAPP_WEBHOOK_PROCESSING_SUSPENDED==='true'||env.WHATSAPP_VERIFIED_ONBOARDING!=='true'||env.WHATSAPP_VERIFIED_INBOUND_CAPTURE!=='true'){console.log(JSON.stringify({disabled:true}));return;}
 const db=require('../../config/db');
 try{

  if(env.WHATSAPP_WEBHOOK_PROCESSING_SUSPENDED==='true'||env.WHATSAPP_VERIFIED_ONBOARDING!=='true'||env.WHATSAPP_VERIFIED_INBOUND_CAPTURE!=='true'){
   console.log(JSON.stringify({disabled:true}));return;
  }
  const tick=require('../../services/whatsappVerifiedInboundTick').createVerifiedInboundTick({pool:db.pool,env});
  let processed=0,awaiting=0,review=0;
  for(let i=0;i<20;i++){
   const result=await tick();
   if(result.disabled)break;
   if(result.workId){processed++;if(result.state==='pending')awaiting++;if(result.state==='quarantined')review++;}
   if(!result.workId&&!result.staged?.staged)break;
  }
  console.log(JSON.stringify({processed,awaitingExactTarget:awaiting,manualReview:review,providerReplay:false}));
 }finally{await db.pool.end();}
})().catch(()=>{console.error('Verified inbound worker failed; inspect scoped operations, do not resend provider messages.');process.exitCode=1;});
