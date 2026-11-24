# Fixed: lane gov

Tests: `apps/control-plane/src/sso-governance.test.ts` (new), `apps/control-plane/src/portability.test.ts` (two tests added), `apps/console/src/SingleSignOn.test.tsx` (one assertion). One migration: `packages/db/migrations/0086_gov_governance.sql`, not locked. Every first failing test was seen failing for the reason in the row before the fix.

Refuted: none. Left: GOV-12 and D18 (see Left out).

## GOV-01, GOV-02, INS-05 (commit "a default role and a mapped group need the right to give them")
- `checkRole` (`kernel/sso/providers.ts`) refuses the instance's own role in a tenant and any default role on the instance's provider, with a 400 on `/defaultRoleId`. `giveRole` (`kernel/sso/people.ts`) gives nothing at the instance, and never `operator_admin`. The migration clears the roles saved before.
- `routes/sso.ts`: setting a default role on create or patch needs `binding:write` in the tenant (changed values only). `PUT group-maps` needs `group:write` (`end_user_group:write` for end users), and `binding:write` when a mapped group holds a binding. Emptying a mapping needs only `sso:write`.
- Test: "a default role must be one the editor may give...", "the instance's provider gives no role at all", "mapping a provider's group needs the right...".
- Siblings looked at: `insertBinding` (already refuses `operator_admin`), SCIM `createScimUser` (calls `giveRole`, now guarded), `applyPushedGroups` (makes only provider-managed groups, which hold no bindings after GOV-03), the console role picker (not shown for the instance).
- A person sees: a 403 naming `binding:write` or `group:write` instead of a silent grant.
- Screens to walk: Single sign-on, a provider's Settings, Default role and Group mapping, as a role with `sso:write` only (a 403 shows as the form's error).

## GOV-03
- `ensureLocalGroup` (`kernel/sso/scim.ts`) adopts only a group with `managed_by = 'provider'`. For another it maps nothing and writes a `scim_refusal` (resource Groups, status 409) that Provisioning, Refused pushes shows. Test: "a pushed group does not take over a group somebody made by hand". Siblings: end user groups share the function.
- Screens: Provisioning tab, Refused pushes.

## GOV-05, D6
- New columns `tenant_member.suspended_by`, `member.disabled_by`, `end_user.disabled_by` ('hand' or 'provider'); what was off is 'hand'. `setActive` (`scim.ts`) turns off as 'provider' and resumes only 'provider'. The hand routes (`routes/tenants.ts` members PATCH, `routes/identity.ts` members PATCH, `routes/endusers.ts` PATCH) write 'hand'. Tests: four in "what a person here turned off, a push does not turn on". Siblings: member, tenant member, end user, instance provider.
- Left out: the people-and-access routes of lane acc that also disable (it owns them); they must write `disabled_by`/`suspended_by = 'hand'` too.

## GOV-06, GOV-07, D10
- `updateProvider`: an OIDC issuer at another origin drops the stored secret unless a new one is sent (a provider that is on answers 409 `secret_needed`, nothing saved); same origin keeps it. The helper is `kernel/origin.ts` `sameOrigin`, for CFG-03 and DAT-03 to use. A changed OIDC issuer or SAML entity ID deletes the provider's `identity_link` rows and audits `identity_provider.links_removed`. Console: the provider's save asks first (`SingleSignOn.tsx`, "Change the issuer?"). Tests: "a changed issuer".

## GOV-08, D2
- `resolvePerson` and `createScimUser` refuse, for a tenant's provider, a member who holds any instance binding: reason `runs_instance` (audited as `sso.refused`; SignIn.tsx has words for it), SCIM 403. Test: "it neither signs them in nor pushes them".

## D12 (requiring)
- Turning `enforce` on ends the `member_session` rows of members in the provider's proved domains (not operators, not the caller) or the end users' `app_session` rows; the count is in the `identity_provider.enforced` audit entry. Sessions made by the provider itself cannot be told from password sessions and end too: those people sign in again with it. Off keeps pushes: said in the PATCH description and the Turn off confirmation. Test: "ends the password sessions...".
- Screens: Require it and Turn off confirmations.

## GOV-09, D5
- Export format 2 (`kernel/tenancy/export.ts`): `members.*.jsonl` carries `password_sealed` (tenant key, `secret:<tenant>:members:<member>`) and no `password_hash`; null for a member who also belongs to another tenant or holds an instance binding. Import reads formats 1 and 2 (`READABLE_FORMAT_VERSIONS`), opening the seal after the passphrase. `docs/contracts/tenant-export.md`, `docs/self-hosting.md` and the Export screen's words are updated. Tests: "members' passwords in an export".
- Shared with lane ins: `kernel/tenancy/import.ts` (the format check, the member insert).
- Left out: an imported member with no hash has no password until one is set (D4's reset link).
- Screens: Export.

## GOV-20
- Migration: `app_domain.hostname` unique only where `verified_at is not null or enabled`. `routes/apps.ts`: registering conflicts only with the same tenant's own or a held name; a check that proves it, or enabling it, answers 409 when another tenant holds it. Test: "a hostname that is not proved yet".

## Left out
- GOV-12 and D18 were not among my rows. Not done.

## Found
- None new beyond the above. Note: the existing "another tenant cannot take the name" step in `apps.test.ts` passes by a 400 for a missing workspace, not for the name.

## Changelog and docs lines
- Single sign-on: a default role needs the right to bind it; a provider of the instance gives no role; requiring ends open password sessions of those it covers; a changed issuer drops the client secret and the ties; a tenant's provider no longer signs in people who run the instance; a push no longer lifts what a person suspended.
- Tenant export is format 2: members' password hashes are sealed under the passphrase and left out for members who belong elsewhere. Format 1 still imports.
