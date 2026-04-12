const db = require('../config/db');
const notificationService = require('./notificationService');
const workflowControl = require('./workflowControl');

/**
 * 🔥 WORKFLOW ENGINE (Phase 2 — Automation Layer)
 * All workflows now pass through workflowControl.run() for:
 *   ✅ Toggle   ✅ Cooldown   ✅ Idempotency   ✅ Audit Log   ✅ Failure Trap
 */
class WorkflowEngine {

    /**
     * WORKFLOW 1: Low Stock → Auto-Procurement
     * RULE KEY: LOW_STOCK_AUTO_PROCUREMENT
     * Cooldown: 6 hours per product (enforced by control layer)
     */
    async onLowStock({ product_id, product_name, current_stock, tenant_id, branch_id, triggered_by }) {
        await workflowControl.run({
            rule_key: 'LOW_STOCK_AUTO_PROCUREMENT',
            tenant_id,
            branch_id,
            event_type: 'LOW_STOCK',
            entity_type: 'products',
            entity_id: product_id,
            metadata: { product_id, product_name, current_stock }
        }, async () => {
            // IDEMPOTENCY GUARD: Check if a draft PR already exists for this product
            const existingDraft = await db.query(`
                SELECT id FROM purchase_requests
                WHERE tenant_id = $1 AND branch_id = $2 AND product_id = $3 AND status = 'draft'
            `, [tenant_id, branch_id, product_id]);

            if (existingDraft.rows.length > 0) {
                console.log(`[Workflow] Idempotency skip: Draft PR already exists for product #${product_id}`);
                return; // Silent skip — prevents duplicate purchase requests
            }

            // Action 1: Create Draft Purchase Request
            await db.query(`
                INSERT INTO purchase_requests 
                (tenant_id, branch_id, product_id, quantity_requested, status, notes, created_by)
                VALUES ($1, $2, $3, $4, 'draft', $5, $6)
            `, [
                tenant_id, branch_id, product_id, 50,
                `[AUTO] Stock auto-replenishment. Current stock: ${current_stock}`,
                triggered_by || null
            ]);

            // Action 2: Manager notification
            await notificationService.notifyRole({
                role: 'manager',
                type: 'LOW_STOCK',
                title: '⚠️ Auto Purchase Request Created',
                message: `Critical: "${product_name || `Product #${product_id}`}" has only ${current_stock} units left. A draft purchase request was auto-generated.`,
                tenant_id, branch_id,
                link: '/inventory/movements',
                metadata: { product_id, current_stock, action: 'create_purchase_request' }
            });
        });
    }

    /**
     * WORKFLOW 2: Late Employee Escalation
     * RULE KEY: LATE_EMPLOYEE_ESCALATION
     * Condition: 3+ late events in current month → formal warning
     */
    async onEmployeeLate({ user_id, user_name, late_minutes, tenant_id, branch_id }) {
        await workflowControl.run({
            rule_key: 'LATE_EMPLOYEE_ESCALATION',
            tenant_id,
            branch_id,
            event_type: 'EMPLOYEE_LATE',
            entity_type: 'hr_attendance',
            entity_id: user_id,
            metadata: { user_id, user_name, late_minutes }
        }, async () => {
            // Evaluate: count late check-ins this calendar month
            const countRes = await db.query(`
                SELECT COUNT(*) as late_count
                FROM hr_attendance
                WHERE user_id = $1 AND tenant_id = $2
                AND status = 'late'
                AND DATE_TRUNC('month', check_in) = DATE_TRUNC('month', CURRENT_DATE)
            `, [user_id, tenant_id]);

            const lateCount = parseInt(countRes.rows[0].late_count);

            // Always send a basic manager alert for any late
            await notificationService.notifyRole({
                role: 'manager',
                type: 'EMPLOYEE_LATE',
                title: `🕐 ${user_name} Checked In Late`,
                message: `${user_name} was ${late_minutes} minutes late today. Monthly late count: ${lateCount}.`,
                tenant_id, branch_id,
                link: '/hr/attendance/admin',
                metadata: { user_id, late_minutes, lateCount }
            });

            // Escalation: 3+ times → formal HR warning record
            if (lateCount >= 3) {
                // IDEMPOTENCY: Check if a warning was already created THIS month
                const existingWarning = await db.query(`
                    SELECT id FROM hr_requests
                    WHERE user_id = $1 AND tenant_id = $2 AND type = 'warning'
                    AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', CURRENT_DATE)
                    AND (payload->>'triggered_by') = 'workflow_engine'
                `, [user_id, tenant_id]);

                if (existingWarning.rows.length === 0) {
                    await db.query(`
                        INSERT INTO hr_requests (user_id, tenant_id, branch_id, type, status, payload)
                        VALUES ($1, $2, $3, 'warning', 'auto_generated', $4)
                    `, [user_id, tenant_id, branch_id, JSON.stringify({
                        reason: 'Repeated Late Attendance',
                        late_count: lateCount,
                        triggered_by: 'workflow_engine',
                        late_minutes_today: late_minutes
                    })]);

                    await notificationService.notifyRole({
                        role: 'manager',
                        type: 'SYSTEM_ALERT',
                        title: `🚨 Escalation: ${user_name} — ${lateCount}x Late This Month`,
                        message: `A formal HR warning record has been auto-generated for ${user_name}.`,
                        tenant_id, branch_id,
                        link: '/hr/attendance/admin',
                        metadata: { user_id, lateCount, action: 'auto_warning_created' }
                    });
                }
            }
        });
    }

    /**
     * WORKFLOW 3: New Deal → Auto-Assignment
     * RULE KEY: DEAL_AUTO_ASSIGNMENT
     */
    async onDealCreated({ deal_id, deal_title, tenant_id, branch_id }) {
        await workflowControl.run({
            rule_key: 'DEAL_AUTO_ASSIGNMENT',
            tenant_id,
            branch_id,
            event_type: 'DEAL_CREATED',
            entity_type: 'deals',
            entity_id: deal_id,
            metadata: { deal_id, deal_title }
        }, async () => {
            // Find least-busy employee
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
            `, [tenant_id]);

            if (assigneeRes.rows.length === 0) return;

            const assignee = assigneeRes.rows[0];

            await db.query(`UPDATE deals SET assigned_to = $1 WHERE id = $2 AND tenant_id = $3`, [assignee.id, deal_id, tenant_id]);

            await notificationService.notify({
                type: 'SYSTEM_ALERT',
                title: '📋 New Deal Assigned to You',
                message: `Workflow Engine assigned deal "${deal_title}" to you (load balance: ${assignee.open_deals} open deals).`,
                tenant_id, branch_id,
                user_id: assignee.id,
                link: '/deals',
                metadata: { deal_id, assigned_by: 'workflow_engine' }
            });
        });
    }
}

module.exports = new WorkflowEngine();
