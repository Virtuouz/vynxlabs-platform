# Walk w-readonly (rows of docs/documentation/fixed/sweep-can.md)

People made (password in demo.json): w-readonly-viewer@fernhill.example (viewer only), w-readonly-grant@fernhill.example (role w_readonly_flow_runner, bound on flow appointments/after-visit only). Admin: Maya Brooks. Screens: 46 per person, 1440 and 390, light and dark. Shots: ~/.local/share/volvel-walk/shots29/w-readonly/{viewer,grant,admin}/ (results.json each).

## Viewer: right
Members, access, roles, groups, end-user groups, end users, service accounts, workspaces, export, repository (tenant); workspace alerts, tables list, sources, files, dashboards, scripts list, flows list, resources, connections, variables, secrets, triggers: line shown, change controls greyed, no refusals. No overflow at 390; dark fine.
Absent (no change control): apps, app builder, docs, flow pages, runs, release, extensions, approvals, overview. Script Run and flow-run Re-run are greyed.

## Viewer: wrong
1. Workspace settings (Tenant.tsx, access section near GiveAccess call ~1115): "Give access" and each "Remove" are enabled; they open dialogs for binding:write the viewer lacks (server /allowed answers []). Not submitted, so refusal on submit unproven, but it is offered and would fail.
2. Table page (clients), Data.tsx:491 and :1362: "Add row" enabled, no line.
3. Events list, PublishEvent.tsx:148 (used Operate.tsx:820): "Publish an event" enabled, no line.
4. Script page Run greyed with no visible line (only 390 screenshot w-script-390-dark.png); reason not said on screen.
5. Flow page (after-visit) shows no line and no Start flow for viewer (absent, acceptable).

## Single-flow grant: wrong
Every screen, including the granted flow page (grant/w-flow-granted-1440-light.png), fails: workspace, summary and tenant GETs return 403 and the page says "needs workspace:read". A grant on one flow cannot reach that flow in the console, so the flow-only Start/Re-run path is not walkable. Cause: console loads GET /tenants/:t/workspaces/:w in Tenant.tsx before any /allowed check.

## Admin: right
All tenant and workspace controls offered (Add member, Create role, Create table, Upload file, Give access, Start flow, Run, Delete etc.), no lines. Opened dialogs only; no destructive actions run. 429s on /stream appear in this walk: three walkers at once, not a finding.

## Instance screens
All five (members, operators, databases, branding, triggers) show "For operators" to non-operators. Not walked as a read-only operator (I may not make one without a binding-less operator role).

## Not walked
Keyboard Tab-skip, reload keeps the line, 768 width, submitting refused actions, flow-only member's flow run/Start.
