# Phase 30, lane explain: "What does this mean?" inside a dialog

Source: walks/p30-r-last.md item F. A coded refusal in a dialog (Create table, Add row) offered "What does this mean?", which opened the help panel behind the modal; focus went to a hidden heading and Esc stopped closing the dialog.

## Built
- `packages/ui/src/overlay.ts`: `InOverlay` context, `useInOverlay()`. Provided by `Dialog` (Dialog.tsx) and `SideSheet` (SideSheet.tsx), so any notice inside either knows it is in a modal.
- `packages/ui/src/Notice.tsx`: `FailureHelp` gains `inline: { body, href }`. Inside a modal the button toggles (`aria-expanded`, `aria-controls`) a region under the notice with the explanation and "Open in documentation" (new tab). Outside a modal, unchanged: `onClick` opens the panel.
- `apps/console/src/help/ErrorMeans.tsx`: loads the errors page the panel already loads (`loadPage`) and draws the code's section; says so in words if it cannot load.
- `apps/console/src/ask.tsx` (setFailureExplainer): supplies `inline`. The toast action (`explained`) is untouched and still opens the panel.

## Test
`apps/console/src/help/Help.test.tsx`, "a failure shown inside a dialog explains itself there": seen failing before the explainer supplied `inline`; passes after. Proves: the code's words appear inside the dialog, the panel stays shut, the link is /docs/develop/reference/errors#draft_changed with target _blank, focus stays in the dialog, Esc calls onClose. The existing toast test and the outside-a-dialog notice test still open the panel.

## Callers of the shared piece (POLISH-013)
Every danger `Notice` of coded words inside any `Dialog` or `SideSheet`, with no change at the call sites.

## Left
No SideSheet-specific test (same context provider). Walk to do: Create table and Add row with a refused code at 390/768/1440, light and dark; region wraps under the notice.
