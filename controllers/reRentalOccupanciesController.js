'use strict';
const db = require('../config/db');
const accessScopeService = require('../services/accessScopeService');
const rentalSvc = require('../services/rentalOccupancyService');
const { checkDealPermission } = require('../middleware/dealPermission');

const fail = (res, err) => {
  if (err && err.isRentalRuleError) return res.status(err.status).json({ status: 'error', code: err.code, message: err.message });
  console.error('[Rental Occupancy Error]', err.message);
  return res.status(500).json({ status: 'error', message: 'Rental occupancy request failed.' });
};
const ctx = (req) => ({ tenantId: String(req.user.tenant_id), branchId: req.user?.role === 'admin' ? null : (req.branchId || req.user?.branch_id || null) });

// Visible = the deal behind the handover is inside the caller's team/department/own scope (admin: all).
async function visibleOccupancy(client, req, id) {
  const { tenantId, branchId } = ctx(req);
  const scope = await accessScopeService.buildScopePredicate({ user: req.user, tableAlias: 'd', assigneeCol: 'assigned_to', paramIndex: 4 });
  const r = await client.query(
    `SELECT o.id FROM re_rental_occupancies o JOIN re_handovers h ON h.id = o.handover_id
       JOIN deals d ON d.id = h.deal_id AND d.tenant_id::text = o.tenant_id::text
      WHERE o.id::text = $1::text AND o.tenant_id::text = $2::text
        AND ($3::text IS NULL OR o.branch_id IS NULL OR o.branch_id::text = $3::text) AND (${scope.sql})`,
    [String(id), tenantId, branchId, ...scope.params]);
  if (r.rows.length === 0) throw new rentalSvc.RentalRuleError('NOT_FOUND', 'Rental occupancy not found or unauthorized.', 404);
}

exports.list = async (req, res) => {
  try {
    const { tenantId, branchId } = ctx(req);
    if (!(await checkDealPermission(req.user.id, tenantId, 'deal.view', req.user.role))) {
      return res.status(403).json({ status: 'error', code: 'PERMISSION_DENIED', message: 'Permission denied: "deal.view" is required.' });
    }
    const scope = await accessScopeService.buildScopePredicate({ user: req.user, tableAlias: 'd', assigneeCol: 'assigned_to', paramIndex: 3 });
    const state = req.query.state && ['occupied', 'vacancy_confirmed', 'cancelled'].includes(req.query.state) ? req.query.state : null;
    const r = await db.query(
      `SELECT o.id, o.unit_id, o.handover_id, o.state, o.revision, o.reminder_lead_days, o.timezone,
              to_char(o.starts_on,'YYYY-MM-DD') AS starts_on, to_char(o.ends_on,'YYYY-MM-DD') AS ends_on,
              (${rentalSvc.DUE_SQL}) AS alert_due_at, o.vacancy_confirmed_at,
              un.name AS unit_name, un.unit_number, un.project_name, d.id AS deal_id, d.title AS deal_title, d.assigned_team_id, st.name AS team_name,
              (SELECT COUNT(*)::int FROM re_rental_alert_deliveries x WHERE x.occupancy_id = o.id AND x.revision = o.revision AND x.delivered_at IS NOT NULL) AS alerts_delivered
         FROM re_rental_occupancies o
         JOIN re_units un ON un.id = o.unit_id
         JOIN re_handovers h ON h.id = o.handover_id
         JOIN deals d ON d.id = h.deal_id AND d.tenant_id::text = o.tenant_id::text
         LEFT JOIN sales_teams st ON st.id = d.assigned_team_id AND st.tenant_id::text = o.tenant_id::text
        WHERE o.tenant_id::text = $1::text AND ($2::text IS NULL OR o.branch_id IS NULL OR o.branch_id::text = $2::text)
          AND (${scope.sql}) ${state ? `AND o.state = '${state}'` : ''}
        ORDER BY o.ends_on ASC LIMIT 500`, [tenantId, branchId, ...scope.params]);
    const rows = [];
    for (const row of r.rows) {
      const rec = await rentalSvc.resolveRecipients(db, { id: row.id, tenant_id: tenantId });
      rows.push({ ...row, recipient_count: rec.users.length, recipient_source: rec.source });
    }
    res.json({ status: 'success', data: rows });
  } catch (e) { fail(res, e); }
};

async function mutate(req, res, fn) {
  const client = await db.connect();
  try {
    const { tenantId, branchId } = ctx(req);
    if (!(await checkDealPermission(req.user.id, tenantId, 'deal.edit_details', req.user.role))) {
      return res.status(403).json({ status: 'error', code: 'PERMISSION_DENIED', message: 'Permission denied: "deal.edit_details" is required.' });
    }
    await client.query('BEGIN');
    await visibleOccupancy(client, req, req.params.id);
    const data = await fn(client, { id: req.params.id, tenantId, branchId });
    await client.query('COMMIT');
    res.json({ status: 'success', data });
  } catch (e) { await client.query('ROLLBACK').catch(() => {}); fail(res, e); } finally { client.release(); }
}

exports.revise = (req, res) => mutate(req, res, async (c, a) => {
  const b = req.body || {};
  const changes = {};
  for (const k of ['starts_on', 'ends_on', 'reminder_lead_days']) if (Object.prototype.hasOwnProperty.call(b, k)) changes[k] = b[k];
  if (Object.keys(changes).length === 0) throw new rentalSvc.RentalRuleError('NO_CHANGES', 'Nothing to change.');
  return rentalSvc.reviseOccupancy(c, { ...a, changes });
});
exports.confirmVacancy = (req, res) => mutate(req, res, (c, a) => rentalSvc.confirmVacancy(c, { ...a, user: req.user }));
exports.cancel = (req, res) => mutate(req, res, (c, a) => rentalSvc.cancelOccupancy(c, a));
