# Fixed by lane t3-access (tier 3, tenant access screens and CLI access)

Tests: `apps/control-plane/src/access-t3.test.ts` (server, 4), `apps/console/src/AccessT3.test.tsx` (console, 15), `packages/cli/src/access.test.ts` (one test added, one changed), `AccessReleases.test.tsx` (ACC-37 line, MP14), `Groups.test.tsx` (now answers the confirm). The server tests and every console test were seen failing on the code before (by `git apply -R` of the fix) except where noted. No migration. The phase branch was merged in at the start and again at the end.

## Done (commit in `git log`, by row id)

- **ACC-17** `releases.ts` `releaseAccess`: a partial release with no steps records no release, answers `{id: "", number: 0, status: "applied"}`, audits `access.unchanged`. `permissions.ts` `insertBinding` finds a binding already given and answers its id (audit `binding.unchanged`). Test "ACC-17". Siblings: every `releaseOne` caller (group and role changes to the same values now also record nothing).
- **ACC-22** `packages/manifest/src/tenant.ts` `checkTenantResources(..., held)`: a role keeps a permission it already holds even when retired; only an added one is checked. Test "ACC-22".
- **ACC-23** `ask.tsx` `isWaiting`, `noteWaiting`: a toast "Waits for approval" that leads to `/t/<t>/releases`; `notify.error` uses it, so every row action is covered. `CreateDialog` (`ListScreen.tsx`), `GiveAccess`, `Roles` dialog, `OfferToAgent`, `Apps` share dialog close on it. Test "ACC-23". Not changed: dialogs not about access.
- **ACC-32 + ACC-MP7** `Members.tsx` `RolePairs`: a custom form field (`FormField.custom`, new in `ListScreen.tsx`); "Where they work" is asked only with a role; up to 20 roles (`bindings`).
- **ACC-33** `Groups.tsx` `AttributesDialog`: names trimmed, a repeat is named at its field and nothing is sent.
- **ACC-34** group "Take out" asks first (the end-user disable already asked, acc2).
- **ACC-MP8** member groups: description on create and "Describe" (shared `describeGroup`, also used by end-user groups).
- **ACC-MP9** service account page: Name editable, Key shown. **ACC-MP10** end user "Rename". **ACC-MP11** `AddressDialog` and a field on Invite: "On which address" (enabled domains; only asked when there are some). **ACC-MP12** `key` on end-user group routes and in the list, with an "Identity provider" tag.
- **ACC-MP13** `signInValues` on both group kinds (GET, POST, PATCH), changed through `releaseOne` keeping `membership.sso.values`; provider-made groups refuse (409). Console: "Filled by sign-in: ..." and "Sign-in values" button.
- **ACC-MP14** `?release=<id>` opens one release (changes and warnings); the number in the list is a button.
- **ACC-MP15/16** CLI: `tenant rollback` prints what it removes and asks (`Io.confirm`, set in `bin.ts` on a terminal) or needs `--yes`; `approve` and `decline` print the changes; `tenant approval [on|off]`. `commands.ts` lines updated.
- **ACC-MP19** `grantForm` Duration: "Other" and a minutes field, 1 to 1440, refused at the field.
- **ACC-MP5 + APP-MP2** `GiveAccess`: "What" (one thing in a workspace, sends `resourceId`) and Who "Anyone, without signing in" with only app-giving roles.
- **ACC-26 siblings** `OfferToAgent.tsx` and `Apps.tsx` compare role ids of the built-in role, not names.
- **ACC-27** a holder of `*:*` checking an explicit kind (`sql`, `workspace_production`) is told the wildcard does not give it.
- **ACC-37** the one line: going back makes a deleted service account again without keys.
- **Verified, already done**: ACC-MP6 (acc2 ACC-24, `WorkspaceAccess`, test "ACC-24 ... Workspace settings"); APP-MP4 (app lane APP-14, `broaderAccess`; `apps.test.ts`, `Interfaces.test.tsx`). **D57** done by acc2.

## Not done

- ACC-27's "others' operator grants": the cause is not clear from the row; left.
- ACC-38: documentation only (phases 30/31).
- `AgentAccess.test.tsx` expected the old `platform` settings entry (acc2 renamed it); fixed the test.

## Found

- Retired permissions in a role checked at `GET`: none seen. `FormField.custom` and `ListScreen.tsx` `CreateDialog` are shared: other lanes editing them will conflict.

## Lines for docs and changelog

- `GET/POST/PATCH` of groups and end-user groups carry `signInValues`; PATCH takes it. End-user groups carry `key`.
- Giving a role already given answers the existing binding (201), no release.
- CLI: `volvel tenant rollback <n> [--yes]`, `volvel tenant approval [on|off]`.

## Polish gate (what people see)

No browser walk was run in this lane; none of the answers is confirmed by a walk.
Screens to walk (1440, 768, 390; light, dark; keyboard; reload): Members and access (Members: Add member with several roles; Groups: Create, Describe, Sign-in values, Take out; End-user groups: key, Sign-in values; Roles; Releases with `?release=`), Give access sheet (What, Anyone), End users (Rename, link address), a service account Identity tab, an operator's Open operator access (Other).
States: loading/empty/refused as the shared pieces; the new fields have no loading of their own (domains, resources read quietly; a read refused shows the hint). Lifecycle: each new action has its reverse (Sign-in values empty clears, Describe empty clears, Rename again). Keyboard: all new controls are buttons or selects. Copy: plain, American.
