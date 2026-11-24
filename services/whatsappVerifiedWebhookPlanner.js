'use strict';
const {createHmac,timingSafeEqual}=require('crypto');
// Capture preparation: resolve exact claims
// from signed Meta payload before ANY schema/ingestion/business side effect.
function createVerifiedWebhookPlanner({pool,appSecrets}) {
 return async function plan({rawBody,signature}) {
  if(!Buffer.isBuffer(rawBody) || rawBody.length>4*1024*1024 || typeof signature!=='string' || !/^sha256=[a-f0-9]{64}$/.test(signature))throw Error('WEBHOOK_SIGNATURE_REQUIRED');
  let verifiedApp=null;
  for(const [appId,secret] of Object.entries(appSecrets)){
   if(!secret)continue;const expected=Buffer.from('sha256='+createHmac('sha256',secret).update(rawBody).digest('hex'));const actual=Buffer.from(signature);if(expected.length===actual.length&&timingSafeEqual(expected,actual)){if(verifiedApp)throw Error('AMBIGUOUS_SIGNING_APP');verifiedApp=appId;}
  }
  if(!verifiedApp)throw Error('WEBHOOK_SIGNATURE_INVALID');
  let body;try{body=JSON.parse(rawBody.toString('utf8'));}catch{throw Error('WEBHOOK_JSON_INVALID');}
  if(body?.object!=='whatsapp_business_account'||!Array.isArray(body.entry))throw Error('WEBHOOK_ENVELOPE_INVALID');
  const operations=[];
  for(const entry of body.entry){
   if(typeof entry.id!=='string'||!/^\d+$/.test(entry.id)||!Array.isArray(entry.changes))throw Error('WEBHOOK_ENTRY_INVALID');
   for(const change of entry.changes){
    if(typeof change.field!=='string')throw Error('WEBHOOK_FIELD_INVALID');
    const phone=change.value?.metadata?.phone_number_id;
    const lifecycle=false; // Until independently qualified WABA-wide codec exists, exact phone is mandatory even for lifecycle events.
    if(!lifecycle && (typeof phone!=='string'||!/^\d+$/.test(phone)))throw Error('WEBHOOK_PHONE_REQUIRED');
    const r=await pool.query(`SELECT c.phone_number_id,c.tenant_id,c.app_id,c.waba_id,c.generation,c.state,c.token_sha256,a.access_token,a.id AS account_id,a.branch_id,a.is_active,a.connection_type,a.coexistence_status FROM whatsapp_phone_claims c JOIN whatsapp_accounts a ON a.phone_number_id=c.phone_number_id AND a.tenant_id=c.tenant_id JOIN whatsapp_onboarding_attempts at ON at.id=c.attempt_id WHERE c.app_id=$1 AND c.waba_id=$2 AND ($3::text IS NULL OR c.phone_number_id=$3) AND a.branch_id IS NOT DISTINCT FROM at.branch_id AND (a.branch_id IS NULL OR EXISTS(SELECT 1 FROM branches b WHERE b.id::text=a.branch_id AND b.tenant_id=a.tenant_id))`,[verifiedApp,entry.id,lifecycle?null:phone]);
    if(!r.rowCount || (!lifecycle&&r.rowCount!==1))throw Error('WEBHOOK_TARGET_UNVERIFIED_OR_AMBIGUOUS');
    for(const row of r.rows){
     if(row.token_sha256!==require('crypto').createHash('sha256').update(row.access_token||'').digest('hex'))throw Error('WEBHOOK_TOKEN_BINDING_CHANGED');
     if(row.connection_type!=='coexistence'||row.state!=='linked'||row.coexistence_status!=='linked'||!row.is_active)throw Error('WEBHOOK_TARGET_INACTIVE');
     operations.push(Object.freeze({schemaVersion:1,field:change.field,tenantId:row.tenant_id,accountId:row.account_id,phoneId:row.phone_number_id,appId:verifiedApp,wabaId:row.waba_id,branchId:row.branch_id,generation:row.generation,value:change.value}));
    }
   }
  }
  // Whole batch planned or whole batch throws. Never return partial targets.
  return Object.freeze(operations);
 };
}
module.exports={createVerifiedWebhookPlanner};
