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
}

module.exports = new REUnitRepository();
