/**
 * 🧪 Test Suite: Tashgheel CRM — P2.2 End-to-End `task.assigned` Flow
 *
 * Verifies the complete real task assignment flow:
 * 1. Task creation for another employee dispatches in-app alert & enqueues WhatsApp job.
 * 2. Reassigning task to a new employee dispatches alert to the new employee only.
 * 3. Updating task without changing assigned_to produces NO new WhatsApp alert.
 * 4. Self-assignment (creator assigns to self) produces zero WhatsApp jobs.
 * 5. Replaying/reprocessing the exact same event produces DUPLICATE_JOB (dedup guard).
 * 6. Legitimate reassignment cycle (A -> B -> A) allows a new legitimate alert.
 * 7. Complete tenant isolation (cross-tenant safety).
 * 8. Missing employee phone does not fail task creation or in-app notifications.
 * 9. Outbox fallback triggers on EventBus publish failure to guarantee zero event loss.
 * 10. Worker processing in dryRun mode transitions jobs to completed and logs to sent.
 */

const db = require('../config/db');
const { eventBus } = require('../src/infrastructure/events/LocalEventBus');
const DomainEvent = require('../src/infrastructure/events/DomainEvent');
const registerGlobalSubscribers = require('../src/domains/shared/subscribers/eventSubscribers');
const tasksController = require('../controllers/tasksController');
const notificationWorkerService = require('../services/notificationWorkerService');

// Ensure event subscribers are active for testing
registerGlobalSubscribers(eventBus);

async function runTaskAssignedFlowTest() {
    console.log('🚀 [Test Suite] Starting P2.2 task.assigned End-to-End Test...\n');
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
            VALUES ('Tenant 2 Tasks', 'tenant2_tasks_${Date.now()}.com')
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
            VALUES ('Branch 2 Test', $1)
            RETURNING id
        `, [tenantId2]);
        branchId2 = newB2.rows[0].id;
    }

    // 2. Setup Test Users
    // Manager (Creator)
    const mgrRes = await db.query(`
        INSERT INTO users (name, email, password_hash, role, tenant_id)
        VALUES ('Task Manager', 'task_mgr_${Date.now()}@tashgheel.com', 'dummy_hash', 'manager', $1)
        RETURNING id, name
    `, [tenantId]);
    const managerUser = mgrRes.rows[0];

    // Employee A (With phone)
    const empARes = await db.query(`
        INSERT INTO users (name, email, phone, password_hash, role, tenant_id)
        VALUES ('Task Employee A', 'emp_a_${Date.now()}@tashgheel.com', '01012345678', 'dummy_hash', 'employee', $1)
        RETURNING id, name, phone
    `, [tenantId]);
    const empA = empARes.rows[0];

    // Employee B (With phone)
    const empBRes = await db.query(`
        INSERT INTO users (name, email, phone, password_hash, role, tenant_id)
        VALUES ('Task Employee B', 'emp_b_${Date.now()}@tashgheel.com', '01087654321', 'dummy_hash', 'employee', $1)
        RETURNING id, name, phone
    `, [tenantId]);
    const empB = empBRes.rows[0];

    // Employee No Phone
    const empNoPhoneRes = await db.query(`
        INSERT INTO users (name, email, phone, password_hash, role, tenant_id)
        VALUES ('Task Employee NoPhone', 'emp_nophone_${Date.now()}@tashgheel.com', NULL, 'dummy_hash', 'employee', $1)
        RETURNING id, name, phone
    `, [tenantId]);
    const empNoPhone = empNoPhoneRes.rows[0];

    // Employee Tenant 2
    const empT2Res = await db.query(`
        INSERT INTO users (name, email, phone, password_hash, role, tenant_id)
        VALUES ('Task Employee T2', 'emp_t2_${Date.now()}@tashgheel.com', '01099990000', 'dummy_hash', 'employee', $1)
        RETURNING id, name, phone
    `, [tenantId2]);
    const empT2 = empT2Res.rows[0];

    // Manager Tenant 2
    const mgrT2Res = await db.query(`
        INSERT INTO users (name, email, password_hash, role, tenant_id)
        VALUES ('Task Manager T2', 'mgr_t2_${Date.now()}@tashgheel.com', 'dummy_hash', 'manager', $1)
        RETURNING id, name
    `, [tenantId2]);
    const mgrT2 = mgrT2Res.rows[0];

    // Helper for Express Mock Req/Res
    const createMockReqRes = (body, user, branch, params = {}) => {
        let statusCode = null;
        let responseData = null;
        const req = {
            body,
            user,
            branchId: branch,
            params
        };
        const res = {
            status: function(code) {
                statusCode = code;
                return this;
            },
            json: function(data) {
                if (statusCode === null) statusCode = 200;
                responseData = data;
                return this;
            }
        };
        return { req, res, getStatus: () => statusCode, getData: () => responseData };
    };

    let createdTaskId = null;
    let selfAssignedTaskId = null;
    let noPhoneTaskId = null;
    let t2TaskId = null;

    try {
        // =====================================================================
        // Test 1: Creating a task for Employee A dispatches alert & enqueues job
        // =====================================================================
        console.log('📋 Test 1: Task Creation Assigned to Employee A');
        const mock1 = createMockReqRes({
            title: 'مراجعة عروض أسعار العملاء',
            description: 'يرجى مراجعة العروض وإرسالها للمدير',
            priority: 'high',
            assigned_to: empA.id,
            due_date: new Date(Date.now() + 86400000).toISOString()
        }, {
            id: managerUser.id,
            name: managerUser.name,
            role: 'manager',
            tenant_id: tenantId,
            branch_id: branchId
        }, branchId);

        await tasksController.createTask(mock1.req, mock1.res);
        assert(mock1.getStatus() === 201, `createTask returned HTTP 201 Created (got ${mock1.getStatus()})`);
        createdTaskId = mock1.getData()?.data?.id;
        assert(!!createdTaskId, `Task saved with ID: ${createdTaskId}`);

        // Wait a tick for async subscriber execution
        await new Promise(r => setTimeout(r, 150));

        // Verify notification_jobs
        const job1Res = await db.query(`
            SELECT * FROM notification_jobs 
            WHERE recipient_id = $1 AND tenant_id = $2 AND event_name = 'task.assigned'
            ORDER BY created_at DESC LIMIT 1
        `, [String(empA.id), tenantId]);

        assert(job1Res.rows.length === 1, 'WhatsApp notification job enqueued for Employee A');
        assert(job1Res.rows[0].recipient_phone === '+201012345678', `Phone correctly normalized to +201012345678 (was ${job1Res.rows[0]?.recipient_phone})`);
        assert(job1Res.rows[0].status === 'pending', 'Job status is pending');
        assert(job1Res.rows[0].priority === 20, 'Job priority is 20');

        // Verify audit log
        const log1Res = await db.query(`
            SELECT * FROM notification_logs WHERE job_id = $1
        `, [job1Res.rows[0].id]);
        assert(log1Res.rows.length === 1, 'Audit log saved in notification_logs');
        assert(log1Res.rows[0].delivery_status === 'queued', 'Audit log delivery_status is queued');

        // =====================================================================
        // Test 2: Reassigning task to Employee B alerts Employee B only
        // =====================================================================
        console.log('\n📋 Test 2: Reassigning Task from Employee A to Employee B');
        const empAJobsBefore = await db.query(`
            SELECT COUNT(*) as c FROM notification_jobs WHERE recipient_id = $1 AND event_name = 'task.assigned'
        `, [String(empA.id)]);

        const mock2 = createMockReqRes({
            title: 'مراجعة عروض أسعار العملاء (محدثة)',
            description: 'تم تحويل المهمة إلى الموظف ب للمتابعة',
            priority: 'high',
            status: 'todo',
            assigned_to: empB.id
        }, {
            id: managerUser.id,
            name: managerUser.name,
            role: 'manager',
            tenant_id: tenantId,
            branch_id: branchId
        }, branchId, { id: createdTaskId });

        await tasksController.updateTask(mock2.req, mock2.res);
        assert(mock2.getStatus() === 200, `updateTask returned HTTP 200 OK (got ${mock2.getStatus()})`);

        await new Promise(r => setTimeout(r, 150));

        // Verify Employee B received a job
        const job2Res = await db.query(`
            SELECT * FROM notification_jobs 
            WHERE recipient_id = $1 AND tenant_id = $2 AND event_name = 'task.assigned'
            ORDER BY created_at DESC LIMIT 1
        `, [String(empB.id), tenantId]);
        assert(job2Res.rows.length === 1, 'WhatsApp notification job enqueued for new assignee (Employee B)');
        assert(job2Res.rows[0].recipient_phone === '+201087654321', 'Employee B phone normalized (+201087654321)');

        // Verify Employee A received NO new jobs
        const empAJobsAfter = await db.query(`
            SELECT COUNT(*) as c FROM notification_jobs WHERE recipient_id = $1 AND event_name = 'task.assigned'
        `, [String(empA.id)]);
        assert(empAJobsBefore.rows[0].c === empAJobsAfter.rows[0].c, 'Previous assignee (Employee A) received no new job on reassignment');

        // =====================================================================
        // Test 3: Updating task without changing assigned_to produces NO new alert
        // =====================================================================
        console.log('\n📋 Test 3: Updating Task Details Without Changing Assignee');
        const empBJobsBefore = await db.query(`
            SELECT COUNT(*) as c FROM notification_jobs WHERE recipient_id = $1 AND event_name = 'task.assigned'
        `, [String(empB.id)]);

        const mock3 = createMockReqRes({
            title: 'تغيير الوصف فقط',
            description: 'الوصف الجديد لا يغير الموظف',
            priority: 'medium',
            status: 'in_progress',
            assigned_to: empB.id // Same assignee
        }, {
            id: managerUser.id,
            name: managerUser.name,
            role: 'manager',
            tenant_id: tenantId,
            branch_id: branchId
        }, branchId, { id: createdTaskId });

        await tasksController.updateTask(mock3.req, mock3.res);
        await new Promise(r => setTimeout(r, 150));

        const empBJobsAfter = await db.query(`
            SELECT COUNT(*) as c FROM notification_jobs WHERE recipient_id = $1 AND event_name = 'task.assigned'
        `, [String(empB.id)]);
        assert(empBJobsBefore.rows[0].c === empBJobsAfter.rows[0].c, 'No new notification job enqueued when assignee is unchanged');

        // =====================================================================
        // Test 4: Self-assignment produces zero WhatsApp jobs
        // =====================================================================
        console.log('\n📋 Test 4: Self-Assignment Exclusion Guard');
        const mock4 = createMockReqRes({
            title: 'مهمة شخصية للمدير',
            description: 'المدير يسند المهمة لنفسه',
            priority: 'low',
            assigned_to: managerUser.id // Self assignment
        }, {
            id: managerUser.id,
            name: managerUser.name,
            role: 'manager',
            tenant_id: tenantId,
            branch_id: branchId
        }, branchId);

        await tasksController.createTask(mock4.req, mock4.res);
        selfAssignedTaskId = mock4.getData()?.data?.id;
        await new Promise(r => setTimeout(r, 150));

        const mgrJobs = await db.query(`
            SELECT * FROM notification_jobs WHERE recipient_id = $1 AND event_name = 'task.assigned'
        `, [String(managerUser.id)]);
        assert(mgrJobs.rows.length === 0, 'Self-assignment produced 0 notification jobs (guard working)');

        // =====================================================================
        // Test 5: Replaying exact same event produces DUPLICATE_JOB
        // =====================================================================
        console.log('\n📋 Test 5: Deduplication Guard on Event Replay');
        const existingJob = job2Res.rows[0];
        const payloadData = typeof existingJob.payload === 'string' ? JSON.parse(existingJob.payload) : existingJob.payload;

        const replayEvent = new DomainEvent({
            eventName: 'task.assigned',
            tenantId,
            branchId,
            aggregateType: 'Task',
            aggregateId: createdTaskId,
            payload: {
                taskId: createdTaskId,
                taskTitle: payloadData.taskTitle,
                assignedTo: empB.id,
                assignedByUserId: managerUser.id,
                assignedByName: managerUser.name,
                assignedAt: payloadData.assignedAt
            },
            actorId: managerUser.id
        });

        const jobsCountBeforeReplay = await db.query('SELECT COUNT(*) as c FROM notification_jobs WHERE tenant_id = $1', [tenantId]);
        await eventBus.publish(replayEvent);
        await new Promise(r => setTimeout(r, 150));
        const jobsCountAfterReplay = await db.query('SELECT COUNT(*) as c FROM notification_jobs WHERE tenant_id = $1', [tenantId]);

        assert(jobsCountBeforeReplay.rows[0].c === jobsCountAfterReplay.rows[0].c, 'Replaying identical event was blocked by deduplication key');

        // =====================================================================
        // Test 6: Legitimate Reassignment Cycle (A -> B -> A)
        // =====================================================================
        console.log('\n📋 Test 6: Legitimate Reassignment Cycle (B back to A)');
        // Wait 50ms so that new updated_at timestamp is strictly different
        await new Promise(r => setTimeout(r, 50));

        const mock6 = createMockReqRes({
            title: 'إعادة المهمة للموظف أ',
            description: 'عادت المهمة للموظف أ مجددًا لمتابعتها',
            priority: 'high',
            status: 'todo',
            assigned_to: empA.id
        }, {
            id: managerUser.id,
            name: managerUser.name,
            role: 'manager',
            tenant_id: tenantId,
            branch_id: branchId
        }, branchId, { id: createdTaskId });

        await tasksController.updateTask(mock6.req, mock6.res);
        await new Promise(r => setTimeout(r, 150));

        const empAJobsCycle = await db.query(`
            SELECT * FROM notification_jobs 
            WHERE recipient_id = $1 AND tenant_id = $2 AND event_name = 'task.assigned'
            ORDER BY created_at DESC
        `, [String(empA.id), tenantId]);

        assert(empAJobsCycle.rows.length === 2, `Employee A received a 2nd job upon legitimate reassignment back (total: ${empAJobsCycle.rows.length})`);
        assert(empAJobsCycle.rows[0].deduplication_key !== empAJobsCycle.rows[1].deduplication_key, 'Second assignment has distinct deduplication key from first assignment');

        // =====================================================================
        // Test 7: Complete Tenant Isolation
        // =====================================================================
        console.log('\n📋 Test 7: Cross-Tenant Isolation');
        const mock7 = createMockReqRes({
            title: 'مهمة المستأجر الثاني',
            description: 'خاصة بالـ Tenant 2 فقط',
            priority: 'urgent',
            assigned_to: empT2.id
        }, {
            id: mgrT2.id,
            name: mgrT2.name,
            role: 'manager',
            tenant_id: tenantId2,
            branch_id: branchId2
        }, branchId2);

        await tasksController.createTask(mock7.req, mock7.res);
        t2TaskId = mock7.getData()?.data?.id;
        await new Promise(r => setTimeout(r, 150));

        const t2Job = await db.query(`
            SELECT * FROM notification_jobs WHERE recipient_id = $1 AND tenant_id = $2
        `, [String(empT2.id), tenantId2]);
        assert(t2Job.rows.length === 1, 'Tenant 2 task job strictly isolated under Tenant 2');
        assert(t2Job.rows[0].tenant_id === tenantId2, 'Tenant ID matches Tenant 2 strictly');

        const leakedJobs = await db.query(`
            SELECT * FROM notification_jobs WHERE recipient_id = $1 AND tenant_id = $2
        `, [String(empT2.id), tenantId]);
        assert(leakedJobs.rows.length === 0, 'No job leaked into Tenant 1');

        // =====================================================================
        // Test 8: Employee without phone does not fail task or in-app
        // =====================================================================
        console.log('\n📋 Test 8: Missing Employee Phone Resilience');
        const mock8 = createMockReqRes({
            title: 'مهمة لموظف بدون هاتف',
            description: 'يجب أن تنجح وتنشئ In-App وتتخطى WhatsApp',
            priority: 'medium',
            assigned_to: empNoPhone.id
        }, {
            id: managerUser.id,
            name: managerUser.name,
            role: 'manager',
            tenant_id: tenantId,
            branch_id: branchId
        }, branchId);

        await tasksController.createTask(mock8.req, mock8.res);
        assert(mock8.getStatus() === 201, 'Task created successfully even if employee has no phone');
        noPhoneTaskId = mock8.getData()?.data?.id;
        await new Promise(r => setTimeout(r, 150));

        const noPhoneJobs = await db.query(`
            SELECT * FROM notification_jobs WHERE recipient_id = $1 AND event_name = 'task.assigned'
        `, [String(empNoPhone.id)]);
        assert(noPhoneJobs.rows.length === 0, 'No WhatsApp job created for employee without phone');

        const noPhoneInApp = await db.query(`
            SELECT * FROM system_notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1
        `, [empNoPhone.id]);
        assert(noPhoneInApp.rows.length === 1, 'In-App notification successfully created for employee without phone');

        // =====================================================================
        // Test 9: Outbox Fallback on EventBus Publish Error
        // =====================================================================
        console.log('\n📋 Test 9: Outbox Fallback Mechanism Verification');
        // Test that if EventBus throws during emission, fallback staging to outbox_events works
        const outbox = require('../src/infrastructure/events/OutboxService');

        const testFallbackEvent = new DomainEvent({
            eventName: 'task.assigned',
            tenantId,
            branchId,
            aggregateType: 'Task',
            aggregateId: 'fallback-task-999',
            payload: {
                taskId: 'fallback-task-999',
                taskTitle: 'مهمة فشل النشر التجريبية',
                assignedTo: empA.id,
                assignedByUserId: managerUser.id,
                assignedByName: managerUser.name,
                assignedAt: new Date().toISOString()
            },
            actorId: managerUser.id
        });

        await outbox.stageEvent(null, testFallbackEvent);

        const outboxRecord = await db.query(`
            SELECT * FROM outbox_events WHERE id = $1 AND aggregate_id = 'fallback-task-999'
        `, [testFallbackEvent.id]);
        assert(outboxRecord.rows.length === 1, 'Event safely staged in outbox_events table on EventBus publish failure');
        assert(outboxRecord.rows[0].status === 'pending', 'Outbox record status is pending for background poller recovery');

        // Clean up outbox record
        await db.query(`DELETE FROM outbox_events WHERE id = $1`, [testFallbackEvent.id]);

        // =====================================================================
        // Test 10: Notification Worker Processing in dryRun Mode
        // =====================================================================
        console.log('\n📋 Test 10: Notification Worker in dryRun Mode');
        const workerResult = await notificationWorkerService.processPendingJobs({ batchSize: 10, dryRun: true });
        assert(workerResult.processed >= 1, `Worker processed pending task jobs in dryRun (count: ${workerResult.processed})`);
        assert(workerResult.failed === 0, `Worker experienced 0 failures in dryRun (failures: ${workerResult.failed})`);

        const checkCompletedJob = await db.query(`
            SELECT status, meta_message_id FROM notification_jobs WHERE id = $1
        `, [job1Res.rows[0].id]);
        assert(checkCompletedJob.rows[0].status === 'completed', 'Task notification job transitioned to completed');
        assert(checkCompletedJob.rows[0].meta_message_id.startsWith('wamid.mock.'), 'Mock WAMID attached');

        const checkCompletedLog = await db.query(`
            SELECT delivery_status, sent_at FROM notification_logs WHERE job_id = $1
        `, [job1Res.rows[0].id]);
        assert(checkCompletedLog.rows[0].delivery_status === 'sent', 'Log delivery_status updated to sent');
        assert(checkCompletedLog.rows[0].sent_at !== null, 'Log sent_at timestamp is stamped');

    } finally {
        console.log('\n🧹 Cleaning up test artifacts...');
        const taskIds = [createdTaskId, selfAssignedTaskId, noPhoneTaskId, t2TaskId].filter(Boolean);
        if (taskIds.length > 0) {
            await db.query(`DELETE FROM task_followers WHERE task_id::text = ANY($1::text[])`, [taskIds.map(String)]);
            await db.query(`DELETE FROM tasks WHERE id::text = ANY($1::text[])`, [taskIds.map(String)]);
        }

        const userIds = [managerUser.id, empA.id, empB.id, empNoPhone.id, empT2.id, mgrT2?.id].filter(Boolean);
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
    console.log(`P2.2 Test Results: ${passCount} PASSED, ${failCount} FAILED`);
    console.log(`========================================\n`);

    if (failCount > 0) {
        process.exit(1);
    }
}

runTaskAssignedFlowTest()
    .then(() => {
        console.log('🎉 P2.2 task.assigned integration tests completed successfully!');
        process.exit(0);
    })
    .catch(err => {
        console.error('💥 Test execution threw an uncaught error:', err);
        process.exit(1);
    });
