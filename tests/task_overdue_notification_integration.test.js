/**
 * 🧪 Test Suite: Tashgheel CRM — P2.3 `task.overdue` Integration
 *
 * Verifies the complete task overdue alert engine:
 * 1. Overdue active task generates in-app alert & enqueues WhatsApp job.
 * 2. Completed task (status = 'completed') past due_date is ignored.
 * 3. Cancelled task (status = 'cancelled') past due_date is ignored.
 * 4. Future task (due_date > NOW()) is ignored.
 * 5. Employee without phone receives in-app alert, skips WhatsApp gracefully, no spam.
 * 6. Scanner idempotency: re-running does not produce duplicate alerts.
 * 7. Rescheduling to a new due date allows a new overdue alert when the new deadline passes.
 * 8. Reassigning overdue task to another employee alerts the new assignee.
 * 9. Cross-tenant isolation verification.
 * 10. Worker processing in dryRun mode (zero real WhatsApp API calls).
 */

const db = require('../config/db');
const { scanAndSendOverdueTaskAlerts } = require('../services/taskOverdueService');
const notificationWorkerService = require('../services/notificationWorkerService');
const outboxService = require('../src/infrastructure/events/OutboxService');
const { eventBus } = require('../src/infrastructure/events/LocalEventBus');
const registerGlobalSubscribers = require('../src/domains/shared/subscribers/eventSubscribers');

// Ensure event subscribers are active for testing
registerGlobalSubscribers(eventBus);

async function runTaskOverdueIntegrationTest() {
    console.log('🚀 [Test Suite] Starting P2.3 task.overdue Integration Test...\n');
    let passCount = 0;
    let failCount = 0;

    const assert = (condition, description) => {
        if (condition) {
            console.log(`  ✅ PASS: ${description}`);
            passCount++;
        } else {
            console.error(`  ❌ FAIL: ${description}`);
            failCount++;
        }
    };

    // 1. Resolve Primary Demo Tenant & Branch
    const tRes = await db.query('SELECT id FROM tenants ORDER BY created_at ASC LIMIT 1');
    if (tRes.rows.length === 0) throw new Error('No tenant found in DB.');
    const tenantId = tRes.rows[0].id;

    // Resolve or create Tenant 2
    let tenantId2 = null;
    const tRes2 = await db.query('SELECT id FROM tenants WHERE id != $1 LIMIT 1', [tenantId]);
    if (tRes2.rows.length > 0) {
        tenantId2 = tRes2.rows[0].id;
    } else {
        const newT = await db.query(`
            INSERT INTO tenants (name, domain)
            VALUES ('Tenant 2 Overdue', 'tenant2_overdue_${Date.now()}.com')
            RETURNING id
        `);
        tenantId2 = newT.rows[0].id;
    }

    const bRes = await db.query('SELECT id FROM branches WHERE tenant_id = $1 LIMIT 1', [tenantId]);
    const branchId = bRes.rows[0]?.id || null;

    let branchId2 = null;
    const bRes2 = await db.query('SELECT id FROM branches WHERE tenant_id = $1 LIMIT 1', [tenantId2]);
    if (bRes2.rows.length > 0) {
        branchId2 = bRes2.rows[0].id;
    } else {
        const newB2 = await db.query(`
            INSERT INTO branches (name, tenant_id)
            VALUES ('Branch 2 Overdue', $1)
            RETURNING id
        `, [tenantId2]);
        branchId2 = newB2.rows[0].id;
    }

    // 2. Setup Test Users
    // Manager
    const mgrRes = await db.query(`
        INSERT INTO users (name, email, password_hash, role, tenant_id)
        VALUES ('Overdue Manager', 'mgr_overdue_${Date.now()}@tashgheel.com', 'dummy_hash', 'manager', $1)
        RETURNING id, name
    `, [tenantId]);
    const managerUser = mgrRes.rows[0];

    // Employee A (With phone)
    const empARes = await db.query(`
        INSERT INTO users (name, email, phone, password_hash, role, tenant_id)
        VALUES ('Overdue Emp A', 'emp_a_od_${Date.now()}@tashgheel.com', '01011223344', 'dummy_hash', 'employee', $1)
        RETURNING id, name, phone
    `, [tenantId]);
    const empA = empARes.rows[0];

    // Employee B (With phone)
    const empBRes = await db.query(`
        INSERT INTO users (name, email, phone, password_hash, role, tenant_id)
        VALUES ('Overdue Emp B', 'emp_b_od_${Date.now()}@tashgheel.com', '01055667788', 'dummy_hash', 'employee', $1)
        RETURNING id, name, phone
    `, [tenantId]);
    const empB = empBRes.rows[0];

    // Employee No Phone
    const empNoPhoneRes = await db.query(`
        INSERT INTO users (name, email, phone, password_hash, role, tenant_id)
        VALUES ('Overdue Emp NoPhone', 'emp_np_od_${Date.now()}@tashgheel.com', NULL, 'dummy_hash', 'employee', $1)
        RETURNING id, name, phone
    `, [tenantId]);
    const empNoPhone = empNoPhoneRes.rows[0];

    // Employee Tenant 2
    const empT2Res = await db.query(`
        INSERT INTO users (name, email, phone, password_hash, role, tenant_id)
        VALUES ('Overdue Emp T2', 'emp_t2_od_${Date.now()}@tashgheel.com', '01099887766', 'dummy_hash', 'employee', $1)
        RETURNING id, name, phone
    `, [tenantId2]);
    const empT2 = empT2Res.rows[0];

    const createdTaskIds = [];

    try {
        // =====================================================================
        // Test 1: Overdue active task generates in-app alert & WhatsApp job
        // =====================================================================
        console.log('📋 Test 1: Overdue Active Task Alert Dispatch');
        const dueTime1 = new Date(Date.now() - 3600000).toISOString(); // 1 hour ago
        const task1Res = await db.query(`
            INSERT INTO tasks (title, description, priority, status, assigned_to, created_by, due_date, tenant_id, branch_id)
            VALUES ('إعداد تقرير المبيعات الشهري', 'تقرير تفصيلي', 'high', 'in_progress', $1, $2, $3, $4, $5)
            RETURNING id, due_date
        `, [empA.id, managerUser.id, dueTime1, tenantId, branchId]);
        const task1Id = task1Res.rows[0].id;
        createdTaskIds.push(task1Id);

        const alerted1 = await scanAndSendOverdueTaskAlerts({ tenantId });
        assert(alerted1 >= 1, `Scanner processed and returned at least 1 alerted task (count: ${alerted1})`);

        // Check in-app notification created
        const inApp1 = await db.query(`
            SELECT * FROM system_notifications
            WHERE user_id = $1 AND tenant_id = $2 AND type = 'task_overdue'
            ORDER BY created_at DESC LIMIT 1
        `, [String(empA.id), tenantId]);
        assert(inApp1.rows.length === 1, 'In-App notification record created in system_notifications');
        assert(inApp1.rows[0].title.includes('مهمة متأخرة'), 'Title indicates overdue status');

        // Check WhatsApp notification job created
        const job1 = await db.query(`
            SELECT * FROM notification_jobs
            WHERE recipient_id = $1 AND tenant_id = $2 AND event_name = 'task.overdue'
            ORDER BY created_at DESC LIMIT 1
        `, [String(empA.id), tenantId]);
        assert(job1.rows.length === 1, 'WhatsApp job enqueued in notification_jobs');
        assert(job1.rows[0].recipient_phone === '+201011223344', 'Phone normalized to +201011223344');
        assert(job1.rows[0].status === 'pending', 'WhatsApp job initial status is pending');

        // =====================================================================
        // Test 2: Completed task past due date is IGNORED
        // =====================================================================
        console.log('\n📋 Test 2: Completed Task Ignored by Scanner');
        const task2Res = await db.query(`
            INSERT INTO tasks (title, description, priority, status, assigned_to, created_by, due_date, tenant_id, branch_id)
            VALUES ('مهمة منتهية', 'مكتملة بالفعل', 'medium', 'completed', $1, $2, NOW() - INTERVAL '2 hours', $3, $4)
            RETURNING id
        `, [empA.id, managerUser.id, tenantId, branchId]);
        createdTaskIds.push(task2Res.rows[0].id);

        const inAppBeforeTest2 = await db.query('SELECT COUNT(*) as c FROM system_notifications WHERE user_id = $1 AND type = \'task_overdue\'', [String(empA.id)]);
        await scanAndSendOverdueTaskAlerts({ tenantId });
        const inAppAfterTest2 = await db.query('SELECT COUNT(*) as c FROM system_notifications WHERE user_id = $1 AND type = \'task_overdue\'', [String(empA.id)]);
        assert(inAppBeforeTest2.rows[0].c === inAppAfterTest2.rows[0].c, 'Completed task produced zero new alerts');

        // =====================================================================
        // Test 3: Cancelled task past due date is IGNORED
        // =====================================================================
        console.log('\n📋 Test 3: Cancelled Task Ignored by Scanner');
        const task3Res = await db.query(`
            INSERT INTO tasks (title, description, priority, status, assigned_to, created_by, due_date, tenant_id, branch_id)
            VALUES ('مهمة ملغاة', 'تم الإلغاء', 'medium', 'cancelled', $1, $2, NOW() - INTERVAL '3 hours', $3, $4)
            RETURNING id
        `, [empA.id, managerUser.id, tenantId, branchId]);
        createdTaskIds.push(task3Res.rows[0].id);

        const inAppBeforeTest3 = await db.query('SELECT COUNT(*) as c FROM system_notifications WHERE user_id = $1 AND type = \'task_overdue\'', [String(empA.id)]);
        await scanAndSendOverdueTaskAlerts({ tenantId });
        const inAppAfterTest3 = await db.query('SELECT COUNT(*) as c FROM system_notifications WHERE user_id = $1 AND type = \'task_overdue\'', [String(empA.id)]);
        assert(inAppBeforeTest3.rows[0].c === inAppAfterTest3.rows[0].c, 'Cancelled task produced zero new alerts');

        // =====================================================================
        // Test 4: Future task (due_date > NOW) is IGNORED
        // =====================================================================
        console.log('\n📋 Test 4: Future Task Ignored by Scanner');
        const task4Res = await db.query(`
            INSERT INTO tasks (title, description, priority, status, assigned_to, created_by, due_date, tenant_id, branch_id)
            VALUES ('مهمة مستقبلية', 'لم يحن موعدها', 'urgent', 'todo', $1, $2, NOW() + INTERVAL '1 day', $3, $4)
            RETURNING id
        `, [empA.id, managerUser.id, tenantId, branchId]);
        createdTaskIds.push(task4Res.rows[0].id);

        const inAppBeforeTest4 = await db.query('SELECT COUNT(*) as c FROM system_notifications WHERE user_id = $1 AND type = \'task_overdue\'', [String(empA.id)]);
        await scanAndSendOverdueTaskAlerts({ tenantId });
        const inAppAfterTest4 = await db.query('SELECT COUNT(*) as c FROM system_notifications WHERE user_id = $1 AND type = \'task_overdue\'', [String(empA.id)]);
        assert(inAppBeforeTest4.rows[0].c === inAppAfterTest4.rows[0].c, 'Future task produced zero new alerts');

        // =====================================================================
        // Test 5: Employee without phone receives In-App, skips WhatsApp
        // =====================================================================
        console.log('\n📋 Test 5: Missing Phone Resilience (In-App Only, No WhatsApp)');
        const task5Res = await db.query(`
            INSERT INTO tasks (title, description, priority, status, assigned_to, created_by, due_date, tenant_id, branch_id)
            VALUES ('مهمة لموظف بدون هاتف', 'تنبيه In-App فقط', 'high', 'in_progress', $1, $2, NOW() - INTERVAL '30 minutes', $3, $4)
            RETURNING id
        `, [empNoPhone.id, managerUser.id, tenantId, branchId]);
        createdTaskIds.push(task5Res.rows[0].id);

        const alerted5 = await scanAndSendOverdueTaskAlerts({ tenantId });
        assert(alerted5 >= 1, `Scanner processed overdue task for employee without phone (count: ${alerted5})`);

        const inApp5 = await db.query(`
            SELECT * FROM system_notifications WHERE user_id = $1 AND type = 'task_overdue'
        `, [String(empNoPhone.id)]);
        assert(inApp5.rows.length === 1, 'In-App notification successfully created for employee without phone');

        const job5 = await db.query(`
            SELECT * FROM notification_jobs WHERE recipient_id = $1 AND event_name = 'task.overdue'
        `, [String(empNoPhone.id)]);
        assert(job5.rows.length === 0, 'No WhatsApp job created for employee without phone');

        // =====================================================================
        // Test 6: Scanner Idempotency on Already-Alerted Overdue Tasks
        // =====================================================================
        console.log('\n📋 Test 6: Scanner Idempotency on Already-Alerted Tasks');
        const inAppCountBefore6 = await db.query('SELECT COUNT(*) as c FROM system_notifications WHERE tenant_id = $1 AND type = \'task_overdue\'', [tenantId]);
        const jobsCountBefore6 = await db.query('SELECT COUNT(*) as c FROM notification_jobs WHERE tenant_id = $1 AND event_name = \'task.overdue\'', [tenantId]);

        const alerted6 = await scanAndSendOverdueTaskAlerts({ tenantId });
        assert(alerted6 === 0, `Subsequent scan returned 0 alerted tasks (count: ${alerted6})`);

        const inAppCountAfter6 = await db.query('SELECT COUNT(*) as c FROM system_notifications WHERE tenant_id = $1 AND type = \'task_overdue\'', [tenantId]);
        const jobsCountAfter6 = await db.query('SELECT COUNT(*) as c FROM notification_jobs WHERE tenant_id = $1 AND event_name = \'task.overdue\'', [tenantId]);

        assert(inAppCountBefore6.rows[0].c === inAppCountAfter6.rows[0].c, 'No duplicate in-app alerts created on rerun');
        assert(jobsCountBefore6.rows[0].c === jobsCountAfter6.rows[0].c, 'No duplicate WhatsApp jobs created on rerun');

        // =====================================================================
        // Test 7: Rescheduled Overdue Task Allows New Legitimate Alert
        // =====================================================================
        console.log('\n📋 Test 7: Rescheduled Overdue Task (New Due Date)');
        // Update task1's due_date to a new timestamp (still in the past for testing)
        const newDueTime = new Date(Date.now() - 1800000).toISOString(); // 30 minutes ago
        await db.query(`
            UPDATE tasks SET due_date = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2
        `, [newDueTime, task1Id]);

        const alerted7 = await scanAndSendOverdueTaskAlerts({ tenantId });
        assert(alerted7 >= 1, `Scanner alerted rescheduled task with new due date (count: ${alerted7})`);

        const inApp1AfterResched = await db.query(`
            SELECT COUNT(*) as c FROM system_notifications WHERE user_id = $1 AND type = 'task_overdue'
        `, [String(empA.id)]);
        assert(parseInt(inApp1AfterResched.rows[0].c, 10) === 2, 'Second In-App notification recorded for rescheduled due date');

        const jobs1AfterResched = await db.query(`
            SELECT COUNT(*) as c FROM notification_jobs WHERE recipient_id = $1 AND event_name = 'task.overdue'
        `, [String(empA.id)]);
        assert(parseInt(jobs1AfterResched.rows[0].c, 10) === 2, 'Second WhatsApp job enqueued under distinct due epoch key');

        // =====================================================================
        // Test 8: Reassigning Overdue Task to Employee B Alerts Employee B
        // =====================================================================
        console.log('\n📋 Test 8: Reassigning Overdue Task to Employee B');
        await db.query(`
            UPDATE tasks SET assigned_to = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2
        `, [empB.id, task1Id]);

        const alerted8 = await scanAndSendOverdueTaskAlerts({ tenantId });
        assert(alerted8 >= 1, `Scanner alerted new assignee (Employee B) for overdue task (count: ${alerted8})`);

        const inAppB = await db.query(`
            SELECT * FROM system_notifications WHERE user_id = $1 AND type = 'task_overdue'
        `, [String(empB.id)]);
        assert(inAppB.rows.length === 1, 'In-App notification sent to new assignee Employee B');

        const jobB = await db.query(`
            SELECT * FROM notification_jobs WHERE recipient_id = $1 AND event_name = 'task.overdue'
        `, [String(empB.id)]);
        assert(jobB.rows.length === 1, 'WhatsApp job enqueued for new assignee Employee B');

        // =====================================================================
        // Test 9: Complete Cross-Tenant Isolation
        // =====================================================================
        console.log('\n📋 Test 9: Cross-Tenant Isolation Verification');
        const taskT2Res = await db.query(`
            INSERT INTO tasks (title, description, priority, status, assigned_to, created_by, due_date, tenant_id, branch_id)
            VALUES ('مهمة متأخرة Tenant 2', 'عزل تام', 'urgent', 'in_progress', $1, $1, NOW() - INTERVAL '15 minutes', $2, $3)
            RETURNING id
        `, [empT2.id, tenantId2, branchId2]);
        createdTaskIds.push(taskT2Res.rows[0].id);

        await scanAndSendOverdueTaskAlerts({ tenantId: tenantId2 });

        const t2Jobs = await db.query(`
            SELECT * FROM notification_jobs WHERE recipient_id = $1 AND tenant_id = $2 AND event_name = 'task.overdue'
        `, [String(empT2.id), tenantId2]);
        assert(t2Jobs.rows.length === 1, 'Tenant 2 task overdue job strictly isolated under Tenant 2');

        const leakedJobs = await db.query(`
            SELECT * FROM notification_jobs WHERE recipient_id = $1 AND tenant_id = $2
        `, [String(empT2.id), tenantId]);
        assert(leakedJobs.rows.length === 0, 'No overdue job leaked into Tenant 1');

        // =====================================================================
        // Test 10: Notification Worker Processing in dryRun Mode
        // =====================================================================
        console.log('\n📋 Test 10: Notification Worker in dryRun Mode');
        const workerResult = await notificationWorkerService.processPendingJobs({ batchSize: 10, dryRun: true });
        assert(workerResult.processed >= 1, `Worker processed overdue task jobs in dryRun (count: ${workerResult.processed})`);
        assert(workerResult.failed === 0, `Worker experienced 0 failures in dryRun (failures: ${workerResult.failed})`);

        const checkCompletedJob = await db.query(`
            SELECT status, meta_message_id FROM notification_jobs WHERE id = $1
        `, [job1.rows[0].id]);
        assert(checkCompletedJob.rows[0].status === 'completed', 'Job status marked completed');
        assert(checkCompletedJob.rows[0].meta_message_id.startsWith('wamid.mock.'), 'Mock WAMID attached');

        const checkCompletedLog = await db.query(`
            SELECT delivery_status, sent_at FROM notification_logs WHERE job_id = $1
        `, [job1.rows[0].id]);
        assert(checkCompletedLog.rows[0].delivery_status === 'sent', 'Log delivery_status updated to sent');
        assert(checkCompletedLog.rows[0].sent_at !== null, 'Log sent_at timestamp is set');

    } finally {
        console.log('\n🧹 Cleaning up test artifacts...');
        if (createdTaskIds.length > 0) {
            await db.query(`DELETE FROM tasks WHERE id::text = ANY($1::text[])`, [createdTaskIds.map(String)]);
        }

        const userIds = [managerUser.id, empA.id, empB.id, empNoPhone.id, empT2.id];
        await db.query(`
            DELETE FROM notification_logs WHERE job_id IN (
                SELECT id FROM notification_jobs WHERE recipient_id = ANY($1::text[])
            )
        `, [userIds.map(String)]);
        await db.query(`DELETE FROM notification_jobs WHERE recipient_id = ANY($1::text[])`, [userIds.map(String)]);
        await db.query(`DELETE FROM system_notifications WHERE user_id::text = ANY($1::text[])`, [userIds.map(String)]);
        await db.query(`DELETE FROM users WHERE id::text = ANY($1::text[])`, [userIds.map(String)]);

        console.log('✨ Cleanup complete.');
    }

    console.log(`\n========================================`);
    console.log(`P2.3 Test Results: ${passCount} PASSED, ${failCount} FAILED`);
    console.log(`========================================\n`);

    if (failCount > 0) {
        process.exit(1);
    }
}

runTaskOverdueIntegrationTest()
    .then(() => {
        console.log('🎉 P2.3 task.overdue integration tests passed successfully!');
        process.exit(0);
    })
    .catch(err => {
        console.error('💥 Test execution threw an uncaught error:', err);
        process.exit(1);
    });
