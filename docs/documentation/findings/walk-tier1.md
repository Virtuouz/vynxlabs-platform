# Findings of the tier 1 walk

Walked on the throwaway instance at `8f8fa3f7`. Rows of the same shape as the others. Screenshots under `~/.local/share/volvel-walk/shots29/`.

### WLK-01 Plain sign-out stays under "Your session ended" and never reaches the sign-in form
- **Outcome:** reproduced (walk, 1440 light)
- **Severity:** broken
- **Where:** `apps/console/src/App.tsx:110` (`beginSession(holder)` on the re-render after `endSession()` at `:143`), so the next 401s wait on the session sheet. From SHL-06/07/08.
- **Fix:** signing out ends the session for good: no sheet, no waiting reads, straight to sign-in. Test: render App, sign out, expect the sign-in form.

### WLK-02 Sign-in from a deep link shows "Sign in or send an API key." until Try again
- **Outcome:** reproduced (walk, 1440 and 390)
- **Severity:** broken
- **Where:** `apps/console/index.html:26-45` starts reads early; their 401s are kept 30 s and handed to the screen after sign-in (`apps/console/src/api.ts:91,113`). From SHL-05.
- **Fix:** an early read that answered 401 is never handed out; it is asked again after sign-in. Test it.

### WLK-03 Tenant overview for someone with workspace access only shimmers for ever
- **Outcome:** reproduced (walk, 390 dark)
- **Severity:** broken
- **Where:** `apps/console/src/screens/TenantOverview.tsx:171` (`!c ? <Loading />` when the counts failed). From SHL-09.

### WLK-04 Shortcut sheet: "Check the row" shows an empty key cap for Space
- **Outcome:** reproduced (walk)
- **Severity:** wrong
- **Where:** `apps/console/src/kit/shortcuts.ts:55`.

### WLK-05 "Your session ended" has a close button that does nothing
- **Outcome:** reproduced (walk)
- **Severity:** broken
- **Where:** `apps/console/src/SessionSheet.tsx:62`. It either closes (and the page says the session ended, with a way back) or shows no close button; Esc likewise. Check that Tab stays inside it.

### WLK-06 Add column with a taken name crashes the page
- **Outcome:** reproduced (walk, every width and theme)
- **Severity:** broken
- **Where:** `apps/console/src/ListScreen.tsx:199` (`error?.fields.find` on a plain Error from `takenColumn`, `apps/console/src/screens/Data.tsx:1732`, called at `:2412`). The same unguarded read is in `Roles.tsx:304`, `Branding.tsx:167`, `Domains.tsx:155`: fix in the shared piece, so any error a form gets is said on the form.

### WLK-07 A data source's address changed without a password: dropped in silence, then a raw driver error
- **Outcome:** reproduced (walk)
- **Severity:** wrong
- **Where:** `apps/control-plane/src/kernel/data/sources.ts:69-72` drops it (D10, as merged); the form says nothing; Test shows "SASL: SCRAM-SERVER-FIRST-MESSAGE: client password must be a string" (`kernel/data/health.ts:41-43`).
- **Fix:** D10 stands (dropped unless given again). The Change form asks for the password as soon as host, port, user or encryption differ from what is stored, and says the stored one will not go there; after a save, the row says the password must be set; a source with no password tests as "No password is set" in words. The same for connections' address changes (CFG-03): check the wizard says it.

### WLK-08 Change, opened again after a save, shows the details from before the save
- **Outcome:** reproduced (walk)
- **Severity:** data (saving that form points the source back, and drops its password)
- **Where:** `apps/console/src/ListScreen.tsx:191,202` keep the first `initial`; `Data.tsx` ChangeSource. Any form opened from ListScreen with initial values is a sibling.

### WLK-09 Smaller, from the data walk
- Focus falls to the page body after a purge, a rename (`Data.tsx` ~1416) and Discard in Queries; it returns to what opened the action.
- Dialogs of more than three fields open with focus on Close, not the first field (Add column, Change source).
- Add column says "Created." (`ListScreen.tsx:243`): it says what was made.
- A retired table's pill is cut to "Retir…" at 1440, and a table made in the console says "Managed in: Repository".
- Back after Discard in Queries leaves `?query=` on a blank new query with no word that it is gone.
- "Name and path" is enabled on a removal draft in Queries.
- Undo refused after another window's change says "Reload it" though the page shows the change already.
- At 390, Data sources scrolls sideways with Unbind out of view and no cue.

### WLK-10 Dialogs open with focus on Close, so Enter cancels
- **Outcome:** reproduced (data and widget walks: Add column, Change source, an action's confirmation)
- **Severity:** rough
- **Where:** `packages/ui/src/Dialog.tsx` / `SideSheet`: the shared piece. A form's first field takes focus; a confirmation's main button does, unless it destroys, when Cancel does. Check every caller still reads right (POLISH-013).

### WLK-11 Smaller, from the widget walk
- A custom confirmation title with a field ("Remove the invoice {number}?") reads "Remove the invoice?" for several rows: it gives the count, as the default title does (`packages/screens/src/actions.tsx`, `fillText`).
- A flow that refuses its input is shown as "does not match what the flow flows/wid-strict takes: /input must have required property 'why'." in two alerts: once, in words ("The flow needs why").
- The rows behind a money pivot cell show cents (135,795) where the widget shows $1,357.95: the same column format.
- Clearing an action's message and adding it again with Close on gives create, close, message: the message comes before the close.

### WLK-12 From the access and SSO walk
- `apps/console/src/screens/Members.tsx:255`: a member with no roles and no groups shows "Through groups only".
- Releases of access at 390 (`AccessReleases.tsx`): By and When are off-screen, Approve and "Go back to this" are clipped, and its inset differs from the other tabs. Groups at 390 (`Groups.tsx:229-248`): Delete clipped; the tab strip is cut to "Re…".
- After approving a release, focus drops to the page body.
- Error toasts stay over the inspector's buttons (Remove, Attributes) at 1440: a toast never covers what it is about, or the inspector gives it room.
- Disabling an end user has no confirmation, unlike suspending a member.
- A saved issuer change says "The provider was saved." and not that its secret was dropped (`SingleSignOn.tsx:729`).
- A refusal for a missing permission names the permission and nobody who can give it ("This needs the binding:write permission."): POLISH-009, in the shared piece that words refusals.
- A refused name shows the raw pattern ("must match pattern ^[a-z]…"); a short export passphrase shows the browser's own bubble: the shared piece words a pattern refusal per field.
- A domain hostname breaks mid-word; the role Summary says "Rows, Rows, past the row policy".
- Disabling an operator who belongs to no tenant shows no notice that it was done. (The Operators list's Disabled state belongs to lane ins2.)

### WLK-13 The flow editor's "Last test" panel shows a step's output with a secret unmasked, and the preview counts a secret
- **Outcome:** reproduced (walk, 1440 light, `shots29/flow/90-preview-1440-light.png`)
- **Severity:** security
- **Where:** `apps/control-plane/src/routes/flows.ts` `expressionContext` (the shield), and the step output the Last test panel reads. `size(trigger.api_key)` gave 10 (the mask's length) while the run gave 23; `show`'s output showed the raw key.
- **Fix:** every place a step's input or output reaches a person is masked by the same piece (D13/SCR-01), including the editor's test panel; an expression over a masked value says it cannot be previewed, rather than computing on the mask. Lane mask2.

### WLK-14 An approval detail written as a string from a secret field goes into the queue and the mail unmasked
- **Outcome:** reproduced (walk)
- **Severity:** security
- **Where:** `apps/control-plane/src/kernel/flows/approval-detail.ts:9` masks map details only. Lane mask2: a detail string is masked by the run's known values like any text.

### WLK-15 From the flow walk
- Renaming a case with Enter makes its edge disappear from the canvas until a reload (`FlowEditor.tsx:268`: handle ids change, `useUpdateNodeInternals` is not called).
- Header names compare case-sensitively, so `X-One` and `x-one` both save (`FlowEditor.tsx:2579`).
- A 300 KB trigger input fails with "No such key: blob", and the input panel shows `{"stored": "flow-runs/…/input.json"}`: a large input is read where it is kept, and said plainly if it cannot be.
- A deploy with problems shows a raw "bundle's manifests are not valid … /body/nodes/mail", and names a problem the editor's list does not: one list, in words, the same in both.
- In Add step, Enter does not pick the first match.
- Minor: the header says "Draft Draft" / "Deployed Deployed"; a reserved case name says "already used"; the edge label "otherwise" is cut; the approval link page shows times with no zone; the Triggers path breaks mid-word at 1440; at 390 the minimap covers the canvas.

### WLK-16 Left by tier 2 lanes, for the next owner of the file
- A service account's decision has no name in `decidedSteps` (`kernel/pages/approvals.ts`) or the retry plan's `approvalsKept`: they read `member` only (opsb).
- `fireScheduleNow` ignores a schedule's `source` (opsb; OPS findings).
- A child flow run's ID, and an exact run ID older than the When filter, say "No run has this ID" (opsb, OPS-33).
