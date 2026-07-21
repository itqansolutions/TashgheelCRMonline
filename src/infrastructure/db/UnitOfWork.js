const db = require('../../../config/db');

/**
 * 🔄 UnitOfWork (Transaction Manager)
 * Manages atomic PostgreSQL database transactions spanning multiple repositories.
 */
class UnitOfWork {
    /**
     * Executes work inside an isolated database transaction
     * @param {Function} workFn - async (client) => result
     */
    static async execute(workFn) {
        const client = await db.pool.connect();
        try {
            await client.query('BEGIN');
            const result = await workFn(client);
            await client.query('COMMIT');
            return result;
        } catch (err) {
            await client.query('ROLLBACK');
            console.error('❌ [UnitOfWork] Transaction Rollback due to error:', err.message);
            throw err;
        } finally {
            client.release();
        }
    }
}

module.exports = UnitOfWork;
