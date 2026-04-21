const db = require('../config/db');

/**
 * Intelligent Scanner to auto-release expired property reservations.
 * If a unit's reservation expires, the associated Deal is automatically marked as 'lost'.
 */
const scanAndReleaseExpiredReservations = async () => {
    try {
        // 1. Find all expired reserved units
        const expiredUnitsRes = await db.query(`
            SELECT id, tenant_id, branch_id 
            FROM re_units 
            WHERE status = 'Reserved' 
            AND reservation_expires_at IS NOT NULL 
            AND reservation_expires_at < CURRENT_TIMESTAMP
        `);

        if (expiredUnitsRes.rows.length === 0) return;

        const expiredUnitIds = expiredUnitsRes.rows.map(row => row.id);

        console.log(`[ReservationEngine] Found ${expiredUnitIds.length} expired unit(s). Initiating auto-release...`);

        for (const unit of expiredUnitsRes.rows) {
            // Find active deals associated with this unit
            const dealRes = await db.query(`
                SELECT id, title 
                FROM deals 
                WHERE unit_id = $1 
                AND pipeline_stage NOT IN ('won', 'lost')
            `, [unit.id]);

            // Release the unit back to the market
            await db.query(`
                UPDATE re_units 
                SET status = 'Available', reservation_expires_at = NULL 
                WHERE id = $1
            `, [unit.id]);

            // Close the associated deals as 'Lost'
            for (const deal of dealRes.rows) {
                await db.query(`
                    UPDATE deals 
                    SET pipeline_stage = 'lost', updated_at = CURRENT_TIMESTAMP 
                    WHERE id = $1
                `, [deal.id]);

                // Record the action in system logs (Audit Oracle logic simulation)
                await db.query(`
                    INSERT INTO system_logs (tenant_id, branch_id, user_id, action, entity_type, entity_id, details)
                    VALUES ($1, $2, 'SYSTEM', 'AUTO_RELEASE', 'Deal', $3, $4)
                `, [
                    unit.tenant_id, 
                    unit.branch_id, 
                    deal.id, 
                    JSON.stringify({ reason: 'Reservation Expired (Auto-Lost)', unit_id: unit.id })
                ]);
                
                console.log(`[ReservationEngine] Unit ${unit.id} released. Deal ${deal.id} marked as LOST.`);
            }
        }
    } catch (err) {
        console.error('[ReservationEngine] Scanner Error:', err.message);
    }
};

/**
 * Bootstraps the reservation scanner to run in the background.
 * @param {number} intervalMinutes - How often to scan (default: 10 minutes)
 */
const startReservationScanner = (intervalMinutes = 10) => {
    console.log(`♻️ [ReservationEngine] Scanner activated. Polling every ${intervalMinutes} minutes.`);
    
    // Run once immediately on startup (after a slight delay to let DB settle)
    setTimeout(scanAndReleaseExpiredReservations, 10000);

    // Set interval
    setInterval(scanAndReleaseExpiredReservations, intervalMinutes * 60 * 1000);
};

module.exports = {
    startReservationScanner,
    scanAndReleaseExpiredReservations
};
