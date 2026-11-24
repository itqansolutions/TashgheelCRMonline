'use strict';
// Called only after webhook raw-body signature and exact claim/app target have
// already been authenticated. No client-controlled tenant or lifecycle event.
function createClaimLifecycle({pool}) {
 return {
 async disconnect({tenantId,phoneId,appId,generation}) {
  const c=await pool.connect();
  try {
   await c.query('BEGIN');
   const r=await c.query(`UPDATE whatsapp_phone_claims SET state='disconnected',generation=generation+1,updated_at=now() WHERE phone_number_id=$1 AND tenant_id=$2 AND app_id=$3 AND generation=$4 AND state IN ('reserved','linked') RETURNING *`,[phoneId,tenantId,appId,generation]);
   if(!r.rowCount)throw Error('LIFECYCLE_GENERATION_OR_BINDING_CHANGED');
   await c.query(`UPDATE whatsapp_accounts SET coexistence_status='disconnected',is_active=false,is_default=false WHERE phone_number_id=$1 AND tenant_id=$2`,[phoneId,tenantId]);
   await c.query(`UPDATE whatsapp_settings SET is_active=false WHERE phone_number_id=$1 AND tenant_id=$2`,[phoneId,tenantId]);
   await c.query('COMMIT');return {state:'disconnected',generation:r.rows[0].generation};
  }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
 }
 };
}
module.exports={createClaimLifecycle};
