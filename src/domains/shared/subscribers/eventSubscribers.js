const activityService = require('../services/activityService');
const notificationDispatcher = require('../services/notificationDispatcher');

/**
 * 📡 Register Global Event Subscribers
 * Listens to domain events and executes cross-cutting side effects automatically:
 *  - Universal Activity Feed logging
 *  - Notification dispatching
 *  - Audit Trail generation
 */
function registerGlobalSubscribers(eventBus) {
    console.log('📡 [Subscribers] Registering global domain event listeners...');

    // Wildcard subscriber for Activity Feed & Audit Logging
    eventBus.subscribe('*', async (event) => {
        try {
            await activityService.logActivity({
                tenantId: event.tenantId,
                branchId: event.branchId,
                entityType: event.aggregateType,
                entityId: event.aggregateId,
                activityType: event.eventName.toUpperCase().replace(/\./g, '_'),
                actorId: event.actorId,
                title: `Event: ${event.eventName} (${event.version})`,
                details: event.payload
            });
        } catch (err) {
            console.error('❌ [Subscribers] Activity logging failed:', err.message);
        }
    });

    // 1. Property Reservation Created Listener
    eventBus.subscribe('reservation.created', async (event) => {
        const { unitNumber, price, customerId, assignedTo } = event.payload || {};
        
        if (assignedTo) {
            await notificationDispatcher.dispatch({
                tenantId: event.tenantId,
                branchId: event.branchId,
                userId: assignedTo,
                type: 'success',
                title: '🏢 New Property Reservation',
                message: `Unit #${unitNumber || event.aggregateId} has been reserved.`,
                link: '/real-estate/units',
                channels: ['in_app']
            });
        }
    });

    // 2. Deal Stage Changed Listener
    eventBus.subscribe('deal.stage_changed', async (event) => {
        const { dealTitle, newStage, assignedTo } = event.payload || {};
        
        if (assignedTo) {
            await notificationDispatcher.dispatch({
                tenantId: event.tenantId,
                branchId: event.branchId,
                userId: assignedTo,
                type: 'info',
                title: '💼 Deal Stage Updated',
                message: `Deal '${dealTitle}' moved to stage '${newStage}'.`,
                link: '/deals',
                channels: ['in_app']
            });
        }
    });

    // 3. Payment Received Listener
    eventBus.subscribe('payment.received', async (event) => {
        const { invoiceNumber, amount, receivedBy } = event.payload || {};
        
        if (receivedBy) {
            await notificationDispatcher.dispatch({
                tenantId: event.tenantId,
                branchId: event.branchId,
                userId: receivedBy,
                type: 'success',
                title: '💰 Payment Received',
                message: `Payment of EGP ${amount} recorded for Invoice ${invoiceNumber}.`,
                link: '/invoices',
                channels: ['in_app']
            });
        }
    });

    // 4. Lead Assigned Listener (P2.1 — Employee Alerts)
    eventBus.subscribe('lead.assigned', async (event) => {
        try {
            const { leadId, leadName, leadPhone, assignedTo, assignedByUserId, assignedByName } = event.payload || {};
            if (!assignedTo) return;

            // Strict guard: Do not send alert if assigned to self
            if (assignedByUserId && String(assignedTo) === String(assignedByUserId)) return;

            const db = require('../../../../config/db');
            const userRes = await db.query(
                `SELECT id, name, phone, is_working FROM users WHERE id = $1 AND tenant_id::text = $2::text LIMIT 1`,
                [assignedTo, event.tenantId]
            );

            if (userRes.rows.length === 0) {
                console.warn(`[Subscriber lead.assigned] User #${assignedTo} not found for tenant ${event.tenantId}`);
                return;
            }

            const assignee = userRes.rows[0];
            if (!assignee.phone) {
                console.log(`ℹ️ [Subscriber lead.assigned] Assignee #${assignedTo} (${assignee.name}) has no phone registered. Skipping WhatsApp.`);
                return;
            }

            const notificationQueueService = require('../../../../services/notificationQueueService');
            const deduplicationKey = `lead.assigned:${event.tenantId}:${leadId || event.aggregateId}:${assignedTo}`;

            const senderText = assignedByName ? `بواسطة: ${assignedByName}` : '';
            const messageText = `عميل جديد تم إسناده إليك 🎯\nاسم العميل: ${leadName || 'عميل محتمل'}\n${leadPhone ? `الهاتف: ${leadPhone}\n` : ''}${senderText}\nرابط العميل: /contacts/customers`;

            await notificationQueueService.enqueueNotificationJob({
                tenantId: event.tenantId,
                branchId: event.branchId,
                eventName: 'lead.assigned',
                channel: 'whatsapp',
                recipientType: 'employee',
                recipientId: assignedTo,
                recipientPhone: assignee.phone,
                recipientName: assignee.name,
                payload: {
                    leadId: leadId || event.aggregateId,
                    leadName,
                    leadPhone,
                    assignedByUserId,
                    assignedByName,
                    messageText
                },
                deduplicationKey,
                priority: 20
            });

            console.log(`📬 [Subscriber lead.assigned] Enqueued WhatsApp alert for employee ${assignee.name} (${assignee.phone})`);
        } catch (err) {
            console.error('❌ [Subscriber lead.assigned] Error:', err.message);
        }
    });

    // 5. Task Assigned Listener (P2.2 — Employee Alerts)
    eventBus.subscribe('task.assigned', async (event) => {
        try {
            const { taskId, taskTitle, dueDate, priority, assignedTo, assignedByUserId, assignedByName, assignedAt } = event.payload || {};
            if (!assignedTo) return;

            // Strict guard: Do not send alert if assigned to self
            if (assignedByUserId && String(assignedTo) === String(assignedByUserId)) return;

            const db = require('../../../../config/db');
            const userRes = await db.query(
                `SELECT id, name, phone, is_working FROM users WHERE id = $1 AND tenant_id::text = $2::text LIMIT 1`,
                [assignedTo, event.tenantId]
            );

            if (userRes.rows.length === 0) {
                console.warn(`[Subscriber task.assigned] User #${assignedTo} not found for tenant ${event.tenantId}`);
                return;
            }

            const assignee = userRes.rows[0];
            if (!assignee.phone) {
                console.log(`ℹ️ [Subscriber task.assigned] Assignee #${assignedTo} (${assignee.name}) has no phone registered. Skipping WhatsApp.`);
                return;
            }

            const notificationQueueService = require('../../../../services/notificationQueueService');

            // Deduplication Key:
            // Combines tenant, task, assignedTo, and assignment timestamp (assignedAt)
            // to allow legitimate reassignments (A -> B -> A) while strictly blocking
            // duplicated alerts for the same assignment event replay.
            const assignmentTime = assignedAt ? new Date(assignedAt).getTime() : (event.occurredAt ? new Date(event.occurredAt).getTime() : '');
            const deduplicationKey = assignmentTime
                ? `task.assigned:${event.tenantId}:${taskId || event.aggregateId}:${assignedTo}:${assignmentTime}`
                : `task.assigned:${event.tenantId}:${taskId || event.aggregateId}:${assignedTo}`;

            const senderText = assignedByName ? `بواسطة: ${assignedByName}\n` : '';
            const dueText = dueDate ? `تاريخ الاستحقاق: ${new Date(dueDate).toLocaleDateString('ar-EG')}\n` : '';
            const priorityText = priority ? `الأولوية: ${priority}\n` : '';
            const messageText = `مهمة جديدة تم إسنادها إليك 📋\nعنوان المهمة: ${taskTitle || 'مهمة عمل'}\n${priorityText}${dueText}${senderText}رابط المهام: /tasks`;

            await notificationQueueService.enqueueNotificationJob({
                tenantId: event.tenantId,
                branchId: event.branchId,
                eventName: 'task.assigned',
                channel: 'whatsapp',
                recipientType: 'employee',
                recipientId: assignedTo,
                recipientPhone: assignee.phone,
                recipientName: assignee.name,
                payload: {
                    taskId: taskId || event.aggregateId,
                    taskTitle,
                    dueDate,
                    priority,
                    assignedByUserId,
                    assignedByName,
                    assignedAt,
                    messageText
                },
                deduplicationKey,
                priority: 20
            });

            console.log(`📬 [Subscriber task.assigned] Enqueued WhatsApp alert for employee ${assignee.name} (${assignee.phone})`);
        } catch (err) {
            console.error('❌ [Subscriber task.assigned] Error:', err.message);
        }
    });
}

module.exports = registerGlobalSubscribers;
