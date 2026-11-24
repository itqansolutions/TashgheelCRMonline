# CRM team and rental package: review and rollback notes

Branch feat/crm-team-rental-package (base 500dcbf7). Additive migration: ops/proposals/crm_team_rental_package.sql (idempotent, verified by applying twice).

## What changed
- Deals: assigned_team_id (FK RESTRICT). Team-only deals keep assigned_to NULL. Employee must be a team member. Team-aware access scope.
- Units: marketing_active, history table re_unit_events (price_changed, marketing_*). Deactivate blocked with a live reservation/contract. Inactive units blocked for new deals/reservations/matching.
- Rentals: re_rental_occupancies, re_rental_alert_deliveries. 09:00 Africa/Cairo on end date minus lead days. Internal alerts only, deduplicated, tenant-scoped real staff users.
- Reports: GET /api/activities/reports/deal-activity (manual logs only). GET /api/re-units/price-changes (sale and rent separate).
- Frontend: Deals team/employee selects, Handover rental modal, Rentals page (/rentals), unit pricing panel, dashboard price-change card, activity report (/reports/deal-activity). Arabic and English.

## Rollback (no .sql file by design, so the migration runner cannot auto-run it)
1. Redeploy the previous release (code only). New columns/tables are ignored by old code.
2. Data rollback, only if required and approved: DROP TABLE re_rental_alert_deliveries, re_rental_occupancies, re_unit_events; ALTER TABLE re_units DROP marketing_* columns; ALTER TABLE deals DROP COLUMN assigned_team_id. This loses team assignments and history.
3. Backup: Ali waived waiting for a fresh backup for this package (00:49). Attempt any available non-disruptive backup within existing authority, but do not block release on it.

## Known gaps to flag
- Existing DB-backed tests (batch_*) need DATABASE_URL_TEST and were not run; they fail identically at baseline without it.
- Many older reports/dashboards never used row scope (pre-existing, not changed).
- Local tests ran on PG 19 embedded; live is PG 18.

- Rent price basis: units store no rent period, so rent changes are shown per unit only (old/new/delta) with an on-screen notice; sale and rent are never mixed or averaged.
- Integrated-page layout proof: tests/crm_app_layout.browser.cjs renders the real Deals, Handover and Rentals pages with real Modal/DataTable (API and auth stubbed, synthetic data).
