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
