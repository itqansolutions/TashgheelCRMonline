const crypto = require('crypto');

/**
 * 🔐 Server-side AES-256-GCM Field-Level Encryption Utility
 * Securely encrypts secrets at rest with authenticated encryption (GCM).
 * Format: enc:v1:<iv_hex>:<authTag_hex>:<ciphertext_hex>
 */

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit IV recommended for GCM
const TAG_LENGTH = 16; // 128-bit authentication tag

function getMasterKey() {
  const customKey = process.env.ENCRYPTION_KEY;
  if (customKey && customKey.length >= 32) {
    if (customKey.length === 64 && /^[0-9a-fA-F]+$/.test(customKey)) {
      return Buffer.from(customKey, 'hex');
    }
    return crypto.createHash('sha256').update(customKey).digest();
  }
  
  const jwtSecret = process.env.JWT_SECRET || 'tashgheel_crm_default_secure_vault_2026';
  return crypto.createHash('sha256').update(`${jwtSecret}:tashgheel_vault_salt_v1`).digest();
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * @param {string} text - Plaintext to encrypt
 * @returns {string} Formatted ciphertext
 */
function encrypt(text) {
  if (text === null || text === undefined || text === '') {
    return text;
  }
  
  const str = String(text);
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = getMasterKey();
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(str, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  
  return `enc:v1:${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypt a ciphertext string formatted as enc:v1:<iv>:<authTag>:<ciphertext>.
 * If the input is not encrypted, returns as-is for backward compatibility.
 * @param {string} cipherText - Ciphertext to decrypt
 * @returns {string} Plaintext
 */
function decrypt(cipherText) {
  if (!cipherText || typeof cipherText !== 'string') {
    return cipherText;
  }

  if (!cipherText.startsWith('enc:v1:')) {
    return cipherText;
  }

  const parts = cipherText.split(':');
  if (parts.length !== 5) {
    throw new Error('Invalid encrypted payload format');
  }

  const iv = Buffer.from(parts[2], 'hex');
  const authTag = Buffer.from(parts[3], 'hex');
  const encryptedText = parts[4];
  const key = getMasterKey();

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Checks if a string is encrypted in the enc:v1 format.
 * @param {string} text
 * @returns {boolean}
 */
function isEncrypted(text) {
  return typeof text === 'string' && text.startsWith('enc:v1:');
}

/**
 * Masks a secret string for safe UI display (e.g. "••••••••1a2b").
 * Never returns the raw secret.
 * @param {string} secret
 * @returns {string}
 */
function maskSecret(secret) {
  if (!secret) return '';
  const plain = isEncrypted(secret) ? decrypt(secret) : secret;
  if (plain.length <= 4) {
    return '••••••••';
  }
  const last4 = plain.slice(-4);
  return `••••••••${last4}`;
}

module.exports = {
  encrypt,
  decrypt,
  isEncrypted,
  maskSecret
};
