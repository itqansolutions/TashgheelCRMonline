const db = require('../config/db');
const notificationService = require('./notificationService');

/**
 * Contract Expiry Scanner (Real Estate → Contracts)
 *
 * Reuses the existing notification infrastructure (system_notifications via
 * notificationService) and the background scanner pattern used by the
 * reservation engine. No new notification system is introduced.
 *
 *  - "Expiring soon": end_date within EXPIRY_WARNING_DAYS → one reminder
 *    (flag: expiry_reminder_sent_at)
 *  - "Expired": end_date passed → one notice (flag: expired_notified_at)
 *
 * Recipients: the originating deal owner + tenant managers/admins.
 * Completed / Cancelled contracts are ignored.
 */
const EXPIRY_WARNING_DAYS = 30;

async function notifyContract(row, kind) {
    const daysLeft = Number(row.days_remaining);
    const title = kind === 'expired'
        ? `Contract expired: ${row.contract_number}`
        : `Contract expiring in ${daysLeft} day(s): ${row.contract_number}`;
    const message = kind === 'expired'
        ? `Contract ${row.contract_number} (${row.deal_title || 'Deal #' + row.deal_id}) ended on ${String(row.end_date_txt)}.`
        : `Contract ${row.contract_number} (${row.deal_title || 'Deal #' + row.deal_id}) ends on ${String(row.end_date_txt)}.`;
    const link = `/contracts?deal_id=${row.deal_id}`;
    const metadata = { contract_id: row.id, deal_id: row.deal_id, kind, end_date: row.end_date_txt };

    const recipients = new Set();
    if (row.deal_owner_id) recipients.add(String(row.deal_owner_id));
    try {
        const mgr = await db.query(
            `SELECT id FROM users WHERE tenant_id::text = $1::text AND role IN ('admin', 'manager')`,
            [row.tenant_id]
        );
        mgr.rows.forEach(u => recipients.add(String(u.id)));
    } catch (e) { /* non-fatal */ }

    for (const uid of recipients) {
        await notificationService.notify({
            type: kind === 'expired' ? 'contract_expired' : 'contract_expiring',
            title, message,
            tenant_id: row.tenant_id,
            branch_id: row.branch_id || null,
            user_id: uid,
            link, metadata
        });
    }
}

const scanContractExpiry = async () => {
    try {
        const { ensureContractColumns } = require('../controllers/reContractsController');
        await ensureContractColumns();

        const baseSelect = `
            SELECT rc.id, rc.contract_number, rc.deal_id, rc.tenant_id, rc.branch_id,
                   to_char(rc.end_date, 'YYYY-MM-DD') AS end_date_txt,
                   (rc.end_date - CURRENT_DATE) AS days_remaining,
                   d.title AS deal_title, d.assigned_to AS deal_owner_id
            FROM re_contracts rc
            JOIN deals d ON d.id = rc.deal_id AND d.tenant_id::text = rc.tenant_id::text
            WHERE rc.end_date IS NOT NULL
              AND rc.status NOT IN ('Completed', 'Cancelled')
        `;

        const expiring = await db.query(`${baseSelect}
              AND rc.end_date >= CURRENT_DATE
              AND rc.end_date <= CURRENT_DATE + ${EXPIRY_WARNING_DAYS}
              AND rc.expiry_reminder_sent_at IS NULL`);
        for (const row of expiring.rows) {
            await notifyContract(row, 'expiring');
            await db.query(`UPDATE re_contracts SET expiry_reminder_sent_at = CURRENT_TIMESTAMP WHERE id = $1 AND tenant_id::text = $2::text`, [row.id, row.tenant_id]);
        }

        const expired = await db.query(`${baseSelect}
              AND rc.end_date < CURRENT_DATE
              AND rc.expired_notified_at IS NULL`);
        for (const row of expired.rows) {
            await notifyContract(row, 'expired');
            await db.query(`UPDATE re_contracts SET expired_notified_at = CURRENT_TIMESTAMP WHERE id = $1 AND tenant_id::text = $2::text`, [row.id, row.tenant_id]);
        }

        if (expiring.rows.length || expired.rows.length) {
            console.log(`[ContractExpiry] Reminders: ${expiring.rows.length} expiring, ${expired.rows.length} expired.`);
        }
        return { expiring: expiring.rows.length, expired: expired.rows.length };
    } catch (err) {
        // re_contracts may not exist yet in some environments – non-fatal
        console.warn('[ContractExpiry] Scanner notice:', err.message);
        return { expiring: 0, expired: 0 };
    }
};

const startContractExpiryScanner = (intervalMinutes = 60) => {
    setTimeout(() => { scanContractExpiry(); }, 30 * 1000);
    setInterval(() => { scanContractExpiry(); }, intervalMinutes * 60 * 1000);
    console.log(`[ContractExpiry] Scanner scheduled every ${intervalMinutes} minute(s).`);
};

module.exports = { scanContractExpiry, startContractExpiryScanner, EXPIRY_WARNING_DAYS };
