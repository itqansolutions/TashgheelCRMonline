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
