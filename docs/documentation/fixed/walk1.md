# Fixed: lane walk1 (rows of the tier 1 walk)

Paths: `C/` = `apps/console/src/`. No migration. No contract changed. Tests: `C/Session.test.tsx`, `C/CommandPalette.test.tsx`, `C/TenantScreens.test.tsx`. Each was seen failing on the code before its fix.

## WLK-01 plain sign-out
`C/App.tsx:108-112`: `beginSession` moved from render into an effect keyed on `[holder, stale]` (stale = `/me` has an error). While `/me` is being asked again after sign-out, the page drew once more with the old `me.data` and re-opened the session, so the 401 that answered `/me` waited for a sign-in that never came. Test `WLK-01` (the 401 of `/me` takes 40 ms, as a network does). Siblings: `beginSession` has no other caller. Seen now: sign-out lands on the sign-in form, no sheet. Walk: sign out from a tenant screen at 1440 and 390, light and dark; sign in as the same person again and let a save wait on a 401 (SHL-08 still holds, tested).

## WLK-02 deep link, sign in, "Sign in or send an API key."
`C/api.ts` `call`: an early read (`window.__vxEarly`) that answered 401 is not handed to the screen; it is asked again. Siblings: every `useLoad` and `api.get` goes through `call`; `index.html` unchanged. Test `WLK-02` (early 401s for `/me`, `/tenants/t1` and its summary, then sign in). Cost: when signed out, the early `/me` is asked once more. Walk: open a workspace deep link signed out, sign in, at 1440 and 390.

## WLK-03 tenant overview with counts refused
`C/screens/TenantOverview.tsx`: the Needs attention panel shows `Pending` (the error with Try again and request ID) when the counts failed; the error above the heading shows only when there are counts to keep. Test `WLK-03`. Siblings looked at in this screen: Workspaces and Recent changes already handled their errors. `C/screens/Overview.tsx` (workspace) was not part of the row and not looked at beyond the grep for `!c ?`; none found. Walk: a member with workspace access only, at 390 dark; states: loading, refused, retry.

## WLK-04 Space key cap
`C/kit/keys.ts` `formatCombo`: a lone space is named "Space" (the `NAMES` entry was bypassed for one-character keys). Test `WLK-04`. Siblings: `keysOf` and every `formatCombo` caller share it (Shell, Overview, Authoring, Queries, KitSheet, Inspector). Copy: "Space".

## WLK-05 session sheet close button
New `dismissible` prop on `Dialog` (`packages/ui/src/Dialog.tsx`): `false` draws no Close button and ignores Esc and backdrop presses. `C/SessionSheet.tsx` uses it, as the page waits on the sheet. Test `WLK-05` (no Close, Esc keeps it). Siblings: no other Dialog passes a no-op `onClose`. Focus trap is the dialog's own (base-ui modal); the test checks the sheet has its controls, a real Tab walk is for the browser. Keyboard: Tab cycles password, Sign in; Esc does nothing. Walk at 390 and with keys only.

# Rows added to the walk file while this lane worked

Taken first: WLK-06, WLK-08, WLK-10. Taken after the coordinator's correction (merged `phase-29-correct-the-product` first): WLK-07, WLK-16, the WLK-12 items after the first five, parts of WLK-09 and WLK-15, and the destroying-action rule of WLK-10. Not taken: WLK-13, WLK-14 (mask2).

## WLK-06 a plain error crashed a form
`C/ListScreen.tsx:199` (`CreateDialog`) and the three siblings `C/screens/Roles.tsx:304`, `Branding.tsx:167`, `Domains.tsx:155` read `error?.fields?.find`: an `Error` thrown by a caller (`takenColumn` in `Data.tsx`) has no `fields`, and is now said in the form's notice. Test `WLK-06` in `C/CreateDialog.test.tsx` (threw "Cannot read properties of undefined (reading 'find')" before). Other `.fields.find` reads: `Environments.tsx:373` and `Authoring.tsx:512` take a value already known to be an `ApiError`/array, left.

## WLK-08 Change shows the details from before a save
`C/ListScreen.tsx` `CreateDialog`: when it opens, its fields are set from `initial` as it is then. Test `WLK-08`. Siblings: every `CreateDialog` with `initial`: `Data.tsx` ChangeSource (`:2505`) and the two in `Groups.tsx`, `Execution.tsx:1200`, `ListScreen.tsx:370` pass the same piece. Walk: Change a source's host, save, Change again: the new host shows.

## WLK-10 dialogs open on Close
`packages/ui/src/SideSheet.tsx` now places the focus as `Dialog` does (a `data-autofocus` control, else the first field, else the first control); `Dialog.tsx` exports `firstField`. `packages/ui/src/Dialogs.tsx`: a confirmation starts on its main button, on Cancel when `danger`; a prompt or type-to-confirm keeps its field. `packages/screens/src/actions.tsx`: an action's confirmation without asks starts on its main button. Tests in `packages/ui/src/dialogFocus.test.tsx` (`WLK-10`, two tests). Siblings: every `SideSheet` caller now starts in its first field; callers whose body arrives late still start on Close (SideSheet has no late-field watcher as Dialog has). Left out: the manifest has no flag for an action that destroys, so an action's confirmation never starts on Cancel; asking the owner whether to add `danger` to `confirm` is for the integrator. Walk: Add column, Change source, a widget action's confirmation, a delete confirmation (Cancel focused), at 1440 and 390, by keyboard.


## WLK-10 gap, closed
`packages/screens/src/actions.tsx`: an action whose steps include `delete` starts its confirmation on Cancel (`data-autofocus`), any other on its main button. Test `WLK-10: the confirmation starts on its main button...` in `packages/screens/src/actions.test.tsx`.

## WLK-07 source with no password
Server: `kernel/data/sources.ts` `sourceFailure` words the driver's "client password must be a string" as "No password is set for the data source ...", test `kernel/data/source-failure.test.ts`. Console: `screens/Data.tsx` `ChangeSource` refuses a submit that moves host, port, user or encryption with no password typed (the stored one will not go there), in the form's own words; test `WLK-07` in `Data.test.tsx`; the old test that expected a host change to keep the password now changes the schema instead. Left out: the row already says "None" for no password; the connections wizard (CFG-03) was not looked at.

## WLK-16
`kernel/pages/approvals.ts` (`decidedSteps`, the decide-conflict read) and `routes/flows.ts` (retry plan `approvalsKept`) join `service_account` by `decided_by_type`, so a service account's decision has its name. Test `WLK-16` in `page-approvals.test.ts` (the retry plan's `approvalsKept` has no test of its own). `fireScheduleNow` already starts a source run when the schedule has a `source` (`triggers.ts:1219`), found fixed by opsb; no test added. `screens/Runs.tsx`: an ID the list does not hold that is a flow run (a child, or older than the When filter) opens as one, test in `RunPage.test.tsx`. Both migration files named 0090 (opsb and app) exist after the merge: the server tests ran with opsb's renamed to 0091 locally, restored before commit.

## WLK-12 (items after the first five)
`api.ts`: a 403 naming a permission carries whom to ask (`ASK_FOR_ACCESS`, shared with `ErrorState`, shown once), and a field's "must match pattern ..." is said as "Use only lowercase letters, digits and hyphens." (`fieldWords`); tests in `kit/LoadState.test.tsx`. `screens/SingleSignOn.tsx`: a save that dropped the client secret says so. `packages/manifest/src/permissions.ts`: the label "Rows past the row policy" has no comma, so a role's summary reads; test in `Roles.test.tsx`. `screens/Domains.tsx`: `break-words` in place of `break-all` (no test: layout). `screens/Instance.tsx`: disabling or enabling a member with no tenant left without an admin is said. Not done: the export passphrase's browser bubble (`Environments.tsx:811`, `minLength` and no field error).

## WLK-15 (done: header names, reserved case, Enter in Add step)
`FlowEditor.tsx`: header names compare in lower case; a case called `otherwise` is refused with its reason; Enter in Find a step adds the first match. Tests in `FlowEditor.test.tsx`, `FlowSteps.test.tsx`, `FlowEditorWalk.test.tsx`. Not done: the case-rename edge that vanishes, the 300 KB input, the deploy error in words, "Draft Draft", the cut "otherwise" label, approval link time zone, Triggers path wrap, minimap at 390.

## WLK-09 (done: Add column's message)
`screens/Data.tsx`: "The column paid was added." Not done: focus after a purge, rename and Discard, long dialogs opening on Close (done through WLK-10), retired pill cut, "Managed in: Repository", `?query=` after Back, "Name and path" on a removal draft, the Undo message, Data sources at 390.

## WLK-11
Not done.
