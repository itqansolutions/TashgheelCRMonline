/**
 * WhatsApp QR Link gateway (unofficial WhatsApp Web / multi-device pairing).
 *
 * Second, isolated track next to the official Cloud API + Coexistence module.
 * Nothing here touches metaService, whatsappService, the Meta webhook or the
 * verified-onboarding tables: accounts created here carry
 * connection_type = 'qr_link' and are served by this gateway only.
 *
 * Design notes
 * - Baileys is required lazily so a missing/broken dependency can never stop the
 *   app from booting or serve the rest of the CRM.
 * - Auth credentials and signal keys are stored in Postgres so a Railway
 *   restart/redeploy does not force a re-scan.
 * - Every session is bound to exactly one whatsapp_accounts row, which carries
 *   the tenant. Inbound traffic can only ever write to that tenant.
 */

const db = require('../config/db');

const ACCOUNT_TYPE = 'qr_link';
const SESSIONS = new Map(); // accountId -> { sock, status, qr, phone, startedAt, retry, retryTimer, stopped }
let gatewayStarted = false;
let baileysLib = null;
let schemaPromise = null;

const STATUS = {
  PENDING: 'pending',
  QR_READY: 'qr_ready',
  CONNECTED: 'connected',
  RECONNECTING: 'reconnecting',
  DISCONNECTED: 'disconnected',
  LOGGED_OUT: 'logged_out',
  ERROR: 'error'
};

function isEnabled() {
  // On unless explicitly switched off. Creating a QR account is still an explicit
  // admin action, so a deployed-but-unused module has no effect on anything.
  return String(process.env.ENABLE_WHATSAPP_QR || 'true').toLowerCase() !== 'false';
}

function silentLogger() {
  const noop = () => {};
  const logger = { level: 'silent', trace: noop, debug: noop, info: noop, warn: noop, error: noop, fatal: noop, child: () => logger };
  return logger;
}

async function ensureSchema() {
  if (schemaPromise) return schemaPromise;
  schemaPromise = (async () => {
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT pg_advisory_xact_lock(hashtext('whatsapp_qr_link_schema'))");
      await client.query(`
        CREATE TABLE IF NOT EXISTS whatsapp_qr_sessions (
          account_id INTEGER PRIMARY KEY,
          tenant_id UUID NOT NULL,
          status VARCHAR(30) NOT NULL DEFAULT 'pending',
          qr_data TEXT,
          qr_generated_at TIMESTAMPTZ,
          phone_e164 VARCHAR(30),
          push_name VARCHAR(255),
          last_error TEXT,
          linked_at TIMESTAMPTZ,
          last_seen_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);
      await client.query(`
        CREATE TABLE IF NOT EXISTS whatsapp_qr_auth_keys (
          account_id INTEGER NOT NULL,
          category TEXT NOT NULL,
          key_id TEXT NOT NULL,
          value TEXT NOT NULL,
          updated_at TIMESTAMPTZ DEFAULT NOW(),
          PRIMARY KEY (account_id, category, key_id)
        )
      `);
      const accountsTable = await client.query("SELECT to_regclass('public.whatsapp_accounts') AS t");
      if (accountsTable.rows[0] && accountsTable.rows[0].t) {
        await client.query('ALTER TABLE whatsapp_accounts ADD COLUMN IF NOT EXISTS qr_status VARCHAR(30)');
        await client.query('ALTER TABLE whatsapp_accounts ADD COLUMN IF NOT EXISTS qr_linked_at TIMESTAMPTZ');
      }
      await client.query('COMMIT');
    } catch (err) {
      try { await client.query('ROLLBACK'); } catch (_) { /* ignore */ }
      schemaPromise = null;
      throw err;
    } finally {
      client.release();
    }
  })();
  return schemaPromise;
}

function nodeSupportsBaileys() {
  const major = Number(String(process.versions.node || '0').split('.')[0]);
  return major >= 20;
}

function loadBaileys() {
  if (baileysLib) return baileysLib;
  if (!nodeSupportsBaileys()) {
    const err = new Error(`WhatsApp QR linking needs Node 20 or newer (running ${process.versions.node}).`);
    err.code = 'QR_NODE_TOO_OLD';
    throw err;
  }
  // eslint-disable-next-line global-require
  baileysLib = require('@whiskeysockets/baileys');
  return baileysLib;
}

function toE164(jid) {
  if (!jid) return null;
  const user = String(jid).split('@')[0].split(':')[0];
  const digits = user.replace(/[^0-9]/g, '');
  return digits ? `+${digits}` : null;
}

function toJid(phone) {
  const digits = String(phone || '').replace(/[^0-9]/g, '');
  if (!digits) return null;
  return `${digits}@s.whatsapp.net`;
}

function extractText(message) {
  const m = message || {};
  if (m.conversation) return m.conversation;
  if (m.extendedTextMessage && m.extendedTextMessage.text) return m.extendedTextMessage.text;
  const media = [
    ['imageMessage', '[image]'],
    ['videoMessage', '[video]'],
    ['audioMessage', '[voice note]'],
    ['documentMessage', '[document]'],
    ['stickerMessage', '[sticker]'],
    ['locationMessage', '[location]'],
    ['contactMessage', '[contact]']
  ];
  for (const [key, label] of media) {
    if (m[key]) return m[key].caption || label;
  }
  return '[unsupported message]';
}

function extractType(message) {
  const m = message || {};
  if (m.conversation || m.extendedTextMessage) return 'text';
  if (m.imageMessage) return 'image';
  if (m.videoMessage) return 'video';
  if (m.audioMessage) return 'audio';
  if (m.documentMessage) return 'document';
  if (m.stickerMessage) return 'sticker';
  return 'text';
}

// ---------------------------------------------------------------------------
// Postgres-backed Baileys auth state
// ---------------------------------------------------------------------------
async function readKey(accountId, category, keyId) {
  const res = await db.query(
    'SELECT value FROM whatsapp_qr_auth_keys WHERE account_id = $1 AND category = $2 AND key_id = $3',
    [accountId, category, keyId]
  );
  if (!res.rows.length) return null;
  const { BufferJSON } = loadBaileys();
  try {
    return JSON.parse(res.rows[0].value, BufferJSON.reviver);
  } catch (err) {
    return null;
  }
}

async function writeKey(accountId, category, keyId, value) {
  const { BufferJSON } = loadBaileys();
  await db.query(
    `INSERT INTO whatsapp_qr_auth_keys (account_id, category, key_id, value, updated_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (account_id, category, key_id)
     DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [accountId, category, keyId, JSON.stringify(value, BufferJSON.replacer)]
  );
}

async function clearAuthKeys(accountId) {
  await db.query('DELETE FROM whatsapp_qr_auth_keys WHERE account_id = $1', [accountId]);
}

async function useDbAuthState(accountId) {
  const { initAuthCreds, BufferJSON } = loadBaileys();
  const storedCreds = await readKey(accountId, 'creds', 'creds');
  const creds = storedCreds || initAuthCreds();
  const keys = {
    get: async (type, ids) => {
      const data = {};
      await Promise.all(ids.map(async (id) => {
        let value = await readKey(accountId, type, id);
        if (type === 'app-state-sync-key' && value) {
          const { proto } = loadBaileys();
          value = proto.Message.AppStateSyncKeyData.fromObject(value);
        }
        data[id] = value;
      }));
      return data;
    },
    set: async (data) => {
      const tasks = [];
      for (const category of Object.keys(data)) {
        for (const id of Object.keys(data[category] || {})) {
          const value = data[category][id];
          if (value === null || value === undefined) {
            tasks.push(db.query(
              'DELETE FROM whatsapp_qr_auth_keys WHERE account_id = $1 AND category = $2 AND key_id = $3',
              [accountId, category, id]
            ));
          } else {
            tasks.push(writeKey(accountId, category, id, value));
          }
        }
      }
      await Promise.all(tasks);
    }
  };
  const saveCreds = async () => {
    await writeKey(accountId, 'creds', 'creds', creds);
  };
  // BufferJSON is imported for parity with Baileys' own file state; JSON.stringify
  // above already handles Buffer revival through BufferJSON.replacer.
  void BufferJSON;
  return { state: { creds, keys }, saveCreds };
}

// ---------------------------------------------------------------------------
// Session bookkeeping
// ---------------------------------------------------------------------------
async function setSession(accountId, patch) {
  const fields = Object.keys(patch);
  if (!fields.length) return;
  const sets = fields.map((f, i) => `${f} = $${i + 2}`).join(', ');
  const values = fields.map((f) => patch[f]);
  await db.query(
    `UPDATE whatsapp_qr_sessions SET ${sets}, updated_at = NOW() WHERE account_id = $1`,
    [accountId, ...values]
  );
}

async function getSessionRow(accountId) {
  const res = await db.query('SELECT * FROM whatsapp_qr_sessions WHERE account_id = $1', [accountId]);
  return res.rows[0] || null;
}

async function getAccount(accountId) {
  const res = await db.query(
    `SELECT id, tenant_id, branch_id, label, display_phone_number, verified_name, is_active,
            COALESCE(connection_type, 'cloud_api') AS connection_type
     FROM whatsapp_accounts WHERE id = $1`,
    [accountId]
  );
  return res.rows[0] || null;
}

// ---------------------------------------------------------------------------
// Connection lifecycle
// ---------------------------------------------------------------------------
async function connect(accountId, options = {}) {
  await ensureSchema();
  const id = Number(accountId);
  if (!id) throw new Error('account id required');
  const account = await getAccount(id);
  if (!account || account.connection_type !== ACCOUNT_TYPE) {
    throw new Error('Not a QR-linked WhatsApp account');
  }
  if (account.is_active === false) {
    await setSession(id, { status: STATUS.DISCONNECTED, qr_data: null, last_error: 'Account disabled' });
    return null;
  }

  const existing = SESSIONS.get(id);
  if (existing && existing.sock && [STATUS.CONNECTED, STATUS.QR_READY, STATUS.PENDING, STATUS.RECONNECTING].includes(existing.status)) {
    return existing;
  }

  const baileys = loadBaileys();
  const {
    default: makeWASocket,
    DisconnectReason,
    fetchLatestBaileysVersion,
    Browsers,
    makeCacheableSignalKeyStore,
    proto
  } = baileys;
  void proto;
  const QRCode = require('qrcode');

  let version;
  try {
    const latest = await fetchLatestBaileysVersion();
    version = latest && latest.version;
  } catch (_) {
    version = undefined;
  }

  const { state, saveCreds } = await useDbAuthState(id);
  const logger = silentLogger();

  const sock = makeWASocket({
    version,
    logger,
    printQRInTerminal: false,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger)
    },
    browser: Browsers.ubuntu('Chrome'),
    syncFullHistory: false,
    shouldSyncHistoryMessage: () => false,
    markOnlineOnConnect: false,
    generateHighQualityLinkPreview: false,
    getMessage: async () => undefined
  });

  const session = {
    sock,
    status: STATUS.PENDING,
    qr: null,
    phone: null,
    retry: 0,
    retryTimer: null,
    stopped: false
  };
  SESSIONS.set(id, session);

  const scheduleReconnect = (delayMs) => {
    if (session.stopped) return;
    if (session.retryTimer) clearTimeout(session.retryTimer);
    session.retryTimer = setTimeout(() => {
      session.retryTimer = null;
      connect(id).catch((err) => console.error('[WhatsAppQR] reconnect failed', err.message));
    }, delayMs);
    if (session.retryTimer.unref) session.retryTimer.unref();
  };

  sock.ev.on('creds.update', () => {
    saveCreds().catch((err) => console.error('[WhatsAppQR] saveCreds failed', err.message));
  });

  sock.ev.on('connection.update', async (update) => {
    try {
      const { connection, lastDisconnect, qr } = update || {};
      if (qr) {
        const dataUrl = await QRCode.toDataURL(qr, { margin: 1, width: 320 });
        session.qr = dataUrl;
        session.status = STATUS.QR_READY;
        await setSession(id, {
          status: STATUS.QR_READY,
          qr_data: dataUrl,
          qr_generated_at: new Date(),
          last_error: null
        });
        await db.query("UPDATE whatsapp_accounts SET qr_status = $2, updated_at = NOW() WHERE id = $1", [id, STATUS.QR_READY]);
      }

      if (connection === 'open') {
        const phone = toE164(sock.user && sock.user.id);
        const pushName = (sock.user && (sock.user.name || sock.user.verifiedName)) || null;
        session.status = STATUS.CONNECTED;
        session.qr = null;
        session.phone = phone;
        session.retry = 0;
        await setSession(id, {
          status: STATUS.CONNECTED,
          qr_data: null,
          phone_e164: phone,
          push_name: pushName,
          linked_at: new Date(),
          last_seen_at: new Date(),
          last_error: null
        });
        await db.query(
          `UPDATE whatsapp_accounts
              SET display_phone_number = COALESCE($2, display_phone_number),
                  verified_name = COALESCE($3, verified_name),
                  qr_status = $4,
                  qr_linked_at = NOW(),
                  is_active = TRUE,
                  updated_at = NOW()
            WHERE id = $1`,
          [id, phone, pushName, STATUS.CONNECTED]
        );
        console.log(`[WhatsAppQR] account ${id} connected as ${phone}`);
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect && lastDisconnect.error && lastDisconnect.error.output
          ? lastDisconnect.error.output.statusCode
          : null;
        const loggedOut = statusCode === DisconnectReason.loggedOut;
        session.qr = null;
        if (loggedOut) {
          session.status = STATUS.LOGGED_OUT;
          session.stopped = true;
          await clearAuthKeys(id);
          await setSession(id, { status: STATUS.LOGGED_OUT, qr_data: null, last_error: 'Device unlinked from the phone' });
          await db.query("UPDATE whatsapp_accounts SET qr_status = $2, updated_at = NOW() WHERE id = $1", [id, STATUS.LOGGED_OUT]);
          SESSIONS.delete(id);
        } else {
          session.status = STATUS.RECONNECTING;
          session.retry = Math.min((session.retry || 0) + 1, 6);
          const delay = Math.min(5000 * session.retry, 60000);
          await setSession(id, {
            status: STATUS.RECONNECTING,
            qr_data: null,
            last_error: lastDisconnect && lastDisconnect.error ? String(lastDisconnect.error.message || lastDisconnect.error) : 'Connection closed'
          });
          scheduleReconnect(delay);
        }
      }
    } catch (err) {
      console.error('[WhatsAppQR] connection.update handler failed', err.message);
    }
  });

  sock.ev.on('messages.upsert', async (event) => {
    try {
      if (!event || event.type !== 'notify') return;
      for (const msg of event.messages || []) {
        await handleIncomingMessage(id, account.tenant_id, msg);
      }
    } catch (err) {
      console.error('[WhatsAppQR] messages.upsert handler failed', err.message);
    }
  });

  await setSession(id, { status: STATUS.PENDING, qr_data: null, last_error: null }).catch(() => {});
  return session;
}

async function handleIncomingMessage(accountId, tenantId, msg) {
  if (!msg || !msg.key) return;
  const remoteJid = msg.key.remoteJid || '';
  if (!remoteJid || remoteJid === 'status@broadcast' || remoteJid.endsWith('@g.us') || remoteJid.endsWith('@broadcast')) {
    return; // groups/channels/status are out of scope for this first increment
  }
  if (msg.message && (msg.message.protocolMessage || msg.message.reactionMessage || msg.message.senderKeyDistributionMessage)) return;

  const phone = toE164(remoteJid);
  if (!phone) return;
  const messageId = msg.key.id;
  if (!messageId) return;

  const body = extractText(msg.message);
  const messageType = extractType(msg.message);
  const direction = msg.key.fromMe ? 'outbound' : 'inbound';
  const tsSeconds = Number(msg.messageTimestamp) || Math.floor(Date.now() / 1000);
  const createdAt = new Date(tsSeconds * 1000);
  const contactName = !msg.key.fromMe ? (msg.pushName || null) : null;

  const convRes = await db.query(
    `INSERT INTO whatsapp_conversations (
        tenant_id, account_id, phone_number, contact_name, last_message_body,
        last_message_at, last_message_direction, unread_count
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (tenant_id, phone_number, account_id)
     DO UPDATE SET
        contact_name = COALESCE(EXCLUDED.contact_name, whatsapp_conversations.contact_name),
        last_message_body = EXCLUDED.last_message_body,
        last_message_at = GREATEST(whatsapp_conversations.last_message_at, EXCLUDED.last_message_at),
        last_message_direction = EXCLUDED.last_message_direction,
        unread_count = CASE WHEN EXCLUDED.last_message_direction = 'inbound'
                            THEN COALESCE(whatsapp_conversations.unread_count, 0) + 1
                            ELSE whatsapp_conversations.unread_count END,
        updated_at = NOW()
     RETURNING id`,
    [tenantId, accountId, phone, contactName, body, createdAt, direction, direction === 'inbound' ? 1 : 0]
  );
  const conversationId = convRes.rows[0].id;

  await db.query(
    `INSERT INTO whatsapp_messages (
        conversation_id, tenant_id, account_id, meta_message_id, direction,
        sender_type, message_type, body, status, created_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'sent', $9)
     ON CONFLICT (meta_message_id) DO NOTHING`,
    [
      conversationId,
      tenantId,
      accountId,
      messageId,
      direction,
      direction === 'inbound' ? 'customer' : 'agent',
      messageType,
      body,
      createdAt
    ]
  );

  await db.query(
    'UPDATE whatsapp_qr_sessions SET last_seen_at = NOW(), updated_at = NOW() WHERE account_id = $1',
    [accountId]
  );
}

// ---------------------------------------------------------------------------
// Public API used by the controller and the CRM send path
// ---------------------------------------------------------------------------
async function sendText({ accountId, toPhone, text }) {
  const id = Number(accountId);
  const session = SESSIONS.get(id);
  if (!session || !session.sock || session.status !== STATUS.CONNECTED) {
    const err = new Error('This WhatsApp number is not connected. Scan the QR code again from WhatsApp settings.');
    err.code = 'QR_NOT_CONNECTED';
    throw err;
  }
  const jid = toJid(toPhone);
  if (!jid) {
    const err = new Error('Invalid recipient phone number');
    err.code = 'QR_BAD_PHONE';
    throw err;
  }
  const sent = await session.sock.sendMessage(jid, { text: String(text) });
  return { id: sent && sent.key ? sent.key.id : null, jid };
}

async function requestPairingCode(accountId, phoneNumber) {
  const id = Number(accountId);
  const session = SESSIONS.get(id) || await connect(id);
  if (!session || !session.sock) throw new Error('Session not available');
  const digits = String(phoneNumber || '').replace(/[^0-9]/g, '');
  if (!digits) throw new Error('Invalid phone number');
  const code = await session.sock.requestPairingCode(digits);
  return code;
}

async function unlink(accountId) {
  const id = Number(accountId);
  const session = SESSIONS.get(id);
  try {
    if (session && session.sock) {
      session.stopped = true;
      if (session.retryTimer) clearTimeout(session.retryTimer);
      await session.sock.logout().catch(() => {});
    }
  } finally {
    SESSIONS.delete(id);
    await clearAuthKeys(id);
    await setSession(id, { status: STATUS.DISCONNECTED, qr_data: null, last_error: null, phone_e164: null });
    await db.query("UPDATE whatsapp_accounts SET qr_status = $2, updated_at = NOW() WHERE id = $1", [id, STATUS.DISCONNECTED]);
  }
  return true;
}

async function stopSession(accountId) {
  const id = Number(accountId);
  const session = SESSIONS.get(id);
  if (session) {
    session.stopped = true;
    if (session.retryTimer) clearTimeout(session.retryTimer);
    try { session.sock.end(undefined); } catch (_) { /* ignore */ }
    SESSIONS.delete(id);
  }
}

async function statusFor(accountId) {
  await ensureSchema();
  const row = await getSessionRow(Number(accountId));
  const session = SESSIONS.get(Number(accountId));
  return {
    status: session ? session.status : (row ? row.status : STATUS.PENDING),
    qr: session && session.qr ? session.qr : (row ? row.qr_data : null),
    qrGeneratedAt: row ? row.qr_generated_at : null,
    phone: (session && session.phone) || (row ? row.phone_e164 : null),
    pushName: row ? row.push_name : null,
    lastError: row ? row.last_error : null,
    linkedAt: row ? row.linked_at : null,
    lastSeenAt: row ? row.last_seen_at : null,
    live: Boolean(session && session.sock)
  };
}

async function createSessionRow(accountId, tenantId) {
  await ensureSchema();
  await db.query(
    `INSERT INTO whatsapp_qr_sessions (account_id, tenant_id, status)
     VALUES ($1, $2, $3)
     ON CONFLICT (account_id) DO UPDATE SET tenant_id = EXCLUDED.tenant_id, updated_at = NOW()`,
    [Number(accountId), tenantId, STATUS.PENDING]
  );
}

async function startGateway() {
  if (gatewayStarted) return;
  if (!isEnabled()) {
    console.log('[WhatsAppQR] disabled by ENABLE_WHATSAPP_QR=false');
    return;
  }
  gatewayStarted = true;
  try {
    loadBaileys();
  } catch (err) {
    console.error('[WhatsAppQR] Baileys unavailable, QR track stays idle:', err.message);
    return;
  }
  try {
    await ensureSchema();
    const res = await db.query(
      `SELECT a.id, a.tenant_id
         FROM whatsapp_accounts a
         JOIN whatsapp_qr_sessions s ON s.account_id = a.id
        WHERE COALESCE(a.connection_type, 'cloud_api') = 'qr_link'
          AND a.is_active IS TRUE
          AND s.status IN ('connected', 'reconnecting', 'pending', 'qr_ready')`
    );
    for (const row of res.rows) {
      connect(row.id).catch((err) => console.error(`[WhatsAppQR] resume ${row.id} failed`, err.message));
      await new Promise((r) => setTimeout(r, 400));
    }
    console.log(`[WhatsAppQR] gateway started, ${res.rows.length} session(s) resumed`);
  } catch (err) {
    console.error('[WhatsAppQR] gateway start failed:', err.message);
  }
}

module.exports = {
  ACCOUNT_TYPE,
  STATUS,
  isEnabled,
  ensureSchema,
  startGateway,
  connect,
  sendText,
  requestPairingCode,
  unlink,
  stopSession,
  statusFor,
  createSessionRow
};
