# UI layout rollout, 2026-11-23

## Phase 1 candidate
- Existing navbar color/theme untouched. No backend, schema, permission or data changes.
- Employee definitions consolidated into existing page tabs, existing directory access gate unchanged. Query URLs retained and local selection updates URL.
- Employee form: all 14 original inputs/selects, permissions/attachments and save handlers retained. Desktop side panel, fullscreen phone, internal scroll, visible footer.
- Employee list: labelled phone cards, full desktop table.
- Opt-in long-editor variant added to shared Modal for Customers (edit only, Customer360 remains dialog), Deals, Tasks and Products. Short dialogs, payments and previews remain centered.

## Evidence
- Build passes (existing chunk-size warning).
- 20 navigation fixture cases, 12 existing attendance/dispatch/navigation browser variants, 8 employee AR/EN 360/1440 variants, 16 actual daily-editor variants, 4 long/short shared-layout controls pass.
- Synthetic read-only API fixtures. No production writes, no business acceptance implied.
- Actual Arabic desktop/phone pixels inspected. First visual passes caught mobile tabs and animated translucent capture; fixed/re-rendered.
- Existing SQL-backed suites were not rerun in this UI batch: test guard correctly refused missing DATABASE_URL_TEST. No production fallback used.

## Coverage inventory, not completion
116 route declarations and 102 page components. Public/alias routes included. Shared dialog count21; custom fixed overlay count72. Neither count implies a reviewed workflow.

### Remaining page-level review
Finance/accounting; purchasing; inventory beyond Products; remaining HR; real estate; marketing/chat; reports; settings/admin; dashboard and public pages. Each needs explicit field/action inventory and phone/desktop checks. Shared header spacing is not whole-page acceptance.

### Page inventory
| Page | Shared dialogs | Custom fixed overlays | Phase1 opt-in |
|---|---:|---:|---|
| Dashboard.jsx | 0 | 0 | no |
| Register.jsx | 0 | 0 | no |
| Reports.jsx | 0 | 0 | no |
| Tasks.jsx | 1 | 0 | yes |
| Login.jsx | 0 | 0 | no |
| Settings.jsx | 0 | 0 | no |
| Invoices.jsx | 2 | 0 | no |
| GeneralDashboard.jsx | 0 | 0 | no |
| ResetPassword.jsx | 0 | 0 | no |
| Files.jsx | 0 | 0 | no |
| Customers.jsx | 1 | 2 | no |
| Products.jsx | 1 | 0 | yes |
| MyProfile.jsx | 0 | 0 | no |
| Employees.jsx | 3 | 0 | no |
| SuperAdmin.jsx | 0 | 0 | no |
| RealEstateDashboard.jsx | 0 | 0 | no |
| Deals.jsx | 1 | 0 | yes |
| ForgotPassword.jsx | 0 | 0 | no |
| Logs.jsx | 0 | 0 | no |
| RealEstate/Contracts.jsx | 2 | 0 | no |
| RealEstate/UnitsRegistry.jsx | 0 | 10 | no |
| RealEstate/Installments.jsx | 4 | 0 | no |
| RealEstate/Handover.jsx | 1 | 0 | no |
| RealEstate/Reservations.jsx | 0 | 0 | no |
| RealEstate/PublicUnitGallery.jsx | 0 | 1 | no |
| RealEstate/Commissions.jsx | 1 | 0 | no |
| Sales/Salesmen.jsx | 0 | 3 | no |
| Sales/Target.jsx | 0 | 1 | no |
| Sales/SalesManagement.jsx | 0 | 0 | no |
| Sales/SalesOrder.jsx | 0 | 0 | no |
| Sales/PriceTiers.jsx | 0 | 1 | no |
| Sales/Documents.jsx | 0 | 0 | no |
| Pricing/Pricing.jsx | 0 | 0 | no |
| Marketing/WhatsAppChatbots.jsx | 0 | 2 | no |
| Marketing/WhatsAppCampaigns.jsx | 0 | 1 | no |
| Marketing/WhatsAppChat.jsx | 0 | 2 | no |
| Purchases/Purchases.jsx | 0 | 1 | no |
| Purchases/RFQs.jsx | 0 | 6 | no |
| Purchases/PurchaseOrders.jsx | 0 | 4 | no |
| Purchases/PurchaseRequests.jsx | 0 | 3 | no |
| Admin/AdminUpgradeRequests.jsx | 0 | 0 | no |
| Admin/AdminPlans.jsx | 0 | 0 | no |
| Integrations/PropertyFinderSettings.jsx | 0 | 0 | no |
| Integrations/WhatsAppSettings.jsx | 0 | 0 | no |
| Integrations/EInvoice.jsx | 0 | 1 | no |
| Integrations/MetaForms.jsx | 0 | 1 | no |
| Automation/AutomationControl.jsx | 0 | 0 | no |
| Automation/RuleBuilder.jsx | 0 | 0 | no |
| Finance/Reports.jsx | 0 | 0 | no |
| Finance/Treasury.jsx | 0 | 1 | no |
| Finance/Invoices.jsx | 0 | 3 | no |
| Finance/CustomerAccounts.jsx | 0 | 2 | no |
| Finance/VendorAccounts.jsx | 0 | 2 | no |
| Finance/QuotationPreview.jsx | 0 | 0 | no |
| Finance/InvoicePreview.jsx | 0 | 2 | no |
| Finance/VoucherPreviewModal.jsx | 0 | 1 | no |
| HR/ApprovalCenter.jsx | 0 | 0 | no |
| HR/Shifts.jsx | 0 | 1 | no |
| HR/MyActivityBalance.jsx | 0 | 0 | no |
| HR/PayrollEngine.jsx | 1 | 0 | no |
| HR/Attendance.jsx | 0 | 0 | no |
| HR/ActivityBalance.jsx | 0 | 1 | no |
| HR/MyRequests.jsx | 1 | 0 | no |
| HR/ActivityDefinition.jsx | 0 | 1 | no |
| HR/AttendanceDevices.jsx | 0 | 1 | no |
| HR/AttendanceAdmin.jsx | 0 | 0 | no |
| HR/MyPayroll.jsx | 1 | 0 | no |
| Inventory/WarehouseKeepers.jsx | 0 | 1 | no |
| Inventory/InventoryControl.jsx | 1 | 0 | no |
| Inventory/StockBalances.jsx | 0 | 1 | no |
| Inventory/ItemCard.jsx | 0 | 0 | no |
| Inventory/TransactionImpact.jsx | 0 | 0 | no |
| Inventory/Warehouses.jsx | 0 | 1 | no |
| Settings/CompanySettings.jsx | 0 | 0 | no |
| Billing/Billing.jsx | 0 | 0 | no |
| Contacts/ContactsVendors.jsx | 0 | 3 | no |
| Contacts/ContactsEmployees.jsx | 0 | 3 | yes |
| Contacts/ContactsCustomers.jsx | 0 | 5 | no |
| ERP/BankReconciliation.jsx | 0 | 0 | no |
| ERP/ChartOfAccounts.jsx | 0 | 1 | no |
| ERP/PeriodClosing.jsx | 0 | 0 | no |
| ERP/PurchasingCycle.jsx | 0 | 0 | no |
| ERP/JournalEntries.jsx | 0 | 0 | no |
| ERP/Entries.jsx | 0 | 0 | no |
| ERP/SalesCycle.jsx | 0 | 1 | no |
| ERP/FinancialReports.jsx | 0 | 0 | no |
| Corporate/ProductRetail.jsx | 0 | 0 | no |
| Corporate/Home.jsx | 0 | 0 | no |
| Corporate/ProductRestaurant.jsx | 0 | 0 | no |
| Corporate/DemoAccess.jsx | 0 | 0 | no |
| Corporate/CorporateLayout.jsx | 0 | 0 | no |
| Corporate/ProductServices.jsx | 0 | 0 | no |
| Corporate/components/QuickLeadPopup.jsx | 0 | 1 | no |
| Corporate/components/StickyConversionBar.jsx | 0 | 1 | no |
| Corporate/components/CorporateNavbar.jsx | 0 | 0 | no |
| SuperAdmin/InsightsPanel.jsx | 0 | 0 | no |
| SuperAdmin/SecretPortalGate.jsx | 0 | 0 | no |
| SuperAdmin/PlatformWrapper.jsx | 0 | 0 | no |
| SuperAdmin/TenantContractManagementModal.jsx | 0 | 0 | no |
| SuperAdmin/SecretPortalHUD.jsx | 0 | 0 | no |
| SuperAdmin/TenantAccessManagementModal.jsx | 0 | 0 | no |
| SuperAdmin/RegistrationRequests.jsx | 0 | 0 | no |

## Phase 2 candidate
- Shift configuration, activity definition and activity-balance editors converted from bespoke overlay wrappers to the same opt-in form panel. Short shift-assignment dialog unchanged in layout.
- Exact source comparison confirms all input/select/textarea counts and every handle* function body unchanged, including all policy defaults and save payloads. All23/7/7 rendered controls retained.
- Existing locale keys wired for matching visible labels, no new policy text. Employee phone form tabs now three visible compact labels with full accessible names/titles.
-12 AR/EN360/1440 actual HR-editor variants, actual-language HR page controls, prior16CRM-editor and8employee variants, navigation and build passed locally. Screenshots inspected after corrections. No live HR save or business write.
- Remaining HR pages and other families are not completed by these three editor conversions. Original Phase1 coverage limits still apply.

## Phase 3 candidate
- Warehouse, warehouse-keeper, inventory-movement and attendance-device editors use the same opt-in panel, internal body scroll and external linked-submit footer. All original field attributes and handle* function ASTs match Phase2 exactly. Original routes, payloads, conditional fields and list actions unchanged.
- 16 actual editor AR/EN360/1440 variants, including fixture keeper checkbox and all four movement type branches, pass without submissions or network writes. Arabic phone and desktop pixels inspected. Movement control boundaries clarified. Existing device locale keys matched without making optional IP required.
- Source-backed existing limitation: `frontend/src/pages/Inventory/WarehouseKeepers.jsx`, `handleSubmit` and `handleDelete`, only set local React state. The initial list maps `/users`; there is no create/update/delete API in those handlers. Users may see a success toast but lose a keeper edit on reload. UI layout work preserves, does not fix or certify, that behavior. No live-write reproduction performed.
- StockBalances transfer/stock-take dialogs, inventory reports and all other remaining page families still await their own review. No daily backup activation.

### Fixture selector correction
- Phase3 regression exposed that the prior HR fixture's add-button matcher did not include the actual English `Allocate / Adjust Balance` label. Corrected the fixture only, no application change needed; all12HRvariants pass after correction. Earlier broad12-pass wording should be read with this correction, not as new product failure.

## Phase 4 candidate
- Finance quick entry only: invoice, quotation, receipt voucher, payment voucher and expense forms share the same long-editor panel. Existing registration-payment, cancellation, preview and approval dialogs unchanged.
- All original field opening-element ASTs and handle* bodies match Phase3. No amounts, permissions, payloads, validation, service/inventory classification or financial handlers changed. External footer submit links to the original form.
- Added visible labels and phone item cards for original product/type/description/quantity/price controls, clear boundaries for finance fields. All fields retained; no transaction submitted during layout tests.
-40 synthetic actual-editor combinations cover5modes,2templates,AR/EN and360/1440. Includes invoice/quotation local item addition/removal and voucher party branches, no network writes. Existing isolated finance collection/default-account and finance-unification regression tests pass. Build passes with pre-existing chunk-size warning.
- Other finance screens, previews, accounting and all remaining families are still not completed or functionally certified by this form-only batch.


## Phase 5 candidate
- StockBalances direct transfer and stock-take forms share the same opt-in form panel, internal scroll and linked external submit. Original 5 transfer controls and each stock-row input retain every original field attribute and all handle* bodies.
- Stock-take desktop table becomes labelled cards on phone with the same product, system quantity, counted quantity and difference content. Original warehouse subtitle, source/destination/product choices and save/loading/disable logic preserved.
- Eight AR/EN360/1440 synthetic variants, 24 stock rows, fixed footer and internal long-body scroll pass with no API writes. Actual Arabic phone and English desktop pixels inspected. No transfer or stock adjustment submitted. No ledger or inventory correctness certification.
- Other remaining page families, dialogs and permissions still require their own bounded review. No database, schema, backup, configuration or role changes.


## Phase 6 candidate
- Opt-in form panel for leave request, RE contract edit, handover scheduling, commission creation and installment-plan entry. Existing footer click/save mechanics preserved; collection, replacement confirmation, history, attachments, payout and lifecycle actions unchanged.
- All control opening ASTs and every noncomponent function body exact against Phase5. Fields remain4/7/3/7/5; commission percentage/fixed branches tested locally. No change to payloads, permission checks, calculation or schedule logic.
-20AR/EN360/1440 synthetic actual-editor variants pass and phone/desktop pixels inspected. Leave application references existing matching locale keys and receives visible field boundaries; original values and handler localization left unchanged.
- No leave submission, contract edit, handover, commission, installment generation, collection or payout performed on live data. Shared form changes are not functional acceptance of these workflows or all remaining pages.


## Phase 7 candidate
- Vendor profile add/edit, price-tier editor and general/RE target entry share the opt-in panel and external linked-submit footer. Original fields retained5/5/5general or6RE, with all original control ASTs and noncomponent function bodies exact against Phase6.
- Vendor statement/printing/payment, target performance drilldown and price-tier/target calculations unchanged. No supplier, target or pricing record submitted or modified.
-24general/RE AR/EN360/1440 actual-component fixture variants, prior stock/RE/HR regression and build pass. Actual Arabic phone and English desktop pixels inspected; no overflow/fixed footer clipping.
- Source-backed existing target default uses2026-Q3 regardless current date. Preserved in this layout-only change, not represented as a current-quarter default or corrected silently.


## Phase 8 candidate
- Chart-of-accounts create and purchase-request create/edit shells converted to shared opt-in panel, internal scroll and original external linked-submit.7COA controls and9initial purchase-request controls retained, each additional item adds the original4controls. Phone item table becomes labelled cards; desktop table retained.
- All control ASTs and noncomponent function bodies exact against Phase7. No seed, accounting create, purchase draft, approval submission, rejection or lifecycle action executed. Separate Save as Draft and Save & Submit for Approval remain separate, preserving original mechanics and calculations.
- Eight AR/EN360/1440 actual-component variants plus top/bottom captures, local add/remove item checks, prior editor regressions and build pass. Actual desktop/phone pixels inspected. Original purchase-request text is English in both languages and is preserved, not claimed translated.
- All-page rollout remains partial; long RFQ/PO/unit forms, marketing, remaining contacts/finance, dashboards and other pages await coverage.


## Phase 9 local candidate, not published
- Purchase-invoice create and RFQ create only: shared form shell with original externally-linked submit, separate RFQ draft and vendor-send click handlers. Every control and noncomponent function AST exact againstec2f083. RFQ PR selector/direct routes remain separate. Receipt, quotation, comparison, award and extra-vendor dialogs unchanged. PO not changed.
- Purchase invoice7controls; RFQ4PR-mode/6direct-mode controls with empty dependency fixtures. Add/remove retains three controls per item. Twelve distinct mode/language/width combinations, top/bottom captures, plus duplicate invoice captures across mode loop. All no-write assertions, linked-submit/footer/viewport checks pass. Earlier cramped RFQ direct phone table fixed to labelled cards and reinspected.
- Phase8eight and stockeight fixture regressions/build/diffcheck pass. Actual local phone and desktop pixels inspected. No procurement records, send-to-vendor, seed, account or approval submits. Enriched fixtures now cover12vendors with internal list scroll/selection, approved-PR selection and generated notes, products/warehouse/preselected invoice totals.16/18RFQ controls include12vendor checkboxes. All12distinct mode/language/width variants pass again, pixels reinspected. No live phase9verification or release yet.
- Phase8live follow-up: exactec2f083 deploymentSUCCESS, index-f8ca8240.js. COA actual desktop/360phone blank editor inspected,7fields/footer visible, no writes. COA loading-error toast means apparent empty tree is NOT confirmed empty data. Purchasing requests redirect dashboard under current session; local-only editor pixels for that page.


## Phase 10 candidate
- POcreate only uses shared panel. ApprovedPR route5controls and manager/admin direct route12controls retain all original attributes, guards and function ASTs against73a7892. Route-specific external submit linked to each original form, disabled rules retained. Receive/cancel/details unchanged.
- Eight route/language/width variants with top/bottom captures, selected approvedPR preview, direct item add12to17and remove17to12pass. Actual phone/desktop inspected, original values gain visible labels for quantity/unit price/discount/tax. Layout follows one-column phone and existing desktop grid. Twelve enriched procurement regression variants/build pass. No order create/receive/cancel/send or business write executed.
- Phase9deployment35a06fe0-8fa5-4312-aa9f-44bf44d73ebeSUCCESS73a7892, live dashboard assetindex-2ffc731e.js. Both purchase and RFQlive routes redirect dashboard under existing purchasing guard, so phase9editor pixels remain local-only, not live workflows.


## Phase 11 candidate
- Contact-customer add/edit11controls and sales team create/edit8controls to shared form panels. All controls and noncomponent function ASTs exact against3d9e8de. Quick classification/area, statements/payments/details and team members/performance unchanged.
-16template/language/width fixture variants plus top/bottom captures pass, actual phone/desktop pixels inspected. Local nested quick-add open/close checks verify overlays remain above panel, no writes; department/branch/manager options populated synthetically. Daily16andHR12regressions/build pass.
- Salesmen existing selectedPeriod is2026-10(line58) and period choices hardcoded2026. Preserved limitation, no current-period correctness claim. Whole-page work remains partial.
- Phase10deployment5a46f96f-4b04-458b-9eae-27c94986c8dcSUCCESS3d9e8de, dashboard assetindex-c05bd8df.js. POroute redirects dashboard, no live POeditor pixels established, no grant/settings change.


## Phase 12 candidate
- ERPsales order create and treasury account create shell only. Cash3/bank5treasury controls; sales10including child customer-search control. All original field/function ASTs exact against3dceeb8. Original default checkbox/opening-balance/account payloads untouched; no account/default/order creation executed. Sales delivery/details unchanged.
-24distinct editor/mode/template/language/viewport variants, top/bottom captures and duplicate sales captures across treasury mode loop pass. Sales line add10to14and remove14to10passes locally; synthetic customer/product gives25EGPtotal. Fixed initially borderless treasury inputs, re-rendered and inspected phone/desktop. POeightregression/build pass. Quotation import handler unchanged but not functionally certified.
- Phase11SUCCESS741145af-81d0-4fe7-811a-69792ea24cb0 exact3dceeb8, assetindex-e19bb8b2.js. Actual contacts/customers blank editor desktop/phone inspected11controls/footer; salesmen route gated to dashboard, team live pixels not established. No saves.

## Phase 13: unit registration editor
- Unit registration shell only, preserving portal, all field attributes and noncomponent function ASTs. Original photo, hierarchy, close and save handlers unchanged. Footer uses the original submit and discard actions with an explicit form link.
- Desktop two-column content and phone single-column content, internal scrolling and fixed footer. Shared Modal adds opt-out for Escape, default true. Units opts out because its existing topmost-dialog Escape handler already owns that behavior.
- Eight distinct AR/EN, 360/1440 and manual/selected-project variants, captured at top and bottom. Default 12 and project 13 controls preserved. Synthetic hierarchy only, no saves or uploads. Developer/project and project-only phase/building quick dialogs open and close via Escape without closing the parent; subsequent parent Escape also closes normally. Stacking checks passed.
- Shared form regression 4 variants, earlier workspace regression 20 variants, exact unit AST invariant and production build passed. Actual phone/desktop fixture pixels inspected. Live check remains a separate release verification, not functional certification.

## Phase 14: unit hierarchy quick editors
- Developer, project, phase and building quick-add shells use the shared form panel, original title/subtitle text, exact field attributes and noncomponent handlers. Portals and existing topmost Escape owner retained. Linked original submit/cancel actions stay in the fixed footer. Registration remains behind each nested panel, stacking scoped above the parent.
- Sixteen distinct dialog/language/width variants captured at top/bottom, fields4/4/2/4. Phone/desktop pixels inspected. Parent registration eight-variant nested Escape regression, exact AST invariants and production build pass. No hierarchy creation, uploads or API writes. Live editor verification remains unavailable on the general-account route, which redirects to dashboard.

## Phase 15: vendor payment editor presentation
- RecordPaymentModal shell only. Exact original field attributes, amount/payment/treasury defaults, noncomponent handlers and financial payload preserved. Original submit/cancel footer linked to the same form; no statement or aging changes.
- Sixteen distinct AR/EN,360/1440, empty/populated treasury and cash/bank variants, captured top/bottom. Three or four controls as applicable; populated fixtures include original default-account selection behavior. Writes blocked, no submit or real payment.
- Initial fixture pixels had invisible control borders, fixed with scoped styling and re-rendered. Phone/desktop pixels inspected. Exact invariants, finance40variant regression and production build passed. This is layout verification, not financial workflow approval or payment execution.

## Phase 16: chatbot scenario builder presentation
- Create/edit scenario-builder shell only. Exact original field attributes and noncomponent function ASTs, save/activation payload, toggle/delete/simulator handlers preserved. No bot saved, activated, toggled, deleted or simulated against live services.
- Eight distinct create/edit, AR/EN,360/1440 variants captured top/middle/bottom. Original default create27controls and enriched edit26controls (four-option list, branching/handoff/completion) preserved. Add/remove step +4/-4 and option +3/-3 controls pass. Writes blocked.
- Initial phone branching controls overflowed inside the panel; scoped wrapping/card rules corrected this and actual updated phone/desktop pixels were inspected. Fixed footer retains original save/cancel actions. Contact/team16variant regression, exact invariants and production build pass. This verifies layout only, not Meta delivery, customer consent or live automation.

### Phase 16 follow-up: selected destination readability
- Review found the native phone select clips the selected handoff text. Added a wrapping read-only live-status description for the exact selected branch/action, including full target node message. No select value, attributes or handler changed. Desktop branch row explicitly wraps so the added description does not squeeze the select.
- Re-rendered all eight variants and inspected updated phone handoff and desktop branching pixels. Exact AST invariant and build pass. Builder labels remain English in the RTL fixtures, an existing localization limitation; Arabic presentation is not accepted. No automation acceptance or live save.

## Phase 17: WhatsApp start-chat and template editor presentation
- Start-chat and template-send shells only; original five/two controls, handler and field ASTs exact. Direct text vs Meta template branch exercised locally. Original submit/send callbacks and disabled expressions unchanged. No live chat start, message send, contact creation, takeover or account changes.
- Twelve distinct editor/branch-language-width variants captured top/bottom with synthetic account/template/customer data and writes blocked. Phone/desktop pixels inspected, chatbot eight-variant regression and build/invariants pass. Existing English/mixed labels in RTL and clipped unselected customer placeholder are localization/native-select limitations, not Arabic presentation acceptance or communication certification.
- Follow-up: long selected synthetic customer/company and account labels exposed in wrapping read-only summaries under original selects; original customer selection/autofill exercised. Scoped phone toolbar flex constraints prevent long account overflow. Phone input bidi presentation preserves international prefix order without changing attributes/handlers. All twelve variants rechecked with long labels; phone/desktop actual pixels inspected. Existing mixed-language labels remain.

## Phase18: Company profile settings presentation
- Scoped formerly generic page-local CSS to `.company-settings-page`, retaining all17 original controls and exact noncomponent function/field ASTs. Page-header organization, phone single-column form, upload layout and full preview reachability only. No save/logo upload, setting value or permission change.
- Sixteen general/real-estate, Arabic/English, phone/desktop and invoice/quotation variants; top/save/preview captures. Fixture API writes blocked. Original preview click branch exercised, original sample totals unchanged. Actual phone top, lower save/preview and desktop pixels inspected. Lower capture uses translated fixture viewport because headless CLI scrolled captures were blank; not evidence of live scroll acceptance.
- Phone preview no longer hides terms/footer behind fixed aspect-ratio internal scroll. Existing mixed-language preview sample/labels remain. Invariants, production build and whitespace check pass. This is presentation only, not financial-document accuracy or settings-save acceptance.
- Follow-up after review: actual local DevTools viewport capture after real document scroll replaces translated capture as reachability evidence.360px viewport/document, scrollY2273, save/preview/footer reachable, no root transform. Existing `.num-en` inline-block leaked into table cells; scoped mobile table-cell correction keeps quantity/price/amount aligned on one line. Corrected pixels inspected. This is local synthetic evidence, not live settings-write or document accuracy certification.

## Phase19: Settings hub presentation
- Scoped generic style selectors to `.settings-page`; domain tabs use existing state/callbacks with visible active marker and phone two-column navigation, no hidden active tab. Original seven tabs and all field/function ASTs exact. Per populated-fixture tab control counts19/5/11/6/4/5/4 preserved. No configuration save/upload/add/delete/toggle/integration action executed.
-56distinct general/RE-language-width-tab variants passed, actual phone CRM/automation/integrations and desktop branding pixels inspected. Real local360px document scroll reached lower audit table; local horizontal scroll revealed error/time columns (457px table/294px region). Phone recipient numeric direction corrected by scoped CSS only. Mixed English/Arabic remains existing, not localization acceptance.
- Company-settings16variant regression, production build and invariants passed. Existing RE defaults use uncontrolled fields and success-toast-only handler, not persisted settings; preserved for consolidated functional review, not certified by this UI batch. Notification saves and external integration operation untested.

## Phase20: Personal profile workspace presentation
- Profile hero/detail/quick-route spacing and phone wrap only. Existing quick-route URLs and admin/employee, general/RE conditions untouched.32long-name/email/branch-present/absent-language-width-role-template variants,7/8/9original route counts, full field/function ASTs and build pass.
- Actual phone/desktop top and phone real document scroll to quick routes inspected. No account/profile/role/branch mutation or API call. Route visibility checks are synthetic source behavior, not broader permission acceptance; original legacy-tab redirect map retained.

### Phase 21: Files and Reports read views
Scoped legacy style rules; fitted page roots and chart grid tracks on phones. Added full read-only product name/count key and wrapped chart tick labels. Preserved original data calculations, fetch functions, file actions, field attributes, and role/module gates. Sixteen actual-chart language/width/empty-populated fixtures and function/field AST checks pass; production build passes. Real local document scroll reaches lower product chart. Initial RTL viewport clipping was found in pixels and corrected; strengthened page-rect assertion prevents this false acceptance. No file download/delete or live business mutation. Synthetic data screenshots are presentation evidence only.

### Phase22: Audit log read-only workspace
Scoped legacy audit-table, badge and diff styles. Organized header/summary/filter sections; always-visible table inspection control; opaque responsive detail panel with readable before/after values. Preserved three filter controls and every noncomponent function/field AST. Twelve AR/EN-direction, phone/desktop, list/diff/raw fixture combinations pass; production build passes. Actual phone document and horizontal table scroll reaches Analysis (760px table within334px region). Original English audit terms and static Deep Sync/Optimized claims retained, not verified security telemetry or localization acceptance. No export, destructive operation or business write.

### Phase23: Inventory item card and transaction-impact presentation
Scoped full-width/box sizing, phone selector sizing, long product-name wrapping, and readable horizontally scrollable ledger columns. Original selector, all field attributes, fetch functions, number formatting and impact calculations exact. Twenty-four language/width/empty/product/service fixture variants pass with writes blocked. Actual phone/desktop and service-state pixels inspected; real local document/horizontal scroll reaches running balance, unit price and valuation columns (1050px table/334px region). Production build passes. Native select may shorten its selected long label on phone; the full product name is visible in the overview immediately below. No stock, valuation, transfer or service-accounting correctness certification and no business writes.

### Phase24: Personal activity balances and payroll read views
Scoped payroll badge/button/trace selectors, fitted phone page roots, month/year selectors and summary cards, corrected numeric table-cell display, preserved horizontally readable ledgers and wrapping deduction descriptions. Original two balance selectors and all noncomponent function ASTs exact; payroll has no inputs. Twenty language/width/empty-populated/list-detail fixtures and build pass; actual phone/desktop and salary-breakdown pixels inspected. Actual horizontal balance-table scroll reaches remaining/notes (820px table/334px region). No HR record, payroll computation, finalize, payment or rule changes. Existing mixed payroll locale text remains; layout does not certify salary/leave arithmetic or policy.

#### Phase24 empty-state follow-up
Live phone inspection caught empty messages horizontally outside the initial viewport. Empty/loading tables now fit width; unused column headers hidden on empty phone tables only. Populated columns untouched. Twenty fixtures/build/invariants pass; corrected empty phone pixels inspected. Original locale gaps retained.


### Phase25 personal attendance terminal presentation
Scoped formerly generic component CSS to attendance dashboard; box sizing/inset header/error readability, phone clock sizing, table numeric semantics, long source wrapping, empty-message fit. No attendance handlers/session state/timezone/duration logic changed.24 Arabic/English phone/desktop fixtures cover none/checked_in/completed/conflict/error/empty states, no POSTs. Exact noncomponent function AST/control attributes unchanged against591884c. Build passes. Actual phone/desktop/error/empty and actual horizontal scroll650/336 inspected, latter reaches hours/status/source. No live punches permitted or performed. Not certification of attendance calculations/geofence/payroll.


### Phase26 approval-center presentation
Scoped generic badge/action/table CSS to approval center. Header/long employee and reason wrapping; horizontal table retains six columns, dates/days/status and distinct approve/reject controls. Empty table fits phone.16 Arabic/English phone/desktop pending/approved/rejected/empty fixtures pass no writes and containment; all original functions/control attributes exact. Build passes. Actual phone/desktop/empty and1100/336 horizontal scroll pixels inspected, both action controls reached without clicking. HRSubNav stubbed locally; needs live read-only context. Existing untranslated fallback strings retained. No approvals/rejections submitted, no claim of action semantics or all HR acceptance.


### Phase27 sales-document index presentation
Scoped page class, responsive create actions/search/type filter, contained long title/customer, readable numeric amount/status/date and existing view action. Eight Arabic/English phone/desktop populated/empty fixtures pass, all original functions/control attributes exact, build passes. Actual phone/desktop/empty screenshots and real horizontal scroll1280/334 inspected, intermediate amount capture shows full1,234,567.89 and currency, end capture reaches view. SalesSubNav locally stubbed. No create/view/action click; no records changed. Source fetch masks failure as empty, preserved and not proof of no documents. Whole business workflow remains unaccepted.


### Phase28 staff attendance overview presentation
Scoped generic CSS, responsive header/date filter, two-column phone summary, contained long employee/email, proper table numeric cells, empty table fit and read-only history scroll. Eight Arabic/English phone/desktop populated/empty fixtures pass, original functions and date control exact, build passes. Actual phone/desktop and1100/336 scroll pixels inspected, reaches hours/source/action. Local HRSubNav stub. Existing icon-only row action has no handler, preserved for consolidated report. Date filtering uses check-in string prefix and displayed times local browser, unchanged, not certified as Cairo-correct. No staff/business record mutations or punch actions.
