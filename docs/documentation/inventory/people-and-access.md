# Inventory: people and access

Read from the code at `270e509` on 2026-11-22. A report, not checked prose: what it calls a bug is settled in [the findings](../findings.md).

## (A) Proposed pages (paths under packages/docs/content)

| Path | State | Purpose | Topic id |
|---|---|---|---|
| tenant/members.md | Existing, 15 lines | The five tabs; split the rest into the pages below | tenant-members (F1 on all 5 tabs) |
| tenant/groups.md | New | Groups of members, keys, provider groups | none |
| tenant/roles.md | New | Built-in roles, role builder | none |
| tenant/giving-access.md | New | Access grants tab, Give access, scopes, "View access" | none |
| tenant/access-releases.md | New | Releases, second person, going back | none |
| tenant/end-users.md | Stub | Pool, links, groups, attributes, sign-in | tenant-end-users |
| tenant/service-accounts.md | Stub | Accounts, keys, access | tenant-service-accounts |
| tenant/agents.md | New | Agent tools, Offer to an agent, MCP setup | none |
| tenant/operator-access.md | Stub | Both the tenant's side and the operator's | tenant-operator-access |
| start/permissions.md | New | Permission model concept page | none |
| build/access-as-code.md | New | defineRole, defineBinding, tenant/ files, `volvel tenant` | none |
| start/account.md | Stub | API keys, recovery codes | account |
| instance/members.md, instance/operators.md | Stubs | Disable accounts, operators | instance-members, instance-operators |

Help ids: apps/console/src/nav.ts:160-177. Tab aliases: nav.ts:339-346, so `/groups`, `/roles`, `/access` and `/releases` all open members help.

Provisioning.tsx is SCIM (belongs to SSO). routes/pools.ts is worker pools, not people.

## (B) Contents

**start/permissions.md** (apps/control-plane/src/kernel/authorize.ts; packages/manifest/src/permissions.ts)
- **Grammar:** `kind:verb`, verb `read|write`, `*` for either half. Access is additive: no deny, conditions, or expiry on bindings.
- **Principals:** member, group, service_account, end_user, end_user_group, `end_users` (all signed in), `anonymous` (anyone). Match rules :54-80. Anonymous bindings also apply to every signed-in principal.
- **Scopes:** tenant reaches all workspaces; then workspace, then one resource. Instance bindings never reach inside a tenant, except `orInstance` routes (tenant record, retention). routes/tenants.ts:304-460.
- **Explicit kinds:** `sql:read` and `workspace_production:write`. `*` never grants them.
- **App-facing cap (end users and app-only members):** script, run, flow_run, table, data, data_all, file, app, theme, whatever the role (:48-51, :137).
- **Suspended member:** holds nothing in that tenant, but an operator grant still counts (:142-178).
- **Refusals:** no standing gives 404 "The tenant"; otherwise 403; anonymous gives 401 (kernel/http.ts:143-150).
- **Row policies:** `data:*` is held to the policy, `data_all:*` passes it. Rules: everyone, `is` (own ID), `in: groups` (ID, key, or name), `equals.attribute` (kernel/data/rows.ts:131-190, data/apply.ts:590-660). Members' groups count; attributes exist only on end users; service accounts have neither.

**Built-in roles** (computed from packages/db/migrations 0005, 0009, 0011, 0013, 0018-0020, 0026-0028, 0035, 0053, 0071, 0078, 0081-82)
- `tenant_admin`: `*:*`, sql:read
- `workspace_admin`: `*` on workspace, role, binding, secret, resource, script, run, bundle, deployment, connection, variable, trigger, flow, flow_run, event, approval, data, data_all, table, data_source, file, app, theme; plus audit:read, member:read, group:read, dashboard:read/write, promotion:write, sql:read, access:write. **No** code, interface, doc, git, portal, end_user or service_account kinds.
- `developer`: `*:read`, sql:read; write on secret, resource, run, bundle, connection, variable, flow_run, event, data, data_all, file, code, dashboard. No deployment, promotion, approval, interface or doc write.
- `deployer`: `*:read`, `bundle:*`, `deployment:*`, promotion:write
- `viewer`: `*:read` (so every row, and the audit log)
- `portal_user`: app:read, data:read, data:write
- `portal_reader`: app:read, data:read
- `app_maintainer`: workspace:read, `interface:*`, table:read, data:read/write, app:read, dashboard:read/write
- `doc_writer`: workspace:read, `doc:*`, table:read, app:read
- `agent_runner`: run:write, flow_run:write
- `operator_admin` (instance only, hidden in tenants): `*` on instance, tenant, member, binding, access_grant; audit:read, export:write

**tenant/members.md** (screens/Members.tsx)
- **Tabs:** "Members", "Groups", "Roles", "Access grants", "Releases" (:17-23).
- **Columns:** Name, Email, Status, Roles ("Through groups only" / "N given directly"), Added. 50 per page, "Load more". URL `?q=`, `?member=`.
- **Inspector:** "Given directly"; "View access", "Suspend"/"Resume", "Remove".
- **"Add member":** Email, Name, Initial password (12-128), Where they work, Role ("No access yet"). An existing account needs email only. No invitation email exists. Workspace roles are not offered. API: up to 20 `bindings`.
- **Permissions:** member:read/write; binding:write for a role given. "You cannot suspend yourself."
- **Suspend** ends app sessions. **Remove** deletes direct bindings, group memberships, SSO links, SCIM record (routes/tenants.ts:641-700).
- **View access** (Access.tsx): "What gives them access", "Find or check a permission" (type `kind:verb` for allowed/denied with places), "not while suspended". API `GET /tenants/:t/access/{member|service_account}/:id`, binding:read or self (routes/access.ts).

**tenant/groups.md** (Groups.tsx:189-300)
- Columns Name, Key (tag "Identity provider"), Created. Buttons "Members", "Rename", "Delete", "Create group".
- Dialog "Who is in X": "Add a member", "Take out".
- Key is derived from name, never changes; description ≤300 is API-only here. group:read/write.
- Delete refusal `principal_in_use`: a bundle still binds it, or the group decides a waiting approval (kernel/tenant/releases.ts:395-432).
- Title refusals: duplicate, or equal to another group's key.

**tenant/roles.md** (Roles.tsx)
- Filters All roles / Made here / Built in. Columns Role, What it is for, Permissions.
- Inspector: Held by, In short, Permissions; Change/View, Delete (disabled while held).
- "Create role": Name `[a-z][a-z0-9_]*` ≤63, Description, picker ("Find a permission", "Read everything", "Change everything", Read/Change columns, "End users can hold it").
- Unknown permissions are kept and flagged. role:read/write at tenant.

**tenant/giving-access.md** (Members.tsx:394-520; GiveAccess.tsx)
- Filters Everyone, Members, Groups, Service accounts, End users. Columns Who, Role, Where. "From repository" tag or "Remove". `?binding=` highlights a row.
- "Give access": Who (10 of each kind, plus "Every end user who signs in"), Where ("The whole tenant" / workspace), Role (workspace roles "(this workspace's)").
- **API-only:** resource scope and `anonymous`. UI for those: the app's Sharing dialog (Apps.tsx; "Read"=portal_reader, "Read and change"=portal_user) and Offer to an agent.

**tenant/access-releases.md** (AccessReleases.tsx; routes/access-releases.ts; kernel/tenant/releases.ts)
- Columns #, What, Status, By, When.
- Statuses: Applied, Waits for approval, Declined, Withdrawn, Superseded. Origins: From the repository, Through the API, In the console, Going back.
- Actions: "Ask for a second person"/"Stop asking for a second person", "Approve", "Decline" (comment ≤1000), "Withdraw", "Go back to this".
- access:read/write; last 200 listed.
- Error codes: `approval_needs_two`, `own_release`, `release_stale`, `delete_not_allowed`, `principal_in_use`.
- **Released:** groups, end-user groups, service accounts, tenant roles, and tenant/workspace bindings to those. **Never released:** member and end-user bindings, `anonymous`/`end_users`, resource bindings, workspace-defined roles, group membership.

**tenant/end-users.md** (EndUsers.tsx; Groups.tsx:291-560; routes/endusers.ts; kernel/endusers.ts)
- Tabs "End users", "Groups". Columns Email, Name, Status (active/invited/disabled), Groups, Last signed in. Pages of 50, Previous/Next.
- "Invite an end user". Inspector: Attributes, "New invitation link" / "Password reset link", Enable/Disable, Delete (rows kept).
- Links work once: invite 7 days, reset 2 hours; newest only; emailed only if mail is configured.
- Attributes: ≤50, name `^[a-z][a-z0-9_]{0,62}$`, value ≤500; replaced as a whole.
- Group columns Name, What it is for, People; buttons People, Rename, Describe, Delete.
- Portal `/portal/<slug>` or `https://<host>/_`: "Sign in", "Forgot your password?", "Create an account", "Staff sign-in" (kernel/apps/pages.ts:140-245). Password 12-200; sessions 30 days (member app sign-in 12 hours); limits 20/min sign-in, 5/min sign-up and reset. Reset or password change ends other sessions. Sign-up is off by default (`tenant_portal.sign_up`, Branding).
- end_user and end_user_group read/write.

**tenant/service-accounts.md** (Tenant.tsx:872-1138; Account.tsx)
- Columns Name, What it is for, Created. Page tabs Identity, Keys, Access, Agent tools. Account key is fixed; rename is API-only.
- Keys: `vxk_` + 32 random bytes, shown once, hash stored. Columns Name, Key (`vxk_…last4`), Last used (minute granularity), Status (active/expired/revoked); "Revoke".
- No rotate action, no per-key scopes. `expiresAt` is API-only. Rotation: create, switch, revoke.
- Delete removes keys and hand-made bindings.

**tenant/agents.md** (AgentAccess.tsx, OfferToAgent.tsx, routes/mcp.ts)
- "Offer to an agent…" on script and flow screens binds `agent_runner` at that resource.
- Agent tools tab: workspace select, address, `mcpServers` JSON, tools table (Tool, What it does, It takes, "Try").
- Endpoint `POST /api/v1/tenants/:t/workspaces/:w/mcp`: Streamable HTTP, stateless, Bearer key.
- Names: `run_<path>`, `start_<path>` (`/`→`__`, `-`→`_`, 64 cap), or `mcp: { name }` in code. Reserved: get_run, get_flow_run, list_approvals, decide_approval.
- Limits: 200 tools, 25 s wait then a run ID, `idempotencyKey` ≤200.
- Flows need a manual trigger. Old names last as long as the path alias.
- Connect needs workspace:read or any script/flow binding. list_approvals/decide_approval need approval:read/write at the workspace. An account cannot decide a step with named approvers.
- Audit: `via: "mcp"`; Try logs `service_account.tool_tried` against the member.

**tenant/operator-access.md** (Tenant.tsx:101-160, 1140-1186; routes/permissions.ts:606-735; kit/OperatorStrip.tsx)
- Columns Operator, Reason, Access level, Opened, Status; "End access".
- Operator dialog "Open operator access": Reason (3-500), Access level (viewer first), Duration 1 hour/4 hours/24 hours (API 1-1440, default 60; any built-in tenant role).
- Strip: "End now", "Hide"; header mark "Operator".
- Audit: `access_grant.opened`/`.revoked`, plus `operator.access` on every request, reads included.

**build/access-as-code.md**
- `defineRole({path,name,description,permissions})`, `defineBinding({path,role,principal,resource?,description})` (packages/sdk/src/index.ts:1224-1293); role lookup is workspace, then tenant, then built-in (kernel/kinds.ts:78-100).
- Tenant kinds: folders `roles`, `groups`, `end-user-groups`, `service-accounts`, `bindings`; file `<key>.<kind>.yaml`; `membership.sso.values` ≤50 (packages/manifest/src/tenant.ts).
- CLI: plan, release, pull, releases, approve, decline, withdraw, rollback; flags `--dir`, `--message`, `--allow-delete`, `--comment` (packages/cli/src/access.ts).
- No SDK helper exists for tenant kinds: YAML only.
- Group paths in `runBy`/`seenBy`: `groups/<key>`, `end-user-groups/<key>` (manifest/src/groups.ts).

**Instance and account:** All members ("Create member", "Disable"/"Enable"), Operators ("Add operator"; last `operator_admin` cannot be removed) (screens/Instance.tsx). Recovery codes are for tenant owners. **No account deletion feature:** members can only be disabled or removed; only end users can be deleted.

## (C) Gotchas
- Second-person approval covers releases only: giving a person a role directly, or adding them to a powerful group, applies at once.
- Turning approval on counts only direct tenant-scope member bindings with `*:*`, `access:*`, or `access:write`; group-held access does not count. One person can turn it off.
- A waiting change surfaces as an error-style message in the dialog (api.ts:62-76).
- `release_stale` if anything in access changed meanwhile.
- No escalation check: binding:write can give any role at its scope. group:write, role:write, and deploying bundles with bindings are equally powerful.
- Nothing stops removing or suspending the last tenant admin.
- Effective access lists suspended members' bindings but does not count them.
- Giving code:write to a service account or non-operator stops managed workers in process mode (kernel/execution/isolation.ts:30-67).
- Rolling back a deleted group or service account recreates it empty, without its keys.

## (D) Wrong, stale, or missing
- The stubs above hold one sentence. No MCP mention anywhere in content; second person is only in docs/sdk-guide.md.
- members.md says events and pickers page; the tab is now "Access grants". Screen text elsewhere still says "Access" (EndUsers.tsx invite, AgentAccess.tsx, endusers.ts).
- API text for creating end-user groups says the name "cannot be changed later"; it can.
- generated/permissions.md: no built-in roles; "Checked at" does not say API-only.
- generated CLI omits `--dir`.
- generated/kinds/binding.md shows only principal type "member".

## (E) Likely bugs (read in code, not run)
1. Roles picker ignores `explicit` (Roles.tsx:36-60): `*:*`/`*:read` shows sql:read ticked though not granted, and it cannot be added; "Read everything" also drops a named sql:read.
2. Deleting a provider-made group returns 204 and does nothing (releases.ts plan, currentAccess filter); the button is enabled.
3. End-user group description is offered at 500 but the schema caps 300; same for role description.
4. "Go back" under approval toasts success although it waits (rollback 202 lacks `waiting`).
5. Bindings sharing a generated key (group and service account with the same key and role) may delete the wrong one (bindingKey, applyStep).
6. Giving a group a workspace-defined role enters currentAccess; a release or rollback without it fails "There is no role" (releases.ts:127-230, 535-545).
7. workspace_admin bound at a workspace has role:*/access:write that only tenant-scope routes check; Give access needs tenant-scope reads (roles, principals), so it fails.
8. Hint "They can change it after signing in", but the console has no change-password screen.
9. "Superseded" is never set for access releases.
10. Held by matches on role name, not ID.

Owner questions: should disabling approval itself need approval (also docs/polish A3-16)? Is workspace_admin meant to lack code/interface/doc/git?

## (F) Screenshots and examples
- **Screenshots:** members inspector; View access with `promotion:write` checked; Give access sheet; role picker; waiting release approval; Go back dialog; invitation link; Attributes dialog; Keys one-time secret; Agent tools; Offer to an agent; operator strip.
- **Examples:** examples/fernhill/tenant and examples/higher-ed-devices/tenant YAML; defineBinding in examples/fernhill/src/apps.ts:1287-1305; defineRole in examples/higher-ed-devices/src/apps.ts:22; MCP JSON; key rotation; table ruled by end-user attribute.
- **Tests as evidence:** apps/control-plane/src/{kernel,mcp,release-access,access-releases,group-rows}.test.ts.
