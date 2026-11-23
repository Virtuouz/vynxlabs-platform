# Fixed by lane acc2 (tier 2, people and access)

Tests: `apps/control-plane/src/access-lane2.test.ts` (server, 14 tests), `apps/console/src/AccessLane2.test.tsx` and `apps/console/src/AccessReleases.test.tsx` (console). Every console test was seen failing against the screens before the commit (12 of 12 in `AccessLane2.test.tsx`; 4 of 12 in `AccessReleases.test.tsx`). Server tests were seen failing on the code before for ACC-11, 12, 13, 16, 18, 19, 20 and D57; ACC-14 and ACC-15 failed at their first assertion only (the later assertions of that test were not seen failing alone). `access-releases.test.ts` changed once: a release that was moved under is now `superseded`, not refused as stale (ACC-15). `Portal.test.tsx` changed once: disabling an end user now asks first.

Commits: `32427e39` (releases, bindings, limit, D57), `65e2c3ec` (server reads), `deb40f80` (releases screen), `eda02bb1` (the other screens), `1199e33d` (phone width of Releases).

## Shared pieces

- `kernel/tenant/releases.ts`: `currentAccess` leaves out workspace roles (ACC-12); `plan` takes the provider-made rows to compare with, never to delete (ACC-18); `providerManaged` now carries bodies; `supersede` marks waiting releases that can no longer apply (ACC-15); `rollbackAsks` leaves out what is gone and returns `warnings` (ACC-13); `ReleaseRequest.notes` become the release's warnings.
- `packages/manifest/src/tenant.ts`: `ACCESS_DESCRIPTION_MAX = 500`, used by the schema and by the four routes (ACC-20). Schemas re-emitted (`schemas/files/*`).
- `routes/identity.ts` `toMember`: optional `directRoles`, `groups`.
- `ListScreen.tsx` `RemoveButton`: `disabled` takes the reason, shown as the title (used by Groups; siblings with a Remove that could use it: not changed).
- `packages/ui/src/Toast.tsx`: toasts are centered from `md` up, so they no longer cover an inspector's buttons (shared by every screen; another lane that edits Toast.tsx will conflict).
- `GiveAccess` takes `inWorkspace`; `WorkspaceAccess` (new, in `Environments.tsx`) is the Access section of Workspace settings.

## Done

- **ACC-11** `releaseAccess` refuses a delete (or put-absent) of a provider-made group, service account or end-user group with the existing sentence (409), recording nothing. Console: Delete is off, with the reason, for a provider's group, in both group screens; Rename of an end-user group likewise (the end-user list now serves `managedBy`). Test: "ACC-11 ...", console "ACC-11 ...". Siblings: the group's Rename was already off.
- **ACC-12** `releases.ts` `currentAccess`: `r.workspace_id is null`. Test "ACC-12 ...": a full release, then going back, with a group holding a workspace role, answer 201 and keep the binding.
- **ACC-13** going back leaves out bindings whose workspace, role or group is gone; `GET .../rollback` answers `warnings`; the release records them; the dialog lists them. Test "ACC-13 ...".
- **ACC-14** both 202s (`POST /access/releases`, `.../rollback`) carry `waiting: true` and a `detail` naming the release; the console says it in a notice among the changes (not as success, not as a failure under the list). Tests: "ACC-14, ACC-15, ACC-16 ..." and console "going back that waits ...".
- **ACC-15** `supersede`: when a release applies, waiting ones whose base no longer matches become `superseded`, with a comment naming the release (audit `access.release_superseded`). The old `release_stale` refusal remains for a change that moved under it by another way.
- **ACC-16** `POST .../decision` and `GET .../releases` are `access.custom`: whoever asked (or whose key asked) withdraws with no permission, and without `access:read` reads the releases they asked. Answering still needs `access:write`. Console: the maker is shown Withdraw when they may only read. Tests as above.
- **ACC-18** put against provider-made rows: second release says `unchanged`, nothing is written. Test "ACC-18 ...".
- **ACC-19** migration `0090_acc2_binding_source_and_workspace_admin.sql`: the binding unique rule includes `source_resource_id`. Test "ACC-19 ..." (both orders). Siblings looked at: `insertBinding`, `OfferToAgent`, the Sharing dialog, `bindingHook`, `releases.ts` binding step: all find by `source_resource_id is null` already.
- **ACC-20** one limit, 500 (`ACCESS_DESCRIPTION_MAX`); the same migration widens `service_account.description`'s check. Test "ACC-20 ...": 400 characters made and changed for group, end-user group, service account, role, and in a release.
- **ACC-21** `failureText` in `AccessReleases`, `Roles` (dialog and field), `GiveAccess`; the role description field reads release refusals whose message begins `/body/description`. Console tests "a refusal names its cause", "ACC-24 ...".
- **ACC-24** `GET /roles` and `GET /principals` take `workspaceId` and need `binding:read` there. `GiveAccess` with `inWorkspace`; Workspace settings gets Access (list, give, remove). The sheet shows the reason a read was refused. `role:*` and `access:write` are dropped from `workspace_admin` (D57, same migration). Test "ACC-24 ...".
- **D57** `workspace_admin` gains `interface:*`, `doc:*`, `git:*`; loses `role:*` and `access:write`. Test "D57 ...". The console's Tenant screen shows role names only, no change.
- **ACC-25** `ChangePassword` panel on Account (calls `POST /auth/change-password`, signs other sessions out). Test "ACC-25 ...".
- **ACC-26** Roles: held-by and the disabled Delete go by `roleId`; a role from a workspace shows "In <workspace>" and "comes from a workspace's repository"; the link goes to `/access`. Siblings looked at and left: `OfferToAgent.tsx:92` and `Apps.tsx:239` match built-in role names (`agent_runner`, `portal_*`) that a tenant cannot reuse, a workspace's role of the same name could confuse them.
- **ACC-27** a permission only a source that does not count gives is "Denied", with the reason. Left: explicit kinds and others' operator grants are still not said.
- **ACC-28** `EndUser.signsInWithProvider` (server); Active when a provider signed them in or they have signed in; no invitation link for them. Siblings: SCIM-made users have `identity_link` rows, so the same.
- **ACC-29** `GET /bindings` serves `resourceKind`, `resourcePath`; the Where cell names and links the thing (`objectHref`). Test "ACC-29 ...".
- **ACC-30** `GET /members` serves `directRoles`, `groups`; "No access", "Through groups only", "N given directly", nothing while unknown.
- **ACC-31** `GET /tenants/:t/members/:id` and `.../end-users/:id`; both inspectors read one when it is not in the loaded pages.
- **ACC-35** the tab and table are "Access"; "under Access grants" is "under Access" in Members, Groups, Roles; the end-user group route text no longer says the name cannot change; the MCP settings entry is `volvel`.
- **ACC-36** warnings in the row and the approve dialog; "All N changes" opens every change of any release.
- **WLK-12** (first five): Members "Through groups only" (ACC-30); Groups row buttons wrap at phone width and the tab strip is tighter; Releases at phone width puts who, when and the answers under the text and draws no actions column; focus after answering goes to the list's first control; toasts centered from `md` up; Disable of an end user asks first.

## Not done, and why

- The WLK-12 Releases inset "differs from the other tabs" (no cause found in code; the screen uses the same `CollectionView`).
- No browser walk was run in this lane: none of the screen answers below is confirmed by a walk.

## Found

- Nothing new beyond the siblings named under ACC-26 and ACC-27.

## Lines for docs and changelog

- `GET /roles` and `GET /principals` accept `workspaceId` (needs `binding:read` at that workspace).
- `GET /tenants/:t/members/:id`, `GET /tenants/:t/end-users/:id` are new; members carry `directRoles`, `groups`; end users carry `signsInWithProvider`; end-user groups carry `managedBy`; bindings carry `resourceKind`, `resourcePath`.
- Releases of access: `status: superseded` is now set; both 202s carry `waiting`, `detail`; `GET .../rollback` carries `warnings`; whoever asked withdraws with no permission.
- Descriptions of groups, roles and service accounts allow 500 characters everywhere.
- `workspace_admin` gains `interface:*`, `doc:*`, `git:*` and loses `role:*`, `access:write`.
- Migration `0090_acc2_binding_source_and_workspace_admin.sql` (integrator renumbers and locks).

## Polish gate (what people see)

Screens to walk, at 1440, 768 and 390 px, light and dark, by keyboard, with a reload, on a Fernhill instance: Members & access (all five tabs, at 390 especially Groups and Releases), the Members inspector with `?member=` far down, End users (Status, Disable confirm, `?user=`), Roles (inspector, dialog), Workspace settings (Access), Account (Password), Access (a suspended member's permission check), a toast beside an open inspector.

- **States.** Members Roles column: nothing while unknown. Releases: warnings, "Superseded" with the comment, a waiting going-back as a notice. GiveAccess: the reason a read was refused. Workspace Access: loading, error, empty.
- **Lifecycle.** A release that waits can be withdrawn by its maker with only read rights; one that cannot apply says so and is asked again. Password: change, other sign-ins end. End user: disable asks.
- **Keyboard.** Focus after answering a release goes to the first control left in the list. New controls are buttons and text fields.
- **Copy.** American spelling, "flow" not used, no banned words; refusals name the cause through `failureText`.
