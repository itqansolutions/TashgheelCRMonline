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
