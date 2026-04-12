const db = require('../config/db');

// In-memory cache for branch-to-tenant mapping (Enterprise Performance)
// TTL: 5 minutes to prevent stale data
const branchCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; 

/**
 * PRODUCTION-GRADE Branch Scope Middleware
 * Enforces strict Triple Isolation (ID + Tenant + Branch)
 * Resolution Tier: Header -> User Permission -> Main Branch Fallback
 */
const branchScope = async (req, res, next) => {
  const headerBranchId = req.headers['x-branch-id'];
  const tenantId = req.user.tenant_id;
  const userId = req.user.id;

  try {
    let resolvedBranchId = headerBranchId;

    // --- Tier 1 & 2: Resolve Branch Context ---
    if (!resolvedBranchId) {
      // 1. Check for User's default/first assigned branch
      const userBranchRes = await db.query(
        'SELECT branch_id FROM user_branches WHERE user_id = $1 LIMIT 1',
        [userId]
      );
      
      if (userBranchRes.rows.length > 0) {
        resolvedBranchId = userBranchRes.rows[0].branch_id;
      } else {
        // 2. Fallback to Tenant's Main Branch
        const mainBranchRes = await db.query(
          'SELECT id FROM branches WHERE tenant_id = $1 AND is_main = true LIMIT 1',
          [tenantId]
        );
        if (mainBranchRes.rows.length > 0) {
          resolvedBranchId = mainBranchRes.rows[0].id;
        }
      }
    }

    if (!resolvedBranchId) {
      return res.status(400).json({ 
        status: 'error', 
        message: 'Branch scope unavailable. No branch assigned to organization.',
        code: 'BRANCH_RESOLUTION_FAILED'
      });
    }

    // --- Tier 3: Security & Cache Validation ---
    const cachedEntry = branchCache.get(resolvedBranchId);
    
    if (cachedEntry && cachedEntry.expiresAt > Date.now()) {
      // Direct Cache Hit
      if (cachedEntry.tenantId !== tenantId) {
        return res.status(403).json({ status: 'error', message: 'Unauthorized branch access attempt recorded.' });
      }
    } else {
      // Cache Miss or Expired: Validate from DB
      const branchRes = await db.query(
        'SELECT tenant_id FROM branches WHERE id = $1',
        [resolvedBranchId]
      );

      if (branchRes.rows.length === 0) {
        return res.status(404).json({ status: 'error', message: 'Selected branch no longer exists.' });
      }

      const branchTenantId = branchRes.rows[0].tenant_id;

      if (branchTenantId !== tenantId) {
        // SECURITY ALERT: Possible cross-tenant ID guessing
        console.warn(`[SECURITY] Cross-tenant branch access attempt: User ${userId} tried accessing branch ${resolvedBranchId}`);
        return res.status(403).json({ status: 'error', message: 'Access denied: Branch does not belong to your organization.' });
      }

      // Update Cache
      branchCache.set(resolvedBranchId, {
        tenantId: branchTenantId,
        expiresAt: Date.now() + CACHE_TTL
      });
    }

    // --- Final Injection ---
    req.branchId = resolvedBranchId;
    next();
  } catch (err) {
    console.error('CRITICAL: Branch scope error:', err.message);
    res.status(500).json({ status: 'error', message: 'Internal server error during context resolution' });
  }
};

module.exports = branchScope;
