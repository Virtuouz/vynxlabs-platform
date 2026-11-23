# Fact-check record: console/how-to/widgets/run-an-action-from-a-widget.md

Lines are current at commit `14f7d5b9` (branch phase-31-write-the-docs). Paths are under `apps/console/src` unless they start with `apps/control-plane` or `packages`. Written by the writer; "Checked by" is for the second agent.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Actions tab: Row actions, "+ Row action", "Shown at the end of the row on hover, and in the detail sheet." | `kit/inspector/widgets/tableDrawer.tsx:569-571`; run | writer, run on the instance 2026-11-23 | holds as run |
| Says; "What Mark done does"; Add a step menu: Ask to confirm, Update the record, Make a record, Remove the record, Run a flow, Run a script, Open a page, Show a message. | `kit/inspector/actionModel.ts:71-100`; run (menu) | writer, run on the instance 2026-11-23 | holds as run |
| Update the record: "The clicked appointment", + Set another field, field becomes a value. | `kit/inspector/actionControls.tsx:227`; run | writer, run on the instance 2026-11-23 | holds as run |
| Ask to confirm is put first; default words "Mark done for the appointment A-7687 of Willow on Dec 4?"; buttons Cancel and Mark done. | run (served app); `packages/screens/src/confirmWords.ts` | writer, run on the instance 2026-11-23 | holds as run; the date reads Dec 4 while the cell reads Dec 3, 6:20 PM (product fault) |
| If it fails: Show the error and stop; When it is done, say. | `actionControls.tsx:1234,1244`; run | writer, run on the instance 2026-11-23 | holds as run |
| Can be pressed when (Only when…) grays with a tooltip; Who can run it (Group). | Actions tab text, run; `apps/control-plane/src/kernel/pages/act.ts` (runBy) | writer, run on the instance 2026-11-23 | not pressed |
| An action has up to eight steps; data steps run in one transaction. | `packages/manifest/src/action.ts:151-184`; `act.ts` | writer, code only | not run |
| After the action the page reads again; booked group went 25 to 24. | `packages/screens/src/actions.tsx:691`; run | writer, run on the instance 2026-11-23 | holds as run |
| "An action has no steps yet." under Needs fixing. | run | writer, run on the instance 2026-11-23 | holds as run |
| Row actions are not pressable in the builder. | run: buttons disabled in the canvas | writer, run on the instance 2026-11-23 | holds as run |
