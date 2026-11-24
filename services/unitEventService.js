'use strict';
const crypto = require('crypto');
class UnitRuleError extends Error {
  constructor(code, message, status = 400) { super(message); this.isUnitRuleError = true; this.code = code; this.status = status; }
}
const REASONS = new Set(['sold_elsewhere', 'other']);

function parsePrice(v) {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) throw new UnitRuleError('INVALID_PRICE', 'Price must be a non-negative number.');
  return n;
}
const numEq = (a, b) => (a === null && b === null) || (a !== null && b !== null && Number(a) === Number(b));

// Returns an event only when the price really changed. Currency/rent period are not stored on units, so they are never invented.
function buildPriceEvent(oldUnit, body) {
  if (!Object.prototype.hasOwnProperty.call(body, 'price')) return null;
  const next = parsePrice(body.price);
  const prev = oldUnit.price === null || oldUnit.price === undefined ? null : Number(oldUnit.price);
  if (numEq(prev, next)) return null;
  const nextType = Object.prototype.hasOwnProperty.call(body, 'transaction_type') && body.transaction_type ? body.transaction_type : oldUnit.transaction_type;
  return {
    eventType: 'price_changed',
    previous: { price: oldUnit.price === null ? null : String(oldUnit.price), transaction_type: oldUnit.transaction_type || null },
    next: { price: next === null ? null : String(next), transaction_type: nextType || null },
    source: 'unit_edit'
  };
}

// Plans a marketing flag change under the unit lock. Deactivation is blocked while the unit is in any live
// reservation/contract/handover state. This never changes the lifecycle status, deals, contracts or money.
async function planMarketingChange(client, oldUnit, body, tenantId) {
  const v = body.marketing_active;
  if (typeof v !== 'boolean' && v !== 'true' && v !== 'false') throw new UnitRuleError('INVALID_MARKETING_FLAG', 'marketing_active must be true or false.');
  const active = v === true || v === 'true';
  const current = oldUnit.marketing_active !== false;
  if (active === current) return { changed: false };
  if (active) {
    return { changed: true, active: true, reason: null, event: { eventType: 'marketing_activated', previous: { marketing_active: false, reason: oldUnit.marketing_inactive_reason || null }, next: { marketing_active: true }, source: 'unit_edit' } };
  }
  const reason = String(body.marketing_inactive_reason || '').trim();
  if (!REASONS.has(reason)) throw new UnitRuleError('REASON_REQUIRED', 'A reason is required to deactivate a unit (sold_elsewhere or other).');
  const note = body.marketing_inactive_note ? String(body.marketing_inactive_note).trim().slice(0, 500) : null;
  if (reason === 'other' && !note) throw new UnitRuleError('NOTE_REQUIRED', 'A short note is required when the reason is other.');
  const live = String(oldUnit.status || '').toLowerCase() !== 'available';
  let contract = false;
  if (!live) {
    const c = await client.query(
      `SELECT 1 FROM re_contracts rc JOIN deals d ON d.id = rc.deal_id AND d.tenant_id::text = rc.tenant_id::text
       WHERE d.unit_id::text = $1::text AND rc.tenant_id::text = $2::text AND COALESCE(rc.status,'') <> 'Cancelled' LIMIT 1`,
      [String(oldUnit.id), String(tenantId)]);
    contract = c.rows.length > 0;
  }
  if (live || contract) {
    throw new UnitRuleError('UNIT_HAS_LIVE_RESERVATION_OR_CONTRACT', 'This unit has a live reservation, contract or handover. Resolve it through its own workflow first, then deactivate the unit.', 409);
  }
  return { changed: true, active: false, reason, event: { eventType: 'marketing_deactivated', previous: { marketing_active: true }, next: { marketing_active: false, reason, note }, source: 'unit_edit' } };
}

async function insertEvent(client, { tenantId, branchId, unitId, user, eventType, previous, next, source }) {
  const snap = { id: user?.id ?? null, name: user?.name ?? null, role: user?.role ?? null };
  await client.query(
    `INSERT INTO re_unit_events (id, tenant_id, branch_id, unit_id, actor_user_id, actor_snapshot, event_type, previous_data, new_data, source)
     VALUES ($1,$2,$3,$4::uuid,$5,$6::jsonb,$7,$8::jsonb,$9::jsonb,$10)`,
    [crypto.randomUUID(), String(tenantId), branchId ? String(branchId) : null, unitId, user?.id ?? null, JSON.stringify(snap), eventType, JSON.stringify(previous ?? null), JSON.stringify(next ?? null), source]);
}

module.exports = { UnitRuleError, buildPriceEvent, planMarketingChange, insertEvent, parsePrice };
