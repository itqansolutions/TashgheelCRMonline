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
            WHERE LOWER(status) = 'reserved' 
            AND reservation_expires_at IS NOT NULL 
            AND reservation_expires_at < CURRENT_TIMESTAMP
        `);

        if (expiredUnitsRes.rows.length === 0) return { releasedCount: 0 };

        const expiredUnitIds = expiredUnitsRes.rows.map(row => row.id);

        console.log(`[ReservationEngine] Found ${expiredUnitIds.length} expired unit(s). Initiating auto-release...`);
        let releasedCount = 0;

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
                SET status = 'Available', 
                    reservation_expires_at = NULL,
                    reservation_extended_at = NULL,
                    reservation_extended_by = NULL,
                    reservation_extension_count = 0,
                    updated_at = CURRENT_TIMESTAMP
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
            releasedCount++;
        }
        return { releasedCount };
    } catch (err) {
        console.error('[ReservationEngine] Scanner Error:', err.message);
        throw err;
    }
};

/**
 * Extends an active reservation for a property unit.
 * Ensures:
 * - Row-level lock (FOR UPDATE) in atomic transaction.
 * - Authorization (admin, manager, or assigned sales rep).
 * - Unit is currently 'Reserved' and reservation has not expired.
 * - Updates reservation_expires_at, tracks who extended it and when.
 * - Emits audit logs.
 */
const extendReservation = async ({ unitId = null, dealId = null, tenantId, branchId = null, user, extensionHours = 24, req = null }) => {
    const client = await db.connect();
    try {
        await client.query('BEGIN');

        let targetUnitId = unitId;
        let targetDeal = null;

        // If dealId provided, resolve the unit and check deal status
        if (dealId) {
            const dealRes = await client.query(
                `SELECT d.*, u.status as unit_status, u.reservation_expires_at 
                 FROM deals d
                 LEFT JOIN re_units u ON d.unit_id::text = u.id::text
                 WHERE d.id = $1 AND d.tenant_id::text = $2::text
                 FOR UPDATE OF d`,
                [dealId, String(tenantId)]
            );

            if (dealRes.rows.length === 0) {
                await client.query('ROLLBACK');
                const err = new Error('Deal not found or unauthorized.');
                err.statusCode = 404;
                throw err;
            }
            targetDeal = dealRes.rows[0];
            if (!targetDeal.unit_id) {
                await client.query('ROLLBACK');
                const err = new Error('This deal is not linked to any property unit.');
                err.statusCode = 400;
                throw err;
            }
            targetUnitId = targetDeal.unit_id;
        }

        // Lock target unit row with SELECT ... FOR UPDATE
        const unitRes = await client.query(
            `SELECT * FROM re_units 
             WHERE id::text = $1::text AND tenant_id::text = $2::text 
             FOR UPDATE`,
            [String(targetUnitId), String(tenantId)]
        );

        if (unitRes.rows.length === 0) {
            await client.query('ROLLBACK');
            const err = new Error('Property unit not found or unauthorized.');
            err.statusCode = 404;
            throw err;
        }

        const unit = unitRes.rows[0];

        // 1. Authorization Check: Admin, Manager, Assigned Sales Rep, or Open Unit
        const isManager = user && ['admin', 'manager', 'sales_manager', 'general_manager'].includes(user.role?.toLowerCase());
        const isAssignedToUnit = user && unit.assigned_to && String(unit.assigned_to) === String(user.id);
        const isAssignedToDeal = user && targetDeal?.assigned_to && String(targetDeal.assigned_to) === String(user.id);
        const isOpenInventory = !unit.assigned_to && (!targetDeal || !targetDeal.assigned_to);

        if (!isManager && !isAssignedToUnit && !isAssignedToDeal && !isOpenInventory) {
            await client.query('ROLLBACK');
            const err = new Error('Unauthorized: Only administrators, managers, or assigned sales agents can extend this reservation.');
            err.statusCode = 403;
            throw err;
        }

        // 2. Unit Status Check: Must be 'Reserved'
        if (unit.status?.toLowerCase() !== 'reserved') {
            await client.query('ROLLBACK');
            const err = new Error(`Cannot extend reservation: Unit is currently ${unit.status}, not Reserved.`);
            err.statusCode = 400;
            throw err;
        }

        // 3. Deal Status Check: If associated with a deal, must not be won or lost
        if (targetDeal && ['won', 'lost'].includes(targetDeal.pipeline_stage?.toLowerCase())) {
            await client.query('ROLLBACK');
            const err = new Error(`Cannot extend reservation: Associated deal is already ${targetDeal.pipeline_stage}.`);
            err.statusCode = 400;
            throw err;
        }

        // 4. Expiration Check: Must still be active, not already expired
        const now = new Date();
        if (unit.reservation_expires_at) {
            const expiryDate = new Date(unit.reservation_expires_at);
            if (expiryDate <= now) {
                await client.query('ROLLBACK');
                const err = new Error('Cannot extend reservation: This reservation has already expired.');
                err.statusCode = 400;
                throw err;
            }
        }

        // 5. Calculate new expiration time (extend from current expiration or now)
        const validHours = Math.max(1, Math.min(720, parseInt(extensionHours) || 24));
        const baseTime = unit.reservation_expires_at ? new Date(unit.reservation_expires_at) : now;
        const newExpiresAt = new Date(baseTime.getTime() + validHours * 60 * 60 * 1000);

        // 6. Update unit atomically
        const updateRes = await client.query(
            `UPDATE re_units 
             SET reservation_expires_at = $1,
                 reservation_extended_at = CURRENT_TIMESTAMP,
                 reservation_extended_by = $2,
                 reservation_extension_count = COALESCE(reservation_extension_count, 0) + 1,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id::text = $3::text AND tenant_id::text = $4::text
             RETURNING *`,
            [newExpiresAt, user ? String(user.id) : null, String(unit.id), String(tenantId)]
        );

        const updatedUnit = updateRes.rows[0];

        // 7. Commit transaction
        await client.query('COMMIT');

        // 8. Log system action & timeline
        try {
            if (req) {
                const { logAction, ACTIONS } = require('./loggerService');
                logAction({
                    req,
                    action: ACTIONS.UPDATE,
                    entityType: 'Unit',
                    entityId: unit.id,
                    details: {
                        action: 'RESERVATION_EXTENDED',
                        hours_added: validHours,
                        previous_expires_at: unit.reservation_expires_at,
                        new_expires_at: newExpiresAt,
                        extended_by_user_id: user ? user.id : 'SYSTEM'
                    }
                });
            }

            if (targetDeal?.id) {
                const { logActivity } = require('../utils/activityLogger');
                await logActivity(tenantId, user, 'deal', targetDeal.id, 'reservation_extended', {
                    hours_added: { to: validHours },
                    new_expires_at: { to: newExpiresAt.toISOString() }
                });
            }
        } catch (logErr) {
            console.warn('[Extend Reservation Log Notice]:', logErr.message);
        }

        return {
            status: 'success',
            success: true,
            message: `Reservation extended successfully by ${validHours} hour(s).`,
            data: {
                unit_id: updatedUnit.id,
                unit_number: updatedUnit.unit_number,
                project_name: updatedUnit.project_name,
                status: updatedUnit.status,
                reservation_expires_at: updatedUnit.reservation_expires_at,
                reservation_extended_at: updatedUnit.reservation_extended_at,
                reservation_extension_count: updatedUnit.reservation_extension_count
            }
        };
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
    } finally {
        client.release();
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
    scanAndReleaseExpiredReservations,
    extendReservation
};
