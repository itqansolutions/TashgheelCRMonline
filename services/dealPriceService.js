'use strict';
// Deal price history and below-unit-price approval (tables: deal_price_changes, deal_price_approvals).
// Design choices (documented, see ops/proposals/deal_price_workflow.sql):
//  - A price at or above the linked unit's CURRENT price saves directly and is logged.
//  - A price below it never changes deals.value. It becomes ONE pending request (a newer request cancels the old one).
//  - Approver: team manager, else the salesperson's department manager, else any admin. The requester is skipped
//    as approver at the manager steps (no self-approval by a manager); admins fall back to the admin pool.
//  - A request is stale (not applicable) if the deal value or the unit price changed since the request, or the deal is terminal.
//  - Closing a deal while a request is pending is blocked.
const crypto = require('crypto');
const db = require('../config/db');

const uuid = () => crypto.randomUUID();
const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
const FINAL = ['closed', 'won', 'closed won', 'closed_won', 'contracted', 'lost', 'closed lost', 'closed_lost', 'cancelled'];
const isTerminalStage = (s) => FINAL.includes(String(s || '').trim().toLowerCase());

let _ready = false;
// Skip the workflow safely if the migration has not been applied yet (never abort a deal save).
async function tablesReady(q) {
  if (_ready) return true;
  try {
    const r = await q.query("SELECT to_regclass('public.deal_price_changes') AS a, to_regclass('public.deal_price_approvals') AS b");
    _ready = !!(r.rows[0] && r.rows[0].a && r.rows[0].b);
  } catch (e) { _ready = false; }
  return _ready;
}

async function getUnitPrice(q, unitId, tenantId) {
  if (!unitId) return null;
  const r = await q.query('SELECT price FROM re_units WHERE id::text = $1::text AND tenant_id::text = $2::text', [String(unitId), String(tenantId)]);
  const p = r.rows[0] ? num(r.rows[0].price) : null;
  return p && p > 0 ? p : null;
}

async function resolveApprover(q, { tenantId, teamId, assignedTo, requestedBy }) {
  if (teamId) {
    const t = await q.query('SELECT manager_id FROM sales_teams WHERE id = $1 AND tenant_id::text = $2::text', [teamId, String(tenantId)]);
    const m = t.rows[0]?.manager_id;
    if (m && String(m) !== String(requestedBy)) return { approverUserId: m, route: 'team_manager' };
  }
  const salesperson = assignedTo || requestedBy;
  if (salesperson) {
    const d = await q.query(
      `SELECT dep.manager_id FROM users u JOIN departments dep ON dep.id = u.department_id
       WHERE u.id = $1 AND u.tenant_id::text = $2::text`, [salesperson, String(tenantId)]);
    const m = d.rows[0]?.manager_id;
    if (m && String(m) !== String(requestedBy)) return { approverUserId: m, route: 'department_manager' };
  }
  return { approverUserId: null, route: 'admin' };
}

async function recordPriceChange(q, { tenantId, branchId, dealId, oldValue, newValue, unitPrice, changedBy, source, approvalId = null, reason = null }) {
  await q.query(
    `INSERT INTO deal_price_changes (id, tenant_id, branch_id, deal_id, old_value, new_value, unit_price_at_change, changed_by, source, approval_id, reason)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [uuid(), String(tenantId), branchId ? String(branchId) : null, dealId, num(oldValue), num(newValue), num(unitPrice), changedBy || null, source, approvalId, reason]
  );
}

async function createPriceRequest(q, { tenantId, branchId, deal, requestedValue, unitPrice, requestedBy, reason = null }) {
  await q.query(`UPDATE deal_price_approvals SET status = 'cancelled', decided_at = CURRENT_TIMESTAMP, decision_note = 'Superseded by a newer request'
                 WHERE deal_id = $1 AND tenant_id::text = $2::text AND status = 'pending'`, [deal.id, String(tenantId)]);
  const route = await resolveApprover(q, { tenantId, teamId: deal.assigned_team_id, assignedTo: deal.assigned_to, requestedBy });
  const id = uuid();
  await q.query(
    `INSERT INTO deal_price_approvals (id, tenant_id, branch_id, deal_id, requested_by, requested_value, deal_value_at_request, unit_id, unit_price_at_request, approver_user_id, approver_route, reason)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [id, String(tenantId), branchId ? String(branchId) : null, deal.id, requestedBy || null, requestedValue, num(deal.value) || 0, deal.unit_id || null, unitPrice, route.approverUserId, route.route, reason]
  );
  return { id, approverUserId: route.approverUserId, route: route.route };
}

async function getPendingRequest(q, dealId, tenantId) {
  const r = await q.query(`SELECT * FROM deal_price_approvals WHERE deal_id = $1 AND tenant_id::text = $2::text AND status = 'pending' LIMIT 1`, [dealId, String(tenantId)]);
  return r.rows[0] || null;
}

async function hasPendingRequest(q, dealId, tenantId) {
  try { return !!(await getPendingRequest(q, dealId, tenantId)); } catch (e) { return false; } // tables absent before migration
}

// Notify the approver (or all admins) in-app. Never throws.
async function notifyApprover({ tenantId, branchId, approverUserId, dealId, dealTitle, requestedValue, unitPrice, requesterName }) {
  try {
    const notificationService = require('./notificationService');
    const targets = approverUserId ? [{ id: approverUserId }] : (await db.query(
      `SELECT id FROM users WHERE tenant_id::text = $1::text AND role = 'admin' AND COALESCE(is_working, true) = true`, [String(tenantId)])).rows;
    for (const t of targets) {
      await notificationService.notify({
        tenant_id: tenantId, branch_id: branchId, user_id: String(t.id), type: 'price_approval',
        title: 'Price approval request',
        message: `${requesterName || 'A salesperson'} asked to price "${dealTitle}" at ${requestedValue} (unit price ${unitPrice}).`,
        link: `/deals/${dealId}`, metadata: { dealId, requestedValue, unitPrice }
      });
    }
  } catch (e) { console.warn('[PriceApproval] notify failed:', e.message); }
}

class PriceError extends Error { constructor(status, code, message) { super(message); this.status = status; this.code = code; } }

function canDecide(user, approval) {
  if (approval.approver_user_id) return String(approval.approver_user_id) === String(user.id);
  return user.role === 'admin';
}

// Approve or reject a pending request. Runs in its own transaction with the deal row locked.
async function decide({ approvalId, user, tenantId, decision, note = null }) {
  const client = db.connect ? await db.connect() : await db.pool.connect();
  try {
    await client.query('BEGIN');
    const a = (await client.query('SELECT * FROM deal_price_approvals WHERE id::text = $1::text AND tenant_id::text = $2::text FOR UPDATE', [String(approvalId), String(tenantId)])).rows[0];
    if (!a) throw new PriceError(404, 'NOT_FOUND', 'Request not found.');
    if (a.status !== 'pending') throw new PriceError(409, 'NOT_PENDING', `Request is already ${a.status}.`);
    if (!canDecide(user, a)) throw new PriceError(403, 'NOT_APPROVER', 'Only the designated approver can decide this request.');
    const deal = (await client.query('SELECT id, title, value, pipeline_stage, unit_id, branch_id FROM deals WHERE id = $1 AND tenant_id::text = $2::text FOR UPDATE', [a.deal_id, String(tenantId)])).rows[0];
    if (!deal) throw new PriceError(404, 'NOT_FOUND', 'Deal not found.');
    if (decision === 'reject') {
      await client.query(`UPDATE deal_price_approvals SET status='rejected', decided_by=$2, decided_at=CURRENT_TIMESTAMP, decision_note=$3 WHERE id=$1`, [a.id, user.id, note]);
      await client.query('COMMIT');
      return { status: 'rejected', dealId: deal.id };
    }
    const unitPrice = await getUnitPrice(client, deal.unit_id, tenantId);
    const stale = isTerminalStage(deal.pipeline_stage) || num(deal.value) !== num(a.deal_value_at_request) || String(deal.unit_id || '') !== String(a.unit_id || '') || (unitPrice !== null && unitPrice !== num(a.unit_price_at_request));
    if (stale) {
      await client.query(`UPDATE deal_price_approvals SET status='stale', decided_by=$2, decided_at=CURRENT_TIMESTAMP, decision_note='Deal or unit price changed since the request' WHERE id=$1`, [a.id, user.id]);
      await client.query('COMMIT');
      throw new PriceError(409, 'STALE_REQUEST', 'The deal or unit price changed since this request. It was not applied; ask the salesperson to request again.');
    }
    await client.query('UPDATE deals SET value = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND tenant_id::text = $3::text', [deal.id, a.requested_value, String(tenantId)]);
    await client.query(`UPDATE deal_price_approvals SET status='approved', decided_by=$2, decided_at=CURRENT_TIMESTAMP, decision_note=$3 WHERE id=$1`, [a.id, user.id, note]);
    await recordPriceChange(client, { tenantId, branchId: deal.branch_id, dealId: deal.id, oldValue: deal.value, newValue: a.requested_value, unitPrice, changedBy: user.id, source: 'approval', approvalId: a.id, reason: note });
    await client.query('COMMIT');
    return { status: 'approved', dealId: deal.id, value: num(a.requested_value) };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally { client.release(); }
}

async function listForDeal(q, dealId, tenantId) {
  const changes = (await q.query(
    `SELECT c.*, u.name AS changed_by_name FROM deal_price_changes c LEFT JOIN users u ON u.id = c.changed_by
     WHERE c.deal_id = $1 AND c.tenant_id::text = $2::text ORDER BY c.changed_at DESC`, [dealId, String(tenantId)])).rows;
  const approvals = (await q.query(
    `SELECT a.*, r.name AS requested_by_name, ap.name AS approver_name FROM deal_price_approvals a
     LEFT JOIN users r ON r.id = a.requested_by LEFT JOIN users ap ON ap.id = a.approver_user_id
     WHERE a.deal_id = $1 AND a.tenant_id::text = $2::text ORDER BY a.requested_at DESC`, [dealId, String(tenantId)])).rows;
  return { changes, approvals };
}

module.exports = { tablesReady, getUnitPrice, resolveApprover, recordPriceChange, createPriceRequest, getPendingRequest, hasPendingRequest, notifyApprover, decide, listForDeal, canDecide, PriceError, isTerminalStage };
