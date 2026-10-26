/**
 * P4 & P5 — Per-Tenant Notification Rules & Delivery Audit Logs Test Suite
 *
 * Verifies:
 *   1. GET /api/notifications/rules returns all 5 supported events with default enabled state when no DB rows exist.
 *   2. PUT /api/notifications/rules upserts single & batch rules atomically per tenant.
 *   3. Disabling `lead.assigned` blocks WhatsApp job creation (`RULE_DISABLED`) while preserving `in_app` notification in `system_notifications`.
 *   4. Disabling `invoice.delivery` causes `financeController.sendInvoiceWhatsApp` to return 403 (`RULE_DISABLED`).
 *   5. Re-enabling `lead.assigned` with a custom `template_name` and `template_language` propagates template metadata into `notification_jobs.payload` and `notification_logs`.
 *   6. Rejects unknown/unsupported event names with HTTP 400.
 *   7. GET /api/notifications/delivery-logs returns tenant-isolated logs, supports filtering by `event_name` and `delivery_status`, and returns accurate KPI summary counts.
 *   8. Zero live external WhatsApp Cloud API calls (strictly offline/safe).
 */

require('dotenv').config();
const db = require('../config/db');
const notificationController = require('../controllers/notificationController');
const financeController = require('../controllers/financeController');
const notificationDispatcher = require('../src/domains/shared/services/notificationDispatcher');
const notificationQueueService = require('../services/notificationQueueService');

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  ✅ PASS: ${label}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${label}`);
    failed++;
  }
}

function createMockRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };
}

async function runTests() {
  console.log('\n======================================================');
  console.log('🧪 P4 — Notification Rules & Delivery Logs Test Suite');
  console.log('======================================================\n');

  let tenantAId;
  let tenantBId;
  let userAId;
  let userBId;
  let customerAId;
  let invoiceAId;

  try {
    // ── Setup Test Tenants, Users, Customer, Invoice ─────────────────────────
    const ts = Date.now();
    const tA = await db.query(
      `INSERT INTO tenants (name, slug) VALUES ('P4 Rules Tenant A', $1) RETURNING id`,
      [`p4-rules-a-${ts}`]
    );
    tenantAId = tA.rows[0].id;

    const tB = await db.query(
      `INSERT INTO tenants (name, slug) VALUES ('P4 Rules Tenant B', $1) RETURNING id`,
      [`p4-rules-b-${ts}`]
    );
    tenantBId = tB.rows[0].id;

    const uA = await db.query(
      `INSERT INTO users (tenant_id, name, email, password_hash, role, phone)
       VALUES ($1, 'Rules Admin A', $2, 'hash', 'admin', '01011122233') RETURNING id`,
      [tenantAId, `rules-a-${ts}@p4.local`]
    );
    userAId = uA.rows[0].id;

    const uB = await db.query(
      `INSERT INTO users (tenant_id, name, email, password_hash, role, phone)
       VALUES ($1, 'Rules Admin B', $2, 'hash', 'admin', '01044455566') RETURNING id`,
      [tenantBId, `rules-b-${ts}@p4.local`]
    );
    userBId = uB.rows[0].id;

    const cA = await db.query(
      `INSERT INTO customers (tenant_id, name, phone, status)
       VALUES ($1, 'عميل اختبار القواعد', '01099988877', 'active') RETURNING id`,
      [tenantAId]
    );
    customerAId = cA.rows[0].id;

    const invA = await db.query(
      `INSERT INTO invoices (tenant_id, customer_id, invoice_number, total_amount, due_date, status)
       VALUES ($1, $2, $3, 2500.00, CURRENT_DATE + INTERVAL '7 days', 'unpaid') RETURNING id`,
      [tenantAId, customerAId, `INV-P4-${ts}`]
    );
    invoiceAId = invA.rows[0].id;

    // ── Test 1: Default hydration of GET /api/notifications/rules ───────────
    console.log('--- 1. Default Hydration of GET /api/notifications/rules ---');
    {
      const req = { user: { id: userAId, tenant_id: tenantAId }, query: {} };
      const res = createMockRes();
      await notificationController.getNotificationRules(req, res);

      assert(res.statusCode === 200, 'GET /rules returns 200');
      assert(Array.isArray(res.body?.data) && res.body.data.length === 5, 'Returns all 5 supported notification events');
      const allEnabled = res.body.data.every(r => r.is_enabled === true);
      assert(allEnabled, 'All 5 events are enabled by default when no custom rows exist');
      const eventNames = res.body.data.map(r => r.event_name);
      assert(
        eventNames.includes('lead.assigned') &&
        eventNames.includes('task.assigned') &&
        eventNames.includes('task.overdue') &&
        eventNames.includes('activity.reminder') &&
        eventNames.includes('invoice.delivery'),
        'Includes lead.assigned, task.assigned, task.overdue, activity.reminder, invoice.delivery'
      );
    }

    // ── Test 2: PUT /api/notifications/rules Disables Events for Tenant A ───
    console.log('\n--- 2. PUT /api/notifications/rules Disables Events & Isolates Tenants ---');
    {
      const req = {
        user: { id: userAId, tenant_id: tenantAId },
        body: {
          rules: [
            { event_name: 'lead.assigned', is_enabled: false },
            { event_name: 'invoice.delivery', is_enabled: false }
          ]
        }
      };
      const res = createMockRes();
      await notificationController.updateNotificationRules(req, res);

      assert(res.statusCode === 200, 'PUT /rules returns 200');
      const leadRule = res.body.data.find(r => r.event_name === 'lead.assigned');
      const invRule = res.body.data.find(r => r.event_name === 'invoice.delivery');
      const taskRule = res.body.data.find(r => r.event_name === 'task.assigned');

      assert(leadRule && leadRule.is_enabled === false, 'lead.assigned is now disabled for Tenant A');
      assert(invRule && invRule.is_enabled === false, 'invoice.delivery is now disabled for Tenant A');
      assert(taskRule && taskRule.is_enabled === true, 'task.assigned remains enabled for Tenant A');

      // Check Tenant B is unaffected
      const reqB = { user: { id: userBId, tenant_id: tenantBId }, query: {} };
      const resB = createMockRes();
      await notificationController.getNotificationRules(reqB, resB);
      const leadRuleB = resB.body.data.find(r => r.event_name === 'lead.assigned');
      assert(leadRuleB && leadRuleB.is_enabled === true, 'Tenant B lead.assigned remains enabled (strict tenant isolation)');
    }

    // ── Test 3: Disabled Rule Blocks WhatsApp But Preserves In-App Alert ─────
    console.log('\n--- 3. Disabled Rule Blocks WhatsApp Queueing While Preserving In-App Alert ---');
    {
      const dispatchRes = await notificationDispatcher.dispatch({
        tenantId: tenantAId,
        userId: userAId,
        type: 'info',
        eventName: 'lead.assigned',
        title: 'عميل محتمل جديد',
        message: 'تم إسناد العميل إليك (اختبار P4)',
        metadata: { lead_id: 999 },
        deduplicationKey: `p4:lead.assigned:${tenantAId}:999`,
        channels: ['in_app', 'whatsapp']
      });

      assert(dispatchRes.inAppSent === true, 'In-App notification still created when WhatsApp rule is disabled');
      assert(dispatchRes.whatsappEnqueued === false, 'WhatsApp job is NOT enqueued when rule is disabled');
      assert(dispatchRes.whatsappError === 'RULE_DISABLED', 'Reason returned is RULE_DISABLED');

      const sysCheck = await db.query(
        `SELECT id FROM system_notifications WHERE tenant_id = $1 AND user_id = $2 AND title = 'عميل محتمل جديد'`,
        [tenantAId, userAId]
      );
      assert(sysCheck.rows.length === 1, 'system_notifications row persisted in database');
    }

    // ── Test 4: Disabled invoice.delivery Returns 403 on Manual Send ─────────
    console.log('\n--- 4. Disabled invoice.delivery Returns 403 on Manual Invoice WhatsApp Send ---');
    {
      const req = {
        user: { id: userAId, tenant_id: tenantAId, role: 'admin' },
        params: { id: invoiceAId },
        body: { client_action_id: 'p4-inv-disabled-test' }
      };
      const res = createMockRes();
      await financeController.sendInvoiceWhatsApp(req, res);

      assert(res.statusCode === 403, 'sendInvoiceWhatsApp returns HTTP 403 when invoice.delivery rule is disabled');
      assert(res.body?.code === 'RULE_DISABLED', 'Response includes code: RULE_DISABLED');
    }

    // ── Test 5: Re-enable Rule + Custom Template Name Propagation ───────────
    console.log('\n--- 5. Re-Enable Rule with Custom Template Name & Language Propagation ---');
    {
      const req = {
        user: { id: userAId, tenant_id: tenantAId },
        body: {
          event_name: 'lead.assigned',
          is_enabled: true,
          template_name: 'custom_lead_alert_v1',
          template_language: 'en'
        }
      };
      const res = createMockRes();
      await notificationController.updateNotificationRules(req, res);
      assert(res.statusCode === 200, 'Single-rule PUT /rules succeeds');

      const qRes = await notificationQueueService.enqueueNotificationJob({
        tenantId: tenantAId,
        eventName: 'lead.assigned',
        channel: 'whatsapp',
        recipientType: 'employee',
        recipientId: userAId,
        recipientPhone: '01011122233',
        recipientName: 'Rules Admin A',
        payload: {
          title: 'عميل محتمل جديد 2',
          messageText: 'تم إسناد العميل إليك بعد تفعيل القاعدة',
          metadata: { lead_id: 1000 }
        },
        deduplicationKey: `p4:lead.assigned:${tenantAId}:1000`
      });

      assert(qRes.enqueued === true, 'WhatsApp job enqueued after re-enabling rule');

      const jobRow = await db.query(
        `SELECT payload FROM notification_jobs WHERE id = $1`,
        [qRes.jobId]
      );
      const logRow = await db.query(
        `SELECT template_name, delivery_status FROM notification_logs WHERE id = $1`,
        [qRes.logId]
      );

      assert(
        jobRow.rows[0]?.payload?.templateName === 'custom_lead_alert_v1',
        'Custom template_name propagated into notification_jobs.payload.templateName'
      );
      assert(
        jobRow.rows[0]?.payload?.languageCode === 'en',
        'Custom template_language propagated into notification_jobs.payload.languageCode'
      );
      assert(
        logRow.rows[0]?.template_name === 'custom_lead_alert_v1' && logRow.rows[0]?.delivery_status === 'queued',
        'Custom template_name and queued status recorded in notification_logs'
      );
    }

    // ── Test 6: Reject Unknown Event Name ────────────────────────────────────
    console.log('\n--- 6. Validation Against Unknown Event Names ---');
    {
      const req = {
        user: { id: userAId, tenant_id: tenantAId },
        body: {
          event_name: 'unknown.invalid.event',
          is_enabled: true
        }
      };
      const res = createMockRes();
      await notificationController.updateNotificationRules(req, res);
      assert(res.statusCode === 400, 'Rejects unsupported event_name with HTTP 400');
    }

    // ── Test 7: GET /api/notifications/delivery-logs & Tenant Isolation ──────
    console.log('\n--- 7. Delivery Audit Logs Endpoint, Filtering & KPI Summary ---');
    {
      const reqA = {
        user: { id: userAId, tenant_id: tenantAId },
        query: { event_name: 'lead.assigned', delivery_status: 'queued' }
      };
      const resA = createMockRes();
      await notificationController.getNotificationDeliveryLogs(reqA, resA);

      assert(resA.statusCode === 200, 'GET /delivery-logs returns 200');
      assert(Array.isArray(resA.body?.data) && resA.body.data.length >= 1, 'Returns matching queued lead.assigned log for Tenant A');
      assert(Number(resA.body?.summary?.total) >= 1, 'Returns KPI summary counts for Tenant A');
      assert(Number(resA.body?.summary?.queued) >= 1, 'KPI summary queued count >= 1');

      // Check Tenant B cannot see Tenant A's delivery logs
      const reqB = {
        user: { id: userBId, tenant_id: tenantBId },
        query: {}
      };
      const resB = createMockRes();
      await notificationController.getNotificationDeliveryLogs(reqB, resB);
      assert(resB.statusCode === 200, 'GET /delivery-logs for Tenant B returns 200');
      assert(resB.body?.data?.length === 0, 'Tenant B sees 0 logs from Tenant A (strict tenant isolation)');
    }

  } catch (err) {
    console.error('Unexpected error during P4 test execution:', err);
    failed++;
  } finally {
    // Clean up test data
    if (tenantAId || tenantBId) {
      const ids = [tenantAId, tenantBId].filter(Boolean);
      await db.query(`DELETE FROM notification_logs WHERE tenant_id::text = ANY($1::text[])`, [ids]).catch(() => {});
      await db.query(`DELETE FROM notification_jobs WHERE tenant_id::text = ANY($1::text[])`, [ids]).catch(() => {});
      await db.query(`DELETE FROM notification_rules WHERE tenant_id::text = ANY($1::text[])`, [ids]).catch(() => {});
      await db.query(`DELETE FROM system_notifications WHERE tenant_id::text = ANY($1::text[])`, [ids]).catch(() => {});
      await db.query(`DELETE FROM invoices WHERE tenant_id::text = ANY($1::text[])`, [ids]).catch(() => {});
      await db.query(`DELETE FROM customers WHERE tenant_id::text = ANY($1::text[])`, [ids]).catch(() => {});
      await db.query(`DELETE FROM users WHERE tenant_id::text = ANY($1::text[])`, [ids]).catch(() => {});
      await db.query(`DELETE FROM tenants WHERE id::text = ANY($1::text[])`, [ids]).catch(() => {});
    }
    await db.pool.end();
  }

  console.log('\n======================================================');
  console.log(`📊 P4 Test Results: ${passed} Passed, ${failed} Failed`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
