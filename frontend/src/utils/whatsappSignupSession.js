// Browser-side coordination only. Server token/asset/tenant proof is mandatory.
// FB.login does not expose a popup handle or session nonce here. Origin/source
// checks cannot prove a message belongs to the same Meta login as its code.
export function isMetaSignupOrigin(origin) {
  try {
    const url = new URL(origin);
    return url.protocol === 'https:' && !url.port &&
      (url.hostname === 'facebook.com' || url.hostname.endsWith('.facebook.com'));
  } catch { return false; }
}

export function createSignupAttempt({ onReady, onStop, selfWindow, setTimer = setTimeout, clearTimer = clearTimeout, timeoutMs = 300000 }) {
  let state = 'waiting';
  let code = null;
  let assets = null;
  let source = null;
  const timer = setTimer(() => stop('timeout'), timeoutMs);
  function stop(reason) {
    if (state !== 'waiting') return false;
    state = 'stopped';
    code = assets = source = null;
    clearTimer(timer);
    onStop(reason);
    return true;
  }
  function ready() {
    if (state !== 'waiting' || !code || !assets) return;
    state = 'submitted';
    clearTimer(timer);
    const payload = { code, phone_number_id: assets.phone, waba_id: assets.waba };
    code = assets = source = null;
    onReady(payload);
  }
  function message(event) {
    if (state !== 'waiting' || !isMetaSignupOrigin(event.origin) || !event.source || event.source === selfWindow) return false;
    let data;
    try { data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data; } catch { return false; }
    if (!data || data.type !== 'WA_EMBEDDED_SIGNUP') return false;
    if (source && source !== event.source) return false;
    if (data.event === 'CANCEL' || data.event === 'ERROR') {
      stop(data.event.toLowerCase());
      return true;
    }
    if (!['FINISH', 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING'].includes(data.event)) return false;
    const phone = data.data?.phone_number_id;
    const waba = data.data?.waba_id;
    // Meta asset IDs are decimal strings. Never merge partial completion data.
    if (typeof phone !== 'string' || !/^\d+$/.test(phone) || typeof waba !== 'string' || !/^\d+$/.test(waba)) return false;
    if (assets && (assets.phone !== phone || assets.waba !== waba)) { stop('conflict'); return false; }
    source = event.source;
    assets = { phone, waba };
    ready();
    return true;
  }
  function login(response) {
    if (state !== 'waiting') return false;
    const value = response?.authResponse?.code;
    if (typeof value !== 'string' || !value.trim()) { stop('authorization'); return false; }
    if (code && code !== value) { stop('conflict'); return false; }
    code = value;
    ready();
    return true;
  }
  return { message, login, stop, dispose() {
    state = 'disposed';
    code = assets = source = null;
    clearTimer(timer);
  } };
}
