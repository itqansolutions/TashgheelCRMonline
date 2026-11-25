'use strict';
// Shared canonical stage semantics for deal guards.
// Stage values are free-text in the DB (deals.pipeline_stage VARCHAR(100)) and
// tenant templates define custom pipelines, so guards must NEVER match the raw
// string. Normalize first (trim / lowercase / collapse whitespace, underscores
// and hyphens to a single space), then compare against the canonical sets.
// - Won-side terminal:  won, closed, closed won, contracted
// - Lost-side terminal: lost, closed lost, cancelled
// This mirrors the report/dashboard vocabulary so API-written aliases like
// 'Closed Won', 'closed_won', 'closed-won' or 'Contracted' cannot bypass the
// terminal lock, the pending-price close block or the finance registry.

function normalizeStageKey(stage) {
  return String(stage || '').trim().toLowerCase().replace(/[\s_-]+/g, ' ');
}

const WON_STAGE_KEYS = new Set(['won', 'closed', 'closed won', 'contracted']);
const LOST_STAGE_KEYS = new Set(['lost', 'closed lost', 'cancelled']);

const isWonStage = (stage) => WON_STAGE_KEYS.has(normalizeStageKey(stage));
const isLostStage = (stage) => LOST_STAGE_KEYS.has(normalizeStageKey(stage));
const isTerminalStage = (stage) => isWonStage(stage) || isLostStage(stage);

// SQL fragment variant lists for queries that cannot call JS helpers
// (LOWER(TRIM(...)) does not collapse '_'/'-', so list the variants).
const WON_STAGE_SQL_VARIANTS = ['won', 'closed', 'closed won', 'closed_won', 'closed-won', 'contracted'];
const LOST_STAGE_SQL_VARIANTS = ['lost', 'closed lost', 'closed_lost', 'closed-lost', 'cancelled'];
const TERMINAL_STAGE_SQL_VARIANTS = [...WON_STAGE_SQL_VARIANTS, ...LOST_STAGE_SQL_VARIANTS];

// Canonical stage keys accepted on write, in normalized form. Tenants ADD
// their configured pipeline stages on top of this (see getAllowedStageKeys).
const CANONICAL_STAGE_KEYS = new Set([...WON_STAGE_KEYS, ...LOST_STAGE_KEYS]);

module.exports = {
  normalizeStageKey,
  isWonStage,
  isLostStage,
  isTerminalStage,
  CANONICAL_STAGE_KEYS,
  WON_STAGE_SQL_VARIANTS,
  LOST_STAGE_SQL_VARIANTS,
  TERMINAL_STAGE_SQL_VARIANTS
};
