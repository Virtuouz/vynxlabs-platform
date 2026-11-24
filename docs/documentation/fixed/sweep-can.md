# Fixed: lane sweep-can (GOV-37, the rest of the console)

Migration: none. API: `GET /tenants/:t/workspaces/:w/allowed` takes optional `kind` and `path` and counts grants given on that resource (additive).

## One piece: `kit/Can.tsx`
- `useCan(base, permission, resource?)`: instance from `/me`; tenant from the access route; a workspace root from `GET <workspace>/allowed` (the server's own check, so a role given at one workspace counts there alone, and a grant on one flow counts for that flow). Yes while unknown.
- `useMay` / `useMayOn(root, resource, ...permissions)`: the same question for a screen that asks several at once and draws nothing until answered. The duplicate in `api.ts` is gone; Connections, Variables, Secrets, Flow page, Runs, Operate, Alerts callers of t4-config-ext / t4-flows-ops import it from `Can.tsx`.
- `Needs` / `useNeeds`: the line, the reason for a greyed button, and `can`, used by lists and pages.
- `needs={{ base, permission, what, resource? }}` on `ListScreen`, `ListCollection` and `CollectionView`: a line under the title ("You can see X, not change it. It needs P. Ask ..."), the screen's actions and empty-state action greyed, the row-action column (header "" or "Actions") switched off. Replaces the string `needs` of t4-config-ext.

## Screens moved onto it (read-only member: line shown, change controls off)
Instance: members (`member:write`), operators (`binding:write`), database locations, branding, triggers (`instance:write`).
Tenant: members, access, roles, groups, end-user groups, end users, service accounts (list, delete, identity form, keys), workspaces list, export (`export:write`), repository (`git:write`). Tenants list already offered "Create tenant" only to operators (kept).
Workspace: settings (`workspace:write`), alerts (`workspace:write`), tables (`table:write`), data sources (`data_source:write`), files (`file:write`), dashboards (`dashboard:write`, with the server's `mayCreate`), apps list (Share `binding:write`, Remove `resource:write`), App Builder, scripts, flows, docs, resources (`resource:write`/`flow:write`), connections, variables, secrets (via `needs`), event page, a script's triggers, script page Run (`run:write` on that script), flow run and script run pages (cancel, re-run: `flow_run:write` / `run:write` on that flow or script), Operate's Edit buttons.
Not gated, with why: Audit export (needs `audit:read`, the same as seeing the log); Groups "Members" row button is switched off with the row actions, so a reader cannot open a group's members (left; needs its own column).

## Tests
- `apps/console/src/ReadOnlyMember.test.tsx` (7 tests; seen failing on the code before: all 6 first failed with no line and enabled buttons).
- `apps/control-plane/src/flows.test.ts` "a screen asks what is held on one flow..." (failed: resource ignored).
- `packages/manifest/src/bundle.test.ts` "cannot be called default" (GOV-38; failed: no problem). Shared by upload (`storeBundle`) and build. Scripts and trigger sources.
- `SingleSignOn.test.tsx` "a refused field in a provider's settings is said at that field" (failed before).
- `apps/control-plane/src/roles-list.test.ts`: REFUTED the role picker "cut at 200": `GET .../roles` does not page, `limit` is ignored, every role is answered. Test kept as the check. Nothing changed for it.

## SSO field errors
`SingleSignOn.tsx` Settings: errors of name, issuer, client ID, sign-in address, entity ID, certificates, scopes, attributes, name ID format, signed, default role are said at the field; a notice only for what no field shows. The client secret field (kit `SecretField`) takes no error yet: its error stays in the notice.

## Found
- `Apps.test`/`Interfaces.test` three tests fail on the phase branch before and after this lane ("widgets are added...", "sharing an app...", APP-MP3).
- Screens still to walk: every one above as a member holding only the `:read`, at 390/768/1440, light and dark, Tab skips disabled controls, reload keeps the line.
