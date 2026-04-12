const { generateDiff } = require('../utils/diffHelper');

/**
 * Standardized System Actions
 */
const ACTIONS = {
  LOGIN: 'LOGIN',
  LOGIN_FAIL: 'LOGIN_FAIL',
  LOGOUT: 'LOGOUT',
  REGISTER: 'REGISTER',
  CREATE: 'CREATE',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',
  STAGE_CHANGE: 'STAGE_CHANGE',
  BILLING: 'BILLING',
  PAYMENT: 'PAYMENT',
  BRANDING_UPDATE: 'BRANDING_UPDATE',
  FILE_UPLOAD: 'FILE_UPLOAD',
  BRANCH_SWITCH: 'BRANCH_SWITCH'
};

/**
 * Log Severity Levels
 */
const LOG_LEVELS = {
  INFO: 'INFO',
  WARNING: 'WARNING',
  CRITICAL: 'CRITICAL'
};

/**
 * Core logging function - Asynchronous and non-blocking
 */
const logAction = async (data) => {
  const { 
    userId, 
    action, 
    entityType, 
    entityId, 
    details, 
    req, 
    level = LOG_LEVELS.INFO,
    tenantId 
  } = data;

  // Run logging in the next tick to avoid blocking the API response
  setImmediate(async () => {
    try {
      const ipAddress = req?.ip || req?.headers['x-forwarded-for'] || 'unknown';
      const userAgent = req?.headers['user-agent'] || 'unknown';
      
      // Attempt to resolve tenant_id if not explicitly provided
      const resolvedTenant = tenantId || req?.user?.tenant_id || '00000000-0000-0000-0000-000000000000';

      await db.query(`
        INSERT INTO system_logs (
          user_id, action, entity_type, entity_id, details, 
          ip_address, user_agent, level, tenant_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [
        userId || req?.user?.id || null, 
        action, 
        entityType, 
        entityId || null, 
        details ? (typeof details === 'string' ? details : JSON.stringify(details)) : null,
        ipAddress,
        userAgent,
        level,
        resolvedTenant
      ]);
    } catch (err) {
      console.error('❌ Failed to write system log:', err.message);
    }
  });
};

/**
 * Helper for CREATE actions
 */
const logCreate = (req, entityType, entityId, details = {}) => {
  logAction({ req, action: ACTIONS.CREATE, entityType, entityId, details, level: LOG_LEVELS.INFO });
};

/**
 * Helper for UPDATE actions (Auto-calculates diff)
 */
const logUpdate = (req, entityType, entityId, oldData, newData) => {
  const diff = generateDiff(oldData, newData);
  if (diff) {
    logAction({ req, action: ACTIONS.UPDATE, entityType, entityId, details: diff, level: LOG_LEVELS.INFO });
  }
};

/**
 * Helper for DELETE actions
 */
const logDelete = (req, entityType, entityId, details = {}, level = LOG_LEVELS.WARNING) => {
  logAction({ req, action: ACTIONS.DELETE, entityType, entityId, details, level });
};

/**
 * Helper for SECURITY actions
 */
const logSecurity = (req, action, details = {}, level = LOG_LEVELS.CRITICAL, userId = null) => {
  logAction({ req, action, userId, details, level });
};

module.exports = {
  logAction,
  logCreate,
  logUpdate,
  logDelete,
  logSecurity,
  ACTIONS,
  LOG_LEVELS
};
