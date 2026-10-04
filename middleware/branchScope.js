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
  if (!req.user) {
    return res.status(401).json({ status: 'error', message: 'User context missing.' });
  }

  const headerBranchId = req.headers['x-branch-id'];
  const tenantId = req.user.tenant_id;
  const userId = req.user.id;
  const userRole = req.user.role;

  try {
    let resolvedBranchId = headerBranchId;

    // --- Tier 1 & 2: Resolve Branch Context (Fallback when no header provided) ---
    if (!resolvedBranchId) {
      // 1. Check for User's default/first assigned branch
      const userBranchRes = await db.query(
        'SELECT branch_id FROM user_branches WHERE user_id::text = $1::text LIMIT 1',
        [userId]
      );
      
      if (userBranchRes.rows.length > 0) {
        resolvedBranchId = userBranchRes.rows[0].branch_id;
      } else {
        // 2. Fallback to Tenant's Main Branch
        const mainBranchRes = await db.query(
          'SELECT id FROM branches WHERE tenant_id::text = $1::text AND is_main = true LIMIT 1',
          [tenantId]
        );
        if (mainBranchRes.rows.length > 0) {
          resolvedBranchId = mainBranchRes.rows[0].id;
        } else {
          // SELF-HEALING: Auto-Provision Main Branch if missing
          console.warn(`[ACL] Self-Healing: Missing main branch for tenant ${tenantId}. Creating one...`);
          const newBranchRes = await db.query(`
            INSERT INTO branches (name, tenant_id, is_main, address)
            VALUES ('Main Branch', $1::text, true, 'Corporate Headquarters')
            RETURNING id
          `, [tenantId]);
          resolvedBranchId = newBranchRes.rows[0].id;
          
          // Auto-assign user to this new branch
          await db.query(`INSERT INTO user_branches (user_id, branch_id) VALUES ($1::text, $2::text) ON CONFLICT DO NOTHING`, [userId, resolvedBranchId]);
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

    // --- Tier 3: Tenant Security & Cache Validation ---
    let branchTenantId;
    const cachedEntry = branchCache.get(resolvedBranchId);
    
    if (cachedEntry && cachedEntry.expiresAt > Date.now()) {
      branchTenantId = cachedEntry.tenantId;
    } else {
      // Cache Miss or Expired: Validate from DB
      const branchRes = await db.query(
        'SELECT tenant_id FROM branches WHERE id::text = $1::text',
        [resolvedBranchId]
      );

      if (branchRes.rows.length === 0) {
        return res.status(404).json({ status: 'error', message: 'Selected branch no longer exists.' });
      }

      branchTenantId = branchRes.rows[0].tenant_id;

      // Update Cache
      branchCache.set(resolvedBranchId, {
        tenantId: branchTenantId,
        expiresAt: Date.now() + CACHE_TTL
      });
    }

    // Tenant Isolation Check: Branch must belong to the user's tenant
    if (!branchTenantId || String(branchTenantId).toLowerCase().trim() !== String(tenantId).toLowerCase().trim()) {
      console.warn(`[SECURITY] Cross-tenant branch access attempt: User ${userId} (tenant ${tenantId}) tried accessing branch ${resolvedBranchId} (tenant ${branchTenantId})`);
      return res.status(403).json({ 
        status: 'error', 
        message: 'Access denied: Branch does not belong to your organization.'
      });
    }

    // --- Tier 4: User Branch Membership Check ---
    // If the branch was explicitly requested via x-branch-id header, non-admin users MUST be assigned to it
    if (headerBranchId && userRole !== 'admin') {
      const userBranchCheck = await db.query(
        'SELECT 1 FROM user_branches WHERE user_id::text = $1::text AND branch_id::text = $2::text LIMIT 1',
        [userId, resolvedBranchId]
      );
      if (userBranchCheck.rows.length === 0) {
        return res.status(403).json({
          status: 'error',
          message: 'Unauthorized branch access: User is not assigned to this branch.',
          code: 'UNAUTHORIZED_BRANCH_ACCESS'
        });
      }
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
