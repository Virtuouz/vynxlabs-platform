# Fixed by lane acc

Test file for every row below: `apps/control-plane/src/access-guards.test.ts` (it failed, for the reasons the rows give, against the code before the commit). `kernel.test.ts` changed twice: its anonymous-binding test now uses an app-facing permission (`data:read`, ACC-01), and `GET /me` accepts a service account's key.

## Shared pieces

- `apps/control-plane/src/kernel/administer.ts`: `keepingAnAdmin(trx, tenant, change)` and `keepingAnOperator(trx, change)` (lock, count before, run, count after, 409 when the last one went), `tenantHolders` (enabled, unsuspended, direct or through a group), `operators`, `isOperator`, `operatorsAmong`, `endSessions(trx, member, scope)`, `endOperatorGrantsIfNoLonger`.
- `kernel/members.ts` `setMemberDisabled`: the one disable, used by `PATCH /members/:id` and by SCIM.
- `kernel/endusers.ts` `endUnusedTokens`.

## Done

- **ACC-01 (D8)**: `kernel/authorize.ts` `check()` counts an `anonymous` binding only for app-facing kinds, whoever calls; `routes/permissions.ts` `insertBinding` and `bindingHook` refuse anyone / end users / end user (group) with a role holding nothing app-facing. Test: "a viewer given to anyone ...", "a role that gives nothing an app uses ...". Siblings: `explainAccess` still lists such a binding as counting (left out: it takes no permission to judge by).
- **ACC-02, INS-03**: `check()` and `explainAccess` count an operator's grant only while the holder is an enabled `operator_admin`; `DELETE /bindings/:id` and disable revoke open grants, audited in each tenant. Test: "removing the binding ends the open grant ...".
- **ACC-03, INS-02, GOV-10**: `appPrincipal` reads `disabled_at`; `endSessions` ends console sessions, app sessions and hand-offs, used by disable, SCIM, suspend and removing a member from a tenant. Test: "their sign-in to a tenant's apps ends ...". Left: pending single sign-on codes and open event streams (INS-02 names them) are not looked at.
- **ACC-07**: `endUnusedTokens` on setting or changing a password, on disabling (route and SCIM). Test: "an invitation does not set a password after a reset was used".
- **ACC-08 (D9)**: `decideRelease` refuses approve and decline from anyone but a member. Left out: a release a service account asked for can still be approved by the member who made its key; the key has no recorded maker, so closing it needs a column (not done).
- **ACC-09, ACC-10, INS-04, GOV-04**: guards at suspend, remove member, remove from group, binding delete, every release step (so group, role, service account and binding changes through releases and deploys), member disable, instance binding delete, and every SCIM push (409, shows under refused pushes). Approval count uses `tenantHolders(..., "access:write")`. `POST /bindings` refuses a disabled or unknown member. `GET /bindings` gains `memberDisabled`. Tests: the "last person who can administer" and "instance keeps an operator" describes, including two requests at once.
- **INS-07 (D7)**: `isOperator`/`operatorsAmong` in `execution/isolation.ts` and `sso/people.ts`; `POST /bindings` takes only `operator_admin`.
- **D3**: `node dist/main.js recover-operator <email>` (`kernel/bootstrap.ts` `recoverOperator`): enables, binds `operator_admin`, ends sessions, prints a new password once, audited as `operator.recovered`. Test: "a command run on the machine ...".
- **API-19 (D14)**: `signed-in` routes refuse a service account's key unless declared `access.signedInOrKey` (now `GET /me` and the batch route). Test: "a route about a person's own account refuses a service account's key".

## Later commits in this lane

- **ACC-08, other half**: migration `0086_acc_key_makers.sql` adds `api_key.created_by` and `tenant_release.asked_through` (no reference: the member may be gone). `releases.ts` `keyMaker` records who made the key a change was asked with; `decideRelease` treats that person as the asker (409 `own_release`). Test: "whoever made the key a change was asked with does not approve it".
- **Disabling at the instance is not refused for a tenant's sake** (owner's correction): `setMemberDisabled` keeps only the last-operator guard. `PATCH /members/:id` answers `tenantsWithoutAdmin: [{id, name}]`, the `member.disabled` audit entry carries the same, and the console (`screens/Instance.tsx`) says it in the confirmation and again by name after. Tenant-level changes (suspend, remove, unbind, a tenant provider's push, releases) still refuse; an instance provider's push is guarded for the last operator only. Tests: "it is allowed, and the answer and the audit entry name the tenants".
- **INS-02 rest**: `endSessions` also deletes unfinished `sso_state` rows of the person and closes their open event streams (`endStreamsOf`, this replica only; other replicas' streams end at their next reconnect, as `stream.ts` already says rights are read once). Test: "their open event streams and unfinished sign-ins end with it".
- **`explainAccess`** (`routes/access.ts`): a binding to anyone is listed as the source of app-facing permissions only. Test: "the explanation of someone's access does not credit ...".
- **ACC-05, ACC-06**: `withUniqueBindingKeys` in `kernel/tenant/releases.ts` gives each binding a key that nobody else has (a short hash of what it gives to whom is added where two would share a name or one was cut at 63); `rollbackAsks` reads a stored snapshot by identity and re-keys it. Test: "removing one binding does not remove another ...". Siblings looked at: `previewSteps`, `allowDelete`, `put-absent` (all read the keys of `currentAccess`, now unique); the CLI `pull` (`packages/cli/src/access.ts`) writes what `GET /access` returns, so it needs no change; `renderTenantFiles` unchanged. Pulled file names for a binding whose name was shared or cut change once.
- **ACC-04**: `grants`, `setPermission`, `setEveryone` in `@volvel/manifest` (`permissions.ts`); the control plane's `grants` is now the manifest's. The console picker, Summary, "In short" and `Access.tsx` use them: a wildcard never gives an explicit permission, taking a box away writes a wildcard out as only what it gave, "Read/Change everything" touches only its own wildcard, kinds only the instance checks are not offered. Tests: `packages/manifest/src/permissions.test.ts`, `apps/console/src/Roles.test.tsx`.

## Verified failing first

The GOV-04 and D3 tests, and every test in `access-guards.test.ts`, were run in a detached worktree at 8d4fa3e (removed after) and failed for the rows' reasons: GOV-04 answered 201 where 409 is wanted; D3 `recoverOperator is not a function`; the two-at-once removal answered 204 and 204.

## Not done

- Pending single sign-on codes of an *end user* are not touched (only a member's).
- Streams on other replicas.

## Found

- Disabling a member used to leave their pending sign-in codes and event streams; fixed here (INS-02).

## Lines for docs and changelog

- `PATCH /members/:id` answers `tenantsWithoutAdmin`; an operator disable is never refused for a tenant, only for the last operator.
- Tenant-level removals, suspensions, unbinds, releases and a tenant provider's push answer 409 when they would take the last person who can change the tenant's access.
- New command `node dist/main.js recover-operator <email>`.
- A service account's key is refused on routes about a person's own account (`GET /me` and batch excepted).
- Migration `0086_acc_key_makers.sql` (integrator renumbers and locks).
- A role's `*` never gives an explicit permission, and the role editor no longer writes one in.

## Polish gate (what people see)

Screens to walk, at 1440, 768 and 390 px, light and dark, by keyboard, with a reload, on a Fernhill instance: Instance > Members (disable confirm and the notice after), Instance > Operators, Roles (picker, inspector "In short", Summary column), Access (a person's permissions), tenant Members and Groups when a removal is refused, the approval switch in Access. **No browser walk has been run in this lane**, so none of the answers below is confirmed by a walk.

- **States.** Disable confirm: the text now says a tenant left without an admin is named afterward; after: a success notice listing tenant names (long lists wrap, no truncation). Refusals from the guards are plain 409 messages shown by the existing error notice; each says what is missing and who can give it ("Give someone else the tenant admin role first", "Make someone else an operator first"). The Operators list still does not show Disabled (`memberDisabled` is served, the screen is not changed): left, see below.
- **Lifecycle.** Disable ends sessions, grants, streams and pending codes; enable does not bring them back; the way back for a lost operator is the command. Removing an operator ends their open grants.
- **Keyboard.** Role picker boxes are unchanged (native checkboxes in a fieldset); no new control was added.
- **Copy.** American spelling, "flow" not used, no banned words; the wildcard copy now says "except what is given by name".
- **Left**: the Operators screen showing Disabled; the approval switch shows the server's 409 text only.
