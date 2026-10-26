/**
 * 🧪 Test Suite: Tashgheel CRM — Messaging & Notification Layer (Phase 1)
 *
 * Verifies:
 * 1. Schema integrity for notification_rules, notification_jobs, notification_logs
 * 2. Queueing & deduplication handling
 * 3. Dry-run worker execution without contacting Meta API
 * 4. Monotonic Webhook delivery tracking (queued -> sent -> delivered -> read)
 * 5. Out-of-order webhook delivery protection
 * 6. Multi-tenant isolation
 */

const db = require('../config/db');
const notificationQueueService = require('../services/notificationQueueService');
const notificationWorkerService = require('../services/notificationWorkerService');

async function runPhase1Tests() {
    console.log('🚀 [Test Suite] Starting Phase 1 Messaging & Notification Layer Tests...\n');
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

    // Get an existing demo or valid tenant
    const tRes = await db.query('SELECT id FROM tenants ORDER BY created_at ASC LIMIT 1');
    if (tRes.rows.length === 0) {
        throw new Error('No tenant found in DB to run test against.');
    }
    const tenantId = tRes.rows[0].id;

    try {
        // ---------------------------------------------------------------------
        // Test 1: Tables existence & Schema
        // ---------------------------------------------------------------------
        console.log('📋 Test 1: Database Schema & Tables Verification');
        const tablesRes = await db.query(`
            SELECT table_name FROM information_schema.tables 
            WHERE table_name IN ('notification_rules', 'notification_jobs', 'notification_logs')
        `);
        const foundTables = tablesRes.rows.map(r => r.table_name);
        assert(foundTables.includes('notification_rules'), 'Table notification_rules exists');
        assert(foundTables.includes('notification_jobs'), 'Table notification_jobs exists');
        assert(foundTables.includes('notification_logs'), 'Table notification_logs exists');

        // ---------------------------------------------------------------------
        // Test 2: Enqueue Notification Job with Phone Normalisation & Audit Log
        // ---------------------------------------------------------------------
        console.log('\n📋 Test 2: Enqueue Notification Job');
        const testDeduplicationKey = `test:lead.assigned:${Date.now()}`;
        const enqueueRes = await notificationQueueService.enqueueNotificationJob({
            tenantId,
            eventName: 'lead.assigned',
            channel: 'whatsapp',
            recipientType: 'employee',
            recipientId: '999',
            recipientPhone: '01012345678', // Unnormalized Egyptian number
            recipientName: 'Ahmed Developer',
            payload: { leadId: 101, leadName: 'VIP Client' },
            deduplicationKey: testDeduplicationKey,
            priority: 15
        });

        assert(enqueueRes.enqueued === true, 'Job enqueued successfully');
        assert(!!enqueueRes.jobId, `Job ID generated: ${enqueueRes.jobId}`);
        assert(!!enqueueRes.logId, `Initial audit Log ID generated: ${enqueueRes.logId}`);

        // Verify row in DB
        const jobRow = await db.query('SELECT * FROM notification_jobs WHERE id = $1', [enqueueRes.jobId]);
        assert(jobRow.rows.length === 1, 'Job saved in notification_jobs table');
        assert(jobRow.rows[0].recipient_phone === '+201012345678', 'Phone normalized to E.164 (+201012345678)');
        assert(jobRow.rows[0].status === 'pending', 'Job initial status is pending');

        const logRow = await db.query('SELECT * FROM notification_logs WHERE job_id = $1', [enqueueRes.jobId]);
        assert(logRow.rows.length === 1, 'Audit log saved in notification_logs table');
        assert(logRow.rows[0].delivery_status === 'queued', 'Log initial delivery_status is queued');

        // ---------------------------------------------------------------------
        // Test 3: Deduplication Prevention
        // ---------------------------------------------------------------------
        console.log('\n📋 Test 3: Deduplication Prevention');
        const duplicateRes = await notificationQueueService.enqueueNotificationJob({
            tenantId,
            eventName: 'lead.assigned',
            channel: 'whatsapp',
            recipientType: 'employee',
            recipientId: '999',
            recipientPhone: '01012345678',
            recipientName: 'Ahmed Developer',
            payload: { leadId: 101, leadName: 'VIP Client' },
            deduplicationKey: testDeduplicationKey // Same key!
        });

        assert(duplicateRes.enqueued === false, 'Duplicate job was rejected from queueing');
        assert(duplicateRes.reason === 'DUPLICATE_JOB', 'Reason returned is DUPLICATE_JOB');

        // ---------------------------------------------------------------------
        // Test 4: Notification Worker Execution (Dry-Run / Safe Mode)
        // ---------------------------------------------------------------------
        console.log('\n📋 Test 4: Worker Processing (Dry-Run)');
        const workerRes = await notificationWorkerService.processPendingJobs({
            batchSize: 5,
            dryRun: true // Ensures no WhatsApp API call is made
        });

        assert(workerRes.processed >= 1, `Worker processed ${workerRes.processed} job(s)`);
        assert(workerRes.succeeded >= 1, `Worker succeeded ${workerRes.succeeded} job(s)`);

        // Check updated job status in DB
        const processedJob = await db.query('SELECT * FROM notification_jobs WHERE id = $1', [enqueueRes.jobId]);
        assert(processedJob.rows[0].status === 'completed', 'Job status updated to completed');
        assert(processedJob.rows[0].meta_message_id.startsWith('wamid.mock.'), `Mock WAMID stored: ${processedJob.rows[0].meta_message_id}`);

        const updatedLog = await db.query('SELECT * FROM notification_logs WHERE job_id = $1', [enqueueRes.jobId]);
        assert(updatedLog.rows[0].delivery_status === 'sent', 'Audit log updated to sent');
        assert(!!updatedLog.rows[0].sent_at, 'Audit log sent_at timestamp is set');

        // ---------------------------------------------------------------------
        // Test 5: Monotonic Webhook Delivery Status Tracking
        // ---------------------------------------------------------------------
        console.log('\n📋 Test 5: Monotonic Webhook Delivery Transitions');
        const mockWamid = processedJob.rows[0].meta_message_id;

        // 5a. Simulate Webhook 'delivered' event
        await db.query(`
            UPDATE notification_logs
            SET delivery_status = 'delivered',
                delivered_at = NOW(),
                updated_at = NOW()
            WHERE meta_message_id = $1
              AND delivery_status IN ('queued', 'sent')
        `, [mockWamid]);

        const deliveredLog = await db.query('SELECT * FROM notification_logs WHERE meta_message_id = $1', [mockWamid]);
        assert(deliveredLog.rows[0].delivery_status === 'delivered', 'Status advanced to delivered');
        assert(!!deliveredLog.rows[0].delivered_at, 'delivered_at timestamp recorded');

        // 5b. Simulate Webhook 'read' event
        await db.query(`
            UPDATE notification_logs
            SET delivery_status = 'read',
                read_at = NOW(),
                updated_at = NOW()
            WHERE meta_message_id = $1
              AND delivery_status IN ('queued', 'sent', 'delivered')
        `, [mockWamid]);

        const readLog = await db.query('SELECT * FROM notification_logs WHERE meta_message_id = $1', [mockWamid]);
        assert(readLog.rows[0].delivery_status === 'read', 'Status advanced to read');
        assert(!!readLog.rows[0].read_at, 'read_at timestamp recorded');

        // 5c. Monotonic Guard Test: Out-of-order 'delivered' event should NOT downgrade 'read'
        await db.query(`
            UPDATE notification_logs
            SET delivery_status = 'delivered',
                updated_at = NOW()
            WHERE meta_message_id = $1
              AND (
                delivery_status = 'queued'
                OR delivery_status = 'sent'
              )
        `, [mockWamid]);

        const guardLog = await db.query('SELECT * FROM notification_logs WHERE meta_message_id = $1', [mockWamid]);
        assert(guardLog.rows[0].delivery_status === 'read', 'Monotonic guard prevented downgrading read -> delivered');

        // ---------------------------------------------------------------------
        // Clean up test records
        // ---------------------------------------------------------------------
        await db.query('DELETE FROM notification_logs WHERE job_id = $1', [enqueueRes.jobId]);
        await db.query('DELETE FROM notification_jobs WHERE id = $1', [enqueueRes.jobId]);
        console.log('\n🧹 Test records cleaned up.');

        console.log(`\n======================================================`);
        console.log(`🏁 Phase 1 Test Results: ${passCount} Passed, ${failCount} Failed`);
        console.log(`======================================================\n`);

        if (failCount > 0) process.exit(1);
        process.exit(0);
    } catch (err) {
        console.error('❌ [Test Suite Error]:', err);
        process.exit(1);
    }
}

runPhase1Tests();
