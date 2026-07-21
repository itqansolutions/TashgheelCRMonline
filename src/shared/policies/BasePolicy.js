/**
 * ⚖️ BasePolicy
 * Enforces business permission and domain action rules (e.g. CanReserve, CanCancel, CanRefund).
 */
class BasePolicy {
    /**
     * Helper to evaluate policy rules and throw clear error if failed.
     * @param {boolean} condition 
     * @param {string} errorMessage 
     */
    static enforce(condition, errorMessage = 'Policy violation') {
        if (!condition) {
            const error = new Error(errorMessage);
            error.status = 403;
            error.code = 'POLICY_VIOLATION';
            throw error;
        }
    }
}

module.exports = BasePolicy;
