'use strict';
// Rental occupancy + internal vacancy alerts. In-app only: nothing here sends WhatsApp, email or SMS, and nothing
// here changes unit lifecycle status, contracts, payments or commissions.
const crypto = require('crypto');
const { rentalDueDate } = require('./crmTeamRentalPolicy');

class RentalRuleError extends Error {
  constructor(code, message, status = 400) { super(message); this.isRentalRuleError = true; this.code = code; this.status = status; }
}
const MAX_LEAD_DAYS = 365;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const isDay = (v) => typeof v === 'string' && DAY.test(v) && new Date(v + 'T00:00:00Z').toISOString().slice(0, 10) === v;

function parseTerms({ starts_on, ends_on, reminder_lead_days }) {
  if (!isDay(ends_on)) throw new RentalRuleError('INVALID_END_DATE', 'A valid rental end date (YYYY-MM-DD) is required.');
  if (starts_on !== undefined && starts_on !== null && starts_on !== '' && !isDay(starts_on)) throw new RentalRuleError('INVALID_START_DATE', 'Invalid rental start date.');
  const start = starts_on || null;
  if (start && ends_on < start) throw new RentalRuleError('END_BEFORE_START', 'The rental end date cannot be before its start date.');
  const lead = typeof reminder_lead_days === 'string' && reminder_lead_days.trim() !== '' ? Number(reminder_lead_days) : reminder_lead_days;
  if (!Number.isInteger(lead) || lead < 0 || lead > MAX_LEAD_DAYS) throw new RentalRuleError('INVALID_NOTICE_DAYS', `Notice days must be a whole number from 0 to ${MAX_LEAD_DAYS}.`);
  return { startsOn: start, endsOn: ends_on, leadDays: lead };
}

const DUE_SQL = `((o.ends_on - o.reminder_lead_days) + o.reminder_local_time) AT TIME ZONE o.timezone`;

async function createOccupancy(client, { tenantId, branchId, unitId, handoverId, contractId, terms, user }) {
  const t = parseTerms(terms);
  const dup = await client.query(`SELECT id FROM re_rental_occupancies WHERE tenant_id::text = $1::text AND unit_id = $2::uuid AND state = 'occupied'`, [String(tenantId), unitId]);
  if (dup.rows.length > 0) throw new RentalRuleError('UNIT_ALREADY_OCCUPIED', 'This unit already has a current rental occupancy.', 409);
  const id = crypto.randomUUID();
  const r = await client.query(
    `INSERT INTO re_rental_occupancies (id, tenant_id, branch_id, unit_id, handover_id, contract_id, starts_on, ends_on, reminder_lead_days, created_by)
     VALUES ($1,$2,$3,$4::uuid,$5::uuid,$6,$7,$8,$9,$10) RETURNING *`,
    [id, String(tenantId), branchId ? String(branchId) : null, unitId, handoverId, contractId || null, t.startsOn, t.endsOn, t.leadDays, user?.id ?? null]);
  return r.rows[0];
}

async function lockOccupancy(client, { id, tenantId, branchId }) {
  const r = await client.query(
    `SELECT * FROM re_rental_occupancies WHERE id::text = $1::text AND tenant_id::text = $2::text
       AND ($3::text IS NULL OR branch_id IS NULL OR branch_id::text = $3::text) FOR UPDATE`, [String(id), String(tenantId), branchId ? String(branchId) : null]);
  if (r.rows.length === 0) throw new RentalRuleError('NOT_FOUND', 'Rental occupancy not found or unauthorized.', 404);
  return r.rows[0];
}

// Extension / date or notice revision. A new revision gets its own alert, so a changed end date can warn again.
async function reviseOccupancy(client, { id, tenantId, branchId, changes }) {
  const occ = await lockOccupancy(client, { id, tenantId, branchId });
  if (occ.state !== 'occupied') throw new RentalRuleError('NOT_OCCUPIED', 'Only a current occupancy can be revised.', 409);
  const endsCur = (await client.query(`SELECT to_char(ends_on,'YYYY-MM-DD') e, to_char(starts_on,'YYYY-MM-DD') s FROM re_rental_occupancies WHERE id=$1::uuid`, [occ.id])).rows[0];
  const t = parseTerms({
    starts_on: changes.starts_on !== undefined ? changes.starts_on : endsCur.s,
    ends_on: changes.ends_on !== undefined ? changes.ends_on : endsCur.e,
    reminder_lead_days: changes.reminder_lead_days !== undefined ? changes.reminder_lead_days : occ.reminder_lead_days
  });
  if (t.endsOn === endsCur.e && t.leadDays === occ.reminder_lead_days && (t.startsOn || null) === (endsCur.s || null)) return { occupancy: occ, changed: false };
  const r = await client.query(
    `UPDATE re_rental_occupancies SET starts_on=$2, ends_on=$3, reminder_lead_days=$4, revision=revision+1, updated_at=NOW() WHERE id=$1::uuid RETURNING *`,
    [occ.id, t.startsOn, t.endsOn, t.leadDays]);
  return { occupancy: r.rows[0], changed: true };
}

async function confirmVacancy(client, { id, tenantId, branchId, user }) {
  const occ = await lockOccupancy(client, { id, tenantId, branchId });
  if (occ.state !== 'occupied') throw new RentalRuleError('NOT_OCCUPIED', 'Only a current occupancy can be confirmed vacant.', 409);
  const r = await client.query(`UPDATE re_rental_occupancies SET state='vacancy_confirmed', vacancy_confirmed_at=NOW(), vacancy_confirmed_by=$2, updated_at=NOW() WHERE id=$1::uuid RETURNING *`, [occ.id, user?.id ?? null]);
  return r.rows[0];
}

async function cancelOccupancy(client, { id, tenantId, branchId }) {
  const occ = await lockOccupancy(client, { id, tenantId, branchId });
  if (occ.state !== 'occupied') throw new RentalRuleError('NOT_OCCUPIED', 'Only a current occupancy can be cancelled.', 409);
  const r = await client.query(`UPDATE re_rental_occupancies SET state='cancelled', updated_at=NOW() WHERE id=$1::uuid RETURNING *`, [occ.id]);
  return r.rows[0];
}

// Internal recipients: the team manager and the unit's responsible staff user; when no valid responsible employee is
// set, the whole team instead. Deduplicated, same tenant (and branch when both are set), real staff users only.
async function resolveRecipients(queryable, occ) {
  const ctx = (await queryable.query(
    `SELECT u.responsible_person_id, d.assigned_team_id, COALESCE(o.branch_id, d.branch_id::text) AS branch_id
       FROM re_rental_occupancies o
       JOIN re_units u ON u.id = o.unit_id AND u.tenant_id::text = o.tenant_id::text
       LEFT JOIN re_handovers h ON h.id = o.handover_id
       LEFT JOIN deals d ON d.id = h.deal_id AND d.tenant_id::text = o.tenant_id::text
      WHERE o.id = $1::uuid`, [occ.id])).rows[0];
  if (!ctx) return { users: [], source: 'none' };
  const eligible = `u.tenant_id::text = $1::text AND COALESCE(u.is_working, TRUE) AND ($2::text IS NULL OR u.branch_id IS NULL OR u.branch_id::text = $2::text)`;
  const out = new Map();
  let source = 'none';
  if (ctx.assigned_team_id) {
    const m = await queryable.query(
      `SELECT u.id, u.name FROM sales_teams st JOIN users u ON u.id = st.manager_id
        WHERE st.id = $3 AND st.tenant_id::text = $1::text AND ${eligible}`, [occ.tenant_id, ctx.branch_id, ctx.assigned_team_id]);
    m.rows.forEach(r => out.set(String(r.id), r));
  }
  let employeeSet = false;
  if (ctx.responsible_person_id) {
    const e = await queryable.query(`SELECT u.id, u.name FROM users u WHERE u.id::text = $3::text AND ${eligible}`, [occ.tenant_id, ctx.branch_id, String(ctx.responsible_person_id)]);
    if (e.rows.length) { employeeSet = true; e.rows.forEach(r => out.set(String(r.id), r)); source = 'manager_and_employee'; }
  }
  if (!employeeSet && ctx.assigned_team_id) {
    const t = await queryable.query(
      `SELECT u.id, u.name FROM sales_team_members stm JOIN users u ON u.id = stm.user_id AND u.tenant_id::text = stm.tenant_id::text
        WHERE stm.team_id = $3 AND stm.tenant_id::text = $1::text AND ${eligible}`, [occ.tenant_id, ctx.branch_id, ctx.assigned_team_id]);
    t.rows.forEach(r => out.set(String(r.id), r)); source = 'manager_and_team';
  }
  if (out.size === 0) source = 'none';
  return { users: [...out.values()], source };
}

async function scanDueAlerts(db, { limit = 200, now = null } = {}) {
  let ids;
  try {
    ids = (await db.query(
      `SELECT o.id FROM re_rental_occupancies o WHERE o.state = 'occupied' AND ${DUE_SQL} <= COALESCE($1::timestamptz, NOW()) ORDER BY o.ends_on LIMIT $2`, [now, limit])).rows;
  } catch (e) {
    console.warn('[RentalAlerts] Scanner notice:', e.message); return { processed: 0, delivered: 0, noRecipients: 0 };
  }
  let delivered = 0, noRecipients = 0;
  for (const { id } of ids) {
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const lock = await client.query(
        `SELECT o.*, ${DUE_SQL} AS due_at, un.name AS unit_name, un.unit_number, to_char(o.ends_on,'YYYY-MM-DD') AS ends_txt
           FROM re_rental_occupancies o JOIN re_units un ON un.id = o.unit_id
          WHERE o.id = $1::uuid AND o.state = 'occupied' AND ${DUE_SQL} <= COALESCE($2::timestamptz, NOW()) FOR UPDATE OF o SKIP LOCKED`, [id, now]);
      const occ = lock.rows[0];
      if (!occ) { await client.query('ROLLBACK'); continue; }
      const { users } = await resolveRecipients(client, occ);
      if (users.length === 0) { noRecipients++; await client.query('COMMIT'); continue; }
      for (const u of users) {
        const ins = await client.query(
          `INSERT INTO re_rental_alert_deliveries (id, tenant_id, occupancy_id, revision, recipient_user_id, recipient_snapshot, kind, due_at)
           VALUES ($1,$2,$3::uuid,$4,$5,$6::jsonb,'vacancy_warning',$7) ON CONFLICT (tenant_id, occupancy_id, revision, recipient_user_id, kind) DO NOTHING RETURNING id`,
          [crypto.randomUUID(), occ.tenant_id, occ.id, occ.revision, u.id, JSON.stringify({ id: u.id, name: u.name }), occ.due_at]);
        if (ins.rows.length === 0) continue; // already delivered for this revision
        const label = occ.unit_number || occ.unit_name || '';
        const n = await client.query(
          `INSERT INTO system_notifications (tenant_id, branch_id, user_id, type, title, message, link, metadata)
           VALUES ($1,$2,$3,'rental_vacancy_warning',$4,$5,$6,$7::jsonb) RETURNING id`,
          [occ.tenant_id, occ.branch_id || null, u.id,
           `الإيجار ينتهي قريبًا / Rental ending soon: ${label}`,
           `إيجار الوحدة ${label} ينتهي في ${occ.ends_txt}. أكد الإخلاء أو مدد العقد. / Rental of unit ${label} ends on ${occ.ends_txt}. Confirm vacancy or extend.`,
           '/real-estate/rentals', JSON.stringify({ occupancy_id: occ.id, unit_id: occ.unit_id, revision: occ.revision, ends_on: occ.ends_txt, internal_only: true })]);
        await client.query(`UPDATE re_rental_alert_deliveries SET delivered_at = NOW(), notification_id = $2 WHERE id = $1::uuid`, [ins.rows[0].id, n.rows[0].id]);
        delivered++;
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      console.warn('[RentalAlerts] occupancy failed:', id, e.message);
    } finally { client.release(); }
  }
  if (ids.length) console.log(`[RentalAlerts] due=${ids.length} delivered=${delivered} noRecipients=${noRecipients}`);
  return { processed: ids.length, delivered, noRecipients };
}

const startRentalAlertScanner = (intervalMinutes = 15) => {
  const db = require('../config/db');
  setTimeout(() => { scanDueAlerts(db); }, 45 * 1000);
  setInterval(() => { scanDueAlerts(db); }, intervalMinutes * 60 * 1000);
  console.log(`[RentalAlerts] Scanner scheduled every ${intervalMinutes} minute(s).`);
};

module.exports = { RentalRuleError, MAX_LEAD_DAYS, parseTerms, createOccupancy, reviseOccupancy, confirmVacancy, cancelOccupancy, resolveRecipients, scanDueAlerts, startRentalAlertScanner, rentalDueDate, DUE_SQL };
