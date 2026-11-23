# Inventory: people and access

Read from the code at `270e509` on 2026-11-22. **Refreshed 2026-11-23** against the branch `phase-30-docs-system` (phase 29 built).

## Refreshed 2026-11-23

What changed in this brief: every claim in (B) was checked against the code as it is after phase 29, with file references. Section A is rewritten for the five collections (Get started, Console, Develop, Administer, Self-host) and Diátaxis types; the old `tenant/`, `start/` and `instance/` paths are gone from the plan (the target tree is in `docs-platform-design.md:118-132`). Section E, the bug list, is settled: all ten are fixed, each with its outcome. Section C and D are rewritten. New in the product since the first reading: the Access tab and "Access changes" words (D54), D63 (a role given straight to a person does not wait), the last-admin and last-operator guards, `recover-operator`, Account's Profile, Password, Sessions and key expiry, sign-in values for groups, `?release=` for one access change, "What I may do here", workspace Access, and the permission gating in `kit/Can.tsx`.

Could not verify: no browser walk was run by me; screen words come from the code, not from a screen. D4 (a one-time reset link for a member's password) is decided but I found no route or control for members (`rg "reset"` in `routes/identity.ts`, `routes/tenants.ts`, `kernel/auth.ts` finds only the library's own `/request-password-reset` rate-limit entry); see "Not there". The generated pages (`packages/docs/generated`) were not regenerated here, so the claims in D about them (permissions, kinds, CLI) are phase 30 M9's to check. `AgentAccess.tsx` and `Provisioning.tsx` were read only for strings.

## (A) Pages to write

Paths are under `packages/docs/content`, in the target tree. Types: T tutorial, H how-to, R reference, E explanation. Help ids (`apps/console/src/nav.ts:176-188, 231, 238`) are `tenant-members`, `tenant-end-users`, `tenant-service-accounts`, `tenant-operator-access`, `instance-members`, `instance-operators`, `account`; topics are path independent. Tab addresses `/groups`, `/roles`, `/access`, `/releases` open the Members & access item (`nav.ts:359-365`); the `releases` slug stays though the tab is "Access changes".

| Page | Collection | Type | Purpose | Sources |
|---|---|---|---|---|
| administer/explanation/how-access-works | Administer | E | Roles, bindings, scopes, who can hold what, additive access, suspended people, row rules. Linked from Get started concepts | kernel/authorize.ts:34-200; packages/manifest/src/permissions.ts:37-500 |
| administer/explanation/second-person-approval | Administer | E | What waits for a second person and what does not (D63), what "Access changes" are, why approval counts people not keys | routes/access-releases.ts:170-215; kernel/tenant/releases.ts; screens/GiveAccess.tsx:38-48 |
| administer/reference/screens/members | Administer | R | Members & access: the five tabs, Members tab, inspector, Add member, View access | screens/Members.tsx:17-26, 60-420; screens/Access.tsx |
| administer/reference/screens/groups | Administer | R | Groups: columns, Members, Rename, Describe, Sign-in values, Delete | screens/Groups.tsx:60-380 |
| administer/reference/screens/roles | Administer | R | Roles tab and the permission picker | screens/Roles.tsx |
| administer/reference/screens/access | Administer | R | Access tab: who holds what, Give access sheet | screens/Members.tsx:505-650; screens/GiveAccess.tsx |
| administer/reference/screens/access-changes | Administer | R | Access changes tab: statuses, actions, `?release=` | screens/AccessReleases.tsx |
| administer/reference/screens/end-users | Administer | R | End users and their Groups tab; links; attributes | screens/EndUsers.tsx; screens/Groups.tsx:385-683 |
| administer/reference/screens/service-accounts | Administer | R | List and the page tabs Identity, Keys, Access, Agent tools | screens/Tenant.tsx:1005-1300; screens/AgentAccess.tsx |
| administer/reference/screens/operator-access | Administer | R | The tenant's list of operator grants; the strip | screens/Tenant.tsx:120-220, 1300-1348; kit/OperatorStrip.tsx |
| administer/reference/permissions | Administer | R | Generated: kinds, verbs, explicit kinds, app-facing kinds. Add the built-in roles table (B) | packages/manifest/src/permissions.ts; apps/console/src/builtinRoles.ts (held to the database by `builtin-roles.test.ts`) |
| administer/reference/audit-actions | Administer | R | Generated: the access actions (`access.released`, `access.release_superseded`, `binding.unchanged`, `operator.access`, `access_grant.opened/.revoked`, `member.disabled`, `operator.recovered`) | kernel/tenant/releases.ts; routes/permissions.ts |
| administer/how-to/add-a-member | Administer | H | Add someone with a role in one step (up to 20 roles); what to do when approval is on | screens/Members.tsx:384-470; routes/tenants.ts:690-780 |
| administer/how-to/give-access | Administer | H | Give a person, group, service account or end user a role at the tenant, a workspace or one thing; "Anyone, without signing in" | screens/GiveAccess.tsx |
| administer/how-to/check-what-someone-can-do | Administer | H | View access, "Find or check a permission", why a source says "not while suspended" or "comes only from operator access" | screens/Access.tsx:92, 162-200 |
| administer/how-to/make-a-role | Administer | H | Create a role, read "In short", "Read everything", explicit kinds | screens/Roles.tsx:93-210, 340-372 |
| administer/how-to/manage-groups | Administer | H | Create, fill, rename, describe; groups filled by sign-in values; groups an identity provider made | screens/Groups.tsx |
| administer/how-to/suspend-or-remove-a-member | Administer | H | Suspend, resume, remove; what each ends; the last-admin refusal | routes/tenants.ts:775-880; kernel/administer.ts |
| administer/how-to/ask-for-a-second-person | Administer | H | Turn approval on and off, approve, decline, withdraw, go back | screens/AccessReleases.tsx:150-390 |
| administer/how-to/invite-end-users | Administer | H | Invite, links, attributes, groups, disable; sign-up setting | screens/EndUsers.tsx; screens/Branding.tsx:557 |
| administer/how-to/rule-rows-by-group-or-attribute | Administer | H | Row rules that name a group or an end-user attribute | kernel/data/rows.ts:131-225; examples/fernhill |
| administer/how-to/make-a-service-account-and-key | Administer | H | Create, make a key (with expiry), switch and revoke to rotate | screens/Tenant.tsx:1056-1090; screens/Account.tsx:31-70 |
| administer/how-to/let-an-agent-run-a-script | Administer | H | Offer to an agent, connect an MCP client, Try | screens/OfferToAgent.tsx; screens/AgentAccess.tsx; routes/mcp.ts |
| administer/how-to/support-access-for-operators | Administer | H | Operator side: Open operator access, Duration, End access; admin side: reading the grant and the audit trail | screens/Tenant.tsx:120-220; routes/permissions.ts:643-760 |
| administer/tutorials/give-a-team-the-right-access | Administer | T | On Fernhill: a group, a role, a binding, check it with View access, then approval | examples/fernhill/tenant |
| develop/how-to/keep-access-in-a-repository | Develop | H | Tenant YAML, `volvel tenant plan/release/pull`, `--allow-delete`, approval, going back | packages/manifest/src/tenant.ts:17-120; packages/cli/src/access.ts |
| develop/how-to/define-roles-and-bindings-in-code | Develop | H | `defineRole`, `defineBinding` for one workspace; who may open an app | packages/sdk/src/index.ts:1310-1365; kernel/kinds.ts:78-100 |
| develop/reference/cli-tenant | Develop | R | Generated `volvel tenant ...`; add `--dir`, `--yes`, `--comment` if the generator lacks them | packages/cli/src/commands.ts:123-200; access.ts:100-125 |
| develop/reference/tenant-files | Develop | R | The five tenant file kinds and their schemas (YAML only, D53) | schemas/files/{group,end_user_group,service_account,tenant_role,tenant_binding}.v1.schema.json |
| develop/reference/mcp | Develop | R | The MCP endpoint, tool names, limits, the approval tools | routes/mcp.ts:40-60, 433-540, 780-810 |
| develop/how-to/call-the-access-api | Develop | H | A script that does what `tenant release` does without the CLI (D53) | routes/access-releases.ts |
| console/reference/screens/account/account | Console | R | Account: Profile, API keys, Password, Sessions, Recovery codes; the menu's "What I may do here" | screens/Account.tsx:290-546; Shell.tsx |
| console/how-to/account/change-password-and-end-sessions | Console | H | Change password; see where you are signed in; end sessions | screens/Account.tsx:189-500 |
| console/how-to/account/make-an-api-key | Console | H | Key with an expiry, the CLI sign-in | screens/Account.tsx:500-540 |
| self-host/reference/console/members-and-operators | Self-host | R | Instance All members and Operators | screens/Instance.tsx |
| self-host/how-to/recover-an-operator | Self-host | H | `node dist/main.js recover-operator <email>` | commands.ts:30-44; kernel/bootstrap.ts |
| self-host/explanation/who-runs-what | Self-host | E | Operators versus tenant admins; why an operator sees inside a tenant only through a grant; D2, D7 | kernel/authorize.ts:125-178 |

Not a page here: `Provisioning.tsx` is SCIM (belongs to single sign-on); `routes/pools.ts` is worker pools.

### Not there (say so on the page)

- No deny rule, condition or expiry on a binding. Operator grants alone expire.
- No account deletion: members are disabled or removed; only end users are deleted.
- No rotate action and no per-key scope: rotate by making a key, switching, revoking.
- No invitation email for a member (Add member, `routes/tenants.ts:690-780`). **No reset link for a member's password** though D4 decides one (not found in code; ask the owner, see "Open").
- No escalation check: `binding:write` can give any role at its scope.
- No SDK helper for the tenant file kinds: YAML only (D53).
- A role given straight to a person never waits for approval (D63).

## (B) Contents

**administer/explanation/how-access-works** (kernel/authorize.ts; packages/manifest/src/permissions.ts)
- **Grammar:** `kind:verb`, verb `read|write`, `*` for either half. Access is additive.
- **Principals:** member, group, service_account, end_user, end_user_group, `end_users` (all signed in), `anonymous` (anyone). Matching: authorize.ts:54-80. An `anonymous` binding is counted only for app-facing kinds, whoever asks (ACC-01, D8: authorize.ts:192); the API refuses to give anyone or end users a role that holds nothing app-facing (`insertBinding`, `bindingHook`).
- **Scopes:** tenant reaches all workspaces; then workspace; then one resource. Instance bindings do not reach inside a tenant, except `orInstance`/`tenantOrInstance` routes (tenant record, retention): authorize.ts:125. Only `operator_admin` may be bound at the instance (D7; `POST /bindings`).
- **Explicit kinds:** `sql:read` and `workspace_production:write` (permissions.ts:211, 368). `*` never grants them; the role picker never writes them in as a wildcard and a holder of `*:*` checking one is told so (ACC-04, ACC-27).
- **App-facing kinds** (what an end user, or a member signed in to apps only, can hold): script, run, flow_run, table, data, data_all, file, app, theme (permissions.ts:300-466; authorize.ts:137-138).
- **Suspended member:** holds nothing in that tenant by any binding or group, but an operator access grant still counts (authorize.ts:139-193).
- **Refusals:** no standing in the tenant is 404 "The tenant"; otherwise 403 naming the permission; anonymous is 401 (kernel/http.ts:170-180).
- **Row policies:** `data:*` is held to the policy, `data_all:*` passes it. Rules: everyone, `is`, `in: groups` (ID, key or name), `equals.attribute` (kernel/data/rows.ts:131-225). A member's groups count; attributes exist only on end users.
- **What the console asks (phase 29):** every screen's gate follows what the server asks, in one piece, `kit/Can.tsx`: at a tenant only a permission given *at the tenant* counts (`heldAtTenant`, :24); at a workspace the server's `/allowed` answers (`useAsked`, :88); `alone` names a narrower permission that is enough (`interface:write` for an app, `doc:write` for a docs app); `orInstance` counts an operator's instance binding (Retention); `resource` counts a grant on one script or flow (Run, Offer to an agent). A control that is refused is off with the line "You can see X, not change it. It needs `perm`, or `alt` alone. <whom to ask>" (:150-170, `NotAllowed`). Reading is never hidden. Say this on the page; it explains greyed buttons. Evidence: `fixed/gate-roles.md`, `GateRoles.test.tsx`.

**Built-in roles** (apps/console/src/builtinRoles.ts, held to the migrations by `builtin-roles.test.ts`)
- `tenant_admin`: `*:*`, `sql:read`.
- `workspace_admin`: `*` on app, approval, binding, bundle, connection, data, data_all, data_source, deployment, doc, event, file, flow, flow_run, git, interface, promotion (write), resource, run, script, secret, table, theme, trigger, variable, workspace; plus audit:read, member:read, group:read, dashboard read/write, sql:read. **Since D57** it has interface, doc and git, and **no** `role:*` or `access:write`, so it cannot make roles or ask for an access change; it can give roles in its workspace with `binding:*` (Workspace settings > Access). Still none of code, portal, end_user, service_account.
- `developer`: `*:read`, write on bundle, code, connection, dashboard, data, data_all, event, file, flow_run, resource, run, secret, variable, plus sql:read. No deployment, promotion, approval, interface or doc write.
- `deployer`: `*:read`, `bundle:*`, `deployment:*`, `promotion:write`.
- `viewer`: `*:read`.
- `portal_user`: app:read, data:read/write. `portal_reader`: app:read, data:read.
- `app_maintainer`: workspace:read, `interface:*`, table:read, data:read/write, app:read, dashboard:read/write.
- `doc_writer`: workspace:read, `doc:*`, table:read, app:read.
- `agent_runner`: run:write, flow_run:write.
- `operator_admin` (instance only, hidden in tenants): access_grant, binding, instance, member, tenant (all), audit:read, export:write.

**administer/reference/screens/members** (screens/Members.tsx)
- Item "Members & access" (nav.ts:176). Tabs: "Members", "Groups", "Roles", "Access", "Access changes" (Members.tsx:17-23).
- **Columns:** Name, Email, Status (Active/Suspended), Roles ("No access", "Through groups only", "N given directly", nothing while unknown; `rolesHeld` :132), Added. 50 per page, "Load more". URL `?q=`, `?member=` (a member beyond the loaded pages is read by itself, ACC-31).
- **Inspector:** "Given directly"; "Suspend"/"Resume", "Remove"; link "View access".
- **"Add member":** Email, Name ("Only for a new account."), Initial password (12-128, "They can change it on their Account screen after signing in"), Roles: one or more Role / Where they work pairs (up to 20; Role starts at "No access yet"; "The whole tenant" or a workspace; workspace roles not offered). An existing account needs the email only. No invitation email.
- **Permissions:** member:read to see, member:write to change, binding:write to give a role. "You cannot suspend yourself."
- **Suspend** ends the person's console and app sessions, event streams and unfinished sign-ins (`endSessions`, administer.ts). **Remove** deletes direct bindings, group memberships, SSO links and SCIM record (routes/tenants.ts:825-880).
- **Refused when it would leave nobody who can change the tenant's access** (suspend, remove, remove from group, delete a binding, a release step, a tenant provider's push): 409 "...Give someone else the tenant admin role first" (ACC-09/10; administer.ts:57-69). "Can change" counts members who hold `binding:write` at the tenant directly or through a group, enabled and not suspended.
- **View access** (screens/Access.tsx): "What gives them access", "Find or check a permission" (type `kind:verb`: Allowed or Denied with the places and the reason), a source struck "not while suspended", "It comes only from operator access, which ends when the grant does" (:200). For yourself the page is "What I may do here" (account menu inside a tenant, :280-285). API `GET /tenants/:t/access/{member|service_account}/:id`, `binding:read` or self.

**administer/reference/screens/groups** (screens/Groups.tsx)
- Columns Name, Key (tag "Identity provider" for provider-made), Created. Row buttons "Members", "Rename", "Describe", "Sign-in values", "Delete"; button "Create group" (Name, "What it is for").
- Dialog "Who is in X": add by email search, "Take out" (asks first).
- Key is made from the name and never changes (:305). Description ≤500 on every route (ACC-20). "Sign-in values": "Filled by sign-in", one value per line, put in the group when they sign in; ≤50 values; refused for a provider-made group (409).
- Delete: off, with the reason, for a provider-made group ("An identity provider made this group. Change it there."). Refused `principal_in_use` when a bundle still binds it or it decides a waiting approval (kernel/tenant/releases.ts:436-460).
- Permissions group:read/write. With approval on, group changes wait.

**administer/reference/screens/roles** (screens/Roles.tsx)
- Filters "All roles", "Made here", "Built in". Columns Role, What it is for, Permissions ("Reads everything" or "Reads N of M").
- Inspector: Held by (by role ID, ACC-26), In short, Permissions; Change/View, Delete (off while held). A role from a workspace says "In <workspace>" and "comes from a workspace's repository".
- "Create role": Name (`^[a-z][a-z0-9_]*$`, ≤63; "Lowercase letters, digits and underscores."), Description ≤500, picker ("Find a permission", "Read everything", "Change everything", Read/Change columns, "End users can hold it", and for explicit kinds "Given only when ticked here: 'everything' does not include it"). A permission no longer defined is kept and flagged; a role keeps one it already holds even when retired (ACC-22).
- Permissions role:read/write at the tenant. With approval on, role changes wait.

**administer/reference/screens/access** (screens/Members.tsx:505-650; GiveAccess.tsx)
- Tab "Access" (was "Access grants"). Filters Everyone, Members, Groups, Service accounts, End users. Columns Who, Role, Where (names and links the thing for a resource, ACC-29). "From repository" tag, or "Remove". `?binding=` highlights a row.
- "Give access" sheet: Who (10 of each kind, "Every end user who signs in", and "Anyone, without signing in" which offers only roles that give something an app uses), Where ("The whole tenant" or a workspace), What (the whole workspace, or one script, flow, app and so on; sent as `resourceId`), Role (a workspace's own roles appear only for that workspace). Giving a role already given answers with the existing binding and records nothing (ACC-17).
- With approval on, a notice says: "a role given straight to a member or to end users applies at once and does not wait. A role given to a group, a service account or a group of end users does wait." (`DirectGrantNote`, GiveAccess.tsx:38-48). Same note in Add member.
- Workspace settings > Access lists, gives and removes the bindings of one workspace (`WorkspaceAccess`, Environments.tsx; needs `binding:write` at the workspace).
- The Share dialog on an app (Apps.tsx:109-370, "Share with": "Read" = portal_reader, "Read and change" = portal_user) and "Offer to an agent…" give the same bindings from where the thing is.

**administer/reference/screens/access-changes** (screens/AccessReleases.tsx; routes/access-releases.ts; kernel/tenant/releases.ts)
- Tab "Access changes" (D54: "release" is gone from words; slugs, CLI command names and error codes keep it). Columns #, What, Status, By, When. The number opens one change (`?release=<id>`) with its changes and warnings. Last 200 listed (routes/access-releases.ts:105).
- Statuses: Applied, Waits for approval, Declined, Withdrawn, **Superseded** (set when another change applied first and this one can no longer apply, with a comment naming it: releases.ts:1012-1034). Origins: From the repository, Through the API, In the console, Going back.
- Actions: "Ask for a second person" / "Stop asking for a second person" (stopping asks first), "Approve", "Decline" (comment ≤1000), "Withdraw", "Go back to this" (dialog "Go back to access change N?", lists what it removes and any warnings for what is gone). A change that waits is shown as a notice, not as success. Whoever asked, or made the key it was asked with, can withdraw without any access permission; answering needs `access:write` (ACC-16).
- Turning approval on needs two people who hold `access:write` at the tenant, directly or through a group (409 `approval_needs_two`). Turning it off needs no approval (decisions.md, top). An approver is a member: a service account cannot approve or decline (D9), and whoever made the key a change was asked with is the asker (409 `own_release`).
- Error codes: `approval_needs_two`, `own_release`, `release_stale`, `delete_not_allowed`, `principal_in_use`.
- **What access changes carry:** groups, end-user groups, service accounts, tenant roles, and the tenant's bindings to those. **They do not carry:** a role given to a member or an end user, `anonymous`/`end_users`, resource bindings, workspace-defined roles, group membership. That is why D63 holds: those apply at once.
- Going back to a change that deleted a group or service account makes it again, empty and without keys (ACC-37). It leaves out what is gone and warns.

**administer/reference/screens/end-users** (screens/EndUsers.tsx; Groups.tsx:385-683; routes/endusers.ts; kernel/endusers.ts)
- Item "End users"; tabs "End users", "Groups". Columns Email, Name, Status (Active, Invited, Disabled), Groups, Last signed in. Pages of 50, Previous/Next. Status is Active when a provider signed them in or they have signed in.
- "Invite an end user" (Email, Name, and "On which address" when the tenant has enabled hostnames). Inspector actions: Rename, Attributes, "New invitation link" or "Password reset link" (none for someone a provider signs in), Enable/Disable (asks first), Delete.
- Links work once: invite 7 days (`INVITE_DAYS`), reset 2 hours (`RESET_HOURS`); a new one replaces the older; mailed only if mail is configured (the dialog says which).
- Attributes: ≤50, name `^[a-z][a-z0-9_]{0,62}$`, value ≤500; replaced as a whole; a repeated name is refused at its field.
- End-user groups: Name, Key, What it is for, People; Rename, Describe, Sign-in values, Delete; provider-made ones refuse Delete and Rename.
- Portal `/portal/<slug>` or `https://<host>/_`: "Sign in", "Forgot your password?", "Create an account" (only when sign-up is on), "Staff sign-in" (kernel/apps/pages.ts:159-240). Password 12-200; sessions 30 days (`END_USER_SESSION_DAYS`), a member at an app's address 12 hours (`MEMBER_APP_SESSION_HOURS`: sessions.ts:8-10); limits 20/min sign-in, 5/min sign-up and reset (endusers.ts:132-133). Sign-up is off by default; the switch is "People may create their own account" in Branding.
- Permissions end_user and end_user_group read/write.

**administer/reference/screens/service-accounts** (screens/Tenant.tsx:1005-1300; Account.tsx:31-70)
- Item "Service accounts". Columns Name, What it is for, Created. Page tabs Identity (Name, What it is for, Key shown), Keys, Access, Agent tools. Rename is in the UI now.
- Keys: `vxk_` + 32 random bytes, shown once, hash kept. "Create API key" has Name and Expires (Never, In 30 days, In 90 days, In a year: kit/expiry.ts). Columns Name, Key (`vxk_…last4`), Last used, **Expires**, Status (Active, Expired, Revoked); "Revoke" (asks first).
- Still no rotate action and no per-key scopes: rotation is create, switch, revoke.
- Access tab lists what it may do and where; Give access and Remove are off without `binding:write`.
- Delete removes keys and hand-made bindings. Permission service_account:write.
- A service account's key is refused on routes about a person's own account (D14), except `GET /me` and the batch route.

**administer/how-to/let-an-agent-run-a-script** (screens/AgentAccess.tsx, OfferToAgent.tsx, routes/mcp.ts)
- "Offer to an agent…" on script and flow screens binds `agent_runner` at that resource; the button is off without `binding:write` on that script or flow (OfferToAgent.tsx:233-249).
- Agent tools tab: workspace select, address, `mcpServers` JSON (entry named `volvel`), tools table (Tool, What it does, It takes, "Try").
- Endpoint `POST /api/v1/tenants/:t/workspaces/:w/mcp`: Streamable HTTP, stateless, Bearer key (mcp.ts:794).
- Names: `run_<path>`, `start_<path>` (`/`→`__`, `-`→`_`, 64 cap) or `mcp: { name }` in code. Fixed: get_run, get_flow_run, list_approvals, decide_approval. Limits: 200 tools (`MAX_TOOLS`), 25 s wait (`WAIT_MS`) then a run ID, `idempotencyKey` 1-200 characters, decision comment ≤2000.
- Flows need a manual trigger. Another person's run, flow run or waiting approval is masked as on screen; the caller's own are given as they are (D13). `decide_approval` is refused for a step with named approvers the account is not among; a service account's decision is listed under its name.
- Audit: `via: "mcp"`; Try logs `service_account.tool_tried` against the member.

**administer/reference/screens/operator-access** (screens/Tenant.tsx:120-220, 1300-1348; routes/permissions.ts:643-760; kit/OperatorStrip.tsx)
- Columns Operator, Reason, Access level, Opened, Status; "End access".
- "Open operator access" (by an operator): Reason (3-500), Access level (built-in tenant roles, "viewer (read only)" first), Duration 1 hour / 4 hours / 24 hours / Other (1-1440 minutes; API default 60).
- Strip: "End now", "Hide"; header mark "Operator"; menu "End access now". Ends by itself at the end time; a failed end says so.
- Audit: `access_grant.opened`/`.revoked`, and `operator.access` on every request, reads included. Removing an operator, or disabling them, ends their open grants (ACC-02).
- An operator who opens a tenant with no grant sees "Operators see inside a tenant only through an access grant": a grant is time-limited, needs a reason, and the tenant's admins can see it and end it (Tenant.tsx:287-296).

**develop/how-to/keep-access-in-a-repository** and **define-roles-and-bindings-in-code**
- `defineRole({path,name,description,permissions})` and `defineBinding({path,role,principal,resource?,description})` are for one workspace (sdk/src/index.ts:1315, 1360). Principal by key (`{type:"group", key}`, service_account, end_user_group), by name (older, breaks on rename), `{type:"member", email}`, `end_user`, `end_users`, `anonymous`. Role lookup: workspace, then tenant, then built-in (kernel/kinds.ts:86).
- Tenant kinds: folders `roles`, `groups`, `end-user-groups`, `service-accounts`, `bindings`; file `<key>.<kind>.yaml` under `tenant/`; `membership.sso.values` ≤50 (manifest/src/tenant.ts:17-115). Schemas in `schemas/files/` and `volvel schemas` maps them. No SDK helper (D53).
- CLI (packages/cli/src/access.ts): `volvel tenant plan | release | pull | releases | approve <n> | decline <n> | withdraw <n> | rollback <n> [--yes] | approval [on|off]`, always with `--tenant <slug>`; flags `--dir`, `--message`, `--comment`, `--allow-delete <kind>/<key>`, `--yes`. Rollback prints what it removes and asks, or needs `--yes`; approve and decline print the changes. Output says "access change".
- Group paths in `runBy`/`seenBy`: `groups/<key>`, `end-user-groups/<key>` (manifest/src/groups.ts).
- A change made from a repository that waits says: "Nothing changed yet. Someone else approves it with: volvel tenant approve N --tenant <slug>" (access.ts:168).

**console/reference/screens/account/account** (screens/Account.tsx)
- Page "Account": API keys (Expires column), Profile (Name, Save name; read-only with "Your name comes from <provider>. Change it there." where a directory pushes it), Password (Current, New, New again, 12+; ends other sessions; "The current password is not right."), Sessions (device, address, when; "End", "End other sessions", both ask first; the one in use has no End), Recovery codes (for tenant owners; a wrong password with a code still spends it, and the form says so: D18).
- Console sessions last 7 days (`CONSOLE_SESSION_DAYS`, D51).

**self-host/reference/console/members-and-operators** (screens/Instance.tsx)
- "All members": Name, Email, Tenants, State (Disabled tag), Created; "Create member" (Name, Email, Initial password); "Disable"/"Enable" (confirm "Disable <email>?"); your own row offers no Disable.
- Disabling at the instance is never refused for a tenant's sake: the answer, the audit entry and the notice name the tenants left with no admin (`tenantsWithoutAdmin`). It is refused only for the last operator. Disabling ends sessions, grants, open streams and pending sign-ins, and does not come back on enabling.
- "Operators": Member (Disabled tag), Role, Since; "Add operator"; removing yourself says so; the last operator cannot be removed.
- Locked-out operator: `node dist/main.js recover-operator <email>` (D3): enables, binds `operator_admin`, ends sessions, prints a new password once, audit `operator.recovered`.
- The Instance area opens only for operators (`ForOperators`, App.tsx).
- A tenant's identity provider does not sign in a member who holds an instance binding (D2); the instance's provider gives no role.

## (C) Gotchas
- Second-person approval covers **access changes only**. D63: a role given straight to a member, or to every end user, and Add member, apply at once; groups, service accounts, end-user groups, roles and their bindings wait. The console says so in a notice. Say it plainly in the explanation page.
- Turning approval on needs two people with `access:write` at the tenant, directly **or through a group** (it used to count direct only). One person can turn it off.
- A change that waits is a notice in the dialog, not an error (ACC-14, ACC-23).
- A waiting change whose base moved becomes Superseded when another applies; `release_stale` remains for a change that moved another way.
- Group, role and "deploy a bundle with bindings" changes are as powerful as `binding:write`: there is still no escalation check.
- The last person who can change a tenant's access cannot be removed, suspended, taken out of a group or unbound at the tenant (409); an instance operator disabling an account is the exception (tenants are named, not protected).
- Effective access lists a suspended member's bindings but does not count them.
- Giving `code:write` to a service account or a non-operator stops managed workers in process mode (kernel/execution/isolation.ts:29-60).
- Rolling back a deleted group or service account recreates it empty, without keys.
- `workspace_admin` can give roles in its workspace but cannot make a role or ask for an access change (D57).
- A key made by a person counts as that person when deciding who asked (`own_release`).

## (D) Wrong, stale, or missing (what to tell the writers)
- The stubs in `tenant/*.md` hold a sentence; the whole tree is rewritten in the five collections. `content/tenant/members.md:13-15` still says "access release" and "Access grants" tab.
- Words: tab "Access" (not "Access grants"), "Access changes" (not releases), "Apps" (not Published apps), "canceled", "Deploy"/"Versions". Command names, slug `releases`, and codes `own_release`, `release_stale` keep the old word.
- Generated pages (phase 30 M9): `generated/permissions.md` lacks built-in roles and "Checked at" does not say API-only; the generated CLI omitted `--dir`; `generated/kinds/binding.md` showed only principal type "member". Not re-checked here.
- No MCP page exists in content; second person was only in `docs/sdk-guide.md`.
- The help topic for Health is not people's; skip.

## (E) Findings: settled in phase 29
All ten read-in-code bugs are fixed. Evidence: `fixed/acc.md`, `fixed/acc2.md`, `fixed/t3-access.md`.
1. Roles picker and explicit kinds: fixed (ACC-04; `grants`, `setPermission` in `@volvel/manifest`).
2. Deleting a provider-made group did nothing: refused with 409 and the button is off with the reason (ACC-11).
3. Description 500 vs 300: one limit, 500, on all routes (ACC-20).
4. Going back under approval toasted success: says it waits (ACC-14).
5. Bindings sharing a generated key: unique keys (ACC-05, ACC-06).
6. A group given a workspace role broke releases: workspace roles left out of `currentAccess` (ACC-12).
7. `workspace_admin` and Give access: it loses `role:*`/`access:write` (D57) and Give access reads by workspace (ACC-24).
8. "They can change it after signing in": Account has Change password (ACC-25).
9. "Superseded" never set: now set (ACC-15).
10. Held by matched a role name: matches the ID (ACC-26).
Owner questions answered: turning approval off needs no approval (decisions.md top); `workspace_admin` has interface, doc and git (D57), not code.

**Open (not in decisions.md or settled by a fix):**
- D4: a one-time password reset link for a member is decided and I found no route or button. Ask before the page says either way.
- `Operators` list shows Disabled (done, ins2); the approval switch shows the server's 409 text only (acc, left).
- A release a service account asked for could be approved by the person who made the key; closed by `own_release` through `api_key.created_by` (acc, migration 0086).
- Pending SSO codes of an end user and streams on other replicas: done in ins2 (`vx_ended`).

## (F) Screenshots and examples
- **Screenshots:** Members inspector; View access with an operator-only source; Give access sheet (with the approval notice); role picker with an explicit kind; a waiting access change and its approve dialog; Go back dialog with warnings; invitation link; Attributes dialog; Keys one-time secret and Expires; Account Sessions; Agent tools; Offer to an agent; operator strip; a greyed button with its "It needs ..." line (gate).
- **Examples:** examples/fernhill/tenant and examples/higher-ed-devices/tenant YAML; defineBinding in examples/fernhill/src/apps.ts (search `defineBinding`); defineRole in examples/higher-ed-devices/src/apps.ts; MCP JSON; key rotation; table ruled by end-user attribute.
- **Tests as evidence:** apps/control-plane/src/{access-guards,access-lane2,access-t3,access-releases,group-rows,kernel,mcp}.test.ts; apps/console/src/{GateRoles,AccessLane2,AccessT3,AccessReleases,Roles,Account}.test.tsx; packages/manifest/src/permissions.test.ts.
