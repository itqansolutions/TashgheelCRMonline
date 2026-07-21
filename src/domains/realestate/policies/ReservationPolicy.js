const BasePolicy = require('../../../shared/policies/BasePolicy');

/**
 * 🏢 ReservationPolicy
 * Enforces business rules for Real Estate property units.
 */
class ReservationPolicy extends BasePolicy {
    /**
     * Checks if a unit can be reserved
     * @param {Object} unit 
     */
    static canReserve(unit) {
        if (!unit) {
            this.enforce(false, 'Unit does not exist.');
        }
        if (unit.status && unit.status.toLowerCase() === 'reserved') {
            this.enforce(false, 'Unit is already reserved.');
        }
        if (unit.status && unit.status.toLowerCase() === 'sold') {
            this.enforce(false, 'Unit has already been sold.');
        }
        return true;
    }

    /**
     * Checks if a unit can be canceled
     * @param {Object} unit 
     */
    static canCancel(unit) {
        if (!unit) this.enforce(false, 'Unit does not exist.');
        if (unit.status && unit.status.toLowerCase() === 'available') {
            this.enforce(false, 'Unit is not currently reserved or sold.');
        }
        return true;
    }
}

module.exports = ReservationPolicy;
