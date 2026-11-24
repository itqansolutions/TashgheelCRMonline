'use strict';
// Explicit capture preparation. Existing controller still holds 503 unless both
// onboarding and this separate capture flag are enabled after qualification.
function createVerifiedWebhookHandler({pool,env}){
 return async function handle(req,res){
  if(env.WHATSAPP_WEBHOOK_PROCESSING_SUSPENDED==='true'){res.set('Retry-After','300');return res.status(503).send('WEBHOOK_PROCESSING_SUSPENDED');}
  if(env.WHATSAPP_VERIFIED_ONBOARDING!=='true'||env.WHATSAPP_VERIFIED_INBOUND_CAPTURE!=='true'){res.set('Retry-After','300');return res.status(503).send('VERIFIED_INBOUND_NOT_QUALIFIED');}
  if(!env.META_APP_ID||!env.META_APP_SECRET)return res.status(503).send('VERIFIED_SIGNING_APP_UNAVAILABLE');
  if(!Buffer.isBuffer(req.rawBody))return res.status(400).send('RAW_SIGNED_BODY_REQUIRED');
  try{
   const capture=require('./whatsappVerifiedWebhookInbox').createVerifiedWebhookInbox({pool,appSecrets:{[env.META_APP_ID]:env.META_APP_SECRET}});
   await capture({rawBody:req.rawBody,signature:req.headers['x-hub-signature-256']});
   return res.status(200).send('EVENT_DURABLY_CAPTURED');
  }catch(error){
   if(/SIGNATURE|ENVELOPE|ENTRY_INVALID|JSON_INVALID|PHONE_REQUIRED|FIELD_INVALID/.test(error.message))return res.status(400).send('VERIFIED_EVENT_REJECTED');
   res.set('Retry-After','30');return res.status(503).send('VERIFIED_CAPTURE_NOT_COMMITTED');
  }
 };
}
module.exports={createVerifiedWebhookHandler};
