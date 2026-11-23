# Fixed: lane gate-roles (a doc writer could not edit docs: every console gate checked against the server)

Migration: none. API: none. Contract: none.

Cause of the regression: the console's `useCan` / `useNeeds` / `Can` / `useMay` asked for one permission where the server's rule is wider (`resource:write`, or a narrower permission alone), or asked a different permission, or a different scope, or counted a grant on a resource the server does not count. Fixed in the shared piece `apps/console/src/kit/Can.tsx`, and at each call site that asked the wrong thing.

How it was checked: every call of `useCan`, `useNeeds`, `Can`, `needs=`, `useMay`, `useMayOn` in `apps/console/src` was matched to the route its control calls and that route's `access:` in `apps/control-plane/src/routes/` (and `kernel/authorize.ts` for the scope: a tenant route counts bindings at the tenant only, a `tenantOrInstance` route also the instance's, a workspace route the tenant's and the workspace's and never one resource's, unless the route is a `custom` rule that says it counts the resource).

## Mismatches found

| # | Control | Console asked | Server checks | Who saw it wrong | Fix |
|---|---------|---------------|---------------|------------------|-----|
| 1 | Flows list: New flow | `flow:write` | `PUT drafts/*`: `resource:write` (`flow:write` only guards flow layouts) | `developer` greyed out | `Flows.tsx:96` asks `resource:write` |
| 2 | Tables list: Create table | `table:write` | `PUT resources/*`: `resource:write` (`table:write` only guards table purges) | `developer` greyed out | `Data.tsx:1524` |
| 3 | App Builder: Make an app | `resource:write` | `PUT drafts/*`: `resource:write`, or `interface:write` alone for an interface or an app serving one | `app_maintainer` (`interface:*`) greyed out | `Interfaces.tsx:41` `alone: ["interface:write"]` |
| 4 | Apps list: remove an app's draft | `resource:write` | `DELETE drafts/*`: same, and `doc:write` alone for a docs app | `app_maintainer`, `doc_writer` | `Apps.tsx:484` `alone: ["interface:write", "doc:write"]` |
| 5 | Docs screen (the reported one, c4de497b) | `resource:write` plus a second `useCan("doc:write")` and a hand-made line | same rule | `doc_writer` | `Docs.tsx:157` now uses the same `alone` option, so the line and the button agree |
| 6 | Every tenant gate (Members, Roles, Groups, End users, Domains, Single sign-on, Git, Portal, Workers, Service accounts, Export, Access) | any permission in the member's access list, whatever the scope it is given at | `access.tenant(...)`: bindings at the tenant only | `workspace_admin` (`binding:*` at a workspace) and a `tenant_admin` bound at a workspace were offered Give access, Create role, Create group | `Can.tsx:24` `heldAtTenant`: counts only a source whose scope is the tenant (and counts) |
| 7 | Retention | tenant access list only | `access.tenantOrInstance("tenant:write")`: an operator's instance binding counts | an operator without an access grant was greyed out | `Can.tsx` `orInstance` option; `Retention.tsx:138` |
| 8 | Offer to an agent (script page, script editor, flow page) | nothing (always on); only the Scripts inspector wrapped it | `POST bindings`: `binding:write`, counting a grant on the resource | everyone saw it, `viewer`, `developer` got a refusal; the flow page offered it to a `flow_run:write` holder | `OfferToAgent.tsx:233` the button asks `binding:write` on the script or flow, in the shared piece |
| 9 | Event page: Publish | `event:write` with the event as resource | `POST events`: `access.workspace("event:write")`, a grant on one event is not counted | someone bound on one event was offered it | `ObjectPages.tsx:397` no resource |
| 10 | Flow page: Edit (flow detail) | `resource:write` asked with the flow as resource | `PUT drafts/*` asks the workspace | someone bound on one flow was offered Edit | `Flows.tsx:396` `resource:write` asked of the workspace, `flow_run:write` (a route that counts the flow) of the flow |
| 11 | Scripts list inspector: Open editor | `resource:write` asked with the script as resource | the workspace | same | `Execution.tsx:185` |
| 12 | Alerts: Send a test alert | `workspace:write` (the whole section sat in one `Can`) | `POST alert-tests`: `connection:write` | `developer` (holds `connection:write`, not `workspace:write`) greyed out | `Alerts.tsx`: only the fields sit in `Can workspace:write`; Save asks it too; the test button asks `connection:write` |

Checked and correct: Workspaces list/Create workspace (`workspace:write`, tenant), Secrets (`secret:write`), service accounts and keys (`service_account:write`), Members (`member:write`, `binding:write`), Roles (`role:write`), Groups and end-user groups, End users, Domains (`domain:write`), SSO (`sso:write` / `instance:write`), Git (`git:write`), Portal branding (`portal:write`), Export (`export:write`), Workers (`worker:write`), Instance screens (`instance:write`, `member:write`, `binding:write`), Environments settings (`workspace:write`) and Access (`binding:write`), Files (`file:write`), Dashboards (`dashboard:write`, the server's own `mayCreate`), Triggers (`resource:write`; pause `trigger:write`), Events list (`event:write`), Connections (`connection:write`, new in a draft also `resource:write`), Variables (`variable:write`), Data sources (`data_source:write`), Table rows (`data:write` on the table, which the server counts), Run and Re-run (`run:write`, `flow_run:write` on the script or flow, counted), the App Builder (the server's `mayAuthor`, which already takes `interface:write`).

## Test

`apps/console/src/GateRoles.test.tsx` (220 tests). A table of families of screen (the control, the route, the server's rule as a function of what the role holds and where it is bound: tenant, workspace, one resource, instance). Each is rendered as every built-in role; the control is offered exactly when the server would allow it. Seen failing before the fix: rows 1, 2, 3, 6 (Roles, Groups, Give access as a role bound at a workspace), 7 (operator bound on the instance), 8, 9, 12; 4, 5, 10 and 11 are not in the table (4 needs a drawn app list; 5 has `Docs.test.tsx`; 10 and 11 need a loaded flow and a chosen script) and are seen through the same shared piece.
`apps/control-plane/src/builtin-roles.test.ts` holds the table of roles in `apps/console/src/builtinRoles.ts` to what the migrations leave in the database, so it cannot go stale.

## Siblings looked at (POLISH-013)

The shared piece is `useCan`, `Can`, `useNeeds` in `kit/Can.tsx`, used by `ListScreen`, `CollectionView`, `ListCollection` and every screen in the table above; each use was read. `useMay` / `useMayOn` (workspace only) unchanged.

## e2e

`e2e/phase-28.spec.ts` `day()` had the UTC-date fault fixed in the phase 26 and 27 specs: it dated invoices by `toISOString()`. Now `toLocaleDateString("en-CA")`, the browser's day. No other spec has the pattern.

## What a person sees differently

A `developer` can start a flow, make a table and send a test alert. An `app_maintainer` can make an app. A doc writer sees one line. A member who holds a role only at a workspace is no longer offered tenant-wide changes the server refuses. The line under a screen names the narrower permission: "It needs resource:write, or interface:write alone."

Screens to walk: Flows, Tables, App Builder, Apps list inspector, Alerts, Retention, Roles, Groups, Access (Give access), Documentation, a script page and a flow page (Offer to an agent), an event page; as `developer`, `app_maintainer`, `doc_writer`, `workspace_admin`, `viewer`; 390/768/1440, light and dark, keyboard (Tab skips the disabled button; the tooltip says why), reload.

## Found

- Not gated at all (a viewer is offered them and the server refuses): the table definition editor (Add column, Rename, Delete table; `Data.tsx` from line 2344 offers them on `managedIn === "ui"` alone), and the New data source button on the Data sources list (it opens the resource editor, `resource:write`).
- Runs list: Cancel and Run again ask the workspace, not the one script or flow, so someone given only one script is not offered them there (the server counts that grant).
- `Retention` is the only `tenantOrInstance` screen the console reads; the tenant rename (`PATCH tenants/:t`, also `tenantOrInstance`) is gated by the server's `mayRename`.
