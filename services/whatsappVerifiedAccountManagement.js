'use strict';
function createVerifiedAccountManagement({pool}) {
 return async function manage({tenantId,branchId,accountId,operation}) {
  if(!tenantId || !branchId || !['default','toggle'].includes(operation))throw Error('VERIFIED_ACCOUNT_CONTEXT_REQUIRED');
  const c=await pool.connect();
  try{
   await c.query('BEGIN');
   // One tenant-wide default exists in the current product. Serialize both
   // selected-account operations before any row locks to avoid cross-default
   // races/deadlocks; hash collisions only serialize unrelated tenants.
   await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",['whatsapp-default:'+tenantId]);
   const r=await c.query(`SELECT a.id,a.is_active,a.phone_number_id FROM whatsapp_accounts a JOIN whatsapp_phone_claims cl ON cl.phone_number_id=a.phone_number_id AND cl.tenant_id=a.tenant_id JOIN whatsapp_onboarding_attempts at ON at.id=cl.attempt_id JOIN branches b ON b.id::text=a.branch_id AND b.tenant_id=a.tenant_id WHERE a.id::text=$1 AND a.tenant_id=$2 AND a.branch_id=$3 AND at.branch_id=a.branch_id AND cl.state='linked' AND a.coexistence_status='linked' AND a.connection_type='coexistence' FOR UPDATE OF a,cl`,[String(accountId),tenantId,branchId]);
   if(r.rowCount!==1)throw Error('VERIFIED_ACCOUNT_NOT_MANAGEABLE');
   const a=r.rows[0];
   if(operation==='default'){
    if(!a.is_active)throw Error('VERIFIED_ACCOUNT_INACTIVE');
    // Existing product stores one default per tenant, not one per branch.
    // Clear same-tenant defaults only; do not claim this is branch-local default.
    await c.query('UPDATE whatsapp_accounts SET is_default=(id=$1) WHERE tenant_id=$2',[a.id,tenantId]);
   }else{
    await c.query('UPDATE whatsapp_accounts SET is_active=NOT is_active,is_default=CASE WHEN is_active THEN false ELSE is_default END WHERE id=$1 AND tenant_id=$2',[a.id,tenantId]);
   }
   await c.query('COMMIT');return {id:a.id,status:'updated'};
  }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
 };
}
module.exports={createVerifiedAccountManagement};
