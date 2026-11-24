'use strict';
const { randomUUID, createHash } = require('crypto');
const { createOwnershipClaims } = require('./whatsappOwnershipClaims');
// Dependency-injected workflow candidate. No route/environment or legacy writer
// is enabled by this module. All provider adapters must be server-owned.
function createOnboardingWorkflow({ pool, exchange, verify, subscribe, loadAppPair }) {
  const claims = createOwnershipClaims({ pool });
  const digits = x => typeof x === 'string' && /^\d+$/.test(x);
  async function begin({ tenantId, userId, branchId = null, appId, configId }) {
    if (!tenantId || !userId || !digits(appId) || !digits(configId)) throw Error('INVALID_ATTEMPT_CONTEXT');
    const pair = await loadAppPair({ tenantId, appId, configId });
    if (!pair || pair.appId !== appId || pair.configId !== configId || !pair.appSecret) throw Error('APP_CONFIG_NOT_AUTHORIZED');
    // Caller must have passed explicit integration-management auth and tenant
    // branch policy before this operation. SQL confirms branch ownership too.
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      if (branchId !== null) {
        const branch = await c.query('SELECT id FROM branches WHERE id::text=$1 AND tenant_id=$2', [branchId,tenantId]);
        if (!branch.rowCount) throw Error('BRANCH_NOT_OWNED');
      }
      const attemptId = randomUUID();
      await c.query(`INSERT INTO whatsapp_onboarding_attempts(id,tenant_id,user_id,branch_id,app_id,config_id,expires_at,status) VALUES($1,$2,$3,$4,$5,$6,now()+interval '5 minutes','open')`, [attemptId,tenantId,String(userId),branchId,appId,configId]);
      await c.query('COMMIT');
      return { attemptId, appId, configId };
    } catch(e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
  }
  async function completeImpl({ attemptId, tenantId, userId, branchId = null, code, phoneId, wabaId },operationState) {
    if (!digits(phoneId) || !digits(wabaId) || typeof code !== 'string' || !code.trim()) throw Error('INVALID_COMPLETION');
    // Read context before external work. Reserve rechecks under row lock after
    // provider proof; no network request runs while holding a DB transaction.
    const r = await pool.query(`SELECT *,expires_at>now() AS fresh FROM whatsapp_onboarding_attempts WHERE id=$1`,[attemptId]);
    const a = r.rows[0];
    if (!a || a.tenant_id!==tenantId || a.user_id!==String(userId) || a.branch_id!==branchId || !a.fresh) throw Error('ATTEMPT_CONTEXT_OR_EXPIRY');
    if ((a.status==='linked' || a.status==='reserved') && a.phone_number_id!==phoneId) throw Error('ATTEMPT_ASSET_CHANGED');
    if(a.status==='linked' || a.status==='reserved'){const claim=await pool.query('SELECT waba_id FROM whatsapp_phone_claims WHERE phone_number_id=$1 AND attempt_id=$2',[phoneId,attemptId]);if(claim.rows[0]?.waba_id!==wabaId)throw Error('ATTEMPT_ASSET_CHANGED');}
    if(a.status==='preview'){if(a.phone_number_id!==phoneId || a.preview_waba_id!==wabaId)throw Error('ATTEMPT_ASSET_CHANGED');return {status:'confirmation_required',attemptId,phoneId,displayPhoneNumber:a.preview_display_phone,verifiedName:a.preview_verified_name};}
    if (a.status==='linked' || a.status==='reserved') return resume({attemptId,tenantId,userId,branchId});
    const elected=await pool.query("UPDATE whatsapp_onboarding_attempts SET status='processing' WHERE id=$1 AND status='open' AND expires_at>now() RETURNING id",[attemptId]);
    if(!elected.rowCount) return {status:'processing',attemptId};
    operationState.owns=true;
    const pair = await loadAppPair({tenantId,appId:a.app_id,configId:a.config_id});
    if (!pair || pair.appId!==a.app_id || pair.configId!==a.config_id || !pair.appSecret || !pair.inspectorToken) throw Error('APP_CONFIG_NOT_AUTHORIZED');
    const token = await exchange({code,appId:pair.appId,appSecret:pair.appSecret});
    const proof = await verify({appId:pair.appId,inspectorToken:pair.inspectorToken,businessToken:token,phoneId,wabaId});
    if (proof.appId!==pair.appId || proof.phoneId!==phoneId || proof.wabaId!==wabaId) throw Error('VERIFIER_RESULT_MISMATCH');
    // Store server-verified preview. A browser asset event is not final user
    // intent: one business token may cover multiple numbers. No claim or
    // subscription until an explicit confirmation of the displayed number.
    const savedPreview=await pool.query("UPDATE whatsapp_onboarding_attempts SET status='preview',phone_number_id=$2,preview_waba_id=$3,preview_token=$4,preview_display_phone=$5,preview_verified_name=$6 WHERE id=$1 AND status='processing'",[attemptId,phoneId,wabaId,token,proof.displayPhoneNumber||phoneId,proof.verifiedName||'']);
    if(savedPreview.rowCount!==1)throw Error('PREVIEW_PERSISTENCE_CHANGED');
    return {status:'confirmation_required',attemptId,phoneId,displayPhoneNumber:proof.displayPhoneNumber||phoneId,verifiedName:proof.verifiedName||''};
  }
  async function confirmImpl({attemptId,tenantId,userId,branchId=null,phoneId},operationState) {
    const previous=await pool.query('SELECT *,expires_at>now() AS fresh FROM whatsapp_onboarding_attempts WHERE id=$1',[attemptId]);
    const prior=previous.rows[0];
    if(!prior || prior.tenant_id!==tenantId || prior.user_id!==String(userId) || prior.branch_id!==branchId || prior.phone_number_id!==phoneId)throw Error('PREVIEW_CONFIRMATION_CHANGED_OR_EXPIRED');
    if(prior.status==='linked'||prior.status==='reserved')return resume({attemptId,tenantId,userId,branchId});
    if(prior.status==='processing')return {status:'processing',attemptId};
    const c=await pool.connect();let a;
    try{
      await c.query('BEGIN');
      const r=await c.query("UPDATE whatsapp_onboarding_attempts SET status='processing' WHERE id=$1 AND tenant_id=$2 AND user_id=$3 AND branch_id IS NOT DISTINCT FROM $4 AND phone_number_id=$5 AND status='preview' AND expires_at>now() RETURNING *",[attemptId,tenantId,String(userId),branchId,phoneId]);
      if(!r.rowCount){await c.query('ROLLBACK');return status({attemptId,tenantId,userId,branchId});}
      a=r.rows[0];await c.query('COMMIT');operationState.owns=true;
    }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
    const pair=await loadAppPair({tenantId,appId:a.app_id,configId:a.config_id});
    if(!pair || pair.appId!==a.app_id || pair.configId!==a.config_id || !pair.inspectorToken || !pair.appSecret)throw Error('APP_CONFIG_NOT_AUTHORIZED');
    const token=a.preview_token,wabaId=a.preview_waba_id;
    const proof=await verify({appId:a.app_id,inspectorToken:pair.inspectorToken,businessToken:token,phoneId,wabaId});
    const reserved = await claims.reserve({attemptId,tenantId,userId,branchId,proof,persist:async(c,claim)=>{
      // No legacy row is overwritten or trusted. Explicit migration/reconnect
      // policy must cover it before this candidate can attach existing phones.
      await c.query('UPDATE whatsapp_phone_claims SET token_sha256=$2 WHERE phone_number_id=$1 AND attempt_id=$3',[phoneId,createHash('sha256').update(token).digest('hex'),attemptId]);
      const old = await c.query('SELECT id,tenant_id,connection_type,coexistence_status FROM whatsapp_accounts WHERE phone_number_id=$1',[phoneId]);
      if (old.rowCount && (old.rowCount!==1 || old.rows[0].tenant_id!==tenantId || old.rows[0].connection_type!=='coexistence' || old.rows[0].coexistence_status!=='disconnected')) throw Error('EXISTING_ACCOUNT_REQUIRES_RECONCILIATION');
      if(old.rowCount){
        await c.query("UPDATE whatsapp_accounts SET access_token=$1,branch_id=$2,coexistence_status='pending',is_active=false,is_default=false WHERE id=$3 AND tenant_id=$4",[token,branchId,old.rows[0].id,tenantId]);
        return;
      }
      await c.query(`INSERT INTO whatsapp_accounts(tenant_id,branch_id,phone_number_id,display_phone_number,verified_name,access_token,connection_type,coexistence_status,is_active,is_default) VALUES($1,$2,$3,$4,$5,$6,'coexistence','pending',false,false)`,[tenantId,branchId,phoneId,proof.displayPhoneNumber||phoneId,proof.verifiedName||'',token]);
    }});
    // Claim persists if subscribe fails or result is uncertain. No automatic
    // provider unsubscribe, no other tenant can take ownership during recovery.
    const confirmed = await subscribe({wabaId,accessToken:token});
    if (confirmed!==true) throw Error('SUBSCRIPTION_UNCONFIRMED_PENDING');
    return finish({attemptId,tenantId,phoneId,generation:reserved.claim.generation});
  }
  async function finish({attemptId,tenantId,phoneId,generation}) {
    const c=await pool.connect();
    try {
      await c.query('BEGIN');
      const owned=await c.query('SELECT a.branch_id FROM whatsapp_onboarding_attempts a WHERE a.id=$1 AND a.tenant_id=$2',[attemptId,tenantId]);
      if(!owned.rowCount)throw Error('ATTEMPT_CONTEXT_CHANGED');
      if(owned.rows[0].branch_id!==null && !(await c.query('SELECT id FROM branches WHERE id::text=$1 AND tenant_id=$2 FOR SHARE',[owned.rows[0].branch_id,tenantId])).rowCount)throw Error('BRANCH_NOT_OWNED');
      const r=await c.query(`UPDATE whatsapp_phone_claims SET state='linked',updated_at=now() WHERE phone_number_id=$1 AND tenant_id=$2 AND attempt_id=$3 AND generation=$4 AND state='reserved' RETURNING *`,[phoneId,tenantId,attemptId,generation]);
      if (!r.rowCount) {
        const prior=await c.query("SELECT 1 FROM whatsapp_phone_claims WHERE phone_number_id=$1 AND tenant_id=$2 AND attempt_id=$3 AND generation=$4 AND state='linked'",[phoneId,tenantId,attemptId,generation]);
        if(!prior.rowCount)throw Error('CLAIM_GENERATION_CHANGED');
        await c.query('COMMIT');return {phoneId,status:'linked'};
      }
      const account=await c.query(`UPDATE whatsapp_accounts SET coexistence_status='linked',is_active=true WHERE phone_number_id=$1 AND tenant_id=$2 AND branch_id IS NOT DISTINCT FROM (SELECT branch_id FROM whatsapp_onboarding_attempts WHERE id=$3)`,[phoneId,tenantId,attemptId]);
      if(account.rowCount!==1)throw Error('ACCOUNT_CONTEXT_CHANGED');
      await c.query(`UPDATE whatsapp_onboarding_attempts SET status='linked',preview_token=NULL WHERE id=$1 AND tenant_id=$2`,[attemptId,tenantId]);
      await c.query('COMMIT');
      return {phoneId,status:'linked'};
    } catch(e) {await c.query('ROLLBACK');throw e;}finally{c.release();}
  }
  async function resume({attemptId,tenantId,userId,branchId=null}) {
    const r=await pool.query(`SELECT a.*,a.expires_at>now() AS fresh,c.app_id AS claimed_app,c.waba_id AS claimed_waba,c.phone_number_id AS claimed_phone,c.generation,c.state,p.access_token FROM whatsapp_onboarding_attempts a JOIN whatsapp_phone_claims c ON c.attempt_id=a.id AND c.tenant_id=a.tenant_id JOIN whatsapp_accounts p ON p.phone_number_id=c.phone_number_id AND p.tenant_id=c.tenant_id WHERE a.id=$1`,[attemptId]);
    const a=r.rows[0];
    if (!a || a.tenant_id!==tenantId || a.user_id!==String(userId) || a.branch_id!==branchId) throw Error('RESUME_CONTEXT_MISMATCH');
    if (a.status==='linked' && a.state==='linked') return {phoneId:a.claimed_phone,status:'linked'};
    if (!a.fresh) throw Error('RESUME_EXPIRED_REAUTH_REQUIRED');
    if (branchId!==null && !(await pool.query('SELECT id FROM branches WHERE id::text=$1 AND tenant_id=$2',[branchId,tenantId])).rowCount) throw Error('BRANCH_NOT_OWNED');
    const pair=await loadAppPair({tenantId,appId:a.app_id,configId:a.config_id});
    if(!pair || pair.appId!==a.claimed_app || pair.configId!==a.config_id || !pair.appSecret || !pair.inspectorToken) throw Error('APP_CONFIG_NOT_AUTHORIZED');
    await verify({appId:pair.appId,inspectorToken:pair.inspectorToken,businessToken:a.access_token,phoneId:a.claimed_phone,wabaId:a.claimed_waba});
    if (a.status!=='reserved' || a.state!=='reserved') throw Error('RESUME_STATE_CHANGED');
    if (await subscribe({wabaId:(await pool.query('SELECT waba_id FROM whatsapp_phone_claims WHERE phone_number_id=$1',[a.claimed_phone])).rows[0].waba_id,accessToken:a.access_token})!==true) throw Error('SUBSCRIPTION_UNCONFIRMED_PENDING');
    return finish({attemptId,tenantId,phoneId:a.claimed_phone,generation:a.generation});
  }
  async function complete(args){
    const state={owns:false};try{return await completeImpl(args,state);}catch(error){
      if(!state.owns)throw error;
      // The one-use code may have been consumed. Do not retry exchange. A fresh
      // authorization is required, but never disturb a reserved/linked claim.
      await pool.query("UPDATE whatsapp_onboarding_attempts SET status='failed',preview_token=NULL WHERE id=$1 AND tenant_id=$2 AND user_id=$3 AND branch_id IS NOT DISTINCT FROM $4 AND status='processing' AND NOT EXISTS(SELECT 1 FROM whatsapp_phone_claims WHERE attempt_id=$1)",[args.attemptId,args.tenantId,String(args.userId),args.branchId??null]);
      throw error;
    }
  }
  async function confirm(args){
    const state={owns:false};try{return await confirmImpl(args,state);}catch(error){
      if(!state.owns)throw error;
      // No external mutation has happened before reservation. Keep verified
      // preview for a retry on temporary proof failures, never replay the code.
      const savedPreview=await pool.query("UPDATE whatsapp_onboarding_attempts SET status='preview' WHERE id=$1 AND tenant_id=$2 AND user_id=$3 AND branch_id IS NOT DISTINCT FROM $4 AND status='processing' AND expires_at>now() AND preview_token IS NOT NULL AND NOT EXISTS(SELECT 1 FROM whatsapp_phone_claims WHERE attempt_id=$1)",[args.attemptId,args.tenantId,String(args.userId),args.branchId??null]);
      throw error;
    }
  }
  async function status({attemptId,tenantId,userId,branchId=null}) {
    const r=await pool.query('SELECT status,phone_number_id,preview_display_phone,preview_verified_name,expires_at>now() AS fresh FROM whatsapp_onboarding_attempts WHERE id=$1 AND tenant_id=$2 AND user_id=$3 AND branch_id IS NOT DISTINCT FROM $4',[attemptId,tenantId,String(userId),branchId]);
    const a=r.rows[0];if(!a)throw Error('ATTEMPT_CONTEXT_MISMATCH');
    if(!a.fresh && a.status!=='linked')return {status:'expired',attemptId};
    if(a.status==='preview')return {status:'confirmation_required',attemptId,phoneId:a.phone_number_id,displayPhoneNumber:a.preview_display_phone,verifiedName:a.preview_verified_name};
    return {status:a.status,attemptId,phoneId:a.phone_number_id};
  }
  async function cancel({attemptId,tenantId,userId,branchId=null}) {
    const r=await pool.query("UPDATE whatsapp_onboarding_attempts SET status='failed',preview_token=NULL WHERE id=$1 AND tenant_id=$2 AND user_id=$3 AND branch_id IS NOT DISTINCT FROM $4 AND status IN ('open','preview') RETURNING id",[attemptId,tenantId,String(userId),branchId]);
    if(!r.rowCount)throw Error('ATTEMPT_CANNOT_CANCEL_PROVISIONING');
    return {status:'cancelled',attemptId};
  }
  async function expirePreviews() {
    // Dedicated worker entry point. Erases expired temporary credentials only,
    // preserves audit rows and reserved account ownership. Must be scheduled
    // explicitly during approved activation; no deletion or timer on import.
    const r=await pool.query("UPDATE whatsapp_onboarding_attempts SET preview_token=NULL,status=CASE WHEN status IN ('open','processing','preview') THEN 'expired' ELSE status END WHERE expires_at<=now() AND (preview_token IS NOT NULL OR status IN ('open','processing','preview')) RETURNING id");
    return {cleared:r.rowCount};
  }
  return { begin, complete, confirm, resume, status, cancel, expirePreviews };
}
module.exports={createOnboardingWorkflow};
