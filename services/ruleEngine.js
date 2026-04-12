const db = require('../config/db');
const notificationService = require('./notificationService');
const workflowControl = require('./workflowControl');

/**
 * ======================================================
 * 🧠 PHASE 3: DB-DRIVEN RULE ENGINE
 * ======================================================
 * Architecture:
 *   Event fires → runRules(event, payload)
 *   → Fetch active DB rules for this event
 *   → evaluateConditions(rule.conditions, payload)
 *   → executeActions(rule.actions, payload, context)
 *   → Log via workflowControl
 * 
 * NO eval(). All conditions use a safe structured parser.
 * ======================================================
 */

// -------------------------------------------------------
// CONDITION EVALUATOR (Safe JSON-based logic, no eval)
// -------------------------------------------------------
const OPERATORS = {
    eq:  (a, b) => a === b,
    neq: (a, b) => a !== b,
    lt:  (a, b) => a < b,
    lte: (a, b) => a <= b,
    gt:  (a, b) => a > b,
    gte: (a, b) => a >= b,
    contains: (a, b) => String(a).toLowerCase().includes(String(b).toLowerCase()),
};

/**
 * Evaluates a conditions JSONB object against a payload.
 * Returns true if ALL conditions pass (AND logic).
 * 
 * Condition format:
 * {
 *   "stock":      { "lt": 10 },
 *   "late_count": { "gte": 3 },
 *   "type":       { "eq": "unpaid" }
 * }
 */
function evaluateConditions(conditions, payload) {
    if (!conditions || Object.keys(conditions).length === 0) return true; // No conditions = always passes

    for (const [field, rule] of Object.entries(conditions)) {
        const payloadValue = payload[field];

        if (payloadValue === undefined) {
            console.warn(`[RuleEngine] Condition field "${field}" not found in payload. Condition fails.`);
            return false;
        }

        for (const [operator, threshold] of Object.entries(rule)) {
            const fn = OPERATORS[operator];
            if (!fn) {
                console.warn(`[RuleEngine] Unknown operator "${operator}". Skipping.`);
                continue;
            }

            const numPayload = typeof payloadValue === 'string' ? parseFloat(payloadValue) : payloadValue;
            const numThreshold = typeof threshold === 'string' ? parseFloat(threshold) : threshold;

            const result = fn(isNaN(numPayload) ? payloadValue : numPayload, isNaN(numThreshold) ? threshold : numThreshold);
            if (!result) return false; // AND logic: one fail = whole condition fails
        }
    }
    return true;
}

// -------------------------------------------------------
// ACTION EXECUTOR (Safe structured action map)
// -------------------------------------------------------

const ACTION_EXECUTORS = {

    notify_manager: async ({ payload, rule }) => {
        await notificationService.notifyRole({
            role: 'manager',
            type: payload._event || 'SYSTEM_ALERT',
            title: `🔔 Rule: "${rule.name}"`,
            message: payload._summary || `Automated rule triggered: ${rule.name}`,
            tenant_id: payload.tenant_id,
            branch_id: payload.branch_id,
            link: payload._link || null,
            metadata: { rule_id: rule.id, triggered_by: 'rule_engine' }
        });
    },

    notify_user: async ({ payload, action }) => {
        const user_id = action.params?.user_id || payload.user_id;
        if (!user_id) return;
        await notificationService.notify({
            type: 'SYSTEM_ALERT',
            title: `🔔 Automated Alert`,
            message: payload._summary || 'An automated workflow triggered an action for you.',
            tenant_id: payload.tenant_id,
            branch_id: payload.branch_id,
            user_id,
            link: payload._link || null
        });
    },

    create_purchase_request: async ({ payload }) => {
        if (!payload.product_id) return;

        // Idempotency: avoid duplicate drafts
        const existing = await db.query(`
            SELECT id FROM purchase_requests
            WHERE tenant_id = $1 AND branch_id = $2 AND product_id = $3 AND status = 'draft'
        `, [payload.tenant_id, payload.branch_id, payload.product_id]);

        if (existing.rows.length > 0) {
            console.log(`[RuleEngine] Idempotency: Draft PR exists for product #${payload.product_id}, skipping.`);
            return;
        }

        await db.query(`
            INSERT INTO purchase_requests (tenant_id, branch_id, product_id, quantity_requested, status, notes, created_by)
            VALUES ($1, $2, $3, 50, 'draft', $4, $5)
        `, [
            payload.tenant_id, payload.branch_id, payload.product_id,
            `[RULE ENGINE] Auto-replenishment. Stock: ${payload.stock ?? payload.current_stock}`,
            payload.created_by || null
        ]);
    },

    assign_lead: async ({ payload }) => {
        if (!payload.deal_id) return;

        const assigneeRes = await db.query(`
            SELECT u.id, u.name, COUNT(d.id) as open_deals
            FROM users u
            LEFT JOIN deals d ON d.assigned_to = u.id
                AND d.pipeline_stage NOT IN ('won', 'lost')
                AND d.tenant_id = $1
            WHERE u.tenant_id = $1 AND u.role = 'employee'
            GROUP BY u.id, u.name
            ORDER BY open_deals ASC
            LIMIT 1
        `, [payload.tenant_id]);

        if (assigneeRes.rows.length === 0) return;
        const assignee = assigneeRes.rows[0];

        await db.query(`UPDATE deals SET assigned_to = $1 WHERE id = $2 AND tenant_id = $3`, [
            assignee.id, payload.deal_id, payload.tenant_id
        ]);

        await notificationService.notify({
            type: 'SYSTEM_ALERT',
            title: '📋 Deal Auto-Assigned (Rule Engine)',
            message: `Deal "${payload.deal_title}" was assigned to you by an automation rule.`,
            tenant_id: payload.tenant_id,
            branch_id: payload.branch_id,
            user_id: assignee.id,
            link: '/deals'
        });
    }
};

// -------------------------------------------------------
// MAIN ENTRY: runRules(event, payload)
// -------------------------------------------------------

/**
 * Central rule engine dispatcher.
 * Called by event sources (controllers, hooks, services).
 * 
 * @param {string} trigger_event - e.g. 'LOW_STOCK'
 * @param {object} payload - contextual data for condition evaluation
 */
async function runRules(trigger_event, payload) {
    try {
        // 1. Fetch all active DB rules for this event + tenant
        const rulesRes = await db.query(`
            SELECT * FROM workflow_rules
            WHERE trigger_event = $1
            AND tenant_id = $2
            AND is_active = TRUE
            AND (branch_id = $3 OR branch_id IS NULL)
            ORDER BY created_at ASC
        `, [trigger_event, payload.tenant_id, payload.branch_id || null]);

        if (rulesRes.rows.length === 0) return;

        for (const rule of rulesRes.rows) {
            const rule_key = `DB_RULE_${rule.id}`;

            // 2. Run through the Control Layer (toggle + cooldown + log)
            await workflowControl.run({
                rule_key,
                tenant_id: payload.tenant_id,
                branch_id: payload.branch_id,
                event_type: trigger_event,
                entity_type: payload._entity_type || trigger_event.toLowerCase(),
                entity_id: payload._entity_id || null,
                metadata: { rule_id: rule.id, rule_name: rule.name, payload }
            }, async () => {
                // 3. Evaluate conditions (safe structured parser — NO eval)
                const conditions = typeof rule.conditions === 'string'
                    ? JSON.parse(rule.conditions)
                    : rule.conditions;

                const passed = evaluateConditions(conditions, payload);

                if (!passed) {
                    console.log(`[RuleEngine] Rule "${rule.name}" conditions NOT met — skipping actions.`);
                    return;
                }

                // 4. Execute all actions in sequence
                const actions = typeof rule.actions === 'string'
                    ? JSON.parse(rule.actions)
                    : rule.actions;

                for (const action of actions) {
                    const executor = ACTION_EXECUTORS[action.type];
                    if (!executor) {
                        console.warn(`[RuleEngine] Unknown action type: "${action.type}"`);
                        continue;
                    }
                    await executor({ payload, rule, action });
                }

                console.log(`[RuleEngine] Rule "${rule.name}" executed ${actions.length} action(s) successfully.`);
            });
        }
    } catch (err) {
        console.error(`[RuleEngine] runRules fatal error for event "${trigger_event}":`, err.message);
    }
}

module.exports = { runRules, evaluateConditions };
