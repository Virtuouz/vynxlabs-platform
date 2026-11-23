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
