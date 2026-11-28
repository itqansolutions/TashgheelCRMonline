-- Rollback for 033. Data-preserving by design: the QR tables only hold pairing
-- state, but dropping them unlinks every QR number, so run only after unlinking
-- accounts from the UI (or accept that each number must be re-scanned).
-- Accounts are kept; they simply lose their QR status columns' meaning.
DROP TABLE IF EXISTS whatsapp_qr_auth_keys;
DROP TABLE IF EXISTS whatsapp_qr_sessions;
ALTER TABLE whatsapp_accounts DROP COLUMN IF EXISTS qr_status;
ALTER TABLE whatsapp_accounts DROP COLUMN IF EXISTS qr_linked_at;
