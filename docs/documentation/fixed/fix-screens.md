# fix-screens (tier 3/4 lane): rows from the walks w-people, w-gov, w-instance, w-configure, w-words

Tests: `apps/console/src/FixScreens.test.tsx` (new), `AccessReleases.test.tsx`, `AccessLane2.test.tsx`, `App.test.tsx`, `Environments.test.tsx`, `packages/ui/src/dialogFocus.test.tsx`, `apps/control-plane/src/group-pickers.test.ts` (new), `environments.test.ts`. Each was seen failing with the source changes reverted (`git apply -R`). No migration. No contract file changed.

## w-people
- #1 Access changes tab: the `div.contents` wrapper is gone (`screens/AccessReleases.tsx`, focus now finds the table in the document). The description was folded for every framed tab by one shared `helpKey` ("members-access" from the common title); each tab now has its own: `Members.tsx` ("members", "access"), `Groups.tsx`, `Roles.tsx`, `AccessReleases.tsx`. Test: "the list is the page's own box".
- #2 "may release access" now "approve access changes"; a given role reads "Gives developer to group x" (`phrase()` in `AccessReleases.tsx`, used by the list and the dialogs).
- #4 Account nav item, menu item, palette entry and page title say "Account" (`Shell.tsx`).
- #6 `fieldWords` (api.ts) words length refusals ("Use at least 12 characters."); `CreateDialog` (`ListScreen.tsx`) no longer adds a banner when every refused field is shown at its field. Also fixes #10's doubled operator-minutes refusal.
- #7 `DirectGrantNote` (`GiveAccess.tsx`): with approval on, Give access (member, end user, every end user, anyone) and Add member say the role applies at once and does not wait; groups, service accounts and end-user groups wait. Behavior unchanged.
- #8 `ApiError` (api.ts): a 400 whose errors are all in `/params` says "That place was not found." `?release=x`: already says so on the Access changes tab (`AccessReleases.test.tsx` covers the existing sentence); not changed.
- #9 `SideSheet` keeps Tab and Shift+Tab inside (`packages/ui/src/SideSheet.tsx`). Every SideSheet (Give access, Create group, inspectors) gets it. Not browser-checked.
- #10 "no access" and "could not be read" pages padded (`Tenant.tsx`).
- #11 facts (Added, Made, Created, Connected, Last changed/set, Last signed in) use `mode="stamp"`: Members, EndUsers, Account, ObjectPages, Instance, Tenants, Tenant.
- Left: #3, #5 (tables, focus: other lane); Add member layout wrap at 390.

## w-gov
- #1 `leaveFirst` (router.tsx) asks as leaving the page does; used for the provider's Tabs and Stepper (`SingleSignOn.tsx`). Siblings with tabs and a SaveBar inside: the other `<Tabs>` users (8 in screens/) were not changed; look at them.
- #2 `GET /tenants/:t/groups` and `/end-user-groups` take `search`, `limit`, `cursor` (`pagination.ts` `NamedListQuery`, order by name then id); with no `limit` they answer all, as before; response now `{items, nextCursor}`. `Combobox` `filter: null` was right once the server narrows; unchanged.
- #7 audit "disabled" is an Update, not a Delete (`Audit.tsx`); provisioning Email column no longer repeats the email. Left: Domains "Disable" vs "Turn off" confirm (tests and e2e name the button).

## w-instance
- #1 `useReopenLastPlace` only when the address has no query and the page was not a reload (`App.tsx`).
- #2 Import check shows no slug line when the tenant is here already (`Environments.tsx`).
- #4 All members: full email in `title` (`Instance.tsx`).
- #5 deleted tenant's entry keeps its name (`routes/identity.ts`, from `details.name`); CSV button says its times are UTC; "Member disabled" no longer DELETE.
- Left: #3 Check again focus (not confirmed).

## w-configure
- #5 Save with a bad run limit or empty name now says why in a toast (`Environments.tsx`). Date items of #7 done by the stamp change. Left: #1-#4, #6, other #7.

## w-words
- #1 `audit-words.ts`: access.released and release_* have words; "tenant release" shown as "access change" (`Audit.tsx`).
- #6 Overview: "Review changes", section "Deploy".

## Screens to walk
Tenant Members & access (all five tabs, 1440/390, light/dark), Give access, Add member (short password, approval on), Create group sheet Tab loop, SSO provider tabs with edits and Groups picker typing "zzz", All tenants reload with filter, Import check, Workspace settings run limit, Audit (tenant and instance, filters), Account nav, `/t/<slug>`, All members, Workspace Overview.
