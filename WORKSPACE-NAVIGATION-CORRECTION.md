# Authorized workspace navigation correction

22 November 2026. Local incremental patch for source commit `f9959e3938da4cd78b2ccd38620883d01d19167f`.

## Scope

Restore navigation to already-permitted pages hidden by the new workspace grouping. This patch does not grant page permissions, enable modules, change roles, alter backend authorization, or upload anything.

Only one application file changes: `frontend/src/context/WorkspaceContext.jsx`. The other two files are this note and the isolated regression test.

## Changes

- Workspace membership recognizes an explicit authorized child route, not only an exact category prefix. For example, a `/contacts/vendors` grant can admit the Contacts category. It does not grant `/contacts` or other Contacts pages.
- A non-admin user with an explicit `/files` grant can see the category containing Files. Existing role/page filters still hide Settings, Logs, Billing and other pages unless their existing filters allow them.
- A missing, stale or inaccessible saved workspace resolves to an accessible default. No accessible workspace resolves to no primary workspace, not an unconditional Sales workspace.
- Navigation remains usable if browser preference storage is unavailable. A saved workspace is a navigation preference, not an authorization source.

The existing Sidebar item filters, ProtectedRoute, role definitions, permission data, module entitlements, API code and database migrations are unchanged. This does not redesign the sidebar or fix unrelated navigation/permission inconsistencies.

## Verification

The production frontend build passed using the existing dependencies. It still emits the existing large-bundle warning.

Run the isolated test from the repository root:

```text
node tests/workspace_navigation.integration.cjs
```

The test uses the frontend's installed development dependencies, including esbuild, React and React DOM. If dependencies are not installed, install them in a local development copy with the frontend's lockfile before running it. Do not run the application or migrations for this test.

Seventeen synthetic component fixtures passed:

- Vendors-only purchasing manager.
- Payroll-only HR manager.
- Warehouses-only inventory user.
- Files-only manager.
- Purchase-order, sales and marketing child-page grants.
- Stale saved workspace replaced; valid saved workspace retained.
- Unavailable browser storage.
- No grants with a stale selection.
- Purchasing, HR and inventory modules remaining disabled.
- Category-prefix boundary handling.
- Unauthorized sibling administration links remaining hidden.
- Enabled-module admin control.

The tests render the actual WorkspaceProvider, Sidebar and destination guard with synthetic identity/module inputs. They check selected workspace, visible link markup, relevant guard decisions, unchanged input permissions and rejection of an invalid workspace switch. They do not connect to the CRM or database. This same suite fails on unmodified `f9959e3` at the first previously reported regression.

A separate isolated browser render with component effects was visually inspected for the corrected Vendors fixture at desktop width and narrow Arabic/RTL width. These are local screenshots, not evidence of deployed behavior. This is not a full mobile, keyboard-accessibility, every-role or every-workspace acceptance campaign.

## Apply boundaries

This is incremental on `f9959e3`, not a replacement full package and not a reason to reapply older patches. Check the source baseline and run a patch apply check in a local copy first. If newer changes conflict, stop and reconcile them rather than overwrite them.

No migration or SQL file changes are included. The previously delivered migration-runner correction is already in this base and remains untouched. Deploying/restarting the whole application can still run its existing startup migrations. The unresolved backup/restore and live database preflight requirements remain unresolved by this frontend patch. A local build or green deployment status does not establish database readiness.

No remote push, merge, deployment, provider sign-in, CRM visit, live SQL query, schema change or account-data change was performed as part of this correction. Distribution, Finance, archive-view UI and other product work remain separate.
