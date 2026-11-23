# Phase 30 walk: fixes (reset link D4, truth fixes)

Instance http://localhost:8091, headless Playwright, screenshots in ~/.local/share/volvel-walk/shots30/fixes/. My data: members fixes-a..d, fixes-dev (developer), fixes-view (viewer), tenant fixes-two (fixes-b belongs to both), workspace fixes-ws in Fernhill.

## Reset link (D4)
- Right: Maya makes a link for fixes-a (confirm text, mailed result, Escape/Done return focus to the button, footer wraps at 390). Mail in mail-30. Link opened signed out: form, "Use at least 12 characters", "The two do not match", Enter submits, done state, reload shows "Nothing to set here". Session open in another browser ended; old password 401; new one signs in. Second link replaced the first (first shows expired). 390 dark/768/1440 look right (reset-*.png).
- Right: operator on All members makes links for fixes-b (two tenants) and fixes-c; a disabled member (fixes-d) has no button; Maya on fixes-b gets 409 "only an operator can make a password link"; self 400 "Change your own password on your Account screen"; unknown id 404.
- Could not walk: SSO-only member (no identity provider exists; none can be made offline). Read-only member button not walked.
- WRONG: All members row actions are cut off at 1440, 768 and 390 (shots op-members-fixes-*.png). The Disable button sits at x=1451 on a 1440 page; "Make a password reset link" is clipped. The brief says the row actions wrap; they do not. Cause: `apps/console/src/kit/ListCollection.tsx:106` (`inline-flex gap-2`, no wrap, no min width); every screen with `rowActions` shares it.
- WRONG: the operator's own row offers "Make a password reset link"; pressing it is refused with a toast (op-own-row-1440.png). Own row already hides Disable (INS-27). `apps/console/src/screens/Instance.tsx:129-137`.
- WRONG: after "Make the link" the result dialog does not keep focus: focus is on the trigger button behind it, so Enter reopens the confirmation (1440, operator). `apps/console/src/kit/MemberResetLink.tsx:41` (dialog opens as the confirm closes and gives focus back).
- Small: result dialog and public page show expiry as local time, the page says "MST", the dialog has no zone (10:04:07 for 17:04 GMT).
- Small: first row on the unfiltered All members list was about 465 px tall once (op-members-1440.png); not reproduced after filtering.

## Truth fixes
- Fire now: right. Developer sees it, runs the flow (run page opens); viewer has no button and the palette lacks "Fire it now"; Maya has both. Typing in the palette matches no page command ("Nothing matches Fire it now") even though it is listed when empty (palette-*.png).
- Retired table: right. Viewer: Bring back and Delete for good greyed with the permission in the tooltip (disabled buttons cannot be focused; a line below says the same). Developer: Bring back works, Delete for good greyed. Maya: Bring back works, Delete for good asks to type the name and deletes. Text "its 1 rows are kept" (`screens/Data.tsx:1834`) is wrong for one.
- Rows: right. Page 2, reload, Previous works (`?back=` in address). `?row=` to a row on another page opens it; to a deleted row says "That row is gone". Reference filter: a name gives the ID message, an ID filters (12 rows), survives reload. Refused Add row with a file: uploaded once, retry only re-posts the row. Refused save names the field ("is required" under title).
- WRONG: row editor labels a required column "optional" (title is required; `screens/Data.tsx:1292,1306,1316` pass `required={false}`).
- Small: Add row refusal (duplicate code) is a notice only, the field is not marked; the file input in Add row is the bare browser control while the inspector has a styled Replace (drift, `Data.tsx:1522`). In the inspector at 900 px tall Save row sits half under the footer.
- Column order t, j, d, a: right in grid, Add row, CSV (API) and Definition, 1440/768/390.
- Two Tabs of one id on two pages (interface with remember): right. Each page keeps its own tab across page changes and reload.
- Event pickers: right in New trigger (Event): platform/run-finished listed with payload. Flow editor's picker not walked (shares `listenChoices`).
