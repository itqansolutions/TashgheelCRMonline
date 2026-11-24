'use strict';
const {createHash}=require('crypto');
const {createVerifiedWebhookPlanner}=require('./whatsappVerifiedWebhookPlanner');
// Durable capture only. Mounted only behind independent OFF-by-default capture
// qualification flag. No effects dispatcher.
function createVerifiedWebhookInbox({pool,appSecrets}){
 return async function capture({rawBody,signature}){
  const c=await pool.connect();
  try{
   await c.query('BEGIN');
   await c.query("SET LOCAL lock_timeout='3s'");
   await c.query("SET LOCAL statement_timeout='15s'");
   const ops=await createVerifiedWebhookPlanner({pool:c,appSecrets})({rawBody,signature});
   if(!ops.length)throw Error('WEBHOOK_SUPPORTED_TARGET_REQUIRED');
   const appId=ops[0].appId;
   const ordered=[...ops].sort((a,b)=>a.phoneId.localeCompare(b.phoneId));
   for(const op of ordered){
    const claim=await c.query("SELECT phone_number_id FROM whatsapp_phone_claims WHERE phone_number_id=$1 AND tenant_id=$2 AND app_id=$3 AND waba_id=$4 AND generation=$5 AND state='linked' FOR SHARE",[op.phoneId,op.tenantId,op.appId,op.wabaId,op.generation]);
    if(claim.rowCount!==1)throw Error('WEBHOOK_CAPTURE_GENERATION_CHANGED');
   }
   // Account recheck under row lock prevents deactivate/retarget during capture.
   for(const op of ordered){const account=await c.query("SELECT id FROM whatsapp_accounts WHERE id=$1 AND tenant_id=$2 AND branch_id IS NOT DISTINCT FROM $3 AND is_active=true AND connection_type='coexistence' AND coexistence_status='linked' FOR SHARE",[op.accountId,op.tenantId,op.branchId]);if(account.rowCount!==1)throw Error('WEBHOOK_CAPTURE_ACCOUNT_CHANGED');}
   for(const op of ordered){
    if(!op.branchId)throw Error('WEBHOOK_CAPTURE_BRANCH_REQUIRED');
    const branch=await c.query('SELECT id FROM branches WHERE id::text=$1::text AND tenant_id=$2 FOR SHARE',[op.branchId,op.tenantId]);if(branch.rowCount!==1)throw Error('WEBHOOK_CAPTURE_BRANCH_CHANGED');
    const digestCheck=await c.query("SELECT 1 FROM whatsapp_accounts a JOIN whatsapp_phone_claims cl ON a.phone_number_id=cl.phone_number_id AND a.tenant_id=cl.tenant_id WHERE a.id=$1 AND cl.token_sha256=encode(sha256(convert_to(coalesce(a.access_token,''),'UTF8')),'hex')",[op.accountId]);if(digestCheck.rowCount!==1)throw Error('WEBHOOK_CAPTURE_TOKEN_CHANGED');
   }
   const digest=createHash('sha256').update(rawBody).digest('hex');
   const inserted=await c.query("INSERT INTO whatsapp_verified_webhook_inbox(app_id,payload_sha256,raw_payload,operations) VALUES($1,$2,$3,$4) ON CONFLICT(app_id,payload_sha256) DO NOTHING RETURNING id",[appId,digest,rawBody,JSON.stringify(ops)]);
   const r=inserted.rowCount?inserted:await c.query('SELECT id FROM whatsapp_verified_webhook_inbox WHERE app_id=$1 AND payload_sha256=$2',[appId,digest]);
   if(r.rowCount!==1)throw Error('WEBHOOK_CAPTURE_NOT_DURABLE');
   await c.query('COMMIT');return{inboxId:r.rows[0].id,duplicate:!inserted.rowCount};
  }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
 };
}
module.exports={createVerifiedWebhookInbox};
