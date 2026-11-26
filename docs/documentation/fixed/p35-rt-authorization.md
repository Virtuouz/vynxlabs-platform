# p35-rt-authorization: who may do what, found in the phase 35 red team

Four findings, each reproduced by a test that failed on the code as it was, then fixed in the shared piece.

## A3: a member's password link (RT-06-2)

**The hole.** With mail not configured, `POST /members/:id/password-link` answers with the link. An operator with no open access grant could set the password of any member of any tenant, a tenant admin included, and sign in as them. The tenant's log held nothing for the operator. A member with `member:write` could do the same to their tenant's admin through `POST /tenants/:t/members/:id/password-link`.

**Proof before.** `member-reset.test.ts`, "an operator with no open access grant is refused ..." got 201 where 404 was wanted; "under a grant ... the entry is in the tenant's log" found an empty log (the entry was written with no tenant on the instance route).

**Fix.** `kernel/member-reset.ts`, `makeMemberResetLink` (both routes use it; `routes/member-resets.ts` now passes the caller):
1. On the instance route an operator needs an open access grant (not revoked, not expired, operator still enabled) on every tenant the member belongs to; otherwise 404, as for any tenant they have no standing in. A member of no tenant needs none. A grant on every tenant, not on one, because the link opens the member's account in all of them.
2. On a tenant route the caller must hold, in that tenant, everything the member holds there (`explainAccess` on both, compared with `grants`). An operator under a grant on the tenant is let through, as the grant is that rule. A plain `member:write` holder is refused (403) for a tenant admin.
3. The audit entry is written once for each tenant the member belongs to, with that tenant's id; the entry names who made it.

The link is still returned when mail is off, as asked.

**Tests.** `member-reset.test.ts`, describe "who may make a member's password link (phase 35, A3)" (4 tests). One older test ("an admin of another tenant ...") asserted that an operator with no grant could make the link; it now opens grants first and asserts the refusal before them.

**Left.** The rule "holds at least what the member holds" is strict: a role with `member:write` alone cannot reset a viewer, who holds `*:read`. If that is too tight for the owner, the comparison can be limited to write permissions. Nothing sends the tenant's admins a notice of the entry.

## A4: who counts as writing a tenant's code (RT-11-3)

**The hole.** `hasOutsideCodeWriters` looked only for `code:write`. The built-in `deployer` role holds `bundle:write`, `deployment:write` and `promotion:write`, by which code reaches a worker, and not `code:write`.

**Found from the routes.** `code:write`: console code, repository pull (`routes/authoring.ts`, `routes/git.ts`). `bundle:write`: bundle upload and app assets (`routes/execution.ts`, `routes/apps.ts`). `deployment:write`: deploy, roll back, deploy of drafts, repository deploy (`routes/execution.ts`, `authoring.ts`, `git.ts`, `widgets.ts`). `promotion:write`: a promotion decision (`routes/execution.ts`, `git.ts`, `promotion-requests.ts`).

**Fix.** `kernel/execution/isolation.ts`: `CODE_PERMISSIONS` holds those four, and any binding in the tenant that grants one counts. **Test.** `execution.test.ts`, "anyone who can upload, deploy or promote code counts as writing it ... (A4)" (failed first on the deployer role; a viewer still counts for nothing).

**Left.** `deployment:write` or `bundle:write` alone are counted, though neither alone may ship new code by every path; this errs on the side of refusing a managed worker. The pool route (`routes/pools.ts`) and the supervisor both use the function, so both follow.

## B4: a role or binding written as a resource (RT-06-3)

**The hole.** A developer (`resource:write`) cannot make a role or binding by `POST /roles` or `/bindings`, but could write a `role` or `binding` resource, with the resource route, a draft, or the deploy of a draft, and so gave themselves `*:*`.

**Proof before.** `resource-grants.test.ts`: the `role` put returned 201, and the draft returned 200.

**Fix.** `kernel/pages/standing.ts`: `requireAccessKindStanding` asks `role:write` (tenant) for a `role` and `binding:write` (the workspace) for a `binding`. `requireStanding` calls it, so every door that already used it (draft save, restore, deploy of drafts, resource put) has it. The resource put and delete routes (`routes/workspaces.ts`) also ask it for the kind already at the path (a rename or replace, or a removal). **Tests.** `resource-grants.test.ts` (3 tests; a tenant admin still writes both).

**What the bindings and roles routes do today (C13).** `POST /tenants/:t/bindings` needs `binding:write` at the scope, and `insertBinding` checks the role is usable there, but never that the caller holds what the role gives. `POST/PATCH /tenants/:t/roles` need `role:write` and accept any permission list. So someone with `binding:write` alone can bind themself to `tenant_admin`; someone with `role:write` and `binding:write` can make and take `*:*`. I did not change these: holding `binding:write` is already the power to administer, and a "no more than you hold" rule changes who may do what (an operator under a viewer grant, an admin handing out the instance-wide wildcards, a service account). It is for the owner to decide. The resource route now has the same rule as those routes, no wider.

**Left.** Repository deploys and bundle deploys (`deployment:write`) carry `role` and `binding` resources and are not asked this: they are gated by code review (decision D25). A deployer who may upload a bundle can therefore still write a role. The `binding:write` needed is at the workspace even for a binding to one resource; the own route asks at the resource.

## B5: operator access recorded for every route (RT-06-1, RT-07-1)

**The hole.** `ctx.authorize` writes an `operator.access` entry when the decision came through an access grant. `ctx.allowed` and `ctx.allowedMany` did not, so routes deciding with them read a tenant for an operator with no entry.

**Proof before.** `operator-access-audit.test.ts`: under a viewer grant, `rows` (authorize) left one entry; `resource-files`, `drafts`, `docs`, `search`, `queries/visual`, `queries/schema` left none. (The lane's own proofs did not run as written: wrong setup.)

**Fix.** `kernel/http.ts`: the entry is written by one private method, `RequestContext.#noteOperatorAccess`, which `authorize`, `allowed` and `allowedMany` all call. One entry for each grant and tenant in a request (`allowedMany` over a list writes one, not one for each row). `authorize` used to key on the grant alone; it now keys on the grant and the tenant.

**Routes found without an entry** (read in the test): `GET .../resource-files`, `.../drafts`, `.../docs`, `/tenants/:t/search`, `.../queries/visual`, `.../queries/schema`. By the same cause, every route that decides only with `ctx.allowed` / `allowedMany`: those in `routes/` terms, search, permissions, promotion-requests, authoring, dashboards, summary, operations, flows, widget-data, stream, widget-choices, workspaces, execution, docs, data, widgets, queries, interfaces, access-releases, apps, tenants, and `kernel/pages/locate.ts`, `act.ts`, `kernel/flows/approvers.ts`. They are covered now by the shared method; only the six above were measured.

**Left.** Three places call `check()` directly and so still write nothing: `kernel/data/files.ts` `callerOf` (a script acting for a person), `routes/mcp.ts` (a service account's tools, never an operator), and `routes/queries.ts` `standing` (followed by `ctx.allowed` calls that now record). A route that is allowed through a grant and only asks a question for a screen's buttons (`canPromote` and the like) now also writes the entry; that is the stated rule, and noisier for an operator.

## Round two

A reviewer broke the fix for A3 (the member's password link), and the break was real.

### A3 again: the caller's workspace roles counted across the whole tenant (high)

**The hole.** `mayMakeLinkFor` (`kernel/member-reset.ts`) compared two flat lists of permissions from `explainAccess`, which returns tenant, workspace and resource bindings alike. A member with `member:write` at the tenant and an admin binding on one workspace "held" everything the tenant admin holds, and got a link for the tenant admin (201).

**Proof before.** `member-reset.test.ts` "a role held only in one workspace does not count as held across the tenant": the member's request for the tenant admin's link answered 201 with the url.

**Fix.** The comparison is by where a binding applies. What the target holds at the tenant must be held by the caller at the tenant. What the target holds in one workspace may be held at the tenant or in that same workspace. What the target holds on one resource may be held at the tenant, in the resource's workspace, or on that resource.

**Test.** The same test: the reviewer's case is refused (403), a tenant admin still makes a link for a workspace admin, and a member whose workspace binding is `tenant_admin` in that workspace may make one for that workspace's admin (201). Commit `4d4043c8`.

**Checked for the same mistake.** `explainAccess` is read in the console's "who can do what" screens (display only) and here. No other place compares two principals' permissions.

**Left.** Nothing.

## Round three: what may be granted

The owner decided two rules. Both are built, each with tests that failed first (`apps/control-plane/src/grant-limits.test.ts`, 16 tests; with the fix out, 11 of the first 13 failed with the hole open, and the access-change, promotion and clone tests failed with the deploy and release checks taken out).

### Rule 1: nobody grants what they do not hold

**The hole.** `POST /tenants/:t/bindings` checked `binding:write` and that the role may be used at the scope; the roles routes took any list of permissions. A custom role of `binding:write` alone could bind its holder to `tenant_admin`; a role of `role:write` alone could write a role of `*:*`.

**The rule.** A binding may give only a role whose every permission the caller holds at that scope (the tenant, the workspace or the resource, or wider). A role may be written, or changed, only to hold what the caller holds there: a change is held to what it adds, so taking a permission away asks no more than before. An operator acting under an access grant holds what the grant's role holds. A wildcard counts as what it covers (`grants`): `binding:*` covers `binding:write`, and `binding:write` does not cover `binding:*`.

**The one comparison.** `holdingsIn` in `kernel/authorize.ts` reads what a principal holds with `explainAccess` and `reaches` (the rows `check()` reads, so an operator's grant counts and a suspended member holds nothing) and answers, for a list of permissions at a place, which is the first not held, using `grants`. `requireToGive` and `refusedToGive` throw the 403, which names that permission. `kernel/grant-limits.ts` holds the other ways it is asked: of what a group or service account is given (`requireToHandOver`), of a role by id (`requireToGiveRole`), and of roles and bindings written as workspace resources (`requireToGiveByResources`). `mayMakeLinkFor` in `kernel/member-reset.ts` was read and not edited: it compares two people, not a caller with a list, so it keeps its own comparison.

**Every door found, and what each does now.**

| Door | Now |
| --- | --- |
| `POST /tenants/:t/bindings` for a person, or at one resource | `insertBinding` asks `requireToGive` for the role at that scope |
| the same, for a group or a service account (an access change) | `releaseAccess` asks (below) |
| `POST /tenants/:t/members` with `bindings` | `insertBinding`, as the caller |
| tenant creation, the operator's first administrator | `insertBinding` as the system: nothing is held yet; unchanged |
| roles routes (`POST`, `PATCH`, `DELETE`), which are access changes | `releaseAccess`: a role put is held to what it adds; delete asks no more |
| access changes from a repository (`/access/releases`, `/access/plan`, rollback) | `releaseAccess` asks of the asker, before the change waits or applies |
| the decision on a waiting access change | `decideRelease` asks of the one who approves, for what it gives |
| a group's sign-in values (group PATCH, repository) | held to what the group is given; only values added are asked |
| `PUT /groups/:g/members/:id` | `requireToHandOver`: the caller holds what the group is given, at each place. Decided from the code: a group is bound to roles, so joining it is the same grant |
| `PUT /end-user-groups/:g/members/:id` | the same |
| `POST /service-accounts/:id/api-keys` | the same: a key acts as the account |
| a member's own key (`POST /api-keys`) | unchanged: it acts as themselves |
| identity provider default role (create, change) | `requireToGiveRole`, after `binding:write` |
| identity provider group mapping (`PUT .../group-maps`) | `requireToHandOver` for each group mapped, after `binding:write` if any holds a role |
| resource `PUT`, draft save, restore and draft deploy of kinds `role` and `binding` | `requireStanding` now also asks `requireToGiveByResources` with the body, after the `role:write` and `binding:write` it already asked |
| SCIM | no door: a directory pushes people and groups; it cannot set a role |
| MCP tools | no door: the tools are the workspace's own scripts and flows; none gives access |
| operator access grants | no door for a tenant member: opening one needs `access_grant:write` on the instance |
| `POST /bindings` for the operator role | operators only; unchanged |
| tenant import | operator only; left as asked |

### Rule 2: a deploy that changes who holds what needs the permission to say so

**The hole.** A deploy (`deployment:write`, the built-in `deployer` role) may carry `role` and `binding` resources, and a reviewer proved that a deployer so gave itself `*:*` in its workspace (chain 3 of the review). A repository deploy was said to be code review's to gate (decision D25); nothing gated it.

**The rule.** A deploy whose result differs from what the workspace has in any `role` or `binding` resource (added, changed or removed) needs `role:write` or `binding:write` there, and is held to rule 1 for what it adds or changes. A deploy that leaves them as they are needs only what it needed.

**The fix.** One check in `deployBundle` (`kernel/execution/deploy.ts`), after the bundle is matched to what is deployed: `requireToChangeAccessByDeploy` (`kernel/grant-limits.ts`). Every way a bundle becomes the deployed one goes through `deployBundle`, so each is covered: a deployment, a promotion (the decision on a promotion request, and a direct promotion, compare with the target workspace), a rollback (a deploy of an earlier bundle), a deploy of drafts, a pull (the puller's standing), and a clone. A clone also copies the roles and bindings the console made in the source, outside any bundle, and is checked for those too (`kernel/tenancy/clone.ts`). The previews run the same code and show the refusal. A git-synced folder does not deploy by itself: a pull is made by a person and deploys with their standing. Tenant import is operator only and is left. The refusal is 403 and says which resource (kind and path) and which permission.

**Questions for the owner** (not decided here).

1. **An administrator cannot give a permission that is given only by its own name.** `tenant_admin` holds `*:*` and `sql:read`, and `*:*` does not give an explicit permission (`grants`). So nobody can now write `workspace_production:*` into a role, or bind a role that has it, through the API: nobody holds it. The existing test "deleting a production workspace" did exactly that as a tenant administrator. I kept the rule as stated and changed that test to write the two roles and their bindings straight into the tables, with a comment. The choice is the owner's: let a holder of `*:*` give explicit permissions too, give `tenant_admin` the explicit permissions by a migration (the next free number is 0104), or leave it.
2. **`workspace_admin` can no longer give `viewer`, `developer` or `deployer`**: it lacks `*:read`, and for the others `bundle:*` or `secret:write`. It still gives itself, `agent_runner`, `portal_user`, `portal_reader`, `doc_writer` and `app_maintainer`. A workspace administrator who gave someone `viewer` can no longer. `tenant_admin` loses nothing (it holds all of them). `developer`, `deployer` and `viewer` do nothing here that they did. Giving `workspace_admin` `*:read` is a migration and a decision.
3. **The repository deploy of the Fernhill example** carries roles and bindings, so Devi (deployer) cannot make the first deploy. `examples/fernhill/setup/setup.mjs` now has Maya (tenant admin) make it, and the README says so; Devi's step 9 (a change to a script) leaves access as it is and still works. The seed was not run here (it needs a running instance); the control-plane tests that deploy bundles were.
4. A binding to one resource in a deploy is held at the workspace, the wider place: someone who holds a role only on that resource cannot deploy it.
5. The browser suite was not run, as the brief says. A spec in which a deployer ships roles or bindings needs the same change as Fernhill.
