const db = require('../../../config/db');

/**
 * 🏛️ BaseRepository
 * Enforces Tenant and Branch isolation for all database operations.
 */
class BaseRepository {
    /**
     * @param {string} tableName - Target SQL table name
     * @param {string} [primaryKey='id'] - Primary key field name
     */
    constructor(tableName, primaryKey = 'id') {
        this.tableName = tableName;
        this.primaryKey = primaryKey;
        this.db = db;
    }

    /**
     * Returns item by Primary Key, ensuring tenant scope matching
     */
    async findById(tenantId, id) {
        const query = `
            SELECT * FROM ${this.tableName} 
            WHERE ${this.primaryKey}::text = $1::text AND tenant_id::text = $2::text
            LIMIT 1
        `;
        const result = await this.db.query(query, [String(id), String(tenantId)]);
        return result.rows[0] || null;
    }

    /**
     * Finds items filtered by tenant, branch (optional), and custom conditions
     */
    async findMany(tenantId, { branchId = null, limit = 50, offset = 0, orderBy = 'created_at DESC', where = {} } = {}) {
        const params = [String(tenantId)];
        let paramIndex = 2;
        let whereClauses = [`tenant_id::text = $1::text`];

        if (branchId) {
            whereClauses.push(`branch_id::text = $${paramIndex}::text`);
            params.push(String(branchId));
            paramIndex++;
        }

        for (const [key, value] of Object.entries(where)) {
            if (value !== undefined && value !== null) {
                whereClauses.push(`${key} = $${paramIndex}`);
                params.push(value);
                paramIndex++;
            }
        }

        const query = `
            SELECT * FROM ${this.tableName}
            WHERE ${whereClauses.join(' AND ')}
            ORDER BY ${orderBy}
            LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
        `;
        params.push(limit, offset);

        const result = await this.db.query(query, params);
        return result.rows;
    }

    /**
     * Counts items matching tenant and branch criteria
     */
    async count(tenantId, { branchId = null, where = {} } = {}) {
        const params = [String(tenantId)];
        let paramIndex = 2;
        let whereClauses = [`tenant_id::text = $1::text`];

        if (branchId) {
            whereClauses.push(`branch_id::text = $${paramIndex}::text`);
            params.push(String(branchId));
            paramIndex++;
        }

        for (const [key, value] of Object.entries(where)) {
            if (value !== undefined && value !== null) {
                whereClauses.push(`${key} = $${paramIndex}`);
                params.push(value);
                paramIndex++;
            }
        }

        const query = `
            SELECT COUNT(*)::int as total FROM ${this.tableName}
            WHERE ${whereClauses.join(' AND ')}
        `;

        const result = await this.db.query(query, params);
        return result.rows[0]?.total || 0;
    }

    /**
     * Generic Insert method enforcing tenant_id injection
     */
    async insert(tenantId, data, branchId = null) {
        const payload = { ...data, tenant_id: String(tenantId) };
        if (branchId && !payload.branch_id) {
            payload.branch_id = String(branchId);
        }

        const keys = Object.keys(payload);
        const values = Object.values(payload);
        const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');

        const query = `
            INSERT INTO ${this.tableName} (${keys.join(', ')})
            VALUES (${placeholders})
            RETURNING *
        `;

        const result = await this.db.query(query, values);
        return result.rows[0];
    }

    /**
     * Generic Update method enforcing tenant isolation
     */
    async update(tenantId, id, data) {
        const updateKeys = Object.keys(data).filter(k => k !== this.primaryKey && k !== 'tenant_id');
        if (updateKeys.length === 0) return await this.findById(tenantId, id);

        const setClause = updateKeys.map((key, i) => `${key} = $${i + 1}`).join(', ');
        const values = updateKeys.map(k => data[k]);

        const query = `
            UPDATE ${this.tableName}
            SET ${setClause}, updated_at = CURRENT_TIMESTAMP
            WHERE ${this.primaryKey}::text = $${values.length + 1}::text AND tenant_id::text = $${values.length + 2}::text
            RETURNING *
        `;
        values.push(String(id), String(tenantId));

        const result = await this.db.query(query, values);
        return result.rows[0] || null;
    }

    /**
     * Generic Delete enforcing tenant isolation
     */
    async delete(tenantId, id) {
        const query = `
            DELETE FROM ${this.tableName}
            WHERE ${this.primaryKey}::text = $1::text AND tenant_id::text = $2::text
            RETURNING *
        `;
        const result = await this.db.query(query, [String(id), String(tenantId)]);
        return result.rows[0] || null;
    }
}

module.exports = BaseRepository;
