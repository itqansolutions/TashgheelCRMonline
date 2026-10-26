const test = require('node:test');
const assert = require('node:assert/strict');
const activityController = require('../controllers/activityController');
const activityReminderService = require('../services/activityReminderService');
const db = require('../config/db');
const notificationService = require('../services/notificationService');

test('Customer Activity Scheduling & Follow-up Notifications', async (t) => {
  const TENANT_ID = '33333333-3333-3333-3333-333333333333';
  const originalQuery = db.query;
  const originalNotify = notificationService.notify;

  t.afterEach(() => {
    db.query = originalQuery;
    notificationService.notify = originalNotify;
  });

  await t.test('1. createActivity accepts and persists scheduled_at and reminder_note', async () => {
    let insertedData = null;
    db.query = async (sql, params) => {
      if (sql.includes('CREATE TABLE') || sql.includes('ALTER TABLE') || sql.includes('CREATE INDEX')) {
        return { rows: [] };
      }
      if (sql.includes('INSERT INTO activities')) {
        insertedData = {
          tenant_id: params[0],
          user_id: params[1],
          entity_type: params[2],
          entity_id: params[3],
          action: params[4],
          meta: JSON.parse(params[5]),
          scheduled_at: params[6],
          reminder_note: params[7]
        };
        return {
          rows: [{
            id: 101,
            ...insertedData,
            created_at: new Date().toISOString(),
            reminder_sent_at: null,
            is_reminder_dismissed: false
          }]
        };
      }
      return { rows: [] };
    };

    const scheduledDate = new Date(Date.now() + 3600 * 2000).toISOString();
    const req = {
      params: { entity_type: 'customer', entity_id: '45' },
      body: {
        action: 'called',
        note: 'Customer requested a callback tomorrow afternoon regarding payment terms.',
        scheduled_at: scheduledDate,
        reminder_note: 'Call Mr. Ahmed back with discounted quotation'
      },
      user: { id: 7, name: 'Sales Agent', role: 'sales_rep', tenant_id: TENANT_ID }
    };

    let statusCode = null;
    let jsonBody = null;
    const res = {
      status(c) { statusCode = c; return this; },
      json(b) { jsonBody = b; return this; }
    };

    await activityController.createActivity(req, res);

    assert.equal(statusCode, 201);
    assert.equal(jsonBody.status, 'success');
    assert.equal(jsonBody.data.scheduled_at, scheduledDate);
    assert.equal(jsonBody.data.reminder_note, 'Call Mr. Ahmed back with discounted quotation');
    assert.equal(insertedData.scheduled_at, scheduledDate);
    assert.equal(insertedData.reminder_note, 'Call Mr. Ahmed back with discounted quotation');
  });

  await t.test('2. getActivities returns scheduled_at and reminder tracking info', async () => {
    const scheduledDate = new Date(Date.now() + 3600 * 1000).toISOString();
    db.query = async (sql, params) => {
      if (sql.includes('FROM activities a')) {
        return {
          rows: [
            {
              id: 101,
              tenant_id: TENANT_ID,
              user_id: 7,
              user_name: 'Sales Agent',
              entity_type: 'customer',
              entity_id: '45',
              action: 'called',
              meta: { changes: { note: { to: 'Called customer' } }, scheduled_at: scheduledDate },
              scheduled_at: scheduledDate,
              reminder_sent_at: null,
              is_reminder_dismissed: false,
              reminder_note: 'Follow-up on quotation',
              created_at: new Date().toISOString()
            }
          ]
        };
      }
      return { rows: [] };
    };

    const req = {
      params: { entity_type: 'customer', entity_id: '45' },
      query: { limit: 10, offset: 0 },
      user: { id: 7, name: 'Sales Agent', role: 'sales_rep', tenant_id: TENANT_ID }
    };

    let jsonBody = null;
    const res = {
      json(b) { jsonBody = b; return this; },
      status() { return this; }
    };

    await activityController.getActivities(req, res);

    assert.equal(jsonBody.status, 'success');
    assert.equal(jsonBody.data.length, 1);
    const item = jsonBody.data[0];
    assert.equal(item.scheduled_at, scheduledDate);
    assert.equal(item.reminder_note, 'Follow-up on quotation');
    assert.equal(item.is_reminder_dismissed, false);
    assert.equal(item.reminder_sent_at, null);
  });

  await t.test('3. updateReminder allows dismissing and rescheduling follow-up', async () => {
    let updatedFields = {};
    db.query = async (sql, params) => {
      const normSql = sql.replace(/\s+/g, ' ');
      if (normSql.includes('SELECT * FROM activities WHERE id::text')) {
        return {
          rows: [{
            id: 101,
            tenant_id: TENANT_ID,
            scheduled_at: new Date().toISOString(),
            is_reminder_dismissed: false,
            meta: {}
          }]
        };
      }
      if (normSql.includes('UPDATE activities SET is_reminder_dismissed = TRUE')) {
        updatedFields.dismissed = true;
        return { rows: [{ id: 101, is_reminder_dismissed: true }] };
      }
      if (normSql.includes('UPDATE activities SET scheduled_at = $1')) {
        updatedFields.rescheduled_to = params[0];
        return {
          rows: [{
            id: 101,
            scheduled_at: params[0],
            reminder_sent_at: null,
            is_reminder_dismissed: false,
            reminder_note: params[1]
          }]
        };
      }
      return { rows: [] };
    };

    // 3A: Dismiss reminder
    const reqDismiss = {
      params: { id: '101' },
      body: { dismiss: true },
      user: { id: 7, tenant_id: TENANT_ID }
    };
    let dismissBody = null;
    const resDismiss = {
      json(b) { dismissBody = b; return this; },
      status() { return this; }
    };
    await activityController.updateReminder(reqDismiss, resDismiss);
    assert.equal(dismissBody.status, 'success');
    assert.equal(updatedFields.dismissed, true);

    // 3B: Reschedule reminder
    const newDate = new Date(Date.now() + 86400 * 1000).toISOString();
    const reqResched = {
      params: { id: '101' },
      body: { scheduled_at: newDate, reminder_note: 'Postponed per client request' },
      user: { id: 7, tenant_id: TENANT_ID }
    };
    let reschedBody = null;
    const resResched = {
      json(b) { reschedBody = b; return this; },
      status() { return this; }
    };
    await activityController.updateReminder(reqResched, resResched);
    assert.equal(reschedBody.status, 'success');
    assert.equal(updatedFields.rescheduled_to, newDate);
  });

  await t.test('4. activityReminderService scans due reminders and sends notifications', async () => {
    const notificationsSent = [];
    notificationService.notify = async (payload) => {
      notificationsSent.push(payload);
      return { id: 1 };
    };

    let updatedActivityId = null;
    db.query = async (sql, params) => {
      if (sql.includes('SELECT a.id, a.tenant_id, a.user_id, a.entity_type')) {
        return {
          rows: [
            {
              id: 202,
              tenant_id: TENANT_ID,
              user_id: 15,
              entity_type: 'customer',
              entity_id: '50',
              action: 'called',
              scheduled_at: new Date(Date.now() - 60000).toISOString(),
              reminder_note: 'Call back with updated floor plans',
              meta: { changes: { note: { to: 'Initial inquiry call' } } },
              creator_name: 'Sara Rep',
              customer_name: 'Mahmoud Hassan',
              customer_phone: '01012345678',
              customer_branch_id: 'branch-1'
            }
          ]
        };
      }
      if (sql.includes('INSERT INTO system_notifications')) {
        notificationsSent.push({
          tenant_id: params[0],
          branch_id: params[1],
          user_id: params[2],
          type: params[3],
          title: params[4],
          message: params[5],
          link: params[6],
          metadata: params[7]
        });
        return { rowCount: 1 };
      }
      if (sql.includes('UPDATE activities SET reminder_sent_at = CURRENT_TIMESTAMP')) {
        updatedActivityId = params[0];
        return { rowCount: 1 };
      }
      return { rows: [] };
    };

    const count = await activityReminderService.scanAndSendReminders();

    assert.equal(count, 1);
    assert.equal(notificationsSent.length, 1);
    const notif = notificationsSent[0];
    assert.equal(notif.type, 'activity_reminder');
    assert.match(notif.title, /Mahmoud Hassan/);
    assert.match(notif.message, /01012345678/);
    assert.match(notif.message, /Call back with updated floor plans/);
    assert.equal(notif.user_id, 15);
    assert.equal(notif.link, '/customers?customer360=50');
    assert.equal(updatedActivityId, 202);
  });
});
