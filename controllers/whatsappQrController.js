/**
 * WhatsApp QR Link (unofficial pairing) — isolated controller.
 *
 * Every route here is admin-only and only ever touches rows whose
 * connection_type = 'qr_link'. The official Cloud API / Coexistence module keeps
 * its own tables, flags and code paths untouched.
 */
const crypto = require('crypto');
const db = require('../config/db');
const gateway = require('../services/whatsappQrGateway');

const FEATURE_OFF = {
  status: 'error',
  code: 'WHATSAPP_QR_DISABLED',
  message: 'WhatsApp QR linking is switched off on this deployment (ENABLE_WHATSAPP_QR=false).'
};

function guard(req, res) {
  if (!gateway.isEnabled()) {
    res.status(404).json(FEATURE_OFF);
    return false;
  }
  if (!req.user || !req.user.tenant_id) {
    res.status(401).json({ status: 'error', message: 'Tenant context missing' });
    return false;
  }
  return true;
}

async function ensureAccountsTable() {
  // The chat module owns this table; make sure it exists before we insert.
  await db.query(`
    CREATE TABLE IF NOT EXISTS whatsapp_accounts (
      id SERIAL PRIMARY KEY,
      tenant_id UUID,
      branch_id VARCHAR(255),
      phone_number_id VARCHAR(100) NOT NULL,
      display_phone_number VARCHAR(50) NOT NULL,
      verified_name VARCHAR(255),
      label VARCHAR(100),
      access_token TEXT,
      is_default BOOLEAN DEFAULT FALSE,
      is_active BOOLEAN DEFAULT TRUE,
      quality_rating VARCHAR(50),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await db.query("ALTER TABLE whatsapp_accounts ADD COLUMN IF NOT EXISTS connection_type VARCHAR(30) NOT NULL DEFAULT 'cloud_api'");
  await db.query('ALTER TABLE whatsapp_accounts ADD COLUMN IF NOT EXISTS qr_status VARCHAR(30)');
  await db.query('ALTER TABLE whatsapp_accounts ADD COLUMN IF NOT EXISTS qr_linked_at TIMESTAMPTZ');
}

// POST /api/whatsapp/qr/accounts  { label, branch_id }
exports.createAccount = async (req, res) => {
  if (!guard(req, res)) return;
  const tenantId = req.user.tenant_id;
  const label = String(req.body.label || '').trim() || 'WhatsApp QR number';
  const branchId = req.body.branch_id || req.branchId || null;

  try {
    await ensureAccountsTable();
    await gateway.ensureSchema();

    const placeholderId = `qr-${crypto.randomUUID()}`;
    const inserted = await db.query(
      `INSERT INTO whatsapp_accounts
         (tenant_id, branch_id, phone_number_id, display_phone_number, verified_name, label,
          is_default, is_active, connection_type, qr_status)
       VALUES ($1, $2, $3, $4, NULL, $5, FALSE, TRUE, $6, $7)
       RETURNING id, tenant_id, branch_id, label, display_phone_number, connection_type, qr_status, created_at`,
      [tenantId, branchId, placeholderId, 'WhatsApp (QR)', label, gateway.ACCOUNT_TYPE, gateway.STATUS.PENDING]
    );
    const account = inserted.rows[0];
    await gateway.createSessionRow(account.id, tenantId);

    // Kick off pairing in the background; the UI polls for the QR.
    gateway.connect(account.id).catch((err) => {
      console.error('[WhatsAppQR] connect after create failed', err.message);
    });

    res.status(201).json({ status: 'success', data: account });
  } catch (err) {
    console.error('[WhatsAppQR] createAccount', err);
    res.status(500).json({ status: 'error', message: err.message || 'Failed to create QR WhatsApp number' });
  }
};

// GET /api/whatsapp/qr/accounts
exports.listAccounts = async (req, res) => {
  if (!guard(req, res)) return;
  try {
    await ensureAccountsTable();
    await gateway.ensureSchema();
    const result = await db.query(
      `SELECT a.id, a.label, a.branch_id, a.display_phone_number, a.verified_name,
              a.is_active, a.is_default, a.connection_type, a.qr_status, a.qr_linked_at,
              a.created_at, s.status AS session_status, s.phone_e164, s.last_seen_at, s.last_error
         FROM whatsapp_accounts a
         LEFT JOIN whatsapp_qr_sessions s ON s.account_id = a.id
        WHERE a.tenant_id::text = $1::text
          AND COALESCE(a.connection_type, 'cloud_api') = $2
        ORDER BY a.id ASC`,
      [req.user.tenant_id, gateway.ACCOUNT_TYPE]
    );
    res.json({ status: 'success', data: result.rows || [] });
  } catch (err) {
    console.error('[WhatsAppQR] listAccounts', err);
    res.status(500).json({ status: 'error', message: err.message || 'Failed to list QR numbers' });
  }
};

async function loadOwnedAccount(req, res) {
  const resAccount = await db.query(
    `SELECT id, tenant_id, label, display_phone_number, verified_name, is_active,
            COALESCE(connection_type, 'cloud_api') AS connection_type
       FROM whatsapp_accounts
      WHERE id::text = $1::text AND tenant_id::text = $2::text`,
    [String(req.params.id), req.user.tenant_id]
  );
  const account = resAccount.rows[0];
  if (!account || account.connection_type !== gateway.ACCOUNT_TYPE) {
    res.status(404).json({ status: 'error', message: 'QR WhatsApp number not found' });
    return null;
  }
  return account;
}

// GET /api/whatsapp/qr/accounts/:id/status
exports.getStatus = async (req, res) => {
  if (!guard(req, res)) return;
  try {
    await ensureAccountsTable();
    const account = await loadOwnedAccount(req, res);
    if (!account) return;
    const status = await gateway.statusFor(account.id);
    res.json({
      status: 'success',
      data: {
        accountId: account.id,
        label: account.label,
        displayPhoneNumber: account.display_phone_number,
        verifiedName: account.verified_name,
        isActive: account.is_active,
        ...status
      }
    });
  } catch (err) {
    console.error('[WhatsAppQR] getStatus', err);
    res.status(500).json({ status: 'error', message: err.message || 'Failed to read QR status' });
  }
};

// POST /api/whatsapp/qr/accounts/:id/refresh — restart pairing, emits a fresh QR
exports.refreshSession = async (req, res) => {
  if (!guard(req, res)) return;
  try {
    await ensureAccountsTable();
    const account = await loadOwnedAccount(req, res);
    if (!account) return;
    await gateway.stopSession(account.id);
    await gateway.connect(account.id);
    const status = await gateway.statusFor(account.id);
    res.json({ status: 'success', data: status });
  } catch (err) {
    console.error('[WhatsAppQR] refreshSession', err);
    res.status(500).json({ status: 'error', message: err.message || 'Failed to restart QR pairing' });
  }
};

// POST /api/whatsapp/qr/accounts/:id/unlink — remove the device link, keep the account
exports.unlink = async (req, res) => {
  if (!guard(req, res)) return;
  try {
    await ensureAccountsTable();
    const account = await loadOwnedAccount(req, res);
    if (!account) return;
    await gateway.unlink(account.id);
    res.json({ status: 'success', message: 'WhatsApp number unlinked' });
  } catch (err) {
    console.error('[WhatsAppQR] unlink', err);
    res.status(500).json({ status: 'error', message: err.message || 'Failed to unlink WhatsApp number' });
  }
};

// DELETE /api/whatsapp/qr/accounts/:id — unlink and remove the account entirely
exports.deleteAccount = async (req, res) => {
  if (!guard(req, res)) return;
  try {
    await ensureAccountsTable();
    const account = await loadOwnedAccount(req, res);
    if (!account) return;
    await gateway.unlink(account.id).catch(() => {});
    await gateway.ensureSchema();
    await db.query('DELETE FROM whatsapp_qr_auth_keys WHERE account_id = $1', [account.id]);
    await db.query('DELETE FROM whatsapp_qr_sessions WHERE account_id = $1', [account.id]);
    await db.query(
      `DELETE FROM whatsapp_accounts
        WHERE id = $1 AND tenant_id::text = $2::text AND COALESCE(connection_type, 'cloud_api') = $3`,
      [account.id, req.user.tenant_id, gateway.ACCOUNT_TYPE]
    );
    res.json({ status: 'success', message: 'QR WhatsApp number removed' });
  } catch (err) {
    console.error('[WhatsAppQR] deleteAccount', err);
    res.status(500).json({ status: 'error', message: err.message || 'Failed to remove QR WhatsApp number' });
  }
};

// GET /api/whatsapp/qr/health — deployment/runtime facts for verification
exports.health = async (req, res) => {
  if (!gateway.isEnabled()) return res.status(404).json(FEATURE_OFF);
  let schemaOk = false;
  let schemaError = null;
  try {
    await gateway.ensureSchema();
    schemaOk = true;
  } catch (err) {
    schemaError = err.message;
  }
  let baileysVersion = null;
  try {
    // eslint-disable-next-line global-require
    baileysVersion = require('@whiskeysockets/baileys/package.json').version;
  } catch (err) {
    baileysVersion = null;
  }
  res.json({
    status: 'success',
    data: {
      enabled: true,
      nodeVersion: process.version,
      baileysVersion,
      schemaOk,
      schemaError,
      accountType: gateway.ACCOUNT_TYPE
    }
  });
};
