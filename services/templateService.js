const db = require('../config/db');

/**
 * Fetches the configuration for a tenant's template.
 * @param {string} tenantId - The UUID of the tenant.
 * @returns {Promise<Object>} The configuration object for the template.
 */
async function getTenantTemplate(tenantId) {
  try {
    const tenantResult = await db.query(
      'SELECT template_name FROM tenants WHERE id = $1',
      [tenantId]
    );

    if (tenantResult.rows.length === 0) {
      return {};
    }

    const templateName = tenantResult.rows[0].template_name || 'general';

    const templateResult = await db.query(
      'SELECT config FROM business_templates WHERE name = $1',
      [templateName]
    );

    return templateResult.rows[0]?.config || {};
  } catch (err) {
    console.error('Error fetching tenant template:', err.message);
    return {};
  }
}

module.exports = {
  getTenantTemplate
};
