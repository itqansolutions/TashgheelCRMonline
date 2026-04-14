const db = require('../config/db');
const templateService = require('./templateService');
const notificationService = require('./notificationService');

/**
 * 🎯 Industry-Aware Automation Service (Step 3)
 * Orchestrates template-defined rules (triggers, conditions, actions).
 */
class TemplateAutomationService {

    /**
     * Entry point for template automations.
     * @param {Object} args { tenantId, event, payload }
     */
    async runTemplateAutomation({ tenantId, event, payload }) {
        try {
            const template = await templateService.getTenantTemplate(tenantId);
            if (!template || !template.automation_rules) return;

            const rules = template.automation_rules;

            for (const rule of rules) {
                // 1. Basic Trigger Check
                if (rule.trigger !== event) continue;

                // 2. Simple Condition Check (e.g., stage matches)
                if (rule.condition && rule.condition.stage) {
                    if (rule.condition.stage !== payload.stage) continue;
                }

                console.log(`[TemplateAutomation] Triggering rule for event: ${event} on tenant: ${tenantId}`);
                await this.executeActions(rule.actions, payload, tenantId);
            }
        } catch (err) {
            console.error('[TemplateAutomation] Execution Error:', err.message);
        }
    }

    /**
     * Executes a list of actions for a matched rule.
     */
    async executeActions(actions, payload, tenantId) {
        for (const action of actions) {
            switch (action.type) {
                case 'create_task':
                    await this.createAutomatedTask(action, payload, tenantId);
                    break;

                case 'notify':
                    await this.sendAutomatedNotification(action, payload, tenantId);
                    break;

                default:
                    console.warn(`[TemplateAutomation] Unknown action type: ${action.type}`);
            }
        }
    }

    /**
     * Action: CREATE_TASK
     * Assigned always to the Deal Owner (payload.assigned_to)
     */
    async createAutomatedTask(action, payload, tenantId) {
        if (!payload.assigned_to) return;

        try {
            const custom = payload.custom_fields || {};
            const contextStr = [custom.project, custom.unit_type].filter(Boolean).join(' • ');
            
            const title = `[AUTO] ${action.title || 'Follow up'}${contextStr ? `: ${contextStr}` : ''}`;
            const description = `Automated industry follow-up for deal "${payload.title}".\nProperty Details: ${contextStr || 'N/A'}`;

            await db.query(`
                INSERT INTO tasks (title, description, priority, status, assigned_to, tenant_id, parent_type, parent_id)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            `, [
                title,
                description,
                'high',
                'todo',
                payload.assigned_to,
                tenantId,
                'deals',
                payload.deal_id
            ]);
            console.log(`[TemplateAutomation] Task created with context: ${title}`);
        } catch (err) {
            console.error('[TemplateAutomation] Task creation error:', err.message);
        }
    }

    /**
     * Action: NOTIFY
     */
    async sendAutomatedNotification(action, payload, tenantId) {
        if (!payload.assigned_to) return;

        try {
            const custom = payload.custom_fields || {};
            const contextStr = [custom.project, custom.unit_type].filter(Boolean).join(' • ');
            const message = `📍 ${action.message || 'New follow-up needed'}${contextStr ? ` for ${contextStr}` : ''}`;

            await notificationService.notify({
                userId: payload.assigned_to,
                tenantId,
                type: 'info',
                title: 'Business Automation',
                message,
                link: '/tasks'
            });
            console.log(`[TemplateAutomation] Notification upgraded: ${message}`);
        } catch (err) {
            console.error('[TemplateAutomation] Notification error:', err.message);
        }
    }
}

module.exports = new TemplateAutomationService();
