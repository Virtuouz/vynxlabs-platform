# Findings: people and access

Slice of [the inventory](../inventory/people-and-access.md), settled at `270e509`. Paths are under `apps/`: `CP/` = `control-plane/src/`, `CO/` = `console/src/`. Scratch tests (two server, one console, each on its own database) ran in the pinned tree and were removed. One walk ran on the throwaway instance, in tenants named "Acc triage …" (no API deletes a tenant, so three empty ones remain there).

## Security and data

### ACC-01 A binding to "anyone" is not held to the app-facing kinds
- **Outcome:** reproduced
- **Severity:** security
- **Where:** `CP/kernel/authorize.ts:139-143` (the cap is for end users and app-only sign-ins only); `CP/routes/permissions.ts:400, 1041`, `CP/kernel/kinds.ts:78`, `packages/manifest/src/kinds.ts:86` (any role may be given to `anonymous`).
- **Evidence:** an admin gave `anonymous` the viewer role at the tenant (API, 201). A caller with no sign-in, and a member of another tenant, then read members and the audit log (200). With `tenant_admin`, a caller with no sign-in created a group (201). An end user with the same binding is refused: less is given to someone signed in than to nobody. Class: missing cap on an unauthenticated principal. Only an admin's mistake, or a bundle's binding, opens it.
- **Fix:** in `check()`, count an `anonymous` binding only for app-facing kinds, whoever is calling, and say so in `explainAccess`. Refuse at write, in `insertBinding` and `bindingHook`, `anonymous`, `end_users`, `end_user` and `end_user_group` with a role that holds nothing app-facing. Spec: "only resources explicitly marked public". Test first: viewer to anyone, then members is 401.
- **Size:** M. **Milestone:** M1

### ACC-02 An operator's access grant goes on working after they stop being an operator
- **Outcome:** reproduced
- **Severity:** security
- **Where:** `CP/kernel/authorize.ts:175-180`; `CP/routes/identity.ts:1099` (removing an operator ends no grant).
- **Evidence:** a second operator opened a 24-hour grant; their `operator_admin` binding was removed; they could not open another (403) but still read members (200) and created a group (201). It lasts up to 24 hours, unless the tenant ends it.
- **Fix:** removing the last instance role that holds `access_grant:write` revokes that member's open grants, in the same transaction, audited. `check()` can also ask for it. Test first: as above, 404 after removal.
- **Size:** S. **Milestone:** M1

### ACC-03 A disabled account stays signed in to tenants' apps for up to 12 hours
- **Outcome:** reproduced
- **Severity:** security
- **Where:** `CP/routes/identity.ts:983` (deletes `member_session` only); `CP/kernel/apps/sessions.ts:137-141` (a member's app sign-in does not read `disabled_at`, though its comment says it does; an end user's does).
- **Evidence:** member with an app session disabled by an operator: the console answers 401, `GET /tenants/:t/session` still answers as that member, and the row is left.
- **Fix:** check `disabled_at` in `appPrincipal`, and delete app sessions with member sessions in one shared `endSessions(member)`. Siblings: `CP/kernel/sso/scim.ts:503` (does delete), removing a member (`routes/tenants.ts:642`, leaves the rows), suspending (does delete). Test first: the sequence above answers anonymous.
- **Size:** S. **Milestone:** M1

### ACC-04 Unticking one box of a wildcard role names the permissions a wildcard never gives
- **Outcome:** reproduced (inventory E1, wider than reported)
- **Severity:** security
- **Where:** `CO/screens/Roles.tsx:38-78` (`allows`, `toggle`), `:114` (`all`), `:284` (`Summary`), `:411` (`inShort`); server rule `CP/kernel/authorize.ts:34`.
- **Evidence:** `toggle(["*:*"], …, "secret", "write", false)` returns `sql:read` and `workspace_production:write` by name; from `*:read` it returns `sql:read`. Saving takes one permission away and gives two the role never had. Class: unintended grant of explicit permissions. Also: `*:*` shows `sql:read` ticked and ticking adds nothing; "Read everything" drops a named `sql:read`; off again drops a whole `run:*`; off under `*:*` empties the role; "In short" says a wildcard changes and reads SQL; a role shows instance kinds it can never use.
- **Fix:** one `allows` that knows `explicit`, in `@volvel/manifest` beside `grants`, used by picker, Summary, `inShort` and `CO/screens/Access.tsx:144` ("gives every permission"). Writing out a wildcard skips explicit and instance kinds; `all()` touches only its own wildcard. Test first: the four toggles above.
- **Size:** M. **Milestone:** M1 (the rest of the picker with it)

### ACC-05 Removing one binding removes another that has the same made-up key
- **Outcome:** reproduced (E5)
- **Severity:** security
- **Where:** `CP/kernel/tenant/releases.ts:114` (`bindingKey`), `:237, 260` (delete steps carry only the key), `:311` (`applyStep`), `:929` (`previewSteps`).
- **Evidence:** group "Tech" and service account "Tech", both viewer: deleting the service account's binding answered 204, removed the **group's**, and left the account's. History says "Took viewer from Tech" and lists the group. Groups and end-user groups share keys the same way, and so do `team` + `app_reader` and `team-app` + `reader` (both `team-app-reader`), and keys cut at 63. Class: wrong access revoked, and access believed revoked kept.
- **Fix:** delete steps carry the body and match by `identity()`. Make keys unique (principal type, and a short hash when they collide or are cut). Siblings: `previewSteps`, `rollbackAsks` (`kept`), `allowDelete`, and the two rows below. Test first: the sequence above.
- **Size:** M. **Milestone:** M2

### ACC-06 Bindings that share a key: a pull loses one, the next release takes it away, and no release can be gone back to
- **Outcome:** reproduced
- **Severity:** data
- **Where:** `packages/manifest/src/tenant.ts:228` (`renderTenantFiles`), `packages/cli/src/access.ts:178-205`, `CP/kernel/tenant/releases.ts:1065` (`rollbackAsks`); also the tenant branch, which commits the same files.
- **Evidence:** `GET /access` lists two files at one path; the CLI writes the second over the first. Planning what is left is possible and deletes a binding, which needs no `--allow-delete`. Planning the full set, or going back to that release, is refused: "is defined twice".
- **Fix:** with ACC-05's unique keys; snapshots already stored are read by identity and given fresh keys. Test first: pull then plan changes nothing; go back succeeds.
- **Size:** S after ACC-05. **Milestone:** M2

### ACC-07 An older invitation still sets the password after a reset
- **Outcome:** reproduced
- **Severity:** security
- **Where:** `CP/kernel/endusers.ts:82` (`createPasswordToken` clears one purpose), `:129` (`setPasswordWithToken`), `:219` (`changeEndUserPassword`).
- **Evidence:** invited, then a reset link was made and used; the invitation link then set a second password, and it signed in. Class: token lifecycle. An invitation lives 7 days.
- **Fix:** setting or changing a password, and disabling an account, deletes every unused token of that end user, in one shared helper. Test first: the second link answers 410.
- **Size:** S. **Milestone:** M1

### ACC-08 One person can approve their own change to access through a service account
- **Outcome:** reproduced; what it should be is Q1
- **Severity:** security
- **Where:** `CP/kernel/tenant/releases.ts:968` (`own` compares principals), `CP/routes/access-releases.ts:379`.
- **Evidence:** with approval on, a member asked for a change, then approved it with a key they had made for a service account that holds `access:write` (200, applied). Class: separation of duties.
- **Fix:** per Q1: only a member decides, and one who asked through a key cannot be told apart, so a release asked by a service account names who made its key. Test first: a service account's decision is 403.
- **Size:** S. **Milestone:** M1

### ACC-09 The last tenant admin, and the last operator who can sign in, can be removed
- **Outcome:** reproduced
- **Severity:** security
- **Where:** `CP/routes/tenants.ts:588, 642`; `CP/routes/permissions.ts:486`; `CP/routes/identity.ts:954, 1120`.
- **Evidence:** the only tenant admin removed themself from the tenant (204) and, elsewhere, removed their own last binding (204, then 403 everywhere). Suspending oneself is refused, removing oneself is not. Operators: A disabled operator B, then removed their own binding (204): nobody enabled is left, since a disabled operator counts. A tenant can be put right by an operator's grant; an instance cannot.
- **Fix:** one `keepsAnAdmin(trx, tenant)` after any change to bindings, membership, suspension, group membership, or account state, and after releases and deploys; counts enabled, unsuspended people, through groups too. The operator's counterpart counts enabled accounts. Siblings: SCIM and SSO group sync (their slice), deleting a group. Test first: each call above is 409.
- **Size:** M. **Milestone:** M1 (with the operator recovery command)

### ACC-10 Turning on approval counts people who cannot approve, and not some who can
- **Outcome:** reproduced
- **Severity:** security
- **Where:** `CP/routes/access-releases.ts:187-206`.
- **Evidence:** two admins, one suspended: turned on (200), so nobody can answer. One direct admin and one through a group: refused `approval_needs_two`. A disabled account is counted too (same query).
- **Fix:** count who `check()` would let: enabled, unsuspended, direct or through a group, tenant scope; share with ACC-09. Test first: both cases reversed.
- **Size:** S. **Milestone:** M1

## Releases of access

### ACC-11 Deleting a group an identity provider made says it worked and does nothing
- **Outcome:** reproduced (E2)
- **Severity:** broken
- **Where:** `CP/kernel/tenant/releases.ts:240` (the plan drops it, so the refusal at `:408` is never reached); `CO/screens/Groups.tsx:247, 388`.
- **Evidence:** `DELETE` answered 204, for a group of members and one of end users; both were still there, and a release "Deleted the group Pushed" that changed nothing was recorded.
- **Fix:** refuse in `releaseOne` with the sentence that already exists, and disable the button as Rename is. Siblings: the end-user group screen also offers Rename and Delete (its list does not say who made it, see missing parts); no-op releases (ACC-17). Test first: 409.
- **Size:** S. **Milestone:** M2

### ACC-12 Giving a group a workspace's own role makes releases and going back fail
- **Outcome:** reproduced (E6)
- **Severity:** broken
- **Where:** `CP/kernel/tenant/releases.ts:138` (`currentAccess`' bindings do not leave out workspace roles; `asTenantBinding` does, `routes/permissions.ts:1018`).
- **Evidence:** "Ops" given a role the workspace's bundle defines: it appears in the tenant's resources; a release without it, and going back to an earlier release, answered 400 "There is no role "keeper" that this tenant can give". A tenant role of the same name would be given instead.
- **Fix:** `and r.workspace_id is null` in `currentAccess`; stored snapshots ignore them. Test first: as above, 201.
- **Size:** S. **Milestone:** M2

### ACC-13 No release can be gone back to once a workspace it names is deleted
- **Outcome:** reproduced
- **Severity:** broken
- **Where:** `CP/kernel/tenant/releases.ts:563, 1065`.
- **Evidence:** a group given viewer in a workspace, the workspace deleted: going back answered 400 `There is no workspace "main"`. Every release between is lost as a way back.
- **Fix:** `rollbackAsks` leaves out bindings whose workspace, provider group or role is gone, and returns them as warnings the dialog lists. Test first: 201 with a warning.
- **Size:** S. **Milestone:** M9

### ACC-14 "Go back to this" says it is done when it waits
- **Outcome:** reproduced (E4)
- **Severity:** wrong
- **Where:** `CP/routes/access-releases.ts:481` and `:356` (202 without `waiting`); `CO/screens/AccessReleases.tsx:204`.
- **Evidence:** server: 202 with `id, number, status, summary`. Console test: the toast reads "The tenant's access is what release 1 left." The CLI handles it.
- **Fix:** read `status` in the console and say "Release 9 waits for a second person"; add `waiting` to both 202s so `api.ts` is one path. Test first: the console test above.
- **Size:** S. **Milestone:** M9

### ACC-15 A waiting release that can no longer apply still says "Waits for approval", and "Superseded" is never set
- **Outcome:** reproduced (E9)
- **Severity:** wrong
- **Where:** `CP/kernel/tenant/releases.ts:1013`; `CP/routes/access-releases.ts:43`; `CO/screens/AccessReleases.tsx:32` (`STATUS`); `migrations/0071`.
- **Evidence:** two changes waited; approving one made the other `release_stale` for good. It stays `awaiting_approval`, with Approve shown. The refusal tells the approver to withdraw it, which answers 409 "Only whoever asked". So approvals go one at a time, and a person is told to do what they may not.
- **Fix:** when a release applies, mark waiting ones whose `base` no longer matches `superseded`, with a comment naming the release; say "Ask for it again". Better (size M): re-plan, and approve if the change is the same. Test first: second is `superseded`.
- **Size:** S. **Milestone:** M9

### ACC-16 Whoever asked for a change cannot always withdraw it, or see it
- **Outcome:** reproduced
- **Severity:** wrong
- **Where:** `CP/routes/access-releases.ts:379` (all three decisions need `access:write`); `CO/screens/AccessReleases.tsx:312`.
- **Evidence:** a role with `group:write` and `access:read` made a group that waits (202); withdrawing it answered 403. The console says "You may read this, not answer it." to the person who asked.
- **Fix:** the maker may withdraw with no permission but their own standing; without `access:read` they see their own. Test first: 200.
- **Size:** S. **Milestone:** M9

### ACC-17 Doing nothing is recorded as a release
- **Outcome:** reproduced
- **Severity:** rough
- **Where:** `CP/kernel/tenant/releases.ts:775-860`.
- **Evidence:** giving a group a role it holds answers 201 and records "Gave deployer to Desk" with no change, and the console says it was given. The same for a member answers 409 "That already exists."
- **Fix:** a partial release with no steps is not recorded and answers the existing binding's id; the member path answers the same. Test first: no new release.
- **Size:** S. **Milestone:** M9

### ACC-18 A provider's group kept in a repository is "updated" on every release
- **Outcome:** reproduced
- **Severity:** wrong
- **Where:** `CP/kernel/tenant/releases.ts:138` (provider groups are not in `currentAccess`), `:225` (`plan`).
- **Evidence:** the same set released three times: `updated: 1` each time. With approval on, an unchanged repository would always wait (same `steps.length`). A description set in the console is also overwritten with a note that says "pull", which never writes it.
- **Fix:** compare a put against provider-made rows too (never delete them). Test first: second release `unchanged: 1`.
- **Size:** S. **Milestone:** M9

### ACC-19 A hand-given binding stops a deploy, and a bundle's binding stops a hand-given one, with "That already exists."
- **Outcome:** reproduced
- **Severity:** broken
- **Where:** `CP/kernel/kinds.ts:165`; `CP/kernel/tenant/releases.ts:596`; unique rule in `migrations/0005`.
- **Evidence:** group given viewer by hand in a workspace, then a bundle with the same binding: the whole deployment answered 409 "That already exists.", naming nothing. The other order: 409 in Give access. A tenant release that asks for both would fail the same way.
- **Fix:** key the unique rule by source as well (`source_resource_id`), so each owns its own row. Siblings: OfferToAgent, the Sharing dialog, `insertBinding`. Test first: deploy is 201.
- **Size:** S. **Milestone:** M9

### ACC-20 A description longer than 300 is refused where 500 is offered
- **Outcome:** reproduced (E3)
- **Severity:** wrong
- **Where:** `CP/routes/endusers.ts:544, 644`, `CP/routes/permissions.ts:159, 232`; `packages/manifest/src/tenant.ts:39`; `CO/screens/Groups.tsx:369, 378`.
- **Evidence:** 400 characters: 400 for an end-user group (create and change) and a role. Members' groups and service accounts say 300.
- **Fix:** one exported limit, 300 or 500, for all four; nothing stored breaks at 500, so raise the schema to 500. Test first: 400 characters is 201.
- **Size:** S. **Milestone:** M9

### ACC-21 Refusals about access say only "The tenant's access is not valid."
- **Outcome:** confirmed by code
- **Severity:** wrong
- **Where:** `CO/screens/Roles.tsx:389` (`error.message`), `CO/screens/GiveAccess.tsx:125`, `CO/screens/AccessReleases.tsx:87` (`failed`); the cause is in `errors`.
- **Evidence:** API answers of ACC-06, ACC-20 and ACC-22 carry the cause in `errors[]`, whose path is never `/body/description`, so `fieldError` shows nothing either.
- **Fix:** use the shared `failureText` (`CO/ask.tsx:79`), as `EndUsers` and `OfferToAgent` do; map release issues to a field when the resource is the one sent. Test first: the role sheet names 300.
- **Size:** S. **Milestone:** M9

### ACC-22 A role that lists a retired permission cannot be changed at all
- **Outcome:** reproduced
- **Severity:** rough
- **Where:** `packages/manifest/src/tenant.ts:195`; `CO/screens/Roles.tsx:259` ("kept, shown, and removable").
- **Evidence:** a role holding `legacy:read`, description only changed: 400. Nor can any release that contains it apply.
- **Fix:** refuse only permissions newly added; or the picker says they must be removed to save. Test first: description saves.
- **Size:** S. **Milestone:** M9

### ACC-23 A change that waits is shown as a failure, and can be asked twice
- **Outcome:** confirmed by code
- **Severity:** rough
- **Where:** `CO/api.ts:62-76`; `Notice tone="danger"` in the dialogs; the dialog stays open and the lists do not reload.
- **Evidence:** deliberate (polish audit, "Access-change approval responses"), and it keeps a false success away. But it is red, and pressing again makes a second waiting release, which ACC-15 then makes useless.
- **Fix:** a `waiting` outcome in `api.ts` that dialogs treat as done: close, attention toast with a link to Releases. Siblings: every caller of groups, roles, service accounts, bindings. Test first: the dialog closes and one request is sent.
- **Size:** M. **Milestone:** M9

## Screens

### ACC-24 A workspace admin cannot give access in the console, and is not told why
- **Outcome:** reproduced (E7)
- **Severity:** broken
- **Where:** `CO/screens/GiveAccess.tsx:62`, `CO/screens/Members.tsx:416`; `CP/routes/permissions.ts:126, 756` (`roles`, `principals` at tenant scope only).
- **Evidence:** member with `workspace_admin` on one workspace: `POST /bindings` there is 201, `GET /bindings?workspaceId` is 200, `GET /roles` and `/principals` are 403. Walk: Access grants says it needs `binding:read`; Give access opens, with "The whole tenant" and an empty Role, and no reason.
- **Fix:** `workspaceId` on `GET /roles` and `GET /principals` (needs `binding:read` there), an Access tab in Workspace settings that uses `?workspaceId=`, and the sheet shows `roles.error`. `role:*` and `access:write` on that role check nothing at a workspace: drop them, or say so (Q2). Test first: both reads 200 at the workspace.
- **Size:** M. **Milestone:** M9

### ACC-25 "They can change it after signing in", but nothing lets a member change a password
- **Outcome:** reproduced (E8)
- **Severity:** wrong
- **Where:** `CO/screens/Instance.tsx:98`; `CO/screens/Account.tsx`; API `POST /auth/change-password` (200 in a scratch test, audited by `CP/kernel/auth.ts:248`).
- **Evidence:** no call to it in the console. So whoever made the account goes on knowing its password. `Add member` (`Members.tsx:352`) has the same field, without the sentence.
- **Fix:** the Account screen's change password (missing parts). Test first: the form calls it.
- **Size:** S. **Milestone:** M9

### ACC-26 Held by, and the disabled Delete, go by a role's name
- **Outcome:** reproduced (E10)
- **Severity:** wrong
- **Where:** `CO/screens/Roles.tsx:458`; bindings carry `roleId`. Also `OfferToAgent.tsx:92`, `Apps.tsx:239`.
- **Evidence:** a workspace's `keeper` was held by a group; the tenant's own `keeper`, held by nobody, deletes by API (204) while the console would disable Delete and name the group.
- **Fix:** match `roleId`; show which workspace a role belongs to (the list gives two rows with one name); a workspace's role says "from a workspace's repository", not "the tenant's" (`:337`); the link goes to `/access`, not `/members` (`:572`). Test first: two roles with one name.
- **Size:** S. **Milestone:** M9

### ACC-27 Checking a permission of a suspended member says "Allowed"
- **Outcome:** reproduced
- **Severity:** wrong
- **Where:** `CO/screens/Access.tsx:130, 183`.
- **Evidence:** "Allowed · dave holds secret:read by no binding that counts now."
- **Fix:** allowed only when a source that counts gives it. Also: it says nothing of ACC-04's explicit kinds, nor of operator grants of others. Test first: reads "Denied".
- **Size:** S. **Milestone:** M9

### ACC-28 An end user who signs in through a provider is "Invited" for ever
- **Outcome:** reproduced
- **Severity:** wrong
- **Where:** `CO/screens/EndUsers.tsx:44, 136`; `hasPassword` in `CP/routes/endusers.ts:75`.
- **Evidence:** no password and signed in three days ago: row reads "Invited · 3d ago", and "New invitation link" is offered, which sets a password beside the provider where it is not required.
- **Fix:** active once `lastSignedInAt` is set or an identity link exists; the API says how they sign in. Siblings: SCIM-made users. Test first: the row reads "Active".
- **Size:** S. **Milestone:** M9

### ACC-29 Access at one script, flow or app does not say which
- **Outcome:** reproduced
- **Severity:** wrong
- **Where:** `CO/screens/Members.tsx:151` (`whereOf`); `GET /bindings` gives `resourceId` only (`CP/routes/permissions.ts:91`).
- **Evidence:** two offers to one agent are two rows alike, "Main (one resource)", each with Remove.
- **Fix:** kind and path on the binding (as `explainAccess` has), shown and linked; used in the confirm too. Test first: the rows differ.
- **Size:** S. **Milestone:** M9

### ACC-30 A member in no group is said to hold roles "Through groups only"
- **Outcome:** reproduced
- **Severity:** wrong
- **Where:** `CO/screens/Members.tsx:255`.
- **Evidence:** no binding, no group: "Through groups only". The same while bindings load, or when they may not be read.
- **Fix:** counts of both from the server on the member; "None", and nothing while unknown. Test first: reads "No access".
- **Size:** S. **Milestone:** M9

### ACC-31 A link to a member or end user past the first page opens nothing
- **Outcome:** confirmed by code
- **Severity:** broken
- **Where:** `CO/screens/Members.tsx:169`, `CO/screens/EndUsers.tsx:170` (the inspector looks in the loaded rows).
- **Evidence:** `?member=` and `?user=` are kept in the address (POLISH-006); pages are of 50; nothing fetches one.
- **Fix:** a read of one (`GET …/members/:id`, `…/end-users/:id` do not exist) when it is not loaded. Test first: link to the 51st.
- **Size:** S. **Milestone:** M9

### ACC-32 Adding a member with a workspace and no role forgets the workspace, silently
- **Outcome:** confirmed by code
- **Severity:** rough
- **Where:** `CO/screens/Members.tsx:358-390`.
- **Evidence:** `bindings` is sent only with a role; "Where they work: Main" is dropped.
- **Fix:** ask Role first, and Where only with one; offer the workspace's roles as Give access does. Test first: the field is not there without a role.
- **Size:** S. **Milestone:** M9

### ACC-33 Two attributes with one name: one is lost without a word; a space is refused as a bad name
- **Outcome:** confirmed by code, the space reproduced (400)
- **Severity:** rough
- **Where:** `CO/screens/Groups.tsx:489` (`Object.fromEntries`, name not trimmed).
- **Evidence:** the last of the two wins. Row rules read these.
- **Fix:** trim, and refuse a repeat at the field. Test first: the repeat is named.
- **Size:** S. **Milestone:** M9

### ACC-34 Disabling an end user is not confirmed
- **Outcome:** confirmed by code
- **Severity:** rough
- **Where:** `CO/screens/EndUsers.tsx:148`; siblings `Members.tsx:174` and `Instance.tsx:24` ask first.
- **Evidence:** it ends every sign-in at one press; group "Take out" (`Groups.tsx:143`) the same.
- **Fix:** the shared confirm, saying what ends. Test first: no request before it.
- **Size:** S. **Milestone:** M9

### ACC-35 Words: "Access", "access grant", and a name that "cannot be changed later"
- **Outcome:** confirmed by code
- **Severity:** wrong
- **Where:** `CP/routes/endusers.ts:538` (says the name cannot be changed; the PATCH beside it changes it); "under Access" in `CO/screens/EndUsers.tsx:353`, `AgentAccess.tsx:97`, `Apps.tsx:276`, `endusers.ts:538`; `AgentAccess.tsx:42` names the settings entry `platform`.
- **Evidence:** the tab is "Access grants". An access grant is the operator's thing in the API, the audit log and the spec, so one name has two meanings.
- **Fix:** call the tab "Access" again (or "Who has access") and keep "access grant" for operators; correct the API text; name the entry `volvel`. Siblings: `Roles.tsx:353, 465`, `Groups.tsx:178, 311`, `Members.tsx:193`.
- **Size:** S. **Milestone:** M13

### ACC-36 What a release warned of is never shown
- **Outcome:** reproduced
- **Severity:** wrong
- **Where:** `CO/screens/AccessReleases.tsx:24` (`warnings` is not in its type); made in `CP/kernel/tenant/releases.ts:867` (`editsUndone`).
- **Evidence:** a release whose summary warns that it undoes a console edit: the text is nowhere, so a second person approves without it. The list also shows three changes and "and N more", with no way to the rest once applied.
- **Fix:** warnings in the row and in the approve dialog; a release page (missing parts). Test first: the warning is in the approve dialog.
- **Size:** S. **Milestone:** M9

## Not bugs, and for the documentation

### ACC-37 Claims refuted or decided already
- **Outcome:** not a bug
- **Evidence:**
  - Turning approval off needs no second person: the owner's decision (`docs/phases/phase-22-polish.md:26`).
  - Members' roles, resource bindings and group membership do not wait: "people stay state" (phase 17). Reproduced: a direct `tenant_admin` with approval on is 201. The Releases screen's description and `PUT /access/approval` already list what does wait; the concept page must say what does not.
  - No escalation check: decided (`phase-18-data-insight.md:180`).
  - `workspace_admin` without `code`: decided (`phase-7-authoring.md:231`). For the other kinds, Q2.
  - `code:write` outside the operator stops managed workers: decided, only without the capability to switch users (phase 9).
  - Suspended bindings listed and not counted: as built, and said on the screen.
  - Going back makes a deleted service account again without keys: membership and keys are state. Said nowhere in the dialog; a line there is enough (S, with ACC-13).

### ACC-38 Documentation gaps of section D
- **Outcome:** confirmed by code; for phases 30 and 31, nothing to fix in the product
- **Evidence:** generated `cli.md:158` lists `--dir` for build, run, dev, deploy, pull and not `tenant`; generated `kinds/binding.md:15` shows one principal form; generated permissions name no built-in role; no page mentions agents; `members.md` is as described.

## Missing parts

| # | What the API takes | Where it belongs | Permissions, siblings | Size |
|---|---|---|---|---|
| 1 | `POST /auth/change-password` (200) | Account | own account; end users have theirs | S |
| 2 | `GET /auth/list-sessions`, `POST /auth/revoke-session`, `/revoke-other-sessions` (200) | Account, "Where you are signed in" | own account | S |
| 3 | `POST /auth/update-user` `name` (200) | Account, Name | own account; not while SCIM or a provider owns it | S |
| 4 | `expiresAt` on a new key (`CP/routes/identity.ts:90`) | Create API key, on Account and service accounts; Expires column | none new; CLI `login` key | S |
| 5 | `resourceId` and `anonymous` in `POST /bindings` (`permissions.ts:412`) | Give access: Where, "One thing in a workspace"; Who, "Anyone" (after ACC-01) | `binding:write` there; Sharing, Offer to an agent | M |
| 6 | Bindings of one workspace: `GET /bindings?workspaceId` (`permissions.ts:310`) | Workspace settings, Access (ACC-24) | `binding:read/write` at the workspace | M |
| 7 | `bindings` up to 20 when adding a member (`tenants.ts:529`) | Add member: several roles | `binding:write` at each | S |
| 8 | Group `description`, create and change (`tenants.ts:735, 789`) | Groups: create field, Describe | `group:write`; end-user groups have it | S |
| 9 | Service account `name` (`tenants.ts:1054`), and its fixed `key` | Service account, Identity: Rename, key shown | `service_account:write` | S |
| 10 | End user `name` (`endusers.ts:337`) | End users inspector, Rename | `end_user:write` | S |
| 11 | `domainId` for invitation and reset links (`endusers.ts:240, 300`) | Invite, and New link: "On which address" when domains exist | `end_user:write`, `domain:read` | S |
| 12 | An end-user group's `key` and who made it (columns exist; `Group` in `endusers.ts:475` leaves them out) | API field, Key column, provider tag | `end_user_group:read` | S |
| 13 | `membership.sso.values` of a group (`packages/manifest/src/tenant.ts:42`) | Groups: "Filled by sign-in", shown, then changed through the same release | `group:write`; SSO mappings | M |
| 14 | One release, its changes and warnings (`Summary`, `access-releases.ts:24`) | Releases inspector, at `?release=` | `access:read` | M |
| 15 | `GET …/rollback` (what going back removes) | CLI: `tenant rollback` shows it and asks, or `--yes`; `approve` shows the changes | `access:write` | S |
| 16 | `PUT /access/approval` | CLI `volvel tenant approval on\|off` | `access:write` | S |
| 17 | `GET /tenants/:t/access/member/:me` for oneself without `binding:read` (`routes/access.ts`) | Account or tenant menu: "What I may do here" | none | S |
| 18 | Any built-in role at instance scope (`identity.ts:1053`; viewer reproduced: reads members) | Add operator: Role; the last-operator guard counts `*:*` too | `binding:write` at the instance | S |
| 19 | Grant length 1 to 1440 minutes (`permissions.ts:641`) | Open operator access: "Other" | `access_grant:write` | S |
| 20 | Tenant kinds (`TENANT_KINDS`) | SDK: helpers or types for roles, groups, accounts, bindings; today YAML only (Q3) | n/a | M |

Not counted (no API, so a new capability): resetting a member's password (M10 in the plan), changing an email, deleting an account or a tenant, per-key scopes, expiry on a binding.

## Owner decides

- **Q1. May a service account approve a change to access?** (a) Only members decide. (b) As now. (c) Yes, but not for a change asked by the person who made its key. **Recommend (a)**: a second person means a person.
- **Q2. Is `workspace_admin` ("Full control of a workspace") meant to lack `interface`, `doc` and `git`?** It holds flows, tables and deployments. `code` was left out on purpose (phase 7); the other three came later, and no document says. It also holds `role:*` and `access:write`, which nothing checks at a workspace. (a) Add the three (not `code`), drop the two. (b) Leave it, and describe it as "everything but writing code, pages and documentation". **Recommend (a).**
- **Q3. Should the SDK define a tenant's access in TypeScript, or stay YAML only?** Phase 17 chose files. **Recommend YAML only**, said in the docs, with a JSON schema for editors.
- **Q4. May a tenant give "anyone" more than apps need?** ACC-01 assumes not. **Recommend not**; a public API stays a webhook or a published app.
