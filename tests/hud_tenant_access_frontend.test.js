/**
 * Phase 4.2.5 — ITQAN HUD Tenant Access Management Frontend Logic Tests
 * 
 * Validates the core logic used in TenantAccessManagementModal and SecretPortalHUD:
 * 1. Canonical module catalog (10 modules, no legacy plans).
 * 2. Strict limit validation (unlimited = -1, zero = 0, positive integers valid, negatives/decimals invalid).
 * 3. Mandatory audit reason validation (>= 10 characters non-whitespace).
 * 4. Dirty state tracking and payload formation for PUT /api/admin/tenants/:tenant_id/override.
 * 5. Overview table filtering & status classification (Configured vs Unconfigured).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// 1. Canonical Module Catalog Definition
const CANONICAL_MODULES = [
    { key: 'crm', title: 'CRM & Customer 360', titleAr: 'إدارة علاقات العملاء' },
    { key: 'sales', title: 'Sales & Invoicing', titleAr: 'المبيعات والفواتير' },
    { key: 'finance', title: 'Finance & Treasury', titleAr: 'المالية والخزينة' },
    { key: 'real_estate', title: 'Real Estate & Properties', titleAr: 'التطوير والتسويق العقاري' },
    { key: 'hr', title: 'Human Resources & Attendance', titleAr: 'الموارد البشرية والبصمة' },
    { key: 'inventory', title: 'Inventory & Warehouses', titleAr: 'المخازن والمستودعات' },
    { key: 'purchasing', title: 'Purchasing & Suppliers', titleAr: 'المشتريات والموردين' },
    { key: 'marketing', title: 'Marketing & Campaigns', titleAr: 'التسويق والحملات الإعلانية' },
    { key: 'reports', title: 'Reports & Analytics', titleAr: 'التقارير المتقدمة والتحليلات' },
    { key: 'automation', title: 'Automation & AI Workflows', titleAr: 'الأتمتة والذكاء الاصطناعي' }
];

// 2. Validation Helper Functions matching frontend implementation
function validateLimitInput(val, isUnlimited) {
    if (isUnlimited) return { valid: true, value: -1 };
    if (val === '' || val === null || val === undefined) {
        return { valid: false, error: 'Value required' };
    }
    const num = Number(val);
    if (!Number.isInteger(num)) {
        return { valid: false, error: 'Must be a whole integer' };
    }
    if (num < 0) {
        return { valid: false, error: 'Cannot be negative. Use Unlimited toggle for -1.' };
    }
    return { valid: true, value: num };
}

function validateAuditReason(reason) {
    if (!reason || typeof reason !== 'string') return false;
    return reason.trim().length >= 10;
}

function calculateDirtyState(initial, current) {
    const modulesChanged = CANONICAL_MODULES.some(
        m => Boolean(initial.modules?.[m.key]) !== Boolean(current.modules?.[m.key])
    );
    const usersChanged = Number(initial.limits?.max_users) !== Number(current.limits?.max_users);
    const branchesChanged = Number(initial.limits?.max_branches) !== Number(current.limits?.max_branches);
    const notesChanged = (initial.notes || '').trim() !== (current.notes || '').trim();
    return modulesChanged || usersChanged || branchesChanged || notesChanged;
}

function filterTenants(tenants, { search = '', template = 'all', configStatus = 'all' }) {
    const s = search.toLowerCase().trim();
    return tenants.filter(t => {
        const matchesSearch = !s ||
            (t.name && t.name.toLowerCase().includes(s)) ||
            (t.id && t.id.toLowerCase().includes(s));
        
        const matchesTemplate = template === 'all' ||
            (t.template || 'general').toLowerCase() === template.toLowerCase();

        const isConfigured = Boolean(t.has_override);
        const matchesConfig = configStatus === 'all' ||
            (configStatus === 'configured' && isConfigured) ||
            (configStatus === 'unconfigured' && !isConfigured);

        return matchesSearch && matchesTemplate && matchesConfig;
    });
}

function formatOverridePayload({ modules, limits, reason, notes }) {
    return {
        modules,
        limits: {
            max_users: Number(limits.max_users),
            max_branches: Number(limits.max_branches)
        },
        reason: reason.trim(),
        notes: (notes || '').trim()
    };
}

describe('PHASE 4.2.5 — HUD TENANT ACCESS FRONTEND LOGIC', () => {

    describe('1. Canonical Module Catalog', () => {
        it('should define exactly 10 canonical modules', () => {
            assert.equal(CANONICAL_MODULES.length, 10);
        });

        it('should contain all required core modules without legacy plans', () => {
            const keys = CANONICAL_MODULES.map(m => m.key);
            const expected = ['crm', 'sales', 'finance', 'real_estate', 'hr', 'inventory', 'purchasing', 'marketing', 'reports', 'automation'];
            for (const exp of expected) {
                assert.ok(keys.includes(exp), `Expected canonical module ${exp} to be present`);
            }
            // Ensure no legacy plan keys exist as modules
            assert.ok(!keys.includes('basic'));
            assert.ok(!keys.includes('pro'));
            assert.ok(!keys.includes('enterprise'));
        });

        it('should provide both English and Arabic labels for all modules', () => {
            for (const mod of CANONICAL_MODULES) {
                assert.ok(mod.title && mod.title.length > 0, `Missing English title for ${mod.key}`);
                assert.ok(mod.titleAr && mod.titleAr.length > 0, `Missing Arabic title for ${mod.key}`);
            }
        });
    });

    describe('2. Numeric Limits Validation (Users & Branches)', () => {
        it('should accept -1 when Unlimited toggle is ON', () => {
            const res = validateLimitInput('999', true);
            assert.equal(res.valid, true);
            assert.equal(res.value, -1);
        });

        it('should accept 0 as an explicit valid value (disables capacity)', () => {
            const res = validateLimitInput(0, false);
            assert.equal(res.valid, true);
            assert.equal(res.value, 0);

            const resStr = validateLimitInput('0', false);
            assert.equal(resStr.valid, true);
            assert.equal(resStr.value, 0);
        });

        it('should accept positive integers', () => {
            assert.deepEqual(validateLimitInput(1, false), { valid: true, value: 1 });
            assert.deepEqual(validateLimitInput('25', false), { valid: true, value: 25 });
            assert.deepEqual(validateLimitInput(1000, false), { valid: true, value: 1000 });
        });

        it('should reject negative values when not marked as unlimited', () => {
            const res = validateLimitInput(-5, false);
            assert.equal(res.valid, false);
            assert.match(res.error, /cannot be negative/i);

            const res2 = validateLimitInput('-1', false);
            assert.equal(res2.valid, false);
        });

        it('should reject floating point decimals', () => {
            const res = validateLimitInput(5.5, false);
            assert.equal(res.valid, false);
            assert.match(res.error, /whole integer/i);

            const resStr = validateLimitInput('3.14', false);
            assert.equal(resStr.valid, false);
        });

        it('should reject non-numeric inputs', () => {
            assert.equal(validateLimitInput('abc', false).valid, false);
            assert.equal(validateLimitInput('', false).valid, false);
            assert.equal(validateLimitInput(null, false).valid, false);
        });
    });

    describe('3. Mandatory Audit Reason Validation', () => {
        it('should reject empty or null reason', () => {
            assert.equal(validateAuditReason(''), false);
            assert.equal(validateAuditReason(null), false);
            assert.equal(validateAuditReason(undefined), false);
        });

        it('should reject strings shorter than 10 characters', () => {
            assert.equal(validateAuditReason('update'), false);
            assert.equal(validateAuditReason('123456789'), false);
        });

        it('should reject whitespace-padded strings whose trimmed length < 10', () => {
            assert.equal(validateAuditReason('   short   '), false);
            assert.equal(validateAuditReason('          '), false);
        });

        it('should accept valid justification of 10 or more characters', () => {
            assert.equal(validateAuditReason('Approved by ITQAN CEO for Q4 Pilot testing'), true);
            assert.equal(validateAuditReason('Contract #2026-081 signed for 5 users'), true);
            assert.equal(validateAuditReason('1234567890'), true);
        });
    });

    describe('4. Dirty State Tracking & Submission Payload Formatter', () => {
        const initial = {
            modules: { crm: true, sales: true, finance: false },
            limits: { max_users: 5, max_branches: 1 },
            notes: 'Initial notes'
        };

        it('should detect no change when data is identical', () => {
            const current = JSON.parse(JSON.stringify(initial));
            assert.equal(calculateDirtyState(initial, current), false);
        });

        it('should detect change when any module is toggled', () => {
            const current = {
                ...initial,
                modules: { ...initial.modules, finance: true }
            };
            assert.equal(calculateDirtyState(initial, current), true);
        });

        it('should detect change when max_users or max_branches changes', () => {
            const userChanged = {
                ...initial,
                limits: { ...initial.limits, max_users: 10 }
            };
            assert.equal(calculateDirtyState(initial, userChanged), true);

            const branchChanged = {
                ...initial,
                limits: { ...initial.limits, max_branches: 3 }
            };
            assert.equal(calculateDirtyState(initial, branchChanged), true);
        });

        it('should format payload correctly matching PUT /api/admin/tenants/:tenant_id/override', () => {
            const payload = formatOverridePayload({
                modules: { crm: true, sales: true, hr: false },
                limits: { max_users: '15', max_branches: '-1' },
                reason: '  Contract signed with CEO approval  ',
                notes: '  Special discount applied  '
            });

            assert.deepEqual(payload, {
                modules: { crm: true, sales: true, hr: false },
                limits: { max_users: 15, max_branches: -1 },
                reason: 'Contract signed with CEO approval',
                notes: 'Special discount applied'
            });
        });
    });

    describe('5. Tenant Overview Table Filtering & Entitlement Badges', () => {
        const mockTenants = [
            { id: 'tenant_001', name: 'Alpha Real Estate', template: 'real_estate', has_override: true, user_count: 3, max_users: 10 },
            { id: 'tenant_002', name: 'Beta Trading Co', template: 'general', has_override: false, user_count: 1, max_users: 0 },
            { id: 'tenant_003', name: 'Gamma Contracting', template: 'general', has_override: true, user_count: 5, max_users: 5 },
            { id: 'tenant_004', name: 'Delta Properties', template: 'real_estate', has_override: false, user_count: 2, max_users: 0 }
        ];

        it('should filter by search keyword across name and ID', () => {
            const res = filterTenants(mockTenants, { search: 'alpha' });
            assert.equal(res.length, 1);
            assert.equal(res[0].id, 'tenant_001');

            const resId = filterTenants(mockTenants, { search: '003' });
            assert.equal(resId.length, 1);
            assert.equal(resId[0].name, 'Gamma Contracting');
        });

        it('should filter by template', () => {
            const re = filterTenants(mockTenants, { template: 'real_estate' });
            assert.equal(re.length, 2);
            assert.deepEqual(re.map(t => t.id), ['tenant_001', 'tenant_004']);

            const gen = filterTenants(mockTenants, { template: 'general' });
            assert.equal(gen.length, 2);
            assert.deepEqual(gen.map(t => t.id), ['tenant_002', 'tenant_003']);
        });

        it('should filter by configuration status (configured vs unconfigured)', () => {
            const configured = filterTenants(mockTenants, { configStatus: 'configured' });
            assert.equal(configured.length, 2);
            assert.deepEqual(configured.map(t => t.id), ['tenant_001', 'tenant_003']);

            const unconfigured = filterTenants(mockTenants, { configStatus: 'unconfigured' });
            assert.equal(unconfigured.length, 2);
            assert.deepEqual(unconfigured.map(t => t.id), ['tenant_002', 'tenant_004']);
        });

        it('should combine multiple filters accurately', () => {
            const res = filterTenants(mockTenants, {
                search: 'delta',
                template: 'real_estate',
                configStatus: 'unconfigured'
            });
            assert.equal(res.length, 1);
            assert.equal(res[0].id, 'tenant_004');
        });
    });
});
