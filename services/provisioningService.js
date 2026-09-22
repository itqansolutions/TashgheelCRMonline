const db = require('../config/db');
const bcrypt = require('bcrypt');
const { logAction, ACTIONS } = require('./loggerService');

/**
 * provisionTenant
 *
 * The canonical tenant provisioning function.
 * Called by:
 *   - authController.register (existing public flow - kept intact)
 *   - registrationRequestsController.approve (new HUD approval flow)
 *
 * @param {object} params
 * @param {string}  params.name          - Admin user full name
 * @param {string}  params.email         - Admin user email
 * @param {string}  params.passwordHash  - Already-hashed password (bcrypt)
 * @param {string}  params.companyName
 * @param {string}  [params.phone]
 * @param {string}  [params.templateName='general']
 * @param {string}  [params.selectedPlan='basic']
 * @param {object}  [params.moduleOverride] - If set, these modules are used instead of plan defaults
 * @param {object}  [params.req]          - Express request (for audit log IP/UA). Optional.
 * @returns {{ tenantId, user, subscription }}
 * @throws on any DB error — caller must wrap in transaction + rollback
 */
async function provisionTenant({
    name,
    email,
    passwordHash,
    companyName,
    phone,
    templateName = 'general',
    selectedPlan = 'basic',
    moduleOverride = null,
    req = null
}) {
    // 1. Create Tenant
    const slug = companyName.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const tenantResult = await db.query(
        `INSERT INTO tenants (name, slug, plan, status, template_name, admin_name, admin_email, admin_phone)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [
            companyName,
            `${slug}-${Date.now().toString().slice(-4)}`,
            selectedPlan || 'basic',
            'active',
            templateName,
            name,
            email,
            phone || null
        ]
    );
    const tenantId = tenantResult.rows[0].id;

    // 2. Insert Admin User (password already hashed)
    const newUserResult = await db.query(
        `INSERT INTO users (name, email, password_hash, role, tenant_id)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [name, email, passwordHash, 'admin', tenantId]
    );
    const user = newUserResult.rows[0];

    // 3. Seed Departments
    const departments = ['General', 'Sales', 'Accounting'];
    for (const dep of departments) {
        try {
            await db.query(
                `INSERT INTO departments (name, tenant_id)
                 SELECT $1, $2
                 WHERE NOT EXISTS (
                     SELECT 1 FROM departments WHERE name = $1 AND tenant_id::text = $2::text
                 )`,
                [dep, tenantId]
            );
        } catch (_) {}
    }

    // 4. Seed Lead Sources
    const leadSources = ['Facebook', 'Google', 'Referral', 'Direct'];
    for (const src of leadSources) {
        try {
            await db.query(
                `INSERT INTO lead_sources (name, tenant_id)
                 SELECT $1, $2
                 WHERE NOT EXISTS (
                     SELECT 1 FROM lead_sources WHERE name = $1 AND tenant_id::text = $2::text
                 )`,
                [src, tenantId]
            );
        } catch (_) {}
    }

    // 5. Seed Main Branch
    try {
        const branchResult = await db.query(
            `INSERT INTO branches (name, address, tenant_id, is_main)
             VALUES ($1, $2, $3, true) RETURNING id`,
            ['Main Branch', 'Corporate Headquarters', tenantId]
        );
        if (branchResult.rows.length > 0) {
            const mainBranchId = branchResult.rows[0].id;
            await db.query(
                `INSERT INTO user_branches (user_id, branch_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
                [user.id, mainBranchId]
            );
            await db.query(
                `UPDATE users SET branch_id = $1 WHERE id = $2`,
                [String(mainBranchId), user.id]
            );
        }
    } catch (branchErr) {
        console.warn('[Provisioning] Main branch seeding notice (non-fatal):', branchErr.message);
    }

    // 6. Audit log
    try {
        logAction({ req: req || {}, action: ACTIONS.REGISTER, entityType: 'Tenant', entityId: tenantId, userId: user.id });
    } catch (_) {}

    // 7. Resolve modules from plan or override
    const planName = selectedPlan || 'basic';
    let planId = null;
    let modules = moduleOverride || { crm: true, finance: true };
    const trialEnd = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

    try {
        const planRes = await db.query(`SELECT id, modules FROM plans WHERE name = $1`, [planName]);
        if (planRes.rows.length > 0) {
            planId = planRes.rows[0].id;
            // If no override provided, use plan default modules
            if (!moduleOverride) {
                modules = planRes.rows[0].modules;
            }
        }

        await db.query(
            `INSERT INTO subscriptions (tenant_id, plan_id, status, trial_ends_at, expires_at)
             VALUES ($1, $2, 'trial', $3, $3)
             ON CONFLICT (tenant_id) DO NOTHING`,
            [String(tenantId), planId, trialEnd]
        );

        // If module override provided, also persist as a tenant_override so moduleGuard respects it
        if (moduleOverride) {
            await db.query(
                `INSERT INTO tenant_overrides (tenant_id, modules, notes)
                 VALUES ($1, $2, $3)
                 ON CONFLICT (tenant_id) DO UPDATE SET modules = $2, notes = $3, updated_at = NOW()`,
                [tenantId, JSON.stringify(moduleOverride), 'Set by Super Admin on registration approval']
            );
        }
    } catch (subErr) {
        console.warn('[Provisioning] Subscription binding (non-fatal):', subErr.message);
    }

    return { tenantId, user, modules, subscription: { status: 'trial', plan: planName, modules, trial_ends_at: trialEnd } };
}

module.exports = { provisionTenant };
