'use strict';
// Candidate verifier. Caller must supply a complete trusted server app pair and
// a newly exchanged business token. Never put provider responses/secrets in logs.
// No default axios dependency: tests inject a synthetic transport.
function createMetaAssetVerifier({ get, graphVersion = 'v21.0', clock = () => Date.now() }) {
  const digits = value => typeof value === 'string' && /^\d+$/.test(value);
  return async function verify({ appId, inspectorToken, businessToken, phoneId, wabaId }) {
    if (!digits(appId) || !digits(phoneId) || !digits(wabaId) || typeof inspectorToken !== 'string' || !inspectorToken.trim() || typeof businessToken !== 'string' || !businessToken.trim()) throw Error('INVALID_VERIFICATION_INPUT');
    const base = `https://graph.facebook.com/${graphVersion}`;
    const debug = await get(`${base}/debug_token`, { params: { input_token: businessToken }, headers: { Authorization: `Bearer ${inspectorToken}` }, timeout: 15000 });
    const token = debug?.data?.data;
    const now = Math.floor(clock() / 1000);
    if (!token || token.is_valid !== true || token.app_id !== appId) throw Error('TOKEN_APP_MISMATCH_OR_INVALID');
    // 0 is the provider's non-expiring sentinel. Missing or malformed timestamps
    // fail closed in this candidate until token-type contracts are qualified.
    for (const field of ['expires_at', 'data_access_expires_at']) {
      if (!Number.isSafeInteger(token[field]) || token[field] < 0 || (token[field] !== 0 && token[field] <= now)) throw Error('TOKEN_EXPIRED_OR_EXPIRY_UNPROVEN');
    }
    for (const scope of ['whatsapp_business_management', 'whatsapp_business_messaging']) {
      if (!Array.isArray(token.scopes) || !token.scopes.includes(scope)) throw Error('REQUIRED_PERMISSION_MISSING');
    }
    // If provider restricts management permission to named assets, selected WABA
    // must be one. An absent target list is NOT proof of selected WABA ownership.
    for (const scope of ['whatsapp_business_management','whatsapp_business_messaging']) {
      const grants = Array.isArray(token.granular_scopes) ? token.granular_scopes.filter(s => s.scope === scope) : [];
      if (grants.some(s => s.target_ids !== undefined && (!Array.isArray(s.target_ids) || !s.target_ids.every(digits)))) throw Error('MALFORMED_GRANULAR_TARGETS');
      const targeted = grants.filter(s => Array.isArray(s.target_ids));
      if (targeted.length && !targeted.some(s => s.target_ids.includes(wabaId))) throw Error('WABA_NOT_GRANTED');
    }
    const headers = { Authorization: `Bearer ${businessToken}` };
    const phone = await get(`${base}/${phoneId}`, { params: { fields: 'id,display_phone_number,verified_name' }, headers, timeout: 15000 });
    if (phone?.data?.id !== phoneId) throw Error('PHONE_ID_MISMATCH');
    // Page with owned cursor on fixed endpoint, never fetch an arbitrary next URL.
    let after;
    const seen = new Set();
    let listed = false;
    for (let page = 0; page < 20; page++) {
      const response = await get(`${base}/${wabaId}/phone_numbers`, { params: { fields: 'id', limit: 100, ...(after ? { after } : {}) }, headers, timeout: 15000 });
      const body = response?.data;
      if (!Array.isArray(body?.data) || body.data.some(p => !digits(p?.id))) throw Error('MALFORMED_PHONE_LIST');
      if (body.data.some(p => p.id === phoneId)) { listed = true; break; }
      if (!body.paging?.next) break;
      const cursor = body.paging?.cursors?.after;
      if (typeof cursor !== 'string' || !cursor || seen.has(cursor)) throw Error('UNSAFE_OR_REPEATED_PAGE_CURSOR');
      seen.add(cursor);
      after = cursor;
    }
    if (!listed) throw Error('PHONE_NOT_VERIFIED_UNDER_WABA');
    // This is immutable evidence for caller, not yet a persisted tenant claim.
    return Object.freeze({ appId, wabaId, phoneId, checkedAt: clock(), displayPhoneNumber: phone.data.display_phone_number || '', verifiedName: phone.data.verified_name || '' });
  };
}
module.exports = { createMetaAssetVerifier };
