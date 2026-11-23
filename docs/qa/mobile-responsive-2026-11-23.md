# Responsive repair campaign, 2026-11-23

Status: broad responsive repairs tested locally. Not a claim of 100% project acceptance.

## Changes

- Mobile navigation starts closed, has a 44px toggle and dismissible backdrop, and closes on route changes.
- Common modal body scrolls separately from its footer; common data tables and real-estate tables support labeled mobile cards.
- Wide page ledgers have local horizontal scrollers without removing columns or actions. Print overflow is restored.
- Fluid grid minimums cannot exceed their container. Page-specific filters, tabs, employee/customer forms, Finance entry forms, HR shifts, purchase requests and WhatsApp settings wrap on phones.
- Populated WhatsApp chat uses one pane at a time with an explicit return to conversations.
- Notification counter and Finance status badges have separate CSS classes. The Arabic partial-payment translation already existed; a global notification badge rule caused the visual collision.
- New invoice receipt vouchers store the selected treasury name. Voucher list and details resolve existing labels through a tenant-matched read-time join, without backfilling stored rows. The details tenant join tolerates text/UUID storage.

## Evidence and limits

Source inventory: 119 route declarations, 102 page JSX files, 87 direct imported route component references after unwrapping route guards. Entry checks include aliases, public pages, synthetic dynamic previews and nine Finance tabs. They are not 103 unique page components.

The full actual App with router/providers was built against a local API fixture. All POST/PUT/PATCH/DELETE methods throw. Most lists were empty, with synthetic invoice, quotation, notification and WhatsApp conversation examples.

- 103 entry points x Arabic/English at 360, 390, 430 and 1440 CSS px: 824 checks, no measured horizontal spill, blank page or render errors at the captured states.
- Six platform-admin paths redirect to the tenant dashboard. Exclude their 48 checks, leaving 776 non-redirect geometry checks.
- A further 206-entry 390px run uses mobile-device emulation, also with no measured spill or render errors.
- At 360x740 in both languages: menu open/backdrop close, notification counter positioning, populated chat one-pane/back/reopen, static visible partial-payment badge, and six representative dialog bounds/control containment.
- Dialogs inspected: CRM customer, contact customer, employee, invoice creation, HR shift and purchase request. Pixels inspected at opening and after scrolling to the bottom. Save/Cancel remain reachable. Wide purchase line tables retain local scroll.
- Common DataTable and SimpleTable synthetic component tests: labels, mobile cards, edit/delete identity, pagination to row11, real-estate action reachability.
- Production build, isolated Finance PostgreSQL regression, existing collection UI regression, 17 workspace permission cases, and eight earlier task/attachment/buyer-matching SQL cases pass.

Earlier route sweep figures were invalidated when a fixture relative-asset path left nested routes blank. Only the corrected results above count.

## Not certified

All populated production variants, all permissions/roles, platform-admin pages, every nested form/tab, native mobile keyboards, assistive-technology behavior, real Safari/Android hardware and every save workflow are not certified. The geometry detector exempts legitimate local horizontal scrollers and cannot establish readability or functional correctness. Pixel and interaction checks are selective.

The Add Account button in Chart of Accounts sets state but no modal is rendered in the existing component. It is an existing functional gap, not a passed dialog test; no unrelated accounting workflow was invented in this campaign.

No production schema, migration, stored financial row, historical unassigned receipt, treasury default, settings, external message or e-invoice was changed by this campaign's testing. Production still used the previous bundle at the read-only baseline check, so live acceptance of these repairs remains pending deployment.

## Reproduction

Requires existing frontend dependencies, Chrome and Python websocket-client.

```sh
node tests/mobile_inventory.cjs
node tests/mobile_app_fixture.cjs
AUDIT_WIDTH=390 AUDIT_LANGS=ar,en AUDIT_RESULT=mobile-390.json python tests/mobile_route_audit.py
AUDIT_LANG=ar python tests/mobile_interaction_audit.py
AUDIT_LANG=en python tests/mobile_interaction_audit.py
node tests/mobile_tables.browser.cjs
FINANCE_TEST_PG_MODULES=/path/to/local/node_modules node tests/finance_collection_effects.integration.cjs
node tests/finance_collection_ui.browser.cjs
node tests/workspace_navigation.integration.cjs
NODE_PATH=/path/to/local/node_modules node tests/four_workflow_fixes.integration.cjs
cd frontend && npm run build
```

The PostgreSQL suites create isolated temporary databases. Never point them at application data. Fixtures and audit captures are written under `/downloads/mobile-campaign`; do not deploy the fixtures.
