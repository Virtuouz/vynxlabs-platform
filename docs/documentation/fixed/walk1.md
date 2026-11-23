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
