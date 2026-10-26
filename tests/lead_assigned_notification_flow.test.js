/**
 * 🧪 Test Suite: Tashgheel CRM — P2.1 End-to-End `lead.assigned` Flow
 *
 * Verifies the complete real flow:
 * 1. Customer creation in `customersController.createCustomer` with an assigned sales rep.
 * 2. Successful database commit of the customer record.
 * 3. Domain Event `lead.assigned` dispatch via LocalEventBus.
 * 4. Subscriber interception and resolution of sales rep's phone.
 * 5. Deterministic deduplication key generation and `notification_jobs` insertion.
 * 6. Audit logging in `notification_logs` (`delivery_status: 'queued'`).
 * 7. Self-assignment exclusion guard (no notification if assigning to oneself).
 * 8. Safe worker processing in `dryRun` mode (zero real WhatsApp API calls).
 */

const db = require('../config/db');
const { eventBus } = require('../src/infrastructure/events/LocalEventBus');
const registerGlobalSubscribers = require('../src/domains/shared/subscribers/eventSubscribers');
const customersController = require('../controllers/customersController');
const notificationWorkerService = require('../services/notificationWorkerService');

// Ensure event subscribers are active for testing
registerGlobalSubscribers(eventBus);

async function runLeadAssignedIntegrationTest() {
    console.log('🚀 [Test Suite] Starting P2.1 lead.assigned End-to-End Test...\n');
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

    // 1. Resolve Demo Tenant & Branch
    const tRes = await db.query('SELECT id FROM tenants ORDER BY created_at ASC LIMIT 1');
    if (tRes.rows.length === 0) throw new Error('No tenant found in DB.');
    const tenantId = tRes.rows[0].id;

    const bRes = await db.query('SELECT id FROM branches WHERE tenant_id = $1 LIMIT 1', [tenantId]);
    const branchId = bRes.rows[0]?.id || null;

    // 2. Setup Test Creator and Test Assignee
    const creatorRes = await db.query(`
        INSERT INTO users (name, email, password_hash, role, tenant_id)
        VALUES ('Test Manager', 'mgr_test_${Date.now()}@tashgheel.com', 'dummy_hash', 'manager', $1)
        RETURNING id, name
    `, [tenantId]);
    const creatorUser = creatorRes.rows[0];

    const assigneeRes = await db.query(`
        INSERT INTO users (name, email, phone, password_hash, role, tenant_id)
        VALUES ('Test Rep', 'rep_test_${Date.now()}@tashgheel.com', '01098765432', 'dummy_hash', 'employee', $1)
        RETURNING id, name, phone
    `, [tenantId]);
    const assigneeUser = assigneeRes.rows[0];

    let createdLeadId = null;

    try {
        console.log('📋 Scenario 1: Assigning New Lead to Sales Rep via Controller');
        
        // Mock Express Request & Response
        let responseStatus = null;
        let responseData = null;
        const mockReq = {
            body: {
                name: 'Karim Ahmed (VIP Prospect)',
                phone: '01122334455',
                status: 'lead',
                entity_type: 'customer',
                assigned_to: assigneeUser.id
            },
            user: {
                id: creatorUser.id,
                name: creatorUser.name,
                tenant_id: tenantId,
                branch_id: branchId
            },
            branchId
        };
        const mockRes = {
            status: function(code) {
                responseStatus = code;
                return this;
            },
            json: function(data) {
                responseData = data;
                return this;
            }
        };

        // Invoke Controller directly
        await customersController.createCustomer(mockReq, mockRes);

        assert(responseStatus === 201, `Controller returned HTTP 201 Created (got ${responseStatus})`);
        assert(responseData?.status === 'success', 'Response status is success');
        createdLeadId = responseData?.data?.id;
        assert(!!createdLeadId, `Customer record saved in DB with ID: ${createdLeadId}`);

        // Allow async EventEmitter loop tick to execute subscriber
        await new Promise(r => setTimeout(r, 200));

        // 3. Verify notification_jobs table
        const jobRes = await db.query(`
            SELECT * FROM notification_jobs 
            WHERE tenant_id::text = $1::text 
              AND event_name = 'lead.assigned'
              AND recipient_id = $2
            ORDER BY created_at DESC LIMIT 1
        `, [tenantId, String(assigneeUser.id)]);

        assert(jobRes.rows.length === 1, 'Job successfully queued in notification_jobs');
        const job = jobRes.rows[0];
        assert(job.recipient_phone === '+201098765432', `Assignee phone correctly normalized (+201098765432)`);
        assert(job.recipient_type === 'employee', 'Recipient type is employee');
        assert(job.status === 'pending', 'Job status is pending');
        assert(job.deduplication_key === `lead.assigned:${tenantId}:${createdLeadId}:${assigneeUser.id}`, `Deterministic deduplication key created: ${job.deduplication_key}`);

        // 4. Verify notification_logs table
        const logRes = await db.query(`
            SELECT * FROM notification_logs WHERE job_id = $1
        `, [job.id]);
        assert(logRes.rows.length === 1, 'Audit log saved in notification_logs');
        assert(logRes.rows[0].delivery_status === 'queued', 'Audit log delivery_status is queued');

        // ---------------------------------------------------------------------
        // Scenario 2: Deduplication on Duplicate Assignment Action
        // ---------------------------------------------------------------------
        console.log('\n📋 Scenario 2: Preventing Duplicate Alert for Same Assignment');
        const notificationQueueService = require('../services/notificationQueueService');
        const dupResult = await notificationQueueService.enqueueNotificationJob({
            tenantId,
            branchId,
            eventName: 'lead.assigned',
            channel: 'whatsapp',
            recipientType: 'employee',
            recipientId: assigneeUser.id,
            recipientPhone: assigneeUser.phone,
            recipientName: assigneeUser.name,
            deduplicationKey: `lead.assigned:${tenantId}:${createdLeadId}:${assigneeUser.id}`
        });

        assert(dupResult.enqueued === false, 'Duplicate assignment job was rejected');
        assert(dupResult.reason === 'DUPLICATE_JOB', 'Reason is DUPLICATE_JOB');

        // ---------------------------------------------------------------------
        // Scenario 3: Self-Assignment Exclusion Guard
        // ---------------------------------------------------------------------
        console.log('\n📋 Scenario 3: Self-Assignment Exclusion Guard');
        let selfLeadId = null;
        const mockSelfReq = {
            body: {
                name: 'Self Assigned Lead',
                phone: '01199887766',
                status: 'lead',
                entity_type: 'customer',
                assigned_to: creatorUser.id // Self assigned!
            },
            user: {
                id: creatorUser.id,
                name: creatorUser.name,
                tenant_id: tenantId,
                branch_id: branchId
            },
            branchId
        };
        const mockSelfRes = {
            status: function(code) { return this; },
            json: function(data) {
                selfLeadId = data?.data?.id;
                return this;
            }
        };

        await customersController.createCustomer(mockSelfReq, mockSelfRes);
        await new Promise(r => setTimeout(r, 200));

        const selfJobRes = await db.query(`
            SELECT * FROM notification_jobs 
            WHERE tenant_id::text = $1::text 
              AND deduplication_key = $2
        `, [tenantId, `lead.assigned:${tenantId}:${selfLeadId}:${creatorUser.id}`]);

        assert(selfJobRes.rows.length === 0, 'Self-assignment correctly produced zero notification jobs');

        // ---------------------------------------------------------------------
        // Scenario 4: Worker Safe Processing (dryRun = true)
        // ---------------------------------------------------------------------
        console.log('\n📋 Scenario 4: Worker Safe Execution (dryRun = true)');
        const workerRes = await notificationWorkerService.processPendingJobs({ batchSize: 5, dryRun: true });
        assert(workerRes.processed >= 1, `Worker processed ${workerRes.processed} job(s)`);

        const completedJob = await db.query('SELECT * FROM notification_jobs WHERE id = $1', [job.id]);
        assert(completedJob.rows[0].status === 'completed', 'Job marked completed by worker');
        assert(completedJob.rows[0].meta_message_id.startsWith('wamid.mock.'), 'Mock WAMID attached');

        const completedLog = await db.query('SELECT * FROM notification_logs WHERE job_id = $1', [job.id]);
        assert(completedLog.rows[0].delivery_status === 'sent', 'Log status updated to sent with timestamp');

        // Cleanup test records
        await db.query('DELETE FROM notification_logs WHERE job_id = $1', [job.id]);
        await db.query('DELETE FROM notification_jobs WHERE id = $1', [job.id]);
        if (createdLeadId) await db.query('DELETE FROM customers WHERE id = $1', [createdLeadId]);
        if (selfLeadId) await db.query('DELETE FROM customers WHERE id = $1', [selfLeadId]);
        await db.query('DELETE FROM users WHERE id IN ($1, $2)', [creatorUser.id, assigneeUser.id]);
        console.log('\n🧹 Test records cleaned up.');

        console.log(`\n======================================================`);
        console.log(`🏁 P2.1 Test Results: ${passCount} Passed, ${failCount} Failed`);
        console.log(`======================================================\n`);

        if (failCount > 0) process.exit(1);
        process.exit(0);
    } catch (err) {
        console.error('❌ [Test Error]:', err);
        // Attempt cleanup
        if (createdLeadId) await db.query('DELETE FROM customers WHERE id = $1', [createdLeadId]).catch(() => {});
        await db.query('DELETE FROM users WHERE id IN ($1, $2)', [creatorUser.id, assigneeUser.id]).catch(() => {});
        process.exit(1);
    }
}

runLeadAssignedIntegrationTest();
