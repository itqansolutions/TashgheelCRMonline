'use strict';
const {createHash,timingSafeEqual}=require('crypto');
// Candidate read gate for every outbound sender and webhook resolved target.
// This is not called by legacy services until explicit integration is reviewed.
function createVerifiedBindingReader({pool}) {
 return async function binding({tenantId,phoneId,token,appId,branchId,allowInactive=false}) {
  const r=await pool.query(`SELECT c.tenant_id,c.app_id,c.waba_id,c.state,c.token_sha256,a.id,a.is_active,a.coexistence_status,a.connection_type,a.branch_id,at.branch_id AS verified_branch FROM whatsapp_phone_claims c JOIN whatsapp_accounts a ON a.phone_number_id=c.phone_number_id AND a.tenant_id=c.tenant_id JOIN whatsapp_onboarding_attempts at ON at.id=c.attempt_id WHERE c.phone_number_id=$1 AND (a.branch_id IS NULL OR EXISTS(SELECT 1 FROM branches b WHERE b.id::text=a.branch_id AND b.tenant_id=a.tenant_id))`,[phoneId]);
  if(r.rowCount!==1)throw Error('UNVERIFIED_OR_AMBIGUOUS_BINDING');
  const row=r.rows[0];
  if((branchId===undefined || row.branch_id!==branchId) || row.connection_type!=='coexistence' || row.branch_id!==row.verified_branch || row.tenant_id!==tenantId || row.app_id!==appId || row.state!=='linked' || row.coexistence_status!=='linked' || (!allowInactive&&!row.is_active))throw Error('BINDING_NOT_ACTIVE_FOR_CONTEXT');
  if(token!==undefined){const actual=Buffer.from(createHash('sha256').update(token).digest('hex'));const expected=Buffer.from(row.token_sha256||'');if(actual.length!==expected.length||!timingSafeEqual(actual,expected))throw Error('TOKEN_BINDING_CHANGED');}
  return Object.freeze({accountId:row.id,tenantId:row.tenant_id,appId:row.app_id,wabaId:row.waba_id,phoneId});
 };
}
module.exports={createVerifiedBindingReader};
