# Walk: w-operate (phase 29)

Instance localhost:8091. Own workspaces `wop-dev` and `wop-main` (Maya Brooks tenant admin, Amara Okafor viewer). Shots in ~/.local/share/volvel-walk/shots29/w-operate/. Widths 1440, 768, 390; light and dark spread across them; keyboard; reload.

## Walked and right
- OPS-MP7 Between (from/to in the address, reload, Back, saved view, empty "Nothing ran in this time", end-before-start notice). runs-between-*.png
- OPS-MP8 Run later and priority: refusals in words (no time, past, 500), valid run goes to its page, focus lands in main. run-later-390-light.png
- OPS-25 list shows "Waiting until 23:02:00" and the chip counts it. OPS-34 unfinished runs last both ways.
- OPS-MP9 Published section, links to the event. OPS-MP10 handler link, "notification was not sent", suppressed sentence, flow run alert.
- OPS-30 "Only masked values differ." (masked-only-1440-light.png); source compare link.
- OPS-36 "Paused ... by Maya Brooks"; OPS-MP3 Fire now for a flow schedule, opens the run; resume.
- OPS-MP1 publish dialog, field refusal, production confirm, focus back. OPS-MP2 platform events in the trigger editor.
- Approvals, Alerts as viewer (fields disabled, notice), Deploy/Versions words, roll back dialog, Connections test failure words.

## Wrong
1. Runs 390 (light, dark): "Waiting for approval" and "Waiting until ..." overlap the Target column. runs-390-light.png. kit/status.tsx:150, Runs.tsx columns.
2. Pause reason runs into the next sentence: "...Checking the weekly run first Nothing it would start..." (all widths). trigger-paused-390-dark.png. Operate.tsx:643.
3. Runs, window ends before it starts: the old rows stay under the notice. runs-between-bad-390-light.png. Runs.tsx:257.
4. Run dialog says "A later run waits as queued", but OPS-25 lists it as waiting for a time; its run page says only "Waiting", no time. InputDialog.tsx.
5. Viewer (1440): peek and run page still offer Re-run and Edit with this input (listed as not done); flow page offers Add a schedule (ObjectPages.tsx:503); Triggers offers New trigger and Edit.
6. Platform event hints cut off at 390 ("Payload: runl..."), not wrapped. platform-events-390-light.png.
7. Words: "The connection is not bound", "Unbind", "1 missing" remain beside "Not set up here".
8. "The failure handler's run" and the event links look like plain text (no link colour).

## Not walked
Environments database locations; flow editor event start; run page connections; the flow's own run page as a viewer.

## Found
Deploying all drafts together fails when a trigger path sorts before its script ("wop/hook" before "wop/ok"); the deploy had to be split.
