/**
 * 🧪 Test Suite: Tashgheel CRM — Activity Follow-Up Reminders Integration
 *
 * Verifies the unification of Scheduled Follow-Up Reminders with the
 * Messaging & Notification Layer (NotificationDispatcher & NotificationQueue):
 *
 * 1. Due activity creates both `system_notifications` (In-App) and 1 pending job in `notification_jobs`.
 * 2. Missing/invalid phone skips WhatsApp, but In-App succeeds and `reminder_sent_at` is set.
 * 3. Re-running scanner does not duplicate in-app alerts or WhatsApp jobs.
 * 4. Rescheduling activity resets `reminder_sent_at = NULL` and enables clean new notification.
 * 5. Dismissed activity (`is_reminder_dismissed = TRUE`) is ignored by the scanner.
 * 6. Cross-tenant isolation verification.
 * 7. Safe Worker execution in `dryRun: true` mode (zero real WhatsApp API calls).
 */

const db = require('../config/db');
const { scanAndSendReminders } = require('../services/activityReminderService');
const notificationWorkerService = require('../services/notificationWorkerService');
const { ensureActivitiesTable } = require('../controllers/activityController');

async function runActivityReminderIntegrationTest() {
    console.log('🚀 [Test Suite] Starting Activity Reminder Notification Integration Test...\n');
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

    await ensureActivitiesTable();

    // 1. Resolve Primary Demo Tenant & Branch
    const tRes = await db.query('SELECT id FROM tenants ORDER BY created_at ASC LIMIT 1');
    if (tRes.rows.length === 0) throw new Error('No tenant found in DB.');
    const tenantId = tRes.rows[0].id;

    // Optional second tenant for cross-tenant test
    let tenantId2 = null;
    const tRes2 = await db.query('SELECT id FROM tenants WHERE id != $1 LIMIT 1', [tenantId]);
    if (tRes2.rows.length > 0) {
        tenantId2 = tRes2.rows[0].id;
    } else {
        const newT = await db.query(`
            INSERT INTO tenants (name, domain)
            VALUES ('Tenant 2 Test', 'tenant2_test_${Date.now()}.com')
            RETURNING id
        `);
        tenantId2 = newT.rows[0].id;
    }

    const bRes = await db.query('SELECT id FROM branches WHERE tenant_id = $1 LIMIT 1', [tenantId]);
    const branchId = bRes.rows[0]?.id || null;

    // 2. Setup Test Reps
    // Rep with valid phone
    const repWithPhoneRes = await db.query(`
        INSERT INTO users (name, email, phone, password_hash, role, tenant_id)
        VALUES ('Rep With Phone', 'rep_phone_${Date.now()}@tashgheel.com', '01011112222', 'dummy_hash', 'employee', $1)
        RETURNING id, name, phone
    `, [tenantId]);
    const repWithPhone = repWithPhoneRes.rows[0];

    // Rep without phone
    const repNoPhoneRes = await db.query(`
        INSERT INTO users (name, email, phone, password_hash, role, tenant_id)
        VALUES ('Rep No Phone', 'rep_nophone_${Date.now()}@tashgheel.com', NULL, 'dummy_hash', 'employee', $1)
        RETURNING id, name, phone
    `, [tenantId]);
    const repNoPhone = repNoPhoneRes.rows[0];

    // Rep in Tenant 2
    const repTenant2Res = await db.query(`
        INSERT INTO users (name, email, phone, password_hash, role, tenant_id)
        VALUES ('Rep Tenant 2', 'rep_t2_${Date.now()}@tashgheel.com', '01099998888', 'dummy_hash', 'employee', $1)
        RETURNING id, name, phone
    `, [tenantId2]);
    const repTenant2 = repTenant2Res.rows[0];

    // Setup Test Customer
    const custRes = await db.query(`
        INSERT INTO customers (name, phone, status, tenant_id, branch_id)
        VALUES ('Followup Target Customer', '01200001111', 'lead', $1, $2)
        RETURNING id, name
    `, [tenantId, branchId]);
    const testCustomer = custRes.rows[0];

    let act1Id = null;
    let act2Id = null;
    let act3Id = null;
    let actCrossId = null;

    try {
        // =====================================================================
        // Test 1: Due activity creates In-App notification and 1 WhatsApp job
        // =====================================================================
        console.log('📋 Test 1: Due Activity Dispatch (In-App + WhatsApp)');
        const act1Res = await db.query(`
            INSERT INTO activities (tenant_id, user_id, entity_type, entity_id, action, scheduled_at, reminder_note, meta)
            VALUES ($1, $2, 'customer', $3, 'follow_up', NOW() - INTERVAL '5 minutes', 'مكالمة لمناقشة العرض المالي', '{"changes": {"note": {"to": "مكالمة لمناقشة العرض المالي"}}}'::jsonb)
            RETURNING id
        `, [tenantId, repWithPhone.id, testCustomer.id]);
        act1Id = act1Res.rows[0].id;

        const sent1 = await scanAndSendReminders();
        assert(sent1 >= 1, `Scanner processed and returned at least 1 sent reminder (count: ${sent1})`);

        // Check activities table updated
        const checkAct1 = await db.query('SELECT reminder_sent_at, is_reminder_dismissed FROM activities WHERE id = $1', [act1Id]);
        assert(checkAct1.rows[0].reminder_sent_at !== null, 'Activity 1 reminder_sent_at is stamped with timestamp');
        assert(checkAct1.rows[0].is_reminder_dismissed === false, 'Activity 1 is_reminder_dismissed remains false');

        // Check system_notifications (In-App)
        const inApp1 = await db.query(`
            SELECT * FROM system_notifications 
            WHERE user_id = $1 AND tenant_id = $2 AND type = 'activity_reminder'
            ORDER BY created_at DESC LIMIT 1
        `, [repWithPhone.id, tenantId]);
        assert(inApp1.rows.length === 1, 'In-App notification record created in system_notifications');
        assert(inApp1.rows[0].title.includes('تذكير بمتابعة عميل'), 'In-App notification title matches expected template');

        // Check notification_jobs (WhatsApp)
        const job1 = await db.query(`
            SELECT * FROM notification_jobs
            WHERE recipient_id = $1 AND tenant_id = $2 AND event_name = 'activity.reminder'
            ORDER BY created_at DESC LIMIT 1
        `, [repWithPhone.id, tenantId]);
        assert(job1.rows.length === 1, 'WhatsApp notification job enqueued in notification_jobs');
        assert(job1.rows[0].recipient_phone === '+201011112222', `Normalized phone +201011112222 stored (was ${job1.rows[0]?.recipient_phone})`);
        assert(job1.rows[0].status === 'pending', 'WhatsApp notification job has pending status');

        // Check notification_logs
        const log1 = await db.query(`
            SELECT * FROM notification_logs WHERE job_id = $1
        `, [job1.rows[0].id]);
        assert(log1.rows.length === 1, 'Initial audit log record created in notification_logs');
        assert(log1.rows[0].delivery_status === 'queued', 'Initial delivery_status is queued');

        // =====================================================================
        // Test 2: Missing Phone Skips WhatsApp but In-App Succeeds
        // =====================================================================
        console.log('\n📋 Test 2: Missing Phone Resilience (In-App Only)');
        const act2Res = await db.query(`
            INSERT INTO activities (tenant_id, user_id, entity_type, entity_id, action, scheduled_at, reminder_note)
            VALUES ($1, $2, 'customer', $3, 'called', NOW() - INTERVAL '2 minutes', 'متابعة بدون رقم هاتف للموظف')
            RETURNING id
        `, [tenantId, repNoPhone.id, testCustomer.id]);
        act2Id = act2Res.rows[0].id;

        const sent2 = await scanAndSendReminders();
        assert(sent2 >= 1, `Scanner processed reminder for user without phone (count: ${sent2})`);

        const checkAct2 = await db.query('SELECT reminder_sent_at FROM activities WHERE id = $1', [act2Id]);
        assert(checkAct2.rows[0].reminder_sent_at !== null, 'Activity 2 reminder_sent_at is stamped (preventing infinite scan)');

        const inApp2 = await db.query(`
            SELECT * FROM system_notifications 
            WHERE user_id = $1 AND tenant_id = $2 AND type = 'activity_reminder'
        `, [repNoPhone.id, tenantId]);
        assert(inApp2.rows.length === 1, 'In-App notification successfully created for rep without phone');

        const job2 = await db.query(`
            SELECT * FROM notification_jobs
            WHERE recipient_id = $1 AND tenant_id = $2 AND event_name = 'activity.reminder'
        `, [repNoPhone.id, tenantId]);
        assert(job2.rows.length === 0, 'No WhatsApp job enqueued for rep without phone');

        // =====================================================================
        // Test 3: Scanner Idempotency (Re-running does not duplicate)
        // =====================================================================
        console.log('\n📋 Test 3: Scanner Idempotency on Already-Sent Reminders');
        const countBeforeInApp = await db.query('SELECT COUNT(*) as c FROM system_notifications WHERE tenant_id = $1', [tenantId]);
        const countBeforeJobs = await db.query('SELECT COUNT(*) as c FROM notification_jobs WHERE tenant_id = $1', [tenantId]);

        const sent3 = await scanAndSendReminders();
        assert(sent3 === 0, `Subsequent scan processed 0 reminders (count: ${sent3})`);

        const countAfterInApp = await db.query('SELECT COUNT(*) as c FROM system_notifications WHERE tenant_id = $1', [tenantId]);
        const countAfterJobs = await db.query('SELECT COUNT(*) as c FROM notification_jobs WHERE tenant_id = $1', [tenantId]);

        assert(countBeforeInApp.rows[0].c === countAfterInApp.rows[0].c, 'No duplicate in-app notifications created');
        assert(countBeforeJobs.rows[0].c === countAfterJobs.rows[0].c, 'No duplicate notification jobs created');

        // =====================================================================
        // Test 4: Rescheduling resets reminder_sent_at and allows new reminder
        // =====================================================================
        console.log('\n📋 Test 4: Rescheduling Activity & New Deduplication Key');
        // Simulate rescheduling: set new scheduled_at (still in past for test) and reset reminder_sent_at = NULL
        const newScheduledAt = new Date(Date.now() - 60000).toISOString();
        await db.query(`
            UPDATE activities 
            SET scheduled_at = $1, reminder_sent_at = NULL, is_reminder_dismissed = FALSE, reminder_note = 'موعد جديد بعد التأجيل'
            WHERE id = $2
        `, [newScheduledAt, act1Id]);

        const sent4 = await scanAndSendReminders();
        assert(sent4 >= 1, `Scanner processed rescheduled activity (count: ${sent4})`);

        const checkAct1Rescheduled = await db.query('SELECT reminder_sent_at FROM activities WHERE id = $1', [act1Id]);
        assert(checkAct1Rescheduled.rows[0].reminder_sent_at !== null, 'Activity 1 reminder_sent_at is re-stamped');

        const inApp1AfterResched = await db.query(`
            SELECT COUNT(*) as c FROM system_notifications 
            WHERE user_id = $1 AND tenant_id = $2 AND type = 'activity_reminder'
        `, [repWithPhone.id, tenantId]);
        assert(parseInt(inApp1AfterResched.rows[0].c, 10) === 2, 'Second In-App notification received after rescheduling');

        const jobs1AfterResched = await db.query(`
            SELECT COUNT(*) as c FROM notification_jobs
            WHERE recipient_id = $1 AND tenant_id = $2 AND event_name = 'activity.reminder'
        `, [repWithPhone.id, tenantId]);
        assert(parseInt(jobs1AfterResched.rows[0].c, 10) === 2, 'Second WhatsApp job enqueued under distinct deduplication key');

        // =====================================================================
        // Test 5: Dismissed activity is ignored by scanner
        // =====================================================================
        console.log('\n📋 Test 5: Dismissed Activity Ignored by Scanner');
        const act3Res = await db.query(`
            INSERT INTO activities (tenant_id, user_id, entity_type, entity_id, action, scheduled_at, is_reminder_dismissed)
            VALUES ($1, $2, 'customer', $3, 'follow_up', NOW() - INTERVAL '10 minutes', TRUE)
            RETURNING id
        `, [tenantId, repWithPhone.id, testCustomer.id]);
        act3Id = act3Res.rows[0].id;

        const jobsBeforeDismissedCheck = await db.query('SELECT COUNT(*) as c FROM notification_jobs WHERE recipient_id = $1', [repWithPhone.id]);
        await scanAndSendReminders();
        const jobsAfterDismissedCheck = await db.query('SELECT COUNT(*) as c FROM notification_jobs WHERE recipient_id = $1', [repWithPhone.id]);

        assert(jobsBeforeDismissedCheck.rows[0].c === jobsAfterDismissedCheck.rows[0].c, 'Dismissed activity produced no new jobs');

        // =====================================================================
        // Test 6: Cross-Tenant Isolation
        // =====================================================================
        console.log('\n📋 Test 6: Cross-Tenant Isolation Verification');
        const actCrossRes = await db.query(`
            INSERT INTO activities (tenant_id, user_id, entity_type, entity_id, action, scheduled_at, reminder_note)
            VALUES ($1, $2, 'customer', $3, 'meeting', NOW() - INTERVAL '1 minute', 'متابعة Tenant 2')
            RETURNING id
        `, [tenantId2, repTenant2.id, testCustomer.id]);
        actCrossId = actCrossRes.rows[0].id;

        await scanAndSendReminders();

        const t2Jobs = await db.query(`
            SELECT * FROM notification_jobs WHERE tenant_id = $1 AND recipient_id = $2
        `, [tenantId2, repTenant2.id]);
        assert(t2Jobs.rows.length === 1, 'Tenant 2 activity job strictly stored under Tenant 2 ID');
        assert(t2Jobs.rows[0].tenant_id === tenantId2, 'Tenant ID strictly matches Tenant 2 without cross-tenant leakage');

        // =====================================================================
        // Test 7: Notification Worker in dryRun Mode
        // =====================================================================
        console.log('\n📋 Test 7: Worker Execution in dryRun Mode');
        const workerResult = await notificationWorkerService.processPendingJobs({ batchSize: 10, dryRun: true });
        assert(workerResult.processed >= 1, `Worker successfully processed pending reminder jobs in dryRun (count: ${workerResult.processed})`);
        assert(workerResult.failed === 0, `Worker encountered zero failures in dryRun (failures: ${workerResult.failed})`);

        // Verify status transitioned from 'pending' to 'completed'
        const checkJobsStatus = await db.query(`
            SELECT id, status FROM notification_jobs WHERE id = $1
        `, [job1.rows[0].id]);
        assert(checkJobsStatus.rows[0].status === 'completed', 'Job status transitioned to completed via dryRun worker');

        // Verify notification_logs contains dryRun result
        const checkLogStatus = await db.query(`
            SELECT delivery_status, meta_message_id, sent_at FROM notification_logs WHERE job_id = $1
        `, [job1.rows[0].id]);
        assert(checkLogStatus.rows[0].delivery_status === 'sent', 'Log delivery_status updated to sent');
        assert(checkLogStatus.rows[0].meta_message_id.startsWith('wamid.mock.'), 'Log records mock wamid generated by dryRun');
        assert(checkLogStatus.rows[0].sent_at !== null, 'Log sent_at timestamp is set');

    } finally {
        console.log('\n🧹 Cleaning up test artifacts...');
        // Cleanup test activities
        const actIds = [act1Id, act2Id, act3Id, actCrossId].filter(Boolean).map(id => String(id));
        if (actIds.length > 0) {
            await db.query(`DELETE FROM activities WHERE id::text = ANY($1::text[])`, [actIds]);
        }
        // Cleanup test notifications & jobs
        await db.query(`
            DELETE FROM notification_logs WHERE job_id IN (
                SELECT id FROM notification_jobs WHERE recipient_id IN ($1, $2, $3)
            )
        `, [String(repWithPhone.id), String(repNoPhone.id), String(repTenant2.id)]);
        await db.query(`
            DELETE FROM notification_jobs WHERE recipient_id IN ($1, $2, $3)
        `, [String(repWithPhone.id), String(repNoPhone.id), String(repTenant2.id)]);
        await db.query(`
            DELETE FROM system_notifications WHERE user_id IN ($1, $2, $3)
        `, [repWithPhone.id, repNoPhone.id, repTenant2.id]);
        // Cleanup test users
        await db.query(`DELETE FROM users WHERE id IN ($1, $2, $3)`, [repWithPhone.id, repNoPhone.id, repTenant2.id]);
        // Cleanup test customer
        await db.query(`DELETE FROM customers WHERE id::text = $1::text`, [String(testCustomer.id)]);

        console.log('✨ Cleanup complete.');
    }

    console.log(`\n========================================`);
    console.log(`Test Results: ${passCount} PASSED, ${failCount} FAILED`);
    console.log(`========================================\n`);

    if (failCount > 0) {
        process.exit(1);
    }
}

runActivityReminderIntegrationTest()
    .then(() => {
        console.log('🎉 All Activity Reminder integration tests passed successfully!');
        process.exit(0);
    })
    .catch(err => {
        console.error('💥 Test execution threw an uncaught error:', err);
        process.exit(1);
    });
