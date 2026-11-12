# Phase 1: kernel

Status: built and verified locally
Last updated: 2026-11-11

Phase 1 builds the shared core that every later feature depends on: tenancy, the resource registry, member identity, permissions, secrets, audit, the console shell and the CLI skeleton.

**Exit criterion:** a tenant, workspace, members and roles can be created, and every change is audited.

## Spec sections implemented

| Master spec section | What phase 1 delivers |
| --- | --- |
| Tenancy and deployment model | Tenants and workspaces, with the production or dev flag fixed at creation |
| Resource model and file format | The resource registry: stored envelopes, versions, and kind hooks |
| Identity and permissions | Platform members and sign-in, groups, service accounts, API keys, roles, bindings, the single authorization check. The end-user pool is reserved |
| Open source, licensing and the ownership promise: you own the keys | Secrets encrypted with a key per tenant |
| Observability and audit: audit log | One append-only audit stream and one write path |
| Apps and user interface: admin console, branding | The console shell, built on a component kit that uses theme tokens |
| System architecture: SDK and CLI | The CLI skeleton |

Not in this phase: scripts, deploys, bundles, workers, the queue, flows, custom tables, apps, end-user sign-in, tenant export, single sign-on, email delivery.

## Owner decisions

| Area | Decision |
| --- | --- |
| Authentication | Better Auth, inside the control plane |
| Console stack | Preact, Vite, Base UI and Tailwind |
| Operator access to tenants | None by default. Explicit, time-limited access grants with a stated reason, audited and visible to the tenant |

The master spec is updated to match: authentication and the frontend stack move out of "open", and the operator-access open question is closed.

## Findings and risks

- **Base UI on Preact is not a supported combination.** Base UI is written for React. It runs here through Preact's compatibility layer: the workspace overrides `react` and `react-dom` with `@preact/compat`. A spike confirmed that dialog, menu and field components work, and the kit's tests keep checking it. An upgrade of either library can still break it. The kit hides Base UI behind its own components, so the fallback is to swap the foundation or move to React without touching the console or client apps.
- **Better Auth owns four tables and its own routes.** Its tables are created by our SQL migrations, not its migration tool, with our naming. A test fails if Better Auth ever expects a schema our migrations do not provide. Its routes are mounted under `/api/v1/auth`, merged into the one API description, and its errors are converted to problem details.
- **Better Auth telemetry is off by default** and is also switched off explicitly in code.
- **Instance and tenant scope do not fit the workspace envelope.** The envelope requires a workspace, but tenant admins and operator admins are bound above any workspace. So roles and bindings live in their own tables with a scope column. Workspace-level roles and bindings can also be written as resources (kinds `role` and `binding`), and the registry projects them into those tables. Tenant-level and instance-level ones are managed through the API. Both routes go through the same audit path.
- **No email in the footprint.** Phase 1 has no way to send mail, so there are no invitation or password-reset emails. An admin creates a member with an initial password, and the member changes it after signing in. Invitations arrive when a mail connector exists.

## Configuration added

| Variable | Required | Meaning |
| --- | --- | --- |
| `PUBLIC_URL` | yes | The URL people use to reach the instance, for example `https://platform.example.com`. Used for cookies and origin checks |
| `AUTH_SECRET` | yes | At least 32 random characters. Signs session cookies |
| `MASTER_KEY` | yes | 32 random bytes, base64. Wraps each tenant's encryption key |
| `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD` | no | Creates the first operator admin when the instance has no members. Ignored afterwards |

Losing `MASTER_KEY` makes every stored secret unreadable. The self-hosting guide must say so.

## Identity

### Principals

| Type | What it is | Where it lives |
| --- | --- | --- |
| `member` | A developer or client staff member | `member`, one identity per instance |
| `group` | A named set of members inside one tenant | `principal_group` |
| `service_account` | A machine identity inside one tenant | `service_account` |
| `anonymous` | Any caller, signed in or not | No row |
| `end_user` | A client's customer | Reserved. Phase 6 |

### Member sign-in

- Email and password, handled by Better Auth. Public sign-up is disabled. Minimum password length is 12.
- A browser session is a cookie. The session row stores the address and user agent.
- Machine callers send `Authorization: Bearer <api key>`.

### API keys

An API key belongs to a member or a service account and acts as that principal. The key is shown once at creation. The database holds only its SHA-256 hash and a short prefix for display. Keys can expire and be revoked. Format: `vxk_` followed by 43 random characters.

### The end-user pool, reserved

End users are a separate pool per tenant, delivered in phase 6. Phase 1 reserves it:

- `end_user` is already a valid principal type in the binding table.
- Member tables are named `member*`. End-user tables will be `end_user*`, each row carrying a tenant ID, with email unique per tenant.
- End-user sign-in will be a second Better Auth configuration with its own cookie name and its own route prefix, `/api/v1/tenants/{tenantId}/end-user-auth`.
- Nothing in the authorization check assumes a principal is a member.

## Tenancy

- **Tenant:** slug, name, data location. Created by an operator admin.
- **Workspace:** belongs to a tenant. Slug unique within the tenant, name, type `production` or `dev`. The type is set at creation and a database trigger refuses any change. A dev workspace may link to a production workspace of the same tenant.
- **Tenant membership:** a member must belong to a tenant before being bound to anything inside it.

## Permissions

### Model

- A **permission** is `kind:verb`. Verbs are `read` and `write`. `*` matches any kind or any verb.
- A **role** is a named list of permissions. Built-in roles ship in a migration. Custom roles belong to a tenant, or to one workspace when defined as a resource.
- A **binding** grants a role to a principal at a scope: `instance`, `tenant`, `workspace` or `resource`.

### Built-in roles

| Role | Bound at | Permissions |
| --- | --- | --- |
| `operator_admin` | instance | `instance:*`, `tenant:*`, `member:*`, `binding:*`, `access_grant:*`, `audit:read` |
| `tenant_admin` | tenant | `*:*` |
| `workspace_admin` | workspace | `workspace:*`, `role:*`, `binding:*`, `secret:*`, `resource:*`, `audit:read`, `member:read`, `group:read` |
| `developer` | workspace | `*:read`, `secret:write`, `resource:write` |
| `viewer` | any | `*:read` |

`resource:*` covers the generic registry routes. As kinds arrive in later phases they gain their own permission kinds.

### The one check

Every route calls `authorize(principal, permission, target)`. No route decides access any other way, and a test fails if a route is registered without declaring its permission.

For a target inside tenant T, optionally workspace W and resource R, the check passes when the principal, one of its groups, or the anonymous principal holds a binding whose role contains the permission, at:

- tenant scope for T, or
- workspace scope for W, or
- resource scope for R.

For an instance-level target, only instance-scope bindings count.

**An instance-scope binding never reaches inside a tenant.** That is what makes operator access explicit.

A custom role or binding can only be created at a scope where the caller holds `role:write` or `binding:write`, so nobody can grant beyond their own scope.

### Operator access grants

- An operator admin opens a grant for one tenant with a reason, a role and a duration (default 1 hour, maximum 24 hours).
- While the grant is active the operator holds that role at tenant scope.
- Opening and revoking a grant is audited in the tenant's audit log.
- Every request authorized through a grant is audited, including reads, with the grant ID.
- Tenant admins can list all grants, past and present, and revoke an active one.

## Resource registry

- The `resource` table holds stored envelopes: ID, tenant, workspace, kind, schema version, path, ownership, version and body.
- A path is unique within its workspace across all kinds. A rename changes the path and keeps the ID.
- Every write validates the manifest against the kind registry, bumps the version and appends to `resource_version`.
- A code-managed resource cannot be changed through the interface routes. In phase 1 every write through the API states its ownership, and a write that would flip an existing resource's ownership is refused.
- **Kind hooks.** A kind may register a hook that runs in the same transaction as the write. This is how a stored manifest takes effect. Phase 1 uses it for `role` and `binding`.

### Kinds in phase 1

| Kind | Body | Effect |
| --- | --- | --- |
| `role` | `description`, `permissions` | A custom role scoped to the workspace |
| `binding` | `role`, `principal`, optional `resource` path | A binding at workspace scope, or at resource scope when `resource` is given |

## Secrets

- Each tenant has one 256-bit data key, generated on first use.
- The data key is stored wrapped with the instance `MASTER_KEY` using AES-256-GCM.
- A secret value is encrypted with the tenant's data key using AES-256-GCM. The tenant, workspace and name are bound in as authenticated data, so a ciphertext cannot be moved to another name or tenant.
- Secrets are named per workspace. The API can set, list and delete them. It never returns a value. Scripts read values at run time from phase 2.
- A tenant export (phase 5) carries the data key, rewrapped for transport. The instance master key never leaves the instance.

## Audit

- `audit_entry` is append-only. Database triggers refuse update, delete and truncate.
- Each entry records who (principal type and ID, API key if any, access grant if any), what (action, target type and ID, details), when, and from where (address, user agent, request ID), plus the tenant and workspace.
- **One write path.** Every change runs through `mutate()`, which opens a transaction, runs the change and writes the audit entry in that same transaction. If either fails, both roll back.
- A test walks every route that is not a read and fails if calling it leaves no audit entry.
- Sign-in, sign-out and password changes are audited through Better Auth's hooks.
- Secret values, passwords and keys never appear in an entry.
- Retention is not enforced yet. Default retention is still an open question in the master spec.

## Schemas

Migrations 0002 to 0007. All IDs are UUIDv7. Every tenant-owned row carries `tenant_id`.

| Table | Purpose | Notable columns and rules |
| --- | --- | --- |
| `member` | Platform members | `email` unique per instance |
| `member_session`, `member_account`, `member_verification` | Better Auth | Sessions, password hashes, verification tokens |
| `service_account` | Machine identities | `tenant_id`, `name` unique per tenant |
| `api_key` | Keys for members and service accounts | `owner_type`, `owner_id`, `token_hash` unique, `prefix`, `expires_at`, `revoked_at` |
| `tenant` (extended) | | adds `name` |
| `workspace` | | `tenant_id`, `slug` unique per tenant, `type`, `linked_workspace_id`. Trigger: `type` is immutable |
| `tenant_member` | Membership | `tenant_id`, `member_id` |
| `principal_group`, `group_member` | Groups | Group `name` unique per tenant |
| `role` | Built-in and custom roles | `tenant_id` and `workspace_id` null for built-ins, `permissions` text array, `resource_id` when projected from a resource |
| `binding` | Grants | `scope_type`, `tenant_id`, `workspace_id`, `resource_id`, `principal_type`, `principal_id`, `role_id`, `source_resource_id` when projected |
| `access_grant` | Operator access | `member_id`, `tenant_id`, `role_id`, `reason`, `expires_at`, `revoked_at` |
| `resource`, `resource_version` | Registry | Unique `(workspace_id, path)` |
| `tenant_key` | Wrapped data key per tenant | |
| `secret` | Encrypted values | Unique `(workspace_id, name)` |
| `audit_entry` | Audit stream | Append-only |

## API surface

All under `/api/v1`, following the phase 0 conventions. `{t}` is a tenant ID and `{w}` a workspace ID.

| Route | Methods | Permission |
| --- | --- | --- |
| `/auth/*` | Better Auth: sign in, sign out, session, change password | Public or session |
| `/me` | GET | Any signed-in principal |
| `/api-keys`, `/api-keys/{id}` | GET, POST, DELETE | Own keys only |
| `/members`, `/members/{id}` | GET, POST | `member:read`, `member:write` at instance |
| `/bindings`, `/bindings/{id}` | GET, POST, DELETE | `binding:*` at instance |
| `/audit` | GET | `audit:read` at instance |
| `/kinds` | GET | Any signed-in principal |
| `/tenants` | GET, POST | GET lists the caller's tenants, or all with `tenant:read` at instance. POST needs `tenant:write` at instance |
| `/tenants/{t}` | GET, PATCH | `tenant:read`, `tenant:write` at the tenant or the instance |
| `/tenants/{t}/members`, `/{memberId}` | GET, POST, DELETE | `member:*` |
| `/tenants/{t}/groups`, `/{g}`, `/{g}/members/{memberId}` | GET, POST, DELETE, PUT | `group:*` |
| `/tenants/{t}/service-accounts`, `/{id}`, `/{id}/api-keys` | GET, POST, DELETE | `service_account:*` |
| `/tenants/{t}/roles`, `/{id}` | GET, POST, PATCH, DELETE | `role:*` |
| `/tenants/{t}/bindings`, `/{id}` | GET, POST, DELETE | `binding:*` at the binding's scope |
| `/tenants/{t}/access-grants`, `/{id}` | GET, POST, DELETE | POST needs `access_grant:write` at instance. GET and DELETE need `access_grant:*` at the tenant, or to be the grant's operator |
| `/tenants/{t}/audit` | GET | `audit:read` |
| `/tenants/{t}/workspaces`, `/{w}` | GET, POST, PATCH | `workspace:*` |
| `/tenants/{t}/workspaces/{w}/secrets`, `/{name}` | GET, PUT, DELETE | `secret:*` |
| `/tenants/{t}/workspaces/{w}/resources` | GET | `resource:read` |
| `/tenants/{t}/workspaces/{w}/resources/{path...}` | GET, PUT, DELETE | `resource:*` |

A caller with no access to a tenant gets 404 for anything inside it, not 403, so tenant IDs cannot be probed.

## Console shell

- `packages/ui` is the component kit. It defines the theme tokens as CSS variables and maps them into Tailwind, so every colour, radius and font in a component comes from a token. Tenant branding in phase 6 becomes a token override.
- Kit components in phase 1: button, text field, select field, dialog, menu, table, badge, notice and empty state. Fields, dialog and menu wrap Base UI primitives. The select field is a native select, which already works with every keyboard, screen reader and phone.
- `apps/console` is a single-page app built with Vite. The control plane serves the built files, so there is still one image and one container.
- The console calls only the public API, with the session cookie.
- Screens: sign in, tenants, and inside a tenant: workspaces, members, groups, roles and bindings, service accounts, secrets, resources (read-only), access grants and the audit log. Plus the instance pages for operator admins: members, instance bindings, instance audit.
- An operator who opens a tenant without a grant sees a screen that explains why and offers to open one. While a grant is active, an amber banner states the access level, the reason and the end time on every tenant screen.
- Production workspaces are always marked in the same amber.
- The typeface is the system font. A bundled webfont would bring a font licence outside the allowlist, and the console must work offline. The font is a theme token, so a tenant's branding can set one.

## CLI skeleton

`packages/cli` provides the `platform` command with no dependencies beyond Node:

- `platform login --url <url> --token <api key>` stores the instance URL and key in the user's config directory, readable only by the user.
- `platform whoami` shows the principal and its tenants.
- `platform status` shows the instance version and readiness.

Build, deploy and sync arrive in phase 2. The command name is a placeholder until the product name is chosen.

## Tests

| Area | Test |
| --- | --- |
| Better Auth schema | After our migrations, Better Auth reports nothing missing |
| Sign-in | Correct and wrong password. Sign-up refused. Session cookie authenticates `/me`. Auth errors are problem details |
| API keys | Create, use, expire, revoke. Only the hash is stored |
| Authorization | The scope matrix: instance, tenant, workspace and resource bindings against targets at each level. Groups. Wildcards. Instance bindings do not reach tenants |
| Authorization | Every route declares a permission |
| Tenant isolation | A member of tenant A gets 404 on every tenant B route |
| Workspaces | Type cannot be changed, at the API or in the database |
| Access grants | No access before, access during, none after expiry or revoke. Reads under a grant are audited. Tenant admin sees and revokes |
| Registry | Create, update, rename, delete. Version history. Path uniqueness. Ownership cannot flip. Unknown kind refused |
| Kind hooks | A `role` and a `binding` resource take effect in the authorization check, and stop when deleted |
| Secrets | Round trip. Wrong tenant, workspace or name fails to decrypt. No route returns a value. Values never reach the audit log |
| Audit | Every mutating route leaves an entry. Update and delete on `audit_entry` are refused. A failed change leaves no entry |
| Kit | Each component renders and responds under Preact |
| Console | Sign-in flow and tenant list against a mocked API |
| CLI | `login`, `whoami`, `status` against a running test instance |
| Exit criterion | One end-to-end test: bootstrap an admin, create a tenant, a workspace, a member, a custom role and a binding, then read all of it back from the audit log |

## Check against the master spec

Checked on 2026-11-11 against the build on the `phase-1-kernel` branch.

### Guiding principles

| Principle | Result |
| --- | --- |
| 1. One platform, one experience | Met. One identity model, one permission check, one audit stream, one API, one console |
| 2. Everything is a resource | Met with one recorded interpretation: roles and bindings above workspace level are administrative records, because the envelope requires a workspace |
| 3. Code first, git as the source of truth | Prepared. Code-managed resources are read-only through the interface routes. Deploys arrive in phase 2 |
| 4. Language-neutral core | Met. Kinds are JSON Schema. Nothing in the registry depends on the authoring language |
| 5. Same software everywhere | Met. One image, now including the console's static files |
| 6. Minimal footprint | Met. Still the control plane, Postgres and an object store. Authentication added no container |
| 7. No central dependency | Met. The authentication library's telemetry is off. No outbound calls were added |
| 8. Tenant portability | Not weakened. Every tenant-owned row carries the tenant ID, and each tenant has its own key, ready to travel with an export |
| 9. The core uses its own SDK | Not applicable yet. The `role` and `binding` kinds use the same kind registry and hook that later kinds will |
| 10. Reuse libraries and engines, not applications | Met. Better Auth is a library: no interface, and its users are our member table |
| 11. Keep the end-user version possible | Met. The end-user pool is reserved, and UI-managed ownership exists in the registry |
| 12. Kernel before features | Met |

### Ownership promise

| Promise | Result |
| --- | --- |
| You own the code | Not weakened |
| You own the data | Not weakened. Export arrives in phase 5 |
| You own the keys | Met. Secrets are encrypted with a key per tenant, wrapped by the instance master key |
| No lock-in | Met. An operator has no access path into a tenant that the tenant cannot see: access needs a grant, and grants and their use are in the tenant's audit log |
| Any location | Met for local and single-host. Fly.io is still not run |

### Exit criterion

| Check | Result |
| --- | --- |
| A tenant, workspace, members and roles can be created through the API | Passed, in `exit-criterion.test.ts` |
| Every change is audited | Passed. A test fails if any route that changes something is not exercised, or succeeds without leaving an audit entry |
| The same flow through the console in a real browser | Passed, driven by a script against a local instance |
| The image boots as the single-host stack, serves the console and signs in the bootstrap admin | Passed |
| Tests pass on Postgres 16 and 18 | See the phase summary |

### Known gaps

- Rate limiting on sign-in uses the authentication library's in-memory limiter, which is per replica.
- No email, so no invitations or password reset. An admin sets an initial password.
- The console is not laid out for phones beyond stacking the navigation above the content.
- Audit retention is not enforced. The default is still an open question in the master spec.
- A tenant or workspace cannot be deleted. That waits for export in phase 5.

## Proposed deviations

None. Two points are interpretations, recorded above: roles and bindings above workspace level are not workspace resources, and invitations by email wait for a mail connector.
