'use strict';
// New path only. Caller supplies authoritative source branch and optional exact
// sender account. No implicit cross-branch fallback or client-provided token.
function createVerifiedSenderResolver({pool,appId}) {
 return async function resolve({tenantId,branchId,accountId=null}) {
  if(!tenantId || !branchId || !appId)throw Error('VERIFIED_SENDER_CONTEXT_REQUIRED');
  const r=await pool.query(`SELECT a.id,a.phone_number_id,a.access_token,a.display_phone_number FROM whatsapp_accounts a JOIN whatsapp_phone_claims c ON c.phone_number_id=a.phone_number_id AND c.tenant_id=a.tenant_id JOIN whatsapp_onboarding_attempts at ON at.id=c.attempt_id JOIN branches b ON b.id::text=a.branch_id AND b.tenant_id=a.tenant_id WHERE a.tenant_id=$1 AND a.branch_id=$2 AND c.app_id=$3 AND c.state='linked' AND c.token_sha256=encode(sha256(convert_to(coalesce(a.access_token,''),'UTF8')),'hex') AND a.is_active=true AND a.coexistence_status='linked' AND a.connection_type='coexistence' AND at.branch_id=a.branch_id AND ($4::text IS NULL OR a.id::text=$4) ORDER BY a.id`,[tenantId,branchId,appId,accountId===null?null:String(accountId)]);
  // Only one active candidate can be implicit. Tenant-global default must not
  // silently choose among multiple branch numbers for an automated action.
  if(r.rowCount!==1)throw Error('VERIFIED_SENDER_SELECTION_REQUIRED');
  return {accountId:r.rows[0].id,phoneNumberId:r.rows[0].phone_number_id,accessToken:r.rows[0].access_token};
 };
}
module.exports={createVerifiedSenderResolver};
