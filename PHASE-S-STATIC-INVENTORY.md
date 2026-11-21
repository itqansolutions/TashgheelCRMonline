# Phase S.1 — Static Dependency and Connection Mapping Inventory

**Date:** November 21, 2026  
**Scope:** Repository-wide inspection of all test files (`tests/`) and operational scripts (`scripts/`).  
**Audit Type:** Strictly READ-ONLY static AST & regex analysis. Zero database calls.  

## 1. Summary of Repository Inventory

| Classification | Category | Count |
| :--- | :--- | :--- |
| **UNPROTECTED** | Tests | 56 |
| **PROTECTED** | Tests | 12 |
| **PARTIALLY PROTECTED** | Tests | 0 |
| **ZERO_DB** | Tests | 18 |
| **OPERATIONAL_SCRIPT_REQUIRES_SEPARATE_POLICY** | Scripts | 81 |
| **ZERO_DB** | Scripts | 6 |
| **TOTAL AUDITED FILES** | All | **173** |

---

## 2. Test Files Inventory (`tests/` — 86 Files)

| # | File Path | Entry Point | Connection Vars | Invokes Guard | Silent Fallback Risk | Classification |
| :- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | `tests/activity_reminder_notification_integration.test.js` | `config/db.js` | `DATABASE_URL` (via `config/db`) | NO | HIGH (Direct `config/db.js` connects to `DATABASE_URL`) | **UNPROTECTED** |
| 2 | `tests/batch_a_customer_360_deal_navigation.test.js` | `config/db.js` | `DATABASE_URL` (via `config/db`) | NO | HIGH (Direct `config/db.js` connects to `DATABASE_URL`) | **UNPROTECTED** |
| 3 | `tests/batch_b_deal_permissions.test.js` | `config/db.js` | `DATABASE_URL` (via `config/db`) | NO | HIGH (Direct `config/db.js` connects to `DATABASE_URL`) | **UNPROTECTED** |
| 4 | `tests/batch_c_sales_teams_management.test.js` | `config/db.js` | `DATABASE_URL` (via `config/db`) | NO | HIGH (Direct `config/db.js` connects to `DATABASE_URL`) | **UNPROTECTED** |
| 5 | `tests/batch_d_property_finder_smart_lead_distribution.test.js` | NONE | NONE | NO | NO | **ZERO_DB** |
| 6 | `tests/batch_e_deal_activity_timeline.test.js` | `config/db.js` | `DATABASE_URL` (via `config/db`) | NO | HIGH (Direct `config/db.js` connects to `DATABASE_URL`) | **UNPROTECTED** |
| 7 | `tests/batch_f_deal_sla_management.test.js` | `config/db.js` | `DATABASE_URL` (via `config/db`) | NO | HIGH (Direct `config/db.js` connects to `DATABASE_URL`) | **UNPROTECTED** |
| 8 | `tests/crm_integrity_audit.test.js` | NONE | `DATABASE_URL` | NO | HIGH (Binds directly to `DATABASE_URL`) | **UNPROTECTED** |
| 9 | `tests/customer_activity_scheduling.test.js` | `config/db.js` | `DATABASE_URL` (via `config/db`) | NO | HIGH (Direct `config/db.js` connects to `DATABASE_URL`) | **UNPROTECTED** |
| 10 | `tests/dashboard_redesign.test.js` | `config/db.js` | `DATABASE_URL` (via `config/db`) | NO | HIGH (Direct `config/db.js` connects to `DATABASE_URL`) | **UNPROTECTED** |
| 11 | `tests/deal_navigation_and_value_integrity.test.js` | `config/db.js` | `DATABASE_URL` (via `config/db`) | NO | HIGH (Direct `config/db.js` connects to `DATABASE_URL`) | **UNPROTECTED** |
| 12 | `tests/delivery_note_item_type_and_concurrency.test.js` | NONE | NONE | NO | NO | **ZERO_DB** |
| 13 | `tests/delivery_note_warehouse_integrity.test.js` | NONE | NONE | NO | NO | **ZERO_DB** |
| 14 | `tests/finance_date_range_and_balance.test.js` | `config/db.js` | `DATABASE_URL` (via `config/db`) | NO | HIGH (Direct `config/db.js` connects to `DATABASE_URL`) | **UNPROTECTED** |
| 15 | `tests/helpers/testSafetyGuard.js` | NONE | `DATABASE_URL_TEST`, `DATABASE_URL` (comparison) | YES | NO (Rejects `PROD_HOST` & aborts if unset) | **PROTECTED** |
| 16 | `tests/hud_tenant_access_frontend.test.js` | NONE | NONE | NO | NO | **ZERO_DB** |
| 17 | `tests/integration/cross_tenant_real_db.test.js` | direct `pg.Pool` | `DATABASE_URL_TEST`, `DATABASE_URL` (comparison) | YES | NO (Rejects `PROD_HOST` & aborts if unset) | **PROTECTED** |
| 18 | `tests/integration/inventory_ledger_phase31.test.js` | direct `pg.Pool` | `DATABASE_URL_TEST`, `DATABASE_URL` (comparison) | YES | NO (Rejects `PROD_HOST` & aborts if unset) | **PROTECTED** |
| 19 | `tests/integration/item_card_ledger.test.js` | direct `pg.Pool` | `DATABASE_URL_TEST`, `DATABASE_URL` (comparison) | YES | NO (Rejects `PROD_HOST` & aborts if unset) | **PROTECTED** |
| 20 | `tests/integration/po_receiving_concurrency.test.js` | direct `pg.Pool` | `DATABASE_URL_TEST`, `DATABASE_URL` (comparison) | YES | NO (Rejects `PROD_HOST` & aborts if unset) | **PROTECTED** |
| 21 | `tests/integration/property_finder_postgres.test.js` | `config/db.js` + direct `pg` | `DATABASE_URL` | NO | HIGH (Direct `config/db.js` connects to `DATABASE_URL`) | **UNPROTECTED** |
| 22 | `tests/integration/purchasing_real_postgres.test.js` | direct `pg.Pool` | `DATABASE_URL_TEST`, `DATABASE_URL` (comparison) | YES | NO (Rejects `PROD_HOST` & aborts if unset) | **PROTECTED** |
| 23 | `tests/integration/quotation_so_real_postgres.test.js` | direct `pg.Pool` | `DATABASE_URL_TEST`, `DATABASE_URL` (comparison) | YES | NO (Rejects `PROD_HOST` & aborts if unset) | **PROTECTED** |
| 24 | `tests/integration/re_contracts_phase23.test.js` | `config/db.js` + direct `pg` | `DATABASE_URL_TEST`, `DATABASE_URL` (comparison) | YES | NO (Rejects `PROD_HOST` & aborts if unset) | **PROTECTED** |
| 25 | `tests/integration/real_estate_targets_phase3.test.js` | direct `pg.Pool` | `DATABASE_URL_TEST`, `DATABASE_URL` (comparison) | NO | HIGH | **UNPROTECTED** |
| 26 | `tests/integration/real_staging_e2e.test.js` | direct `pg.Pool` | `DATABASE_URL_TEST`, `DATABASE_URL` (comparison) | NO | HIGH | **UNPROTECTED** |
| 27 | `tests/integration/sales_commissions_phase33c.test.js` | direct `pg.Pool` | `DATABASE_URL_TEST`, `DATABASE_URL` (comparison) | NO | HIGH | **UNPROTECTED** |
| 28 | `tests/integration/sales_finance_settlement_phase32a.test.js` | direct `pg.Pool` | `DATABASE_URL_TEST`, `DATABASE_URL` (comparison) | YES | NO (Rejects `PROD_HOST` & aborts if unset) | **PROTECTED** |
| 29 | `tests/integration/sales_quotation_to_invoice_phase32b.test.js` | direct `pg.Pool` | `DATABASE_URL_TEST`, `DATABASE_URL` (comparison) | YES | NO (Rejects `PROD_HOST` & aborts if unset) | **PROTECTED** |
| 30 | `tests/integration/sales_targets_phase33b.test.js` | direct `pg.Pool` | `DATABASE_URL_TEST`, `DATABASE_URL` (comparison) | NO | HIGH | **UNPROTECTED** |
| 31 | `tests/integration/salesmen_360_phase34_rbac.test.js` | direct `pg.Pool` | `DATABASE_URL_TEST`, `DATABASE_URL` (comparison) | NO | HIGH | **UNPROTECTED** |
| 32 | `tests/integration/treasury_ledger_real_postgres.test.js` | direct `pg.Pool` | `DATABASE_URL_TEST`, `DATABASE_URL` (comparison) | YES | NO (Rejects `PROD_HOST` & aborts if unset) | **PROTECTED** |
| 33 | `tests/invoice_delivery_whatsapp.test.js` | `config/db.js` | `DATABASE_URL` (via `config/db`) | NO | HIGH (Direct `config/db.js` connects to `DATABASE_URL`) | **UNPROTECTED** |
| 34 | `tests/invoice_quotation_branding.test.js` | `config/db.js` | `DATABASE_URL` (via `config/db`) | NO | HIGH (Direct `config/db.js` connects to `DATABASE_URL`) | **UNPROTECTED** |
| 35 | `tests/lead_assigned_notification_flow.test.js` | `config/db.js` | `DATABASE_URL` (via `config/db`) | NO | HIGH (Direct `config/db.js` connects to `DATABASE_URL`) | **UNPROTECTED** |
| 36 | `tests/manual_entitlements_engine.test.js` | `config/db.js` | `DATABASE_URL` (via `config/db`) | NO | HIGH (Direct `config/db.js` connects to `DATABASE_URL`) | **UNPROTECTED** |
| 37 | `tests/migration_runner_preflight.test.js` | NONE | NONE | NO | NO | **ZERO_DB** |
| 38 | `tests/notification_layer_phase1.test.js` | `config/db.js` | `DATABASE_URL` (via `config/db`) | NO | HIGH (Direct `config/db.js` connects to `DATABASE_URL`) | **UNPROTECTED** |
| 39 | `tests/notification_rules_and_logs_p4.test.js` | `config/db.js` | `DATABASE_URL` (via `config/db`) | NO | HIGH (Direct `config/db.js` connects to `DATABASE_URL`) | **UNPROTECTED** |
| 40 | `tests/pf_lead_property_linking.test.js` | `config/db.js` | `DATABASE_URL` (via `config/db`) | NO | HIGH (Direct `config/db.js` connects to `DATABASE_URL`) | **UNPROTECTED** |
| 41 | `tests/phase0_security_audit.test.js` | `config/db.js` | `DATABASE_URL` (via `config/db`) | NO | HIGH (Direct `config/db.js` connects to `DATABASE_URL`) | **UNPROTECTED** |
| 42 | `tests/phase1_decoupling.test.js` | NONE | NONE | NO | NO | **ZERO_DB** |
| 43 | `tests/phase1_integration_isolation.test.js` | direct `pg.Pool` | `DATABASE_URL` | NO | HIGH (Binds directly to `DATABASE_URL`) | **UNPROTECTED** |
| 44 | `tests/phase1_isolated_verification.test.js` | `config/db.js` + direct `pg` | `DATABASE_URL` | NO | HIGH (Direct `config/db.js` connects to `DATABASE_URL`) | **UNPROTECTED** |
| 45 | `tests/phase1_tenant_isolation_numbering.test.js` | `config/db.js` | `DATABASE_URL` (via `config/db`) | NO | HIGH (Direct `config/db.js` connects to `DATABASE_URL`) | **UNPROTECTED** |
| 46 | `tests/phase2_1_purchasing_reconnection.test.js` | `config/db.js` | `DATABASE_URL` (via `config/db`) | NO | HIGH (Direct `config/db.js` connects to `DATABASE_URL`) | **UNPROTECTED** |
| 47 | `tests/phase2_2_quotation_sales_order_idempotency.test.js` | NONE | NONE | NO | NO | **ZERO_DB** |
| 48 | `tests/phase2_focus3_installments_governance.test.js` | `config/db.js` | `DATABASE_URL` (via `config/db`) | NO | HIGH (Direct `config/db.js` connects to `DATABASE_URL`) | **UNPROTECTED** |
| 49 | `tests/phase2_focus4_commissions_governance.test.js` | `config/db.js` | `DATABASE_URL` (via `config/db`) | NO | HIGH (Direct `config/db.js` connects to `DATABASE_URL`) | **UNPROTECTED** |
| 50 | `tests/phase2_isolated_verification.test.js` | `config/db.js` + direct `pg` | `DATABASE_URL` | NO | HIGH (Direct `config/db.js` connects to `DATABASE_URL`) | **UNPROTECTED** |
| 51 | `tests/phase2_navigation_template.test.js` | NONE | NONE | NO | NO | **ZERO_DB** |
| 52 | `tests/phase3_finance_unification.test.js` | NONE | NONE | NO | NO | **ZERO_DB** |
| 53 | `tests/phase4_attribution_funnel.test.js` | NONE | NONE | NO | NO | **ZERO_DB** |
| 54 | `tests/phase5_tenant_isolation.test.js` | `config/db.js` | `DATABASE_URL` (via `config/db`) | NO | HIGH (Direct `config/db.js` connects to `DATABASE_URL`) | **UNPROTECTED** |
| 55 | `tests/phase6_voucher_cancellation.test.js` | `config/db.js` | `DATABASE_URL` (via `config/db`) | NO | HIGH (Direct `config/db.js` connects to `DATABASE_URL`) | **UNPROTECTED** |
| 56 | `tests/phase7_auth_middleware.test.js` | `config/db.js` | `DATABASE_URL` (via `config/db`) | NO | HIGH (Direct `config/db.js` connects to `DATABASE_URL`) | **UNPROTECTED** |
| 57 | `tests/phase8_re_payments_decoupling.test.js` | `config/db.js` | `DATABASE_URL` (via `config/db`) | NO | HIGH (Direct `config/db.js` connects to `DATABASE_URL`) | **UNPROTECTED** |
| 58 | `tests/phase9_financial_write_authorization.test.js` | `config/db.js` | `DATABASE_URL` (via `config/db`) | NO | HIGH (Direct `config/db.js` connects to `DATABASE_URL`) | **UNPROTECTED** |
| 59 | `tests/phase_g2_sales_order_invoice.test.js` | `config/db.js` | `DATABASE_URL` (via `config/db`) | NO | HIGH (Direct `config/db.js` connects to `DATABASE_URL`) | **UNPROTECTED** |
| 60 | `tests/phase_g4_customer_account_reconciliation.test.js` | `config/db.js` | `DATABASE_URL` (via `config/db`) | NO | HIGH (Direct `config/db.js` connects to `DATABASE_URL`) | **UNPROTECTED** |
| 61 | `tests/phase_g5_delivery_returns.test.js` | `config/db.js` | `DATABASE_URL` (via `config/db`) | NO | HIGH (Direct `config/db.js` connects to `DATABASE_URL`) | **UNPROTECTED** |
| 62 | `tests/phase_g6_5_customer_360.test.js` | `config/db.js` | `DATABASE_URL` (via `config/db`) | NO | HIGH (Direct `config/db.js` connects to `DATABASE_URL`) | **UNPROTECTED** |
| 63 | `tests/pre_deployment_verification.test.js` | `config/db.js` | `DATABASE_URL` (via `config/db`) | NO | HIGH (Direct `config/db.js` connects to `DATABASE_URL`) | **UNPROTECTED** |
| 64 | `tests/property_finder_integration.test.js` | `config/db.js` | `DATABASE_URL` (via `config/db`) | NO | HIGH (Direct `config/db.js` connects to `DATABASE_URL`) | **UNPROTECTED** |
| 65 | `tests/property_finder_lead_flow.test.js` | `config/db.js` | `DATABASE_URL` (via `config/db`) | NO | HIGH (Direct `config/db.js` connects to `DATABASE_URL`) | **UNPROTECTED** |
| 66 | `tests/property_finder_listing_extraction.test.js` | NONE | NONE | NO | NO | **ZERO_DB** |
| 67 | `tests/property_finder_normalize_lead.test.js` | NONE | NONE | NO | NO | **ZERO_DB** |
| 68 | `tests/quotations_item_type_integrity.test.js` | `config/db.js` | `DATABASE_URL` (via `config/db`) | NO | HIGH (Direct `config/db.js` connects to `DATABASE_URL`) | **UNPROTECTED** |
| 69 | `tests/re_application_controller_integration.test.js` | `config/db.js` | `DATABASE_URL` (via `config/db`) | NO | HIGH (Direct `config/db.js` connects to `DATABASE_URL`) | **UNPROTECTED** |
| 70 | `tests/re_branch_scope_and_lifecycle_integrity.test.js` | `config/db.js` | `DATABASE_URL` (via `config/db`) | NO | HIGH (Direct `config/db.js` connects to `DATABASE_URL`) | **UNPROTECTED** |
| 71 | `tests/re_lifecycle_audit_remediation.test.js` | `config/db.js` | `DATABASE_URL` (via `config/db`) | NO | HIGH (Direct `config/db.js` connects to `DATABASE_URL`) | **UNPROTECTED** |
| 72 | `tests/re_postgres_live_verification.test.js` | direct `pg.Pool` | `DATABASE_URL` | NO | HIGH (Binds directly to `DATABASE_URL`) | **UNPROTECTED** |
| 73 | `tests/re_reservation_expiry_integrity.test.js` | `config/db.js` | `DATABASE_URL` (via `config/db`) | NO | HIGH (Direct `config/db.js` connects to `DATABASE_URL`) | **UNPROTECTED** |
| 74 | `tests/re_unit_lifecycle_state_machine.test.js` | `config/db.js` | `DATABASE_URL` (via `config/db`) | NO | HIGH (Direct `config/db.js` connects to `DATABASE_URL`) | **UNPROTECTED** |
| 75 | `tests/safety_guard.unit.test.js` | NONE | `DATABASE_URL_TEST`, `DATABASE_URL` (comparison) | YES | NO (Rejects `PROD_HOST` & aborts if unset) | **PROTECTED** |
| 76 | `tests/sales_order_item_type_integrity.test.js` | `config/db.js` | `DATABASE_URL` (via `config/db`) | NO | HIGH (Direct `config/db.js` connects to `DATABASE_URL`) | **UNPROTECTED** |
| 77 | `tests/schema_migrations_and_recon_integrity.test.js` | NONE | NONE | NO | NO | **ZERO_DB** |
| 78 | `tests/stage2_customer_unit_linking.test.js` | NONE | NONE | NO | NO | **ZERO_DB** |
| 79 | `tests/stage3_workflow_sla_integrity.test.js` | NONE | NONE | NO | NO | **ZERO_DB** |
| 80 | `tests/stage4_assignment_policy.test.js` | NONE | NONE | NO | NO | **ZERO_DB** |
| 81 | `tests/task_assigned_notification_flow.test.js` | `config/db.js` | `DATABASE_URL` (via `config/db`) | NO | HIGH (Direct `config/db.js` connects to `DATABASE_URL`) | **UNPROTECTED** |
| 82 | `tests/task_overdue_notification_integration.test.js` | `config/db.js` | `DATABASE_URL` (via `config/db`) | NO | HIGH (Direct `config/db.js` connects to `DATABASE_URL`) | **UNPROTECTED** |
| 83 | `tests/tenant_contracts_ledger.test.js` | `config/db.js` | `DATABASE_URL` (via `config/db`) | NO | HIGH (Direct `config/db.js` connects to `DATABASE_URL`) | **UNPROTECTED** |
| 84 | `tests/tenant_modules_enforcement.test.js` | NONE | NONE | NO | NO | **ZERO_DB** |
| 85 | `tests/unit_overview_and_multi_deals.test.js` | `config/db.js` | `DATABASE_URL` (via `config/db`) | NO | HIGH (Direct `config/db.js` connects to `DATABASE_URL`) | **UNPROTECTED** |
| 86 | `tests/whatsapp_coexistence_regression.test.js` | NONE | NONE | NO | NO | **ZERO_DB** |

---

## 3. Operational Scripts Inventory (`scripts/` — 87 Files)

> **Operational Policy Requirement:** Scripts in `scripts/` are operational utilities (schema migrations, data seeders, emergency patches, manual reconciliation, and environment diagnostics). They are NOT test scripts and must NEVER be run in automated test suites without explicit human authorization and dedicated parameters.

| # | File Path | Entry Point | Connection Vars | Operational Role | Classification |
| :- | :--- | :--- | :--- | :--- | :--- |
| 1 | `scripts/activities-indexes-migration.js` | direct `pg.Pool` | NONE | Schema Migration | **OPERATIONAL_SCRIPT_REQUIRES_SEPARATE_POLICY** |
| 2 | `scripts/activities-migration.js` | direct `pg.Pool` | NONE | Schema Migration | **OPERATIONAL_SCRIPT_REQUIRES_SEPARATE_POLICY** |
| 3 | `scripts/analytics-index-migration.js` | `config/db.js` | `DATABASE_URL` (via `config/db`) | Schema Migration | **OPERATIONAL_SCRIPT_REQUIRES_SEPARATE_POLICY** |
| 4 | `scripts/audit/scan_unfiltered_queries.js` | NONE | NONE | Operational Audit / Diagnostics | **ZERO_DB** |
| 5 | `scripts/audit_comprehensive_cleanup.js` | `config/db.js` | `DATABASE_URL` (via `config/db`) | Operational Audit / Diagnostics | **OPERATIONAL_SCRIPT_REQUIRES_SEPARATE_POLICY** |
| 6 | `scripts/audit_re_sold_units.js` | `config/db.js` | `DATABASE_URL` (via `config/db`) | Operational Audit / Diagnostics | **OPERATIONAL_SCRIPT_REQUIRES_SEPARATE_POLICY** |
| 7 | `scripts/audit_test_connections.js` | `config/db.js` + direct `pg` | `DATABASE_URL_TEST`, `DATABASE_URL` (comparison) | Operational Audit / Diagnostics | **OPERATIONAL_SCRIPT_REQUIRES_SEPARATE_POLICY** |
| 8 | `scripts/backfill_re_payments_to_vouchers.js` | `config/db.js` | `DATABASE_URL` (via `config/db`) | Operational Utility | **OPERATIONAL_SCRIPT_REQUIRES_SEPARATE_POLICY** |
| 9 | `scripts/billing-migration.js` | `config/db.js` | `DATABASE_URL` (via `config/db`) | Schema Migration | **OPERATIONAL_SCRIPT_REQUIRES_SEPARATE_POLICY** |
| 10 | `scripts/bootCheck.js` | NONE | `DATABASE_URL_TEST`, `DATABASE_URL` (comparison) | Operational Utility | **OPERATIONAL_SCRIPT_REQUIRES_SEPARATE_POLICY** |
| 11 | `scripts/branch-system-migration.js` | `config/db.js` | `DATABASE_URL` (via `config/db`) | Schema Migration | **OPERATIONAL_SCRIPT_REQUIRES_SEPARATE_POLICY** |
| 12 | `scripts/bulletproof-branch-migration.js` | `config/db.js` | `DATABASE_URL` (via `config/db`) | Schema Migration | **OPERATIONAL_SCRIPT_REQUIRES_SEPARATE_POLICY** |
| 13 | `scripts/catalog_audit_details.js` | `config/db.js` | `DATABASE_URL` (via `config/db`) | Operational Audit / Diagnostics | **OPERATIONAL_SCRIPT_REQUIRES_SEPARATE_POLICY** |
| 14 | `scripts/check-type.js` | `config/db.js` | `DATABASE_URL` (via `config/db`) | Operational Utility | **OPERATIONAL_SCRIPT_REQUIRES_SEPARATE_POLICY** |
| 15 | `scripts/checkMoneyDivergence.js` | direct `pg.Pool` | `DATABASE_URL` | Operational Utility | **OPERATIONAL_SCRIPT_REQUIRES_SEPARATE_POLICY** |
| 16 | `scripts/check_re_units_constraints.js` | `config/db.js` | `DATABASE_URL` (via `config/db`) | Operational Utility | **OPERATIONAL_SCRIPT_REQUIRES_SEPARATE_POLICY** |
| 17 | `scripts/create-logs-table.js` | `config/db.js` | `DATABASE_URL` (via `config/db`) | Operational Utility | **OPERATIONAL_SCRIPT_REQUIRES_SEPARATE_POLICY** |
| 18 | `scripts/crm_integrity_audit_and_repair.js` | `config/db.js` | `DATABASE_URL` | Operational Audit / Diagnostics | **OPERATIONAL_SCRIPT_REQUIRES_SEPARATE_POLICY** |
| 19 | `scripts/custom-plans-migration.js` | `config/db.js` | `DATABASE_URL` (via `config/db`) | Schema Migration | **OPERATIONAL_SCRIPT_REQUIRES_SEPARATE_POLICY** |
| 20 | `scripts/dbReconciliation.js` | `config/db.js` | `DATABASE_URL` (via `config/db`) | Operational Utility | **OPERATIONAL_SCRIPT_REQUIRES_SEPARATE_POLICY** |
| 21 | `scripts/detailed_inventory_audit.js` | `config/db.js` + direct `pg` | `DATABASE_URL_TEST`, `DATABASE_URL` (comparison) | Operational Audit / Diagnostics | **OPERATIONAL_SCRIPT_REQUIRES_SEPARATE_POLICY** |
| 22 | `scripts/diag-db.js` | `config/db.js` | `DATABASE_URL` (via `config/db`) | Operational Audit / Diagnostics | **OPERATIONAL_SCRIPT_REQUIRES_SEPARATE_POLICY** |
| 23 | `scripts/finance-engine-migration.js` | `config/db.js` | `DATABASE_URL` (via `config/db`) | Schema Migration | **OPERATIONAL_SCRIPT_REQUIRES_SEPARATE_POLICY** |
| 24 | `scripts/fix-departments-tenant-migration.js` | `config/db.js` | `DATABASE_URL` (via `config/db`) | Schema Migration | **OPERATIONAL_SCRIPT_REQUIRES_SEPARATE_POLICY** |
| 25 | `scripts/fix-lead-sources-migration.js` | `config/db.js` | `DATABASE_URL` (via `config/db`) | Schema Migration | **OPERATIONAL_SCRIPT_REQUIRES_SEPARATE_POLICY** |
| 26 | `scripts/fix-schema-patch.js` | direct `pg.Pool` | `DATABASE_URL` | Emergency Schema Patch | **OPERATIONAL_SCRIPT_REQUIRES_SEPARATE_POLICY** |
| 27 | `scripts/force-reconcile.js` | NONE | NONE | Operational Utility | **ZERO_DB** |
| 28 | `scripts/generate_phase_s_inventory.js` | `config/db.js` + direct `pg` | `DATABASE_URL_TEST`, `DATABASE_URL` (comparison) | Operational Utility | **OPERATIONAL_SCRIPT_REQUIRES_SEPARATE_POLICY** |
| 29 | `scripts/goldDemoSeeder.js` | `config/db.js` | `DATABASE_URL` (via `config/db`) | Operational Utility | **OPERATIONAL_SCRIPT_REQUIRES_SEPARATE_POLICY** |
| 30 | `scripts/ha-patch.js` | `config/db.js` | `DATABASE_URL` (via `config/db`) | Emergency Schema Patch | **OPERATIONAL_SCRIPT_REQUIRES_SEPARATE_POLICY** |
| 31 | `scripts/hr-activity-migration.js` | `config/db.js` | `DATABASE_URL` (via `config/db`) | Schema Migration | **OPERATIONAL_SCRIPT_REQUIRES_SEPARATE_POLICY** |
| 32 | `scripts/hr-core-migration.js` | `config/db.js` | `DATABASE_URL` (via `config/db`) | Schema Migration | **OPERATIONAL_SCRIPT_REQUIRES_SEPARATE_POLICY** |
| 33 | `scripts/hr-devices-migration.js` | `config/db.js` | `DATABASE_URL` (via `config/db`) | Schema Migration | **OPERATIONAL_SCRIPT_REQUIRES_SEPARATE_POLICY** |
| 34 | `scripts/hr-operations-migration.js` | `config/db.js` | `DATABASE_URL` (via `config/db`) | Schema Migration | **OPERATIONAL_SCRIPT_REQUIRES_SEPARATE_POLICY** |
| 35 | `scripts/hr-payroll-migration.js` | `config/db.js` | `DATABASE_URL` (via `config/db`) | Schema Migration | **OPERATIONAL_SCRIPT_REQUIRES_SEPARATE_POLICY** |
| 36 | `scripts/hr-shifts-migration.js` | `config/db.js` | `DATABASE_URL` (via `config/db`) | Schema Migration | **OPERATIONAL_SCRIPT_REQUIRES_SEPARATE_POLICY** |
| 37 | `scripts/industry-templates-migration.js` | direct `pg.Pool` | `DATABASE_URL` | Schema Migration | **OPERATIONAL_SCRIPT_REQUIRES_SEPARATE_POLICY** |
| 38 | `scripts/init-db.js` | `config/db.js` | `DATABASE_URL` (via `config/db`) | Operational Utility | **OPERATIONAL_SCRIPT_REQUIRES_SEPARATE_POLICY** |
| 39 | `scripts/initialize-rbac.js` | `config/db.js` | `DATABASE_URL` (via `config/db`) | Operational Utility | **OPERATIONAL_SCRIPT_REQUIRES_SEPARATE_POLICY** |
| 40 | `scripts/inventory-core-migration.js` | `config/db.js` | `DATABASE_URL` (via `config/db`) | Schema Migration | **OPERATIONAL_SCRIPT_REQUIRES_SEPARATE_POLICY** |
| 41 | `scripts/inventory-crm-migration.js` | `config/db.js` | `DATABASE_URL` (via `config/db`) | Schema Migration | **OPERATIONAL_SCRIPT_REQUIRES_SEPARATE_POLICY** |
| 42 | `scripts/migrate_phase2_1_hierarchy.js` | `config/db.js` | `DATABASE_URL` (via `config/db`) | Operational Utility | **OPERATIONAL_SCRIPT_REQUIRES_SEPARATE_POLICY** |
| 43 | `scripts/migrate_phase2_2_contracts.js` | `config/db.js` | `DATABASE_URL` (via `config/db`) | Operational Utility | **OPERATIONAL_SCRIPT_REQUIRES_SEPARATE_POLICY** |
| 44 | `scripts/migrate_phase2_3_installments.js` | `config/db.js` | `DATABASE_URL` (via `config/db`) | Operational Utility | **OPERATIONAL_SCRIPT_REQUIRES_SEPARATE_POLICY** |
| 45 | `scripts/migrate_phase2_4_commissions.js` | `config/db.js` | `DATABASE_URL` (via `config/db`) | Operational Utility | **OPERATIONAL_SCRIPT_REQUIRES_SEPARATE_POLICY** |
| 46 | `scripts/migrate_phase2_5_cancellations.js` | `config/db.js` | `DATABASE_URL` (via `config/db`) | Operational Utility | **OPERATIONAL_SCRIPT_REQUIRES_SEPARATE_POLICY** |
| 47 | `scripts/migrate_phase2_6_handovers.js` | `config/db.js` | `DATABASE_URL` (via `config/db`) | Operational Utility | **OPERATIONAL_SCRIPT_REQUIRES_SEPARATE_POLICY** |
| 48 | `scripts/mkh_read_only_audit.js` | `config/db.js` | `DATABASE_URL` (via `config/db`) | Operational Audit / Diagnostics | **OPERATIONAL_SCRIPT_REQUIRES_SEPARATE_POLICY** |
| 49 | `scripts/notifications-migration.js` | `config/db.js` | `DATABASE_URL` (via `config/db`) | Schema Migration | **OPERATIONAL_SCRIPT_REQUIRES_SEPARATE_POLICY** |
| 50 | `scripts/nuclear-patch.js` | direct `pg.Client` | `DATABASE_URL` | Emergency Schema Patch | **OPERATIONAL_SCRIPT_REQUIRES_SEPARATE_POLICY** |
| 51 | `scripts/pre-boot.js` | NONE | NONE | Operational Utility | **ZERO_DB** |
| 52 | `scripts/promote-superadmin.js` | `config/db.js` | `DATABASE_URL` (via `config/db`) | Operational Utility | **OPERATIONAL_SCRIPT_REQUIRES_SEPARATE_POLICY** |
| 53 | `scripts/quotation-settings-patch.js` | `config/db.js` | `DATABASE_URL` (via `config/db`) | Emergency Schema Patch | **OPERATIONAL_SCRIPT_REQUIRES_SEPARATE_POLICY** |
| 54 | `scripts/re-units-enhancement-migration.js` | direct `pg.Pool` | `DATABASE_URL` | Schema Migration | **OPERATIONAL_SCRIPT_REQUIRES_SEPARATE_POLICY** |
| 55 | `scripts/resilient-patch.js` | `config/db.js` | `DATABASE_URL` (via `config/db`) | Emergency Schema Patch | **OPERATIONAL_SCRIPT_REQUIRES_SEPARATE_POLICY** |
| 56 | `scripts/robust-production-patch.js` | direct `pg.Client` | `DATABASE_URL` | Emergency Schema Patch | **OPERATIONAL_SCRIPT_REQUIRES_SEPARATE_POLICY** |
| 57 | `scripts/run_migration_010.js` | `config/db.js` | `DATABASE_URL` (via `config/db`) | Schema Migration | **OPERATIONAL_SCRIPT_REQUIRES_SEPARATE_POLICY** |
| 58 | `scripts/run_migration_021.js` | `config/db.js` | `DATABASE_URL` (via `config/db`) | Schema Migration | **OPERATIONAL_SCRIPT_REQUIRES_SEPARATE_POLICY** |
| 59 | `scripts/run_migration_026.js` | `config/db.js` | `DATABASE_URL` (via `config/db`) | Schema Migration | **OPERATIONAL_SCRIPT_REQUIRES_SEPARATE_POLICY** |
| 60 | `scripts/saas-migration.js` | `config/db.js` | `DATABASE_URL` (via `config/db`) | Schema Migration | **OPERATIONAL_SCRIPT_REQUIRES_SEPARATE_POLICY** |
| 61 | `scripts/seed-demo-data.js` | `config/db.js` | `DATABASE_URL` (via `config/db`) | Demo / Tenant Seeder | **OPERATIONAL_SCRIPT_REQUIRES_SEPARATE_POLICY** |
| 62 | `scripts/seed-tenant-demo-data.js` | direct `pg.Pool` | `DATABASE_URL` | Demo / Tenant Seeder | **OPERATIONAL_SCRIPT_REQUIRES_SEPARATE_POLICY** |
| 63 | `scripts/seedTemplates.js` | `config/db.js` | `DATABASE_URL` (via `config/db`) | Demo / Tenant Seeder | **OPERATIONAL_SCRIPT_REQUIRES_SEPARATE_POLICY** |
| 64 | `scripts/super-patch.js` | direct `pg.Client` | `DATABASE_URL` | Emergency Schema Patch | **OPERATIONAL_SCRIPT_REQUIRES_SEPARATE_POLICY** |
| 65 | `scripts/tasks-deals-migration.js` | `config/db.js` | `DATABASE_URL` (via `config/db`) | Schema Migration | **OPERATIONAL_SCRIPT_REQUIRES_SEPARATE_POLICY** |
| 66 | `scripts/temp-migration.js` | `config/db.js` | `DATABASE_URL` (via `config/db`) | Schema Migration | **OPERATIONAL_SCRIPT_REQUIRES_SEPARATE_POLICY** |
| 67 | `scripts/tenant-identity-migration.js` | `config/db.js` | `DATABASE_URL` (via `config/db`) | Schema Migration | **OPERATIONAL_SCRIPT_REQUIRES_SEPARATE_POLICY** |
| 68 | `scripts/test-db.js` | direct `pg.Client` | `DATABASE_URL` | Operational Utility | **OPERATIONAL_SCRIPT_REQUIRES_SEPARATE_POLICY** |
| 69 | `scripts/test-final-business-flow-audit.js` | direct `pg.Pool` | `DATABASE_URL` | Operational Audit / Diagnostics | **OPERATIONAL_SCRIPT_REQUIRES_SEPARATE_POLICY** |
| 70 | `scripts/test-pf-diff.js` | `config/db.js` | `DATABASE_URL` (via `config/db`) | Operational Utility | **OPERATIONAL_SCRIPT_REQUIRES_SEPARATE_POLICY** |
| 71 | `scripts/test-pf-real-flow.js` | `config/db.js` | `DATABASE_URL` (via `config/db`) | Operational Utility | **OPERATIONAL_SCRIPT_REQUIRES_SEPARATE_POLICY** |
| 72 | `scripts/test-phase2-1-hierarchy.js` | `config/db.js` | `DATABASE_URL` (via `config/db`) | Operational Utility | **OPERATIONAL_SCRIPT_REQUIRES_SEPARATE_POLICY** |
| 73 | `scripts/test-phase2-2-contracts.js` | direct `pg.Pool` | `DATABASE_URL` | Operational Utility | **OPERATIONAL_SCRIPT_REQUIRES_SEPARATE_POLICY** |
| 74 | `scripts/test-phase2-3-installments.js` | direct `pg.Pool` | `DATABASE_URL` | Operational Utility | **OPERATIONAL_SCRIPT_REQUIRES_SEPARATE_POLICY** |
| 75 | `scripts/test-phase2-4-commissions.js` | direct `pg.Pool` | `DATABASE_URL` | Operational Utility | **OPERATIONAL_SCRIPT_REQUIRES_SEPARATE_POLICY** |
| 76 | `scripts/test-phase2-5-cancellations.js` | direct `pg.Pool` | `DATABASE_URL` | Operational Utility | **OPERATIONAL_SCRIPT_REQUIRES_SEPARATE_POLICY** |
| 77 | `scripts/test-phase2-6-handovers.js` | direct `pg.Pool` | `DATABASE_URL` | Operational Utility | **OPERATIONAL_SCRIPT_REQUIRES_SEPARATE_POLICY** |
| 78 | `scripts/test-phase2-7-unit-matching.js` | direct `pg.Pool` | `DATABASE_URL` | Operational Utility | **OPERATIONAL_SCRIPT_REQUIRES_SEPARATE_POLICY** |
| 79 | `scripts/test-real-estate-concurrency.js` | `config/db.js` | `DATABASE_URL` (via `config/db`) | Operational Utility | **OPERATIONAL_SCRIPT_REQUIRES_SEPARATE_POLICY** |
| 80 | `scripts/testEnterpriseKernel.js` | NONE | NONE | Operational Utility | **ZERO_DB** |
| 81 | `scripts/testPhase1Foundation.js` | NONE | NONE | Operational Utility | **ZERO_DB** |
| 82 | `scripts/testPhase2CoreServices.js` | NONE | NONE | Operational Utility | **ZERO_DB** |
| 83 | `scripts/test_procurement_scenario.js` | `config/db.js` | `DATABASE_URL` (via `config/db`) | Operational Utility | **OPERATIONAL_SCRIPT_REQUIRES_SEPARATE_POLICY** |
| 84 | `scripts/verify_db_environment.js` | `config/db.js` | `DATABASE_URL` (via `config/db`) | Operational Audit / Diagnostics | **OPERATIONAL_SCRIPT_REQUIRES_SEPARATE_POLICY** |
| 85 | `scripts/workflow-control-migration.js` | `config/db.js` | `DATABASE_URL` (via `config/db`) | Schema Migration | **OPERATIONAL_SCRIPT_REQUIRES_SEPARATE_POLICY** |
| 86 | `scripts/workflow-migration.js` | `config/db.js` | `DATABASE_URL` (via `config/db`) | Schema Migration | **OPERATIONAL_SCRIPT_REQUIRES_SEPARATE_POLICY** |
| 87 | `scripts/workflow-rules-migration.js` | `config/db.js` | `DATABASE_URL` (via `config/db`) | Schema Migration | **OPERATIONAL_SCRIPT_REQUIRES_SEPARATE_POLICY** |
