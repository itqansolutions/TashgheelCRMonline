const db = require('../../../../config/db');

/**
 * 🔎 GlobalSearchService (HubSpot Style Search Engine)
 * Performs high-performance multi-entity search across all business domains.
 */
class GlobalSearchService {
    /**
     * Executes global search for query term
     * @param {string} tenantId 
     * @param {string} query 
     * @param {Object} [options={}]
     */
    async search(tenantId, query, { limit = 10 } = {}) {
        if (!query || query.trim().length < 2) return { results: [] };

        const searchTerm = `%${query.trim()}%`;
        const tenantStr = String(tenantId);

        try {
            const [customers, deals, invoices, units, tasks] = await Promise.all([
                // 1. Customers
                db.query(`
                    SELECT id, name as title, email as subtitle, 'Customer' as entity_type, '/customers' as link
                    FROM customers 
                    WHERE tenant_id::text = $1 AND (name ILIKE $2 OR email ILIKE $2 OR phone ILIKE $2)
                    LIMIT $3
                `, [tenantStr, searchTerm, limit]),

                // 2. Deals
                db.query(`
                    SELECT id, title, pipeline_stage as subtitle, 'Deal' as entity_type, '/deals' as link
                    FROM deals 
                    WHERE tenant_id::text = $1 AND title ILIKE $2
                    LIMIT $3
                `, [tenantStr, searchTerm, limit]),

                // 3. Invoices
                db.query(`
                    SELECT id, invoice_number as title, status as subtitle, 'Invoice' as entity_type, '/invoices' as link
                    FROM invoices 
                    WHERE tenant_id::text = $1 AND invoice_number ILIKE $2
                    LIMIT $3
                `, [tenantStr, searchTerm, limit]),

                // 4. Real Estate Units
                db.query(`
                    SELECT id, name as title, status as subtitle, 'Property' as entity_type, '/real-estate/units' as link
                    FROM re_units 
                    WHERE tenant_id::text = $1 AND (name ILIKE $2 OR unit_number ILIKE $2 OR project_name ILIKE $2)
                    LIMIT $3
                `, [tenantStr, searchTerm, limit]),

                // 5. Tasks
                db.query(`
                    SELECT id, title, priority as subtitle, 'Task' as entity_type, '/tasks' as link
                    FROM tasks 
                    WHERE tenant_id::text = $1 AND title ILIKE $2
                    LIMIT $3
                `, [tenantStr, searchTerm, limit])
            ]);

            const combined = [
                ...customers.rows,
                ...deals.rows,
                ...invoices.rows,
                ...units.rows,
                ...tasks.rows
            ];

            return {
                query,
                totalMatches: combined.length,
                results: combined
            };
        } catch (err) {
            console.error('❌ [GlobalSearchService] Error:', err.message);
            return { query, totalMatches: 0, results: [] };
        }
    }
}

module.exports = new GlobalSearchService();
