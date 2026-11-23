# Fixed: lane fix-gating (GOV-37 left over from sweep-can, w-readonly, w-operate #5)

Migration: none. API: additive. `GET /tenants/:t/workspaces/:w`, `.../summary`, `GET /tenants/:t`, `GET /tenants/:t/summary` and `GET /tenants/:t/workspaces` also answer someone whose only grants are on resources inside (see 2). `Workspace` gains optional `onlyInside`.

## 1. A viewer is still offered a change (one piece: `kit/Can.tsx`, `useNeeds`)
- Workspace settings Access: `Environments.tsx` `WorkspaceAccess`: Give access and each Remove off, line "It needs binding:write" (`binding:write` at the workspace). Service account page Access tab (`Tenant.tsx`): same, at the tenant.
- Table page: `Data.tsx` `RowsBrowser` takes `needs`; Add row is greyed with the line instead of hidden by `canChange`; editing, batch and delete follow `may.can`. Table page asks `data:write` on that table (a grant on the table counts); a source's table asks `data_source:write`.
- Events list (`Operate.tsx`): `needs` `event:write` on the CollectionView, so "Publish an event" is greyed with the line. Event page: line for publish and for change (`ObjectPage` takes `line`).
- Script page: `line={mayRun.line}`, the visible line for the greyed Run.
- Triggers list: `needs` `resource:write`, New trigger greyed with the line (Edit was already off).
- Run page "Edit with this input" / "Edit in <dev>" (`RunPage.tsx` `EditInDev`): off unless `resource:write` in the dev workspace it opens. Re-run on the run page was already on `useNeeds` (kept; tested).
- Flow page "Add a schedule" (`TriggersOf`, `ObjectPages.tsx`) was already on `useNeeds`; tested through the script page, same component.
- Test: `apps/console/src/ViewerGating.test.tsx` (7 tests, all seen failing before).
- Siblings looked at: Runs list (Cancel/Run again hidden for readers, not greyed with a line: left), Approvals, instance screens (already on the piece).

## 2. A grant on one flow reaches that flow
- `kernel/http.ts`: `Access` permission routes can be wrapped with `reachedFromInside(...)`; the hook first runs the ordinary `check`, and only when it refuses and `boundInside` (the server's own binding match, now also tenant-wide with no workspace) holds, sets `ctx.insideOnly`. Handlers trim by it.
- Routes: workspace GET (name, slug, kind; link, limit, alert emptied; `onlyInside: true`), workspace summary (counts stay null as each is checked; `version` and `linked` nulled), tenant GET (name and slug; settings at defaults, `mayRename` false), tenant summary (every count already per permission), workspaces list (adds workspaces where the caller is bound inside, trimmed).
- Console: shell panel lists no section of a workspace the person reaches only inside (`Shell.tsx`, `onlyInside`).
- Test: `apps/control-plane/src/shell-inside.test.ts` (4 tests; first two failed with 403 before): the person gets 200 on those routes; 403 on other resources, resource list, secrets, connection bindings, PATCH of workspace and tenant, another workspace, members; `/allowed` per resource; no-grant member 403, other tenant 404; list shows only the one workspace.

## Screens to re-walk
Workspace settings Access; service account Access tab; a table page; Events list and event page; Triggers; script page and its Triggers tab; flow page; script and flow run page and peek; as `w-readonly-viewer` and `w-readonly-grant` (flow appointments/after-visit): every screen, with the granted flow page offering Start and Re-run. 390/768/1440, light and dark, Tab skips disabled, reload keeps the line.

## Found / left
- A person bound only inside has an empty workspace panel; there is no list of "what you were given". Needs its own route and a design.
- The Runs list hides Cancel / Run again for readers and says nothing.
- Tenant/workspace GET for inside-only answers neutral fillers (limit 0, defaults) rather than omitting the fields; screens that read them are behind permissions they lack.
