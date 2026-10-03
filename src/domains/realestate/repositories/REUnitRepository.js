const BaseRepository = require('../../../shared/repositories/BaseRepository');

/**
 * 🏬 REUnitRepository
 * Data access encapsulation for `re_units` table.
 */
class REUnitRepository extends BaseRepository {
    constructor() {
        super('re_units', 'id');
    }

    /**
     * Updates reservation status and expiration date
     */
    async updateReservation(tenantId, unitId, status, expirationDate = null) {
        const query = `
            UPDATE re_units 
            SET status = $1, reservation_expires_at = $2, updated_at = CURRENT_TIMESTAMP
            WHERE id::text = $3::text AND tenant_id::text = $4::text
            RETURNING *
        `;
        const result = await this.db.query(query, [status, expirationDate, String(unitId), String(tenantId)]);
        return result.rows[0] || null;
    }

    /**
     * Atomically locks the unit row and reserves it within a transaction.
     */
    async reserveWithLock(tenantId, unitId, expirationDate = null) {
        const client = await this.db.connect();
        try {
            await client.query('BEGIN');

            const lockRes = await client.query(
                `SELECT * FROM re_units 
                 WHERE id::text = $1::text AND tenant_id::text = $2::text 
                 FOR UPDATE`,
                [String(unitId), String(tenantId)]
            );

            if (lockRes.rows.length === 0) {
                await client.query('ROLLBACK');
                const err = new Error('Property unit not found.');
                err.status = 404;
                throw err;
            }

            const unit = lockRes.rows[0];
            if (unit.status !== 'Available') {
                await client.query('ROLLBACK');
                const err = new Error(`Unit is already ${unit.status}. Please select an Available unit.`);
                err.status = 400;
                throw err;
            }

            const updateRes = await client.query(
                `UPDATE re_units 
                 SET status = 'Reserved', 
                     reservation_expires_at = $1,
                     reservation_extended_at = NULL,
                     reservation_extended_by = NULL,
                     reservation_extension_count = 0,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE id::text = $2::text AND tenant_id::text = $3::text
                 RETURNING *`,
                [expirationDate, String(unitId), String(tenantId)]
            );

            await client.query('COMMIT');
            return updateRes.rows[0];
        } catch (err) {
            await client.query('ROLLBACK').catch(() => {});
            throw err;
        } finally {
            client.release();
        }
    }
}

module.exports = new REUnitRepository();
