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

## Round three: planted accounts

An account (`member`) is one for each email on the whole instance. A tenant admin who adds a member may set the account's password, so an admin of tenant A could make an account for someone else's email, sign in as it, make an API key and recovery codes, remove it from A, and wait. When tenant B (or the operator) later added that email, the old key, codes and password acted there. A reset by link ended the console session but not the key or the codes, and a recovery code with the password got round an enforced single sign-on. The owner decided three changes.

### 1. A reset and the first single sign-on tie end what could sign in before

**Proof before.** `planted-accounts.test.ts`: after a reset by link the planted key still answered 200 (wanted 401); after an operator recovery the operator's old key still answered 200; after the first tie to a provider the session, key and codes were all still there; a person changing their own password left their other sessions alive.

**How keys are modelled.** `api_key.owner_type` is `member` or `service_account`. A member's key acts as the account itself, in every tenant it belongs to. A service account belongs to one tenant (`service_account.tenant_id`) and its keys are the tenant's, not a person's. Only the first kind is ended; service accounts' keys are left alone. The product has no passkeys or other second factors (the authentication library runs with only email and password; recovery codes are the one extra way in), so there was nothing else to end.

**Fix.** One function, `kernel/sign-ins.ts` `endEarlierSignIns`: ends every session (console and apps, and open streams, through `endSessions`), revokes the account's personal keys, deletes its recovery codes, optionally deletes the password, and writes `member.sign_ins_ended` in the log of each tenant the account belongs to (reason, how many keys and codes). Used by:
- the member reset by link (`setMemberPasswordWithToken`), reason `password_reset`;
- the operator's recovery command (`recoverOperator`), reason `operator_recovered`;
- the first tie of an existing account to a single sign-on identity, by a person's sign-in (`resolvePerson`) or by a directory push (`scim.ts` `tie`), through `endSignInsOnFirstTie`, reason `single_sign_on_tie`. "First" is when the account has no other identity link. The password is deleted too where a required provider covers the account's email (`memberPasswordRefusedBy`; an operator keeps theirs, as everywhere); where the provider is not required the password stays beside single sign-on.
- the library's own reset (`/request-password-reset`, `/reset-password`) is not offered (no mail sender is given to it, so it refuses); a test says so. Nothing was needed there.
- an account changing its own password while signed in (`/change-password`, `kernel/auth.ts`): the current session stays and every other one ends, the console's and the apps'. Keys and recovery codes stay, since the person is signed in and can list and revoke them. I think this is right: ending the keys would break their scripts for a change they chose to make. If the owner wants codes ended there too, it is one call to `endEarlierSignIns`.

**Tests.** `planted-accounts.test.ts`, the first two describes. Existing tests that relied on a session or key surviving a first tie were changed to sign in again or make a new key (`sso.test.ts` three places, `scim.test.ts` one); they asserted the old behaviour, not a requirement.

**To look at twice.** An operator's own first tie to the instance's provider ends their sessions, including the one doing the setup. A person tied by a push from a directory loses their sessions and keys at the moment of the push, not at their next sign-in.

### 2. An account that loses its last membership keeps nothing that can sign in

**Proof before.** The planted account, removed from A, still signed in, kept its key and codes, and acted in B as soon as B added the email.

**Fix.** `kernel/sign-ins.ts` `stripIfNoMembership`: when an account belongs to no tenant and holds nothing at the instance (any instance binding, which is wider than "operator" and so never strips an account that runs or is meant to run the instance), it ends sessions, personal keys and recovery codes and deletes the password, and writes the entry. The account row is kept: no route deletes an account anywhere in the product (a directory only turns it off, and tenant deletion keeps accounts), so deleting would have been new. The next tenant to add the email starts from an account nobody can sign in to until its owner chooses a password by a link (`makeMemberResetLink` already inserts the password row when there is none).

**Covered.** The members route (`DELETE /tenants/:t/members/:id`, entry in the tenant it left) and tenant deletion (`deleteTenant`, for each member of the tenant; the tenant has no log any more, so the entries are the instance's).

**Not applicable, read in the code.** SCIM: a directory's removal only suspends the person in the tenant and ties off the link (`deleteScimUser`); it never deletes `tenant_member`, so no membership ends there. An import never removes memberships: it makes a new tenant and matches or makes accounts. A suspended member still belongs to the tenant and is not stripped.

**Tests.** `planted-accounts.test.ts`, third describe (route, one who belongs elsewhere and an operator keep theirs, tenant deletion). Existing tests changed because they asserted the old state: `kernel.test.ts` (a removed member can still sign in, then is added back: now they choose a password by a link), `environments.test.ts` (a deleted tenant's member could still sign in), `portability.test.ts` (a tenant deleted and imported back found the account with its password).

### 3. The stricter link rule only where the link is handed back

**Confirmed from the code.** `routes/member-resets.ts` `deliver` returned `url: null` only when the mail was sent. With mail set up but the send failing (`Mailer.send` returns false), the link came back in the answer. That is fixed first: with mail set up, a failed send now answers 503 `unavailable` and the link is in no answer. The link is made but unseen and runs out in two hours.

**Fix.** `makeMemberResetLink` takes `returnsLink` (the routes pass `!kernel.mail.configured`). `mayMakeLinkFor` runs the "holds what the member holds" comparison only when the link is handed back. With mail set up `member:write` is enough in a tenant. Unchanged in both cases: the tenant-only rule (a member of two tenants, or of the instance, is for an operator), an operator's need for an open access grant on every tenant of the member, and the audit entry in each tenant.

**Tests.** `planted-accounts.test.ts`, the fourth describe: no mail, a member manager is refused (403) for a tenant admin; mail on, the same caller gets 201 with no link in the answer and the mail goes to the member; mail on but failing, 503 and no link.

### The reviewer's proofs, as tests

`planted-accounts.test.ts`, last describe. With the planter removed from A (so its last membership is gone): B adds the email, and the planted session, key, password, and password plus recovery code all fail in B; B's admin makes the link and the owner's own password works, the old key still does not. The same account made an operator by the instance holds nothing from before (401 on session and key, password refused).

### What still works

The chain is closed where the planter's account ends up with no membership. It is **not** closed where the planter keeps the account as a member of A (never removes it) and B adds the same email: the planter's password, session and key then act in B as before (tested by hand: session 200, key 200 in B; B's admin cannot make a link because the account belongs to two tenants, 409, so B cannot clear it, only an operator with a grant on both). Closing that means stopping a tenant admin from choosing a password for an email that no one else has proved, which is the first question in the reviewer's report (the create-member password) and is for the owner. The same holds for P2 when the squatter stays in A and the operator binds the account `operator_admin`: nothing ends until a reset by link. Also not covered: a tenant import creates accounts with the password hash from the archive.

No migration was needed (next free number is still 0104). One audit action was added, `member.sign_ins_ended` (`packages/manifest/src/audit.ts`).

## Round four: an account nobody has proved starts again when it gains a place

**The hole** (the one left open at the end of round three). An admin of tenant A makes an account for someone else's address with a password of their own and keeps it in A. Tenant B later adds the address, or the operator binds it at the instance. The admin of A signs in with the password they chose and acts in B with what B gave. B's admin could not clear it: a link for an account of two tenants was refused.

**The owner's rule.** A person's own recovery codes, keys and password are never taken from them just because another tenant adds them. So the rule applies only to an account its owner has never proved.

**Proof before.** `planted-accounts.test.ts`, describe "an account nobody has proved starts again when it gains a place (round four)": with the maker keeping the account in A and B adding it, the maker's session, key, password and recovery code all still answered in A and B (200, wanted 401); the same when the operator bound the account at the instance; the same when a directory (SCIM) added it; and B's admin got 409 for a password link. Five of the new tests failed before the change.

### 1. How "proved" is recorded

`member.proved_at` (migration 0105, with a comment saying what it means; null is "nobody has proved it"). Set by `markProved` in `kernel/sign-ins.ts`, only:
- when a member's password is set through a link that was **mailed** to the account's address (`member_password_token.mailed`, set when the link is made without being handed back; `setMemberPasswordWithToken` reads it);
- when the person signs in through single sign-on and the email's domain is one the provider has proved (`resolvePerson`, before the tenant is joined, so that joining ends nothing of theirs);
- for the first operator (`bootstrapAdmin`) and for an operator recovered on the machine (`recoverOperator`): whoever runs the command holds the instance;
- in the migration, for accounts that already belong to two or more tenants, hold access at the instance, or are tied to a single sign-on identity. Nothing is ended by the migration; every other existing account stays not proved and is ended only if it later gains a place.

Never set by an admin typing a password, by a tenant import (with or without `keepSignIns`), by a push from a directory (a push is not the person signing in), or by a link that came back to the caller.

**The link that came back to the caller.** Where no mail is set up the link is in the answer, so whoever asked for it can use it. I read that as proving nothing about the owner, as the safe reading says. A link sent by mail goes to the address and the caller never sees it, so it does. Where mail is set up but the send fails, the route answers 503 and the link is seen by nobody (round three), so no unmailed link exists there.

### 2. The doors, and what each does

The rule is `startOverIfUnproved` (`kernel/sign-ins.ts`), called after the place is added with "had a place" read before. If the account is proved: nothing. If not, and it already had a place elsewhere (a tenant or the instance) or holds a session, personal key or recovery code: `endEarlierSignIns` with the password (reason `gained_a_place`), an entry `member.sign_ins_ended` in each tenant it belongs to, and it stays not proved.

| Door | Now |
|---|---|
| `POST /tenants/:t/members` for an account already here | the rule. An account made by that same request is not touched |
| the same route for the same tenant again, or a role / suspend change in the tenant | no new place: nothing ends (the second add is refused as before) |
| SCIM push of an existing account (`createScimUser`) | the rule. A push that creates the account has nothing to end |
| a single sign-on sign-in that adds the person to a tenant (`ensureTenantMember`) | the sign-in proves the account first (the domain is proved), so nothing ends; where the provider's domain is not the person's, the rule runs |
| tenant import, accounts matched to ones already here (`kernel/tenancy/import.ts`) | the rule, after the archive's rows are loaded. Accounts the import creates have no password, or the archive's with `keepSignIns`, and are not proved |
| `POST /bindings` (instance access) | the rule |
| `bootstrapAdmin`, `recoverOperator` | the account is proved |
| tenant creation (the caller becomes its first member) | not a door: the person acts for themselves |
| a repository or release changing access | not a door: bindings name groups and service accounts, never a person, and a person must already belong to the tenant |
| a group's members, a role given in a tenant | not a door: the person must already belong to the tenant |

The one place I did not follow the sentence "has anything that can sign in" to the letter: a **password alone**, on an account with **no place anywhere**, does not count. That is what an operator leaves when they make an account at the instance (`POST /members`) and then bind it as an operator; ending the password they just typed would break making an operator, which the console offers. A tenant's admin cannot make such an account (a tenant route gives it a place, and losing the last place deletes the password in round three), so the maker of a planted account is never in that state. Any session, key or code on it, or any other place, does count.

### 3. The second tenant's admin is not stuck

`makeMemberResetLink`: the refusal for an account of more than one tenant is kept for proved accounts, for an account that holds access at the instance, and for a link that would be handed back to the caller. For an account nobody has proved, where the link is mailed (not returned), an admin of either tenant may make it, with the existing rules unchanged (`member:write`; an operator needs a grant on each tenant of the account). Where the link would be handed back the account of several tenants is still for an operator, since the caller could sign in with it in tenants they do not run.

### 4. Imports

Said in tests only (`an account an import creates is not proved...`): the imported account has `proved_at` null, with and without `keepSignIns`. `import.ts` was changed only to apply the rule at the door above (the accounts it attaches).

### 5. Tests

`planted-accounts.test.ts`: the remaining chain (maker keeps the account; B adds; nothing of the maker's acts in A or B; B's admin makes a mailed link; the owner signs in and is proved); the maker making a link for it while mail is off and using it does not prove it, and B's add then ends the maker's password; the operator-binding variant; a proved person added to a second tenant keeps session, password, API key and recovery codes; a proved account added by SCIM and by import is untouched, and an unproved one added by SCIM or import starts again; an unproved account changed within its own tenant is untouched; the migration's update leaves multi-tenant accounts and operators proved and a single-tenant account not.

Existing tests that encoded the old state, changed by marking the account's owner as having proved it (`proved_at` set in the test's set-up, with a comment): `planted-accounts.test.ts` (three, an account of two tenants and an operator added to a tenant), `portability.test.ts` (Bob, the person who already has an account on the instance an archive is imported into).

### What is left, said plainly

No step of the chain works in any variant I could build:
- **The maker proves the account themselves with no mail**: the link comes back to them, so it proves nothing; they set a password, and B's add (or the operator's binding) still ends it (tested).
- **With mail on**: the link goes to the real owner's address, which the maker does not hold. The maker cannot change the account's address: no route or setting changes a member's email (the library's change-email is off; a SCIM push never changes a member's email; the members route only suspends). Mail is not readable through the product. An admin of A who also controls the mailbox of the address is the owner for this purpose.
- **A tenant admin whose own directory is tied to the address** (single sign-on from a proved domain): that is the owner by the rule, as in round three.
- **An account that is proved stays reachable by whoever also holds its address or its provider**: that is the meaning of proof, and a provider's domain is already a stated non-goal in `SECURITY.md`.
- **Accounts that existed before and were never proved** (one tenant, a password typed by an admin, never replaced) are not marked by the migration: the migration cannot tell a person who chose their own password from one who did not. They lose their sign-ins only when they next gain a place. If the owner wants those marked, it is a decision.
- A person who knows the password an admin typed for them and is then added to a second tenant is signed out and must use a link once. That is the rule as given.

**To look at twice.** The exception for a password alone on an account with no place (above). The `endEarlierSignIns` call in the import runs inside the import's transaction, after the rows are loaded.
