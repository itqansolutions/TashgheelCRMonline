const db = require('../config/db');

/**
 * Workflow Control Panel API
 */

// @desc    Get all workflow execution logs
// @route   GET /api/workflows/logs
// @access  Private (Admin/Manager)
exports.getLogs = async (req, res) => {
    const tenant_id = req.user.tenant_id;
    const branch_id = req.branchId;
    try {
        const result = await db.query(`
            SELECT * FROM workflow_logs
            WHERE tenant_id::text = $1::text AND (branch_id::text = $2::text OR branch_id IS NULL)
            ORDER BY created_at DESC
            LIMIT 100
        `, [tenant_id, branch_id]);
        res.json({ status: 'success', data: result.rows });
    } catch (err) {
        res.status(500).json({ status: 'error', message: 'Failed to fetch workflow logs.' });
    }
};

// @desc    Get workflow config (toggle state for all rules)
// @route   GET /api/workflows/config
// @access  Private (Admin/Manager)
exports.getConfig = async (req, res) => {
    const tenant_id = req.user.tenant_id;
    try {
        const result = await db.query(`
            SELECT * FROM workflow_config WHERE tenant_id::text = $1::text ORDER BY rule_key ASC
        `, [tenant_id]);

        // Merge with known defaults so we show all rules even before first trigger
        const knownRules = [
            { rule_key: 'LOW_STOCK_AUTO_PROCUREMENT', cooldown_minutes: 360 },
            { rule_key: 'LATE_EMPLOYEE_ESCALATION', cooldown_minutes: 0 },
            { rule_key: 'DEAL_AUTO_ASSIGNMENT', cooldown_minutes: 0 }
        ];

        const configMap = {};
        result.rows.forEach(r => { configMap[r.rule_key] = r; });

        const merged = knownRules.map(rule => configMap[rule.rule_key] || {
            rule_key: rule.rule_key,
            is_enabled: true,
            cooldown_minutes: rule.cooldown_minutes,
            last_triggered_at: null,
            tenant_id
        });

        res.json({ status: 'success', data: merged });
    } catch (err) {
        res.status(500).json({ status: 'error', message: 'Failed to fetch workflow config.' });
    }
};

// @desc    Toggle a workflow rule ON/OFF
// @route   PATCH /api/workflows/config/:rule_key/toggle
// @access  Private (Admin only)
exports.toggleRule = async (req, res) => {
    const tenant_id = req.user.tenant_id;
    const { rule_key } = req.params;
    const { is_enabled } = req.body;
    try {
        await db.query(`
            INSERT INTO workflow_config (tenant_id, rule_key, is_enabled, updated_at)
            VALUES ($1, $2, $3, NOW())
            ON CONFLICT (tenant_id, rule_key)
            DO UPDATE SET is_enabled = $3, updated_at = NOW()
        `, [tenant_id, rule_key, is_enabled]);

        res.json({ status: 'success', message: `Rule "${rule_key}" ${is_enabled ? 'enabled' : 'disabled'}.` });
    } catch (err) {
        res.status(500).json({ status: 'error', message: 'Failed to toggle rule.' });
    }
};

// @desc    Update cooldown for a workflow rule
// @route   PATCH /api/workflows/config/:rule_key/cooldown
// @access  Private (Admin)
exports.updateCooldown = async (req, res) => {
    const tenant_id = req.user.tenant_id;
    const { rule_key } = req.params;
    const { cooldown_minutes } = req.body;
    try {
        await db.query(`
            INSERT INTO workflow_config (tenant_id, rule_key, cooldown_minutes, updated_at)
            VALUES ($1, $2, $3, NOW())
            ON CONFLICT (tenant_id, rule_key)
            DO UPDATE SET cooldown_minutes = $3, updated_at = NOW()
        `, [tenant_id, rule_key, cooldown_minutes]);

        res.json({ status: 'success', message: `Cooldown updated to ${cooldown_minutes} minutes for "${rule_key}".` });
    } catch (err) {
        res.status(500).json({ status: 'error', message: 'Failed to update cooldown.' });
    }
};
