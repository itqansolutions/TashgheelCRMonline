const db = require('../config/db');

/**
 * Centralized Enterprise Access & Scope Service
 * 
 * Rules:
 * - Admin: Unrestricted (all records)
 * - Supervising Department Manager: Own department + all child/descendant departments
 * - Department Manager: Own department records
 * - Employee: Strictly own assigned records (assigned_to = user.id)
 */
class AccessScopeService {
  /**
   * Resolves list of accessible department IDs for a user based on role and hierarchy
   * @param {Object} user 
   * @returns {Promise<number[]|null>} null for admin, array of IDs for manager, empty array for employee
   */
  async getAccessibleDepartmentIds(user) {
    if (!user) return [];
    if (user.role === 'admin') return null; // Unrestricted

    try {
      const tenantId = user.tenant_id;
      const userId = user.id;
      const deptId = user.department_id ? parseInt(user.department_id, 10) : null;

      // Check if user is a manager by role OR assigned as direct manager of any department
      const isManagerRole = (user.role === 'manager' || user.role === 'supervisor');
      
      const managedDeptsRes = await db.query(`
        SELECT id FROM departments 
        WHERE tenant_id::text = $1::text 
          AND (manager_id = $2 OR ($3::boolean = TRUE AND id = $4))
      `, [tenantId, userId, isManagerRole, deptId]);

      if (managedDeptsRes.rows.length === 0) {
        // Regular employee: No department-wide scope, strictly personal
        return [];
      }

      const initialDeptIds = managedDeptsRes.rows.map(r => r.id);

      // Recursive CTE to fetch all child/descendant departments
      const treeRes = await db.query(`
        WITH RECURSIVE dept_tree AS (
          SELECT id, parent_department_id FROM departments 
          WHERE id = ANY($1::int[]) AND tenant_id::text = $2::text
          UNION ALL
          SELECT d.id, d.parent_department_id FROM departments d
          JOIN dept_tree dt ON d.parent_department_id = dt.id
          WHERE d.tenant_id::text = $2::text
        )
        SELECT DISTINCT id FROM dept_tree
      `, [initialDeptIds, tenantId]);

      return treeRes.rows.map(r => r.id);
    } catch (err) {
      console.error('[AccessScopeService.getAccessibleDepartmentIds error]:', err.message);
      return [];
    }
  }

  /**
   * Builds parameterized SQL WHERE predicate for row-level scoping
   * @param {Object} options
   * @param {Object} options.user
   * @param {string} options.tableAlias e.g. 'c' for customers, 'd' for deals
   * @param {string} options.assigneeCol e.g. 'assigned_to', 'assigned_user_id'
   * @param {number} options.paramIndex current parameter index ($1, $2, etc.)
   * @returns {Promise<{ sql: string, params: any[], nextParamIndex: number }>}
   */
  async buildScopePredicate({
    user,
    tableAlias = 'c',
    assigneeCol = 'assigned_to',
    paramIndex = 1
  }) {
    if (!user || user.role === 'admin') {
      return { sql: '1=1', params: [], nextParamIndex: paramIndex };
    }

    const accessibleDeptIds = await this.getAccessibleDepartmentIds(user);

    if (accessibleDeptIds && accessibleDeptIds.length > 0) {
      // Department Manager / Supervising Dept Manager
      // Can see records assigned to themselves OR assigned to any user in their accessible departments
      const p1 = paramIndex;
      const p2 = paramIndex + 1;
      const p3 = paramIndex + 2;
      const col = tableAlias ? `${tableAlias}.${assigneeCol}` : assigneeCol;

      const sql = `(${col}::text = $${p1}::text OR ${col} IN (
        SELECT id FROM users 
        WHERE department_id = ANY($${p2}::int[]) 
          AND tenant_id::text = $${p3}::text
      ))`;

      const params = [String(user.id), accessibleDeptIds, String(user.tenant_id)];
      return { sql, params, nextParamIndex: paramIndex + 3 };
    }

    // Regular Employee: Strictly own assigned records
    const p1 = paramIndex;
    const col = tableAlias ? `${tableAlias}.${assigneeCol}` : assigneeCol;
    const sql = `(${col}::text = $${p1}::text)`;
    const params = [String(user.id)];
    return { sql, params, nextParamIndex: paramIndex + 1 };
  }
}

module.exports = new AccessScopeService();
