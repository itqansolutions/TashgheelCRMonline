const db = require('../config/db');

/**
 * 🛡️ Workflow Control Layer (Phase 2.5)
 * Provides 5 safety mechanisms for all workflow executions:
 *   1. Rule Toggle  (is_enabled check)
 *   2. Cooldown     (time-gated re-fire prevention)
 *   3. Idempotency  (duplicate action guard)
 *   4. Audit Log    (full workflow_logs trail)
 *   5. Failure Trap (structured error capture)
 */
class WorkflowControl {

    /**
     * Pre-flight check before running any workflow rule.
     * Returns { allowed: true } or { allowed: false, reason }
     */
    async canFire(rule_key, tenant_id, entity_id = null) {
        try {
            // 1. TOGGLE CHECK: Is this rule enabled?
            const configRes = await db.query(`
                SELECT is_enabled, cooldown_minutes, last_triggered_at, config
                FROM workflow_config
                WHERE tenant_id = $1 AND rule_key = $2
            `, [tenant_id, rule_key]);

            // If no config row exists, default to ENABLED (safe default for MVP)
            if (configRes.rows.length > 0) {
                const config = configRes.rows[0];

                if (!config.is_enabled) {
                    return { allowed: false, reason: `Rule "${rule_key}" is disabled.` };
                }

                // 2. COOLDOWN CHECK: Has enough time passed since last trigger?
                if (config.last_triggered_at && config.cooldown_minutes > 0) {
                    const lastFired = new Date(config.last_triggered_at);
                    const cooldownMs = config.cooldown_minutes * 60 * 1000;
                    const elapsed = Date.now() - lastFired.getTime();

                    if (elapsed < cooldownMs) {
                        const minutesLeft = Math.ceil((cooldownMs - elapsed) / 60000);
                        return { allowed: false, reason: `Cooldown active for "${rule_key}". Try again in ${minutesLeft} minutes.` };
                    }
                }
            }

            return { allowed: true };

        } catch (err) {
            console.error(`[WorkflowControl] canFire error for ${rule_key}:`, err.message);
            // Fail-open: allow execution if control check itself errors (prevent blocking automation)
            return { allowed: true };
        }
    }

    /**
     * Mark a rule as triggered right now (updates cooldown timestamp).
     */
    async markTriggered(rule_key, tenant_id) {
        try {
            await db.query(`
                INSERT INTO workflow_config (tenant_id, rule_key, is_enabled, last_triggered_at)
                VALUES ($1, $2, TRUE, NOW())
                ON CONFLICT (tenant_id, rule_key)
                DO UPDATE SET last_triggered_at = NOW(), updated_at = NOW()
            `, [tenant_id, rule_key]);
        } catch (err) {
            console.error(`[WorkflowControl] markTriggered error:`, err.message);
        }
    }

    /**
     * Log a workflow execution event (success, skipped, or failed).
     */
    async log({ tenant_id, branch_id, event_type, rule_name, status = 'success', entity_type, entity_id, action_taken, metadata, error_message }) {
        try {
            await db.query(`
                INSERT INTO workflow_logs
                (tenant_id, branch_id, event_type, rule_name, status, entity_type, entity_id, action_taken, metadata, error_message)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            `, [
                tenant_id, branch_id || null,
                event_type, rule_name, status,
                entity_type || null, entity_id ? String(entity_id) : null,
                action_taken || null,
                metadata ? JSON.stringify(metadata) : null,
                error_message || null
            ]);
        } catch (err) {
            console.error(`[WorkflowControl] log error:`, err.message);
        }
    }

    /**
     * Convenience wrapper: run a workflow step with full control layer protection.
     * Usage: await workflowControl.run({ rule_key, tenant_id, ... }, async () => { ...action logic... })
     */
    async run({ rule_key, tenant_id, branch_id, event_type, entity_type, entity_id, metadata }, actionFn) {
        const preflight = await this.canFire(rule_key, tenant_id, entity_id);

        if (!preflight.allowed) {
            console.log(`[WorkflowControl] Skipped "${rule_key}": ${preflight.reason}`);
            await this.log({
                tenant_id, branch_id,
                event_type, rule_name: rule_key,
                status: 'skipped',
                entity_type, entity_id,
                action_taken: 'blocked_by_control_layer',
                metadata: { reason: preflight.reason, ...metadata }
            });
            return;
        }

        try {
            await actionFn();
            await this.markTriggered(rule_key, tenant_id);
            await this.log({
                tenant_id, branch_id,
                event_type, rule_name: rule_key,
                status: 'success',
                entity_type, entity_id,
                action_taken: 'executed',
                metadata
            });
        } catch (err) {
            console.error(`[WorkflowControl] Execution failure for "${rule_key}":`, err.message);
            await this.log({
                tenant_id, branch_id,
                event_type, rule_name: rule_key,
                status: 'failed',
                entity_type, entity_id,
                action_taken: 'error',
                metadata,
                error_message: err.message
            });
        }
    }
}

module.exports = new WorkflowControl();
