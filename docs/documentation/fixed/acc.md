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

## Not done

- ACC-04 (wildcard picker in console and `@volvel/manifest`), ACC-05 and ACC-06 (binding keys in releases, rendered files): not started, out of budget in this lane.
- Console: Operators screen should show Disabled from `memberDisabled`; 409 copy from the guards is plain text from the server.

## Found

- Disabling a member now also refuses when they are the last admin of any tenant they belong to (new behaviour from the guard; say so in the docs for `PATCH /members/:id`).

## Lines for docs and changelog

- `PATCH /members/:id`, `DELETE /bindings/:id`, tenant member, group member and binding routes, releases and SCIM answer 409 when they would take the last tenant admin or the last operator.
- New command `recover-operator <email>`.
- A service account's key is refused on routes about a person's own account.
- No migration. No schema or contract change except `GET /bindings` `memberDisabled` (API only).

## Screens to walk

Operators (instance), Members, Groups, Approval toggle in Access, release decision. Polish gate answers for those are not given: no browser walk was run.
