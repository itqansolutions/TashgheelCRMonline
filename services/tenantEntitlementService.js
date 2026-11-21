const db = require('../config/db');

/**
 * 🏛️ Tenant Entitlement Service
 * Centralized, authoritative manual access and limits management for Tashgheel CRM Online.
 * 
 * Replaces predefined commercial plans (Basic/Pro/Enterprise) with explicit,
 * per-tenant module flags and usage limits configured exclusively by ITQAN administrators.
 */

// 1. Canonical System Modules
const CANONICAL_MODULES = Object.freeze([
  'crm',          // Contacts, leads, pipeline, customer accounts
  'sales',        // Sales orders, sales targets, sales documents
  'finance',      // Invoices, payments, expenses, vouchers, treasury
  'real_estate',  // Units, properties, installments, contracts
  'hr',           // Employees, attendance, shifts, leave
  'inventory',    // Warehouses, balances, item cards, movements
  'purchasing',   // Purchase requests, POs, RFQs, vendor management
  'marketing',    // WhatsApp campaigns & meta forms
  'reports',      // Analytics and operational reporting
  'automation'    // Workflow triggers, rules, auto-actions
]);

// 2. Canonical Limits
const ALLOWED_LIMIT_KEYS = Object.freeze([
  'max_users',
  'max_branches',
  'storage_gb'
]);

// 3. In-Memory Entitlement Cache (TTL: 30 seconds)
const cache = new Map();
const CACHE_TTL_MS = 30 * 1000;

/**
 * Evict a tenant from the local cache immediately upon administrative update.
 * @param {string} tenantId 
 */
function invalidateTenantEntitlements(tenantId) {
  if (tenantId) {
    cache.delete(String(tenantId).toLowerCase());
  }
}

/**
 * Clear the entire entitlement cache.
 */
function clearEntitlementCache() {
  cache.clear();
}

/**
 * Validate module configuration payload.
 * Ensures only known canonical keys are accepted and values are strict booleans.
 * Unknown keys are stripped.
 * 
 * @param {Object} inputModules 
 * @returns {Object} Validated modules map
 */
function validateModules(inputModules) {
  if (!inputModules || typeof inputModules !== 'object') {
    return {};
  }
  const validated = {};
  for (const mod of CANONICAL_MODULES) {
    if (Object.prototype.hasOwnProperty.call(inputModules, mod)) {
      validated[mod] = Boolean(inputModules[mod]);
    } else {
      validated[mod] = false; // Explicit default: unconfigured modules are disabled
    }
  }
  return validated;
}

/**
 * Validate usage limits payload.
 * -1 = Unlimited
 * 0 = Zero additional capacity
 * N > 0 = Maximum permitted capacity
 * 
 * @param {Object} inputLimits 
 * @returns {Object} Validated limits map
 */
function validateLimits(inputLimits) {
  if (!inputLimits || typeof inputLimits !== 'object') {
    return { max_users: 10, max_branches: 1 };
  }
  const validated = {};
  for (const key of ALLOWED_LIMIT_KEYS) {
    if (Object.prototype.hasOwnProperty.call(inputLimits, key)) {
      const val = Number(inputLimits[key]);
      if (!Number.isInteger(val) || (val < 0 && val !== -1)) {
        throw new Error(`Invalid limit for '${key}'. Must be a non-negative integer or -1 for unlimited.`);
      }
      validated[key] = val;
    }
  }
  if (validated.max_users === undefined) validated.max_users = 10;
  if (validated.max_branches === undefined) validated.max_branches = 1;
  return validated;
}

/**
 * Fetch technical entitlements for a tenant.
 * Uses in-memory cache with fallback to database.
 * Fails closed if no record exists or database query fails.
 * 
 * @param {string} tenantId 
 * @param {Object} [dbClient=db] 
 * @returns {Promise<{ modules: Object, limits: Object, notes: string|null, isConfigured: boolean }>}
 */
async function getTenantEntitlements(tenantId, dbClient = db) {
  if (!tenantId) {
    return { modules: {}, limits: {}, notes: null, isConfigured: false };
  }

  const normalizedId = String(tenantId).toLowerCase();

  // 1. Check in-memory cache
  const cached = cache.get(normalizedId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  // 2. Query tenant_overrides table
  const query = `
    SELECT modules, limits, notes, updated_at
    FROM tenant_overrides
    WHERE tenant_id::text = $1::text
    LIMIT 1
  `;
  const res = await dbClient.query(query, [tenantId]);

  if (res.rows.length === 0) {
    const unconfigured = {
      modules: {},
      limits: { max_users: 0, max_branches: 0 },
      notes: null,
      isConfigured: false
    };
    // Cache unconfigured status briefly (5 seconds) to prevent DB hammering
    cache.set(normalizedId, { data: unconfigured, expiresAt: Date.now() + 5000 });
    return unconfigured;
  }

  const row = res.rows[0];
  const rawMods = typeof row.modules === 'string' ? JSON.parse(row.modules) : (row.modules || {});
  const rawLimits = typeof row.limits === 'string' ? JSON.parse(row.limits) : (row.limits || {});

  const configured = {
    modules: validateModules(rawMods),
    limits: validateLimits(rawLimits),
    notes: row.notes || null,
    isConfigured: true,
    updated_at: row.updated_at
  };

  // Cache configured record
  cache.set(normalizedId, { data: configured, expiresAt: Date.now() + CACHE_TTL_MS });
  return configured;
}

/**
 * Configure or update tenant entitlements.
 * Restricted strictly to ITQAN Platform Super Administrators.
 * Records change in tenant_access_audit_logs and evicts cache.
 * 
 * @param {Object} params
 * @param {string} params.tenant_id
 * @param {Object} params.modules
 * @param {Object} params.limits
 * @param {string} [params.notes]
 * @param {string} params.reason - Mandatory explanation for audit log
 * @param {number|string} params.admin_user_id - User ID of ITQAN Super Admin
 * @param {string} [params.ip_address]
 * @param {Object} [dbClient=db]
 */
async function setTenantEntitlements(params, dbClient = db) {
  const { tenant_id, modules, limits, notes, reason, admin_user_id, ip_address } = params;

  if (!tenant_id) {
    throw new Error('Tenant ID is required.');
  }
  if (!reason || typeof reason !== 'string' || reason.trim().length < 5) {
    throw new Error('A detailed audit reason (at least 5 characters) is required to modify entitlements.');
  }

  const validatedMods = validateModules(modules);
  const validatedLims = validateLimits(limits);

  // 1. Fetch previous state for audit log
  let previousModules = {};
  let previousLimits = {};
  try {
    const prevRes = await dbClient.query(
      `SELECT modules, limits FROM tenant_overrides WHERE tenant_id::text = $1::text LIMIT 1`,
      [tenant_id]
    );
    if (prevRes.rows.length > 0) {
      previousModules = prevRes.rows[0].modules || {};
      previousLimits = prevRes.rows[0].limits || {};
    }
  } catch (err) {
    console.warn('[tenantEntitlementService] Could not fetch previous state for audit:', err.message);
  }

  // 2. Upsert into tenant_overrides
  const upsertQuery = `
    INSERT INTO tenant_overrides (tenant_id, modules, limits, notes, updated_at)
    VALUES ($1, $2::jsonb, $3::jsonb, $4, NOW())
    ON CONFLICT (tenant_id)
    DO UPDATE SET
      modules = EXCLUDED.modules,
      limits = EXCLUDED.limits,
      notes = EXCLUDED.notes,
      updated_at = NOW()
    RETURNING *
  `;
  const upsertRes = await dbClient.query(upsertQuery, [
    tenant_id,
    JSON.stringify(validatedMods),
    JSON.stringify(validatedLims),
    notes || null
  ]);

  // 3. Record in audit log table (gracefully skip if table not yet created)
  try {
    await dbClient.query(`
      INSERT INTO tenant_access_audit_logs 
        (tenant_id, changed_by, previous_modules, new_modules, previous_limits, new_limits, reason, ip_address)
      VALUES 
        ($1, $2, $3::jsonb, $4::jsonb, $5::jsonb, $6::jsonb, $7, $8)
    `, [
      tenant_id,
      admin_user_id ? Number(admin_user_id) : null,
      JSON.stringify(previousModules),
      JSON.stringify(validatedMods),
      JSON.stringify(previousLimits),
      JSON.stringify(validatedLims),
      reason.trim(),
      ip_address || null
    ]);
  } catch (auditErr) {
    // If audit table does not exist yet (pending migration), log structured warning
    console.warn('[tenantEntitlementService] Audit log write deferred (table pending migration):', auditErr.message);
  }

  // 4. Invalidate Cache immediately
  invalidateTenantEntitlements(tenant_id);

  return {
    tenant_id,
    modules: validatedMods,
    limits: validatedLims,
    notes: upsertRes.rows[0]?.notes || null,
    isConfigured: true
  };
}

module.exports = {
  CANONICAL_MODULES,
  ALLOWED_LIMIT_KEYS,
  validateModules,
  validateLimits,
  getTenantEntitlements,
  setTenantEntitlements,
  invalidateTenantEntitlements,
  clearEntitlementCache
};
