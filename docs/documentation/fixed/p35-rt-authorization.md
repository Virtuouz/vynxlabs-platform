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
