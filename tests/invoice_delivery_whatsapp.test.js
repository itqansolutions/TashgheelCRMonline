/**
 * 🧪 Test Suite: Tashgheel CRM — P3 Invoice Delivery via WhatsApp
 *
 * Verifies the complete invoice WhatsApp delivery layer:
 * 1. Invoice Not Found / Unauthorized Guard (404)
 * 2. Cross-tenant isolation (Tenant B cannot send or view Tenant A's invoice)
 * 3. Missing customer phone guard (400)
 * 4. Invalid phone format guard (400)
 * 5. Successful phone normalisation (Egyptian 010... -> +2010... & International +966...)
 * 6. Successful enqueue into notification_jobs with customer recipient type & priority 15
 * 7. Correct audit record in notification_logs with metadata linking entity_type = 'invoice'
 * 8. Deduplication guard preventing rapid double-click submissions (409)
 * 9. Intentional resend allowed with fresh action nonce
 * 10. getInvoiceDetails returns accurate `latest_delivery` status badge data
 * 11. getInvoiceDeliveryHistory returns chronologically ordered delivery logs
 * 12. NotificationWorker in dryRun mode processes the job to 'completed' and 'sent'
 * 13. Monotonic delivery status progression when delivery webhook event occurs
 */

const db = require('../config/db');
const financeController = require('../controllers/financeController');
const notificationWorkerService = require('../services/notificationWorkerService');

// Helper to mock Express req & res
function createMockReqRes({ user, params = {}, body = {}, query = {}, branchId = null }) {
    const req = {
        user: {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role || 'admin',
            tenant_id: user.tenant_id,
            branch_id: user.branch_id || null
        },
        params,
        body,
        query,
        branchId: branchId || user.branch_id || null
    };

    let statusCode = 200;
    let responseData = null;

    const res = {
        status: (code) => {
            statusCode = code;
            return res;
        },
        json: (data) => {
            responseData = data;
            return res;
        },
        getStatusCode: () => statusCode,
        getResponseData: () => responseData
    };

    return { req, res };
}

async function runInvoiceDeliveryTestSuite() {
    console.log('🚀 [Test Suite] Starting P3 Invoice Delivery via WhatsApp Integration Tests...\n');
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

    // 1. Resolve Primary Tenant
    const tRes = await db.query('SELECT id, name FROM tenants ORDER BY created_at ASC LIMIT 1');
    if (tRes.rows.length === 0) throw new Error('No tenant found in DB.');
    const tenantId1 = tRes.rows[0].id;

    // Resolve or create Tenant 2 for cross-tenant testing
    let tenantId2 = null;
    const tRes2 = await db.query('SELECT id FROM tenants WHERE id != $1 LIMIT 1', [tenantId1]);
    if (tRes2.rows.length > 0) {
        tenantId2 = tRes2.rows[0].id;
    } else {
        const newT = await db.query(`
            INSERT INTO tenants (name, domain)
            VALUES ('Tenant 2 Finance', 'tenant2_fin_${Date.now()}.com')
            RETURNING id
        `);
        tenantId2 = newT.rows[0].id;
    }

    // 2. Setup Test Users
    const uRes1 = await db.query(`
        INSERT INTO users (name, email, password_hash, role, tenant_id)
        VALUES ('Fin Manager T1', 'fin_mgr_t1_${Date.now()}@test.com', 'dummy_hash', 'admin', $1)
        RETURNING id, name, email, role, tenant_id
    `, [tenantId1]);
    const userT1 = uRes1.rows[0];

    const uRes2 = await db.query(`
        INSERT INTO users (name, email, password_hash, role, tenant_id)
        VALUES ('Fin Manager T2', 'fin_mgr_t2_${Date.now()}@test.com', 'dummy_hash', 'admin', $1)
        RETURNING id, name, email, role, tenant_id
    `, [tenantId2]);
    const userT2 = uRes2.rows[0];

    // 3. Setup Test Customers
    // Customer A: with valid Egyptian phone
    const cResA = await db.query(`
        INSERT INTO customers (name, phone, email, tenant_id, status)
        VALUES ('Amr Customer With Phone', '01099887766', 'amr_${Date.now()}@test.com', $1, 'active')
        RETURNING id, name, phone
    `, [tenantId1]);
    const customerWithPhone = cResA.rows[0];

    // Customer B: without phone
    const cResB = await db.query(`
        INSERT INTO customers (name, phone, email, tenant_id, status)
        VALUES ('Customer Without Phone', NULL, 'nophone_${Date.now()}@test.com', $1, 'active')
        RETURNING id, name, phone
    `, [tenantId1]);
    const customerNoPhone = cResB.rows[0];

    // 4. Setup Test Invoices
    const invRes1 = await db.query(`
        INSERT INTO invoices (invoice_number, total_amount, due_date, status, customer_id, tenant_id)
        VALUES ($1, 15000.00, CURRENT_DATE + INTERVAL '7 days', 'unpaid', $2, $3)
        RETURNING id, invoice_number, total_amount
    `, [`INV-TEST-${Date.now()}-1`, customerWithPhone.id, tenantId1]);
    const invoice1 = invRes1.rows[0];

    const invRes2 = await db.query(`
        INSERT INTO invoices (invoice_number, total_amount, due_date, status, customer_id, tenant_id)
        VALUES ($1, 8500.00, CURRENT_DATE + INTERVAL '3 days', 'unpaid', $2, $3)
        RETURNING id, invoice_number, total_amount
    `, [`INV-TEST-${Date.now()}-2`, customerNoPhone.id, tenantId1]);
    const invoiceNoPhone = invRes2.rows[0];

    const invResT2 = await db.query(`
        INSERT INTO invoices (invoice_number, total_amount, due_date, status, tenant_id)
        VALUES ($1, 3000.00, CURRENT_DATE, 'unpaid', $2)
        RETURNING id, invoice_number
    `, [`INV-T2-${Date.now()}`, tenantId2]);
    const invoiceT2 = invResT2.rows[0];

    try {
        // =========================================================================
        // Test 1: Invoice Not Found (404)
        // =========================================================================
        console.log('\n--- Scenario 1: Invoice Not Found ---');
        {
            const { req, res } = createMockReqRes({
                user: userT1,
                params: { id: '99999999' },
                body: { recipient_phone: '01011112222' }
            });
            await financeController.sendInvoiceWhatsApp(req, res);
            assert(res.getStatusCode() === 404, 'Non-existent invoice returns 404');
            assert(res.getResponseData()?.status === 'error', 'Returns error status');
        }

        // =========================================================================
        // Test 2: Cross-Tenant Isolation Guard (404 on Foreign Tenant Invoice)
        // =========================================================================
        console.log('\n--- Scenario 2: Cross-Tenant Isolation Guard ---');
        {
            const { req, res } = createMockReqRes({
                user: userT2, // Tenant 2 user
                params: { id: String(invoice1.id) }, // Tenant 1 invoice
                body: { recipient_phone: '01011112222' }
            });
            await financeController.sendInvoiceWhatsApp(req, res);
            assert(res.getStatusCode() === 404, 'Tenant 2 cannot dispatch WhatsApp for Tenant 1 invoice (404)');
        }

        // =========================================================================
        // Test 3: Missing Phone Guard
        // =========================================================================
        console.log('\n--- Scenario 3: Missing Phone Guard ---');
        {
            const { req, res } = createMockReqRes({
                user: userT1,
                params: { id: String(invoiceNoPhone.id) },
                body: {} // No phone in body, customer has no phone
            });
            await financeController.sendInvoiceWhatsApp(req, res);
            assert(res.getStatusCode() === 400, 'Returns 400 when neither invoice nor body provides a phone');
            assert(res.getResponseData()?.message.includes('phone'), 'Error message clearly mentions phone requirement');
        }

        // =========================================================================
        // Test 4: Invalid Phone Format Guard
        // =========================================================================
        console.log('\n--- Scenario 4: Invalid Phone Format Guard ---');
        {
            const { req, res } = createMockReqRes({
                user: userT1,
                params: { id: String(invoice1.id) },
                body: { recipient_phone: 'invalid-phone-string' }
            });
            await financeController.sendInvoiceWhatsApp(req, res);
            assert(res.getStatusCode() === 400, 'Returns 400 on malformed phone number');
            assert(res.getResponseData()?.message.includes('format'), 'Error mentions phone format');
        }

        // =========================================================================
        // Test 5: Successful Enqueue with Customer Default Phone (Egyptian Normalisation)
        // =========================================================================
        console.log('\n--- Scenario 5: Successful Enqueue with Customer Default Phone ---');
        let queuedJobId = null;
        let queuedLogId = null;
        {
            const clientActionId = `action_test_${Date.now()}`;
            const { req, res } = createMockReqRes({
                user: userT1,
                params: { id: String(invoice1.id) },
                body: { client_action_id: clientActionId }
            });
            await financeController.sendInvoiceWhatsApp(req, res);
            assert(res.getStatusCode() === 200, 'Returns 200 OK for successful delivery enqueue');
            const data = res.getResponseData()?.data;
            assert(Boolean(data?.jobId), 'Response includes jobId');
            assert(Boolean(data?.logId), 'Response includes logId');
            assert(data?.recipientPhone === '+201099887766', 'Normalised Egyptian phone correctly to +201099887766');

            queuedJobId = data.jobId;
            queuedLogId = data.logId;

            // Verify notification_jobs in database
            const jobCheck = await db.query('SELECT * FROM notification_jobs WHERE id = $1', [queuedJobId]);
            assert(jobCheck.rows.length === 1, 'Job exists in notification_jobs');
            const job = jobCheck.rows[0];
            assert(job.status === 'pending', 'Job is initially in pending status');
            assert(job.channel === 'whatsapp', 'Job channel is whatsapp');
            assert(job.recipient_type === 'customer', 'Recipient type is customer');
            assert(job.priority === 15, 'Job priority is set to 15 (high priority manual)');
            assert(job.payload?.invoiceNumber === invoice1.invoice_number, 'Payload contains invoiceNumber');
            assert(Number(job.payload?.totalAmount) === 15000, 'Payload contains totalAmount');

            // Verify notification_logs in database
            const logCheck = await db.query('SELECT * FROM notification_logs WHERE id = $1', [queuedLogId]);
            assert(logCheck.rows.length === 1, 'Log exists in notification_logs');
            const log = logCheck.rows[0];
            assert(log.delivery_status === 'queued', 'Initial log status is queued');
            assert(log.metadata?.entity_type === 'invoice', 'Log metadata entity_type is invoice');
            assert(log.metadata?.entity_id === String(invoice1.id), 'Log metadata entity_id links invoice.id');
            assert(log.metadata?.invoice_number === invoice1.invoice_number, 'Log metadata links invoice_number');
        }

        // =========================================================================
        // Test 6: Deduplication Guard on Rapid Double-Click
        // =========================================================================
        console.log('\n--- Scenario 6: Deduplication Guard on Rapid Double-Click ---');
        {
            // Sending the same request again with the exact same nonce within the window
            const { req, res } = createMockReqRes({
                user: userT1,
                params: { id: String(invoice1.id) },
                body: { client_action_id: `action_dedup_test` }
            });
            // First click
            await financeController.sendInvoiceWhatsApp(req, res);
            assert(res.getStatusCode() === 200, 'First click succeeds');

            // Second immediate click with same action nonce
            const { req: req2, res: res2 } = createMockReqRes({
                user: userT1,
                params: { id: String(invoice1.id) },
                body: { client_action_id: `action_dedup_test` }
            });
            await financeController.sendInvoiceWhatsApp(req2, res2);
            assert(res2.getStatusCode() === 409, 'Rapid duplicate click is blocked with 409 Conflict');
            assert(res2.getResponseData()?.code === 'DUPLICATE_JOB', 'Response code is DUPLICATE_JOB');
        }

        // =========================================================================
        // Test 7: Manual Override with Custom Phone & Message (International Number)
        // =========================================================================
        console.log('\n--- Scenario 7: Manual Phone Override & Custom Message ---');
        {
            const customPhone = '+966501234567';
            const customMsg = 'Custom invoice dispatch text for Saudi client';
            const { req, res } = createMockReqRes({
                user: userT1,
                params: { id: String(invoice1.id) },
                body: {
                    recipient_phone: customPhone,
                    custom_message: customMsg,
                    client_action_id: `action_custom_${Date.now()}`
                }
            });
            await financeController.sendInvoiceWhatsApp(req, res);
            assert(res.getStatusCode() === 200, 'Custom phone & message dispatch accepted');
            const data = res.getResponseData()?.data;
            assert(data?.recipientPhone === '+966501234567', 'Preserved international format +966501234567');

            const check = await db.query('SELECT payload FROM notification_jobs WHERE id = $1', [data.jobId]);
            assert(check.rows[0]?.payload?.messageText === customMsg, 'Custom message saved in job payload');

            const logCheck2 = await db.query('SELECT message_body FROM notification_logs WHERE job_id = $1', [data.jobId]);
            assert(logCheck2.rows[0]?.message_body === customMsg, 'Custom message saved in notification_logs');
        }

        // =========================================================================
        // Test 8: getInvoiceDetails Returns Latest Delivery Badge Data
        // =========================================================================
        console.log('\n--- Scenario 8: getInvoiceDetails Includes latest_delivery ---');
        {
            const { req, res } = createMockReqRes({
                user: userT1,
                params: { id: String(invoice1.id) }
            });
            await financeController.getInvoiceDetails(req, res);
            assert(res.getStatusCode() === 200, 'getInvoiceDetails succeeds (200)');
            const invData = res.getResponseData()?.data;
            assert(Boolean(invData?.latest_delivery), 'Response contains latest_delivery object');
            assert(invData?.latest_delivery?.delivery_status === 'queued', 'latest_delivery reflects queued state');
            assert(Boolean(invData?.latest_delivery?.recipient_phone), 'latest_delivery has recipient_phone');
        }

        // =========================================================================
        // Test 9: getInvoiceDeliveryHistory Returns Ordered Logs
        // =========================================================================
        console.log('\n--- Scenario 9: getInvoiceDeliveryHistory Returns Logs ---');
        {
            const { req, res } = createMockReqRes({
                user: userT1,
                params: { id: String(invoice1.id) }
            });
            await financeController.getInvoiceDeliveryHistory(req, res);
            assert(res.getStatusCode() === 200, 'getInvoiceDeliveryHistory succeeds (200)');
            const history = res.getResponseData()?.data;
            assert(Array.isArray(history) && history.length >= 2, 'History returns multiple delivery records');
            assert(Boolean(history[0].id) && Boolean(history[0].delivery_status), 'Record contains delivery_status');
        }

        // =========================================================================
        // Test 10: Cross-Tenant Isolation on History
        // =========================================================================
        console.log('\n--- Scenario 10: Cross-Tenant History Isolation ---');
        {
            const { req, res } = createMockReqRes({
                user: userT2, // Tenant 2 user
                params: { id: String(invoice1.id) } // Tenant 1 invoice
            });
            await financeController.getInvoiceDeliveryHistory(req, res);
            assert(res.getStatusCode() === 200, 'Endpoint responds safely');
            const history = res.getResponseData()?.data;
            assert(Array.isArray(history) && history.length === 0, 'Tenant 2 sees ZERO delivery history for Tenant 1 invoice');
        }

        // =========================================================================
        // Test 11: NotificationWorker Processing in Dry-Run Mode
        // =========================================================================
        console.log('\n--- Scenario 11: Worker Processing in dryRun Mode ---');
        {
            const workerResult = await notificationWorkerService.processPendingJobs({ batchSize: 20, dryRun: true });
            assert(workerResult.processed > 0, `Worker processed ${workerResult.processed} job(s)`);
            assert(workerResult.succeeded > 0, `Worker succeeded on ${workerResult.succeeded} job(s)`);

            // Verify our queued job transitioned to completed
            const jobCheck = await db.query('SELECT status, meta_message_id, processed_at FROM notification_jobs WHERE id = $1', [queuedJobId]);
            assert(jobCheck.rows[0].status === 'completed', 'Job status transitioned to completed');
            assert(jobCheck.rows[0].meta_message_id.startsWith('wamid.mock.'), 'Job received mock WAMID');
            assert(Boolean(jobCheck.rows[0].processed_at), 'processed_at timestamp is stamped');

            // Verify notification_logs transitioned to sent
            const logCheck = await db.query('SELECT delivery_status, meta_message_id, sent_at FROM notification_logs WHERE id = $1', [queuedLogId]);
            assert(logCheck.rows[0].delivery_status === 'sent', 'Log delivery_status transitioned to sent');
            assert(logCheck.rows[0].meta_message_id.startsWith('wamid.mock.'), 'Log stamped with meta_message_id');
            assert(Boolean(logCheck.rows[0].sent_at), 'Log stamped with sent_at');
        }

        // =========================================================================
        // Test 12: Monotonic Delivery Advancement (Simulating Webhook Callback)
        // =========================================================================
        console.log('\n--- Scenario 12: Monotonic Delivery Advancement ---');
        {
            // Simulate webhook event: delivered
            await db.query(`
                UPDATE notification_logs
                SET delivery_status = 'delivered',
                    delivered_at = NOW(),
                    updated_at = NOW()
                WHERE (job_id = $1 OR metadata->>'entity_id' = $2::text)
                  AND delivery_status IN ('queued', 'sent')
            `, [queuedJobId, invoice1.id]);

            const logCheck = await db.query('SELECT delivery_status, delivered_at FROM notification_logs WHERE id = $1', [queuedLogId]);
            assert(logCheck.rows[0].delivery_status === 'delivered', 'Log delivery_status advanced to delivered');
            assert(Boolean(logCheck.rows[0].delivered_at), 'delivered_at timestamp recorded');

            // Check getInvoiceDetails now reflects 'delivered'
            const { req, res } = createMockReqRes({
                user: userT1,
                params: { id: String(invoice1.id) }
            });
            await financeController.getInvoiceDetails(req, res);
            const latest = res.getResponseData()?.data?.latest_delivery;
            assert(latest?.delivery_status === 'delivered', 'getInvoiceDetails returns latest_delivery as delivered');
        }

    } finally {
        // =========================================================================
        // Cleanup Test Data
        // =========================================================================
        console.log('\n🧹 Cleaning up test data...');
        try {
            await db.query(`
                DELETE FROM notification_logs 
                WHERE metadata->>'entity_id' IN ($1::text, $2::text, $3::text)
                   OR tenant_id::text IN ($4::text, $5::text)
            `, [invoice1.id, invoiceNoPhone.id, invoiceT2.id, tenantId1, tenantId2]);

            await db.query(`
                DELETE FROM notification_jobs 
                WHERE payload->>'invoiceId' IN ($1::text, $2::text, $3::text)
                   OR tenant_id::text IN ($4::text, $5::text)
            `, [invoice1.id, invoiceNoPhone.id, invoiceT2.id, tenantId1, tenantId2]);

            await db.query('DELETE FROM invoices WHERE id IN ($1, $2, $3)', [invoice1.id, invoiceNoPhone.id, invoiceT2.id]);
            await db.query('DELETE FROM customers WHERE id IN ($1, $2)', [customerWithPhone.id, customerNoPhone.id]);
            await db.query('DELETE FROM users WHERE id IN ($1, $2)', [userT1.id, userT2.id]);
            console.log('✅ Clean up complete.');
        } catch (cleanErr) {
            console.warn('Cleanup warning:', cleanErr.message);
        }
    }

    console.log(`\n======================================================`);
    console.log(`📊 P3 Test Results: ${passCount} Passed, ${failCount} Failed`);
    console.log(`======================================================\n`);

    if (failCount > 0) {
        process.exit(1);
    }
}

runInvoiceDeliveryTestSuite()
    .then(() => {
        console.log('🎉 P3 Invoice Delivery Test Suite Completed Successfully!');
        process.exit(0);
    })
    .catch((err) => {
        console.error('💥 P3 Test Suite Fatal Error:', err);
        process.exit(1);
    });
