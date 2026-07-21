const db = require('../../../config/db');

/**
 * 🚩 FeatureManager
 * Evaluates feature toggles dynamically (e.g. `isEnabled(tenantId, 'ai_recommendations')`)
 */
class FeatureManager {
    /**
     * Checks if feature is enabled for given tenant
     * @param {string} tenantId 
     * @param {string} featureKey - e.g. 'hr', 'inventory', 'automation', 'ai'
     */
    async isEnabled(tenantId, featureKey) {
        if (!tenantId || !featureKey) return false;

        try {
            // Check overrides or tenant active modules
            const result = await db.query(`
                SELECT p.modules 
                FROM subscriptions s
                JOIN plans p ON s.plan_id = p.id
                WHERE s.tenant_id::text = $1::text AND s.status IN ('active', 'trial')
            `, [String(tenantId)]);

            if (result.rows.length === 0) return true; // Legacy fallback

            const modules = typeof result.rows[0].modules === 'string' 
                ? JSON.parse(result.rows[0].modules) 
                : (result.rows[0].modules || {});

            return Boolean(modules[featureKey]);
        } catch (err) {
            console.error('❌ [FeatureManager] Error checking flag:', err.message);
            return true; // Safe fallback
        }
    }
}

module.exports = new FeatureManager();
