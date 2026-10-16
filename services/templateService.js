const db = require('../config/db');

/**
 * Fetches the configuration for a tenant's template.
 * @param {string} tenantId - The UUID of the tenant.
 * @returns {Promise<Object>} The configuration object for the template.
 */
const DEFAULT_TEMPLATE_CONFIGS = {
  general: {
    name: 'General',
    deal_fields: [],
    pipeline: ['Discovery', 'Proposal', 'Negotiation', 'Won', 'Lost'],
    automation_rules: []
  },
  real_estate: {
    name: 'Real Estate',
    deal_fields: [
      { key: 'unit_type', label: 'Unit Type', icon: 'Building2', type: 'text' },
      { key: 'project', label: 'Property Project', icon: 'MapPin', type: 'text' },
      { key: 'price', label: 'Price (Expected)', icon: 'Coins', type: 'number' },
      { key: 'area', label: 'Total Area (m²)', icon: 'Ruler', type: 'number' }
    ],
    pipeline: ['Lead', 'Interested', 'Site Visit', 'Negotiation', 'Closed'],
    automation_rules: []
  }
};

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

    const dbConfig = templateResult.rows[0]?.config || {};
    const defaults = DEFAULT_TEMPLATE_CONFIGS[templateName] || {};

    return {
      ...defaults,
      ...dbConfig,
      pipeline: Array.isArray(dbConfig.pipeline) && dbConfig.pipeline.length > 0
        ? dbConfig.pipeline
        : (defaults.pipeline || []),
      deal_fields: Array.isArray(dbConfig.deal_fields) && dbConfig.deal_fields.length > 0
        ? dbConfig.deal_fields
        : (defaults.deal_fields || [])
    };
  } catch (err) {
    console.error('Error fetching tenant template:', err.message);
    return {};
  }
}

module.exports = {
  getTenantTemplate,
  DEFAULT_TEMPLATE_CONFIGS
};

