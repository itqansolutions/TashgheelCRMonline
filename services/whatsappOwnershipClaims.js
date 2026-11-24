'use strict';
// Isolated candidate only. Proof MUST be produced by a private server verifier,
// never copied from req.body or legacy account metadata. No route wiring here.
function createOwnershipClaims({ pool }) {
  const numericId = v => typeof v === 'string' && /^\d+$/.test(v);
  return {
    async reserve({ attemptId, tenantId, userId, branchId = null, proof, persist }) {
      if (!proof || !numericId(proof.phoneId) || !numericId(proof.appId) || !numericId(proof.wabaId) || typeof persist !== 'function') throw Error('INVALID_VERIFIED_INPUT');
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const a = await client.query(`SELECT * FROM whatsapp_onboarding_attempts WHERE id=$1 FOR UPDATE`, [attemptId]);
        const attempt = a.rows[0];
        if (!attempt || attempt.tenant_id !== tenantId || attempt.user_id !== String(userId) || attempt.branch_id !== branchId || attempt.app_id !== proof.appId) throw Error('ATTEMPT_CONTEXT_MISMATCH');
        if(branchId!==null && !(await client.query('SELECT id FROM branches WHERE id::text=$1 AND tenant_id=$2 FOR SHARE',[branchId,tenantId])).rowCount)throw Error('BRANCH_NOT_OWNED');
        // DB clock, not caller time. Never allow an old attempt to reclaim a phone.
        const valid = await client.query(`SELECT expires_at > now() AS fresh FROM whatsapp_onboarding_attempts WHERE id=$1`, [attemptId]);
        if (!valid.rows[0]?.fresh) throw Error('ATTEMPT_EXPIRED');
        if (attempt.status !== 'processing') {
          const prior = await client.query(`SELECT * FROM whatsapp_phone_claims WHERE phone_number_id=$1 AND attempt_id=$2 AND tenant_id=$3 AND app_id=$4 AND waba_id=$5 AND state IN ('reserved','linked')`, [proof.phoneId,attemptId,tenantId,proof.appId,proof.wabaId]);
          if (!prior.rowCount) throw Error('ATTEMPT_ALREADY_USED');
          await client.query('COMMIT');
          return { claim: prior.rows[0], replay: true };
        }
        // A phone stays reserved across inactive/disconnected state. Rebinding
        // requires a separate policy and explicit transition, not this helper.
        const r = await client.query(`INSERT INTO whatsapp_phone_claims(phone_number_id,tenant_id,app_id,waba_id,attempt_id,state,verified_at) VALUES($1,$2,$3,$4,$5,'reserved',now()) ON CONFLICT(phone_number_id) DO UPDATE SET attempt_id=EXCLUDED.attempt_id,state='reserved',verified_at=now(),updated_at=now(),generation=CASE WHEN whatsapp_phone_claims.attempt_id=EXCLUDED.attempt_id THEN whatsapp_phone_claims.generation ELSE whatsapp_phone_claims.generation+1 END WHERE whatsapp_phone_claims.tenant_id=EXCLUDED.tenant_id AND whatsapp_phone_claims.app_id=EXCLUDED.app_id AND whatsapp_phone_claims.waba_id=EXCLUDED.waba_id AND (whatsapp_phone_claims.attempt_id=EXCLUDED.attempt_id OR whatsapp_phone_claims.state='disconnected') RETURNING *`, [proof.phoneId,tenantId,proof.appId,proof.wabaId,attemptId]);
        if (!r.rowCount) throw Error('PHONE_RESERVED');
        // Caller receives same transaction client. Must write account/settings
        // as pending, no network calls, and never use pool.query here.
        await persist(client, r.rows[0]);
        await client.query(`UPDATE whatsapp_onboarding_attempts SET status='reserved',phone_number_id=$2 WHERE id=$1`, [attemptId,proof.phoneId]);
        await client.query('COMMIT');
        return { claim: r.rows[0], replay: false };
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally { client.release(); }
    }
  };
}
module.exports = { createOwnershipClaims };
