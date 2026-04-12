const db = require('../config/db');
const { evaluateConditions } = require('../services/ruleEngine');

const MAX_RULES_PER_TENANT = 20;

// @desc    Get all rules for tenant
// @route   GET /api/rules
exports.getRules = async (req, res) => {
    const tenant_id = req.user.tenant_id;
    const branch_id = req.branchId;
    try {
        const result = await db.query(`
            SELECT r.*, u.name as created_by_name
            FROM workflow_rules r
            LEFT JOIN users u ON r.created_by = u.id
            WHERE r.tenant_id = $1 AND (r.branch_id = $2 OR r.branch_id IS NULL)
            ORDER BY r.created_at DESC
        `, [tenant_id, branch_id]);
        res.json({ status: 'success', data: result.rows });
    } catch (err) {
        res.status(500).json({ status: 'error', message: 'Failed to load rules.' });
    }
};

// @desc    Create a new rule
// @route   POST /api/rules
exports.createRule = async (req, res) => {
    const tenant_id = req.user.tenant_id;
    const branch_id = req.branchId;
    const { name, trigger_event, conditions, actions, cooldown_minutes } = req.body;

    try {
        // Safety: Max 20 rules per tenant
        const countRes = await db.query(`SELECT COUNT(*) FROM workflow_rules WHERE tenant_id = $1`, [tenant_id]);
        if (parseInt(countRes.rows[0].count) >= MAX_RULES_PER_TENANT) {
            return res.status(400).json({ status: 'error', message: `Rule limit reached (max ${MAX_RULES_PER_TENANT} per tenant).` });
        }

        // Safety: Validate conditions schema (no unknown operators)
        const VALID_OPS = ['eq', 'neq', 'lt', 'lte', 'gt', 'gte', 'contains'];
        if (conditions && typeof conditions === 'object') {
            for (const [field, ops] of Object.entries(conditions)) {
                for (const op of Object.keys(ops)) {
                    if (!VALID_OPS.includes(op)) {
                        return res.status(400).json({ status: 'error', message: `Invalid condition operator: "${op}". Allowed: ${VALID_OPS.join(', ')}` });
                    }
                }
            }
        }

        // Safety: Validate actions
        const VALID_ACTIONS = ['notify_manager', 'notify_user', 'create_purchase_request', 'assign_lead'];
        if (!Array.isArray(actions) || actions.length === 0) {
            return res.status(400).json({ status: 'error', message: 'At least one action is required.' });
        }
        for (const action of actions) {
            if (!VALID_ACTIONS.includes(action.type)) {
                return res.status(400).json({ status: 'error', message: `Invalid action type: "${action.type}". Allowed: ${VALID_ACTIONS.join(', ')}` });
            }
        }

        const result = await db.query(`
            INSERT INTO workflow_rules (tenant_id, branch_id, name, trigger_event, conditions, actions, cooldown_minutes, created_by)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *
        `, [tenant_id, branch_id, name, trigger_event, JSON.stringify(conditions || {}), JSON.stringify(actions), cooldown_minutes || 0, req.user.id]);

        res.status(201).json({ status: 'success', data: result.rows[0], message: 'Rule created successfully.' });
    } catch (err) {
        console.error('createRule:', err.message);
        res.status(500).json({ status: 'error', message: err.message });
    }
};

// @desc    Update rule
// @route   PUT /api/rules/:id
exports.updateRule = async (req, res) => {
    const { id } = req.params;
    const tenant_id = req.user.tenant_id;
    const { name, conditions, actions, cooldown_minutes, is_active } = req.body;
    try {
        const result = await db.query(`
            UPDATE workflow_rules
            SET name = COALESCE($1, name),
                conditions = COALESCE($2, conditions),
                actions = COALESCE($3, actions),
                cooldown_minutes = COALESCE($4, cooldown_minutes),
                is_active = COALESCE($5, is_active),
                updated_at = NOW()
            WHERE id = $6 AND tenant_id = $7
            RETURNING *
        `, [name, conditions ? JSON.stringify(conditions) : null, actions ? JSON.stringify(actions) : null, cooldown_minutes, is_active, id, tenant_id]);

        if (result.rows.length === 0) return res.status(404).json({ status: 'error', message: 'Rule not found.' });
        res.json({ status: 'success', data: result.rows[0] });
    } catch (err) {
        res.status(500).json({ status: 'error', message: 'Failed to update rule.' });
    }
};

// @desc    Delete rule
// @route   DELETE /api/rules/:id
exports.deleteRule = async (req, res) => {
    const tenant_id = req.user.tenant_id;
    try {
        const result = await db.query(`DELETE FROM workflow_rules WHERE id = $1 AND tenant_id = $2 RETURNING id`, [req.params.id, tenant_id]);
        if (result.rows.length === 0) return res.status(404).json({ status: 'error', message: 'Rule not found.' });
        res.json({ status: 'success', message: 'Rule deleted.' });
    } catch (err) {
        res.status(500).json({ status: 'error', message: 'Failed to delete rule.' });
    }
};

// @desc    Simulate rule (dry-run condition evaluation — no actions executed)
// @route   POST /api/rules/:id/simulate
exports.simulateRule = async (req, res) => {
    const tenant_id = req.user.tenant_id;
    const { test_payload } = req.body;
    try {
        const ruleRes = await db.query(`SELECT * FROM workflow_rules WHERE id = $1 AND tenant_id = $2`, [req.params.id, tenant_id]);
        if (ruleRes.rows.length === 0) return res.status(404).json({ status: 'error', message: 'Rule not found.' });

        const rule = ruleRes.rows[0];
        const conditions = typeof rule.conditions === 'string' ? JSON.parse(rule.conditions) : rule.conditions;
        const actions = typeof rule.actions === 'string' ? JSON.parse(rule.actions) : rule.actions;

        const passed = evaluateConditions(conditions, test_payload || {});

        res.json({
            status: 'success',
            simulation: {
                rule_name: rule.name,
                trigger_event: rule.trigger_event,
                conditions_evaluated: conditions,
                test_payload: test_payload || {},
                conditions_passed: passed,
                actions_that_would_fire: passed ? actions : [],
                preview: passed
                    ? `✅ Rule WOULD fire. ${actions.length} action(s) would execute.`
                    : `❌ Rule would NOT fire. Conditions not met.`
            }
        });
    } catch (err) {
        res.status(500).json({ status: 'error', message: 'Simulation failed.' });
    }
};
