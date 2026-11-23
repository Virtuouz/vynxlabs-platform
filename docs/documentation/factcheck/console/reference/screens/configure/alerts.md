# Fact-check record: console/reference/screens/configure/alerts.md

Lines are current at commit `5ebf1c80` (branch phase-31-write-the-docs). Paths are under the repository root. Written by the writer; "Checked by" is for the second agent.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Description and section names. | apps/console/src/screens/Alerts.tsx:157-170,214,226 | writer, run on the instance 2026-11-23; second agent, 2026-11-23 (see the second check below) | holds as run |
| Start a script and Post to a connection selects; None; stale values kept as '(not found)' / '(no longer bound)'; only bound http connections. | apps/console/src/screens/Alerts.tsx:116-137,172-205 | writer, read from the code 2026-11-23; second agent, 2026-11-23 (see the second check below) | holds as read |
| Save toast; Send a test alert states and texts. | apps/console/src/screens/Alerts.tsx:96-110,60-71,209-236 | writer, run on the instance 2026-11-23 (Save); second agent, 2026-11-23 (see the second check below) | holds as run |
| Set by scripts themselves list and From the repository tag. | apps/console/src/screens/Alerts.tsx:240-262 | writer, run on the instance 2026-11-23; second agent, 2026-11-23 (see the second check below) | holds as run |
| Recent alerts: 50 a page, Older alerts, Posted/Not posted, +N more, The script it started, empty text. | apps/console/src/screens/Alerts.tsx:264-340; apps/control-plane/src/routes/alerts.ts:33 | writer, run on the instance 2026-11-23; second agent, 2026-11-23 (see the second check below) | holds as run |
| Permissions run:read / resource:read / connection:write / workspace:write. | apps/control-plane/src/routes/alerts.ts:35,99,161; routes/workspaces.ts:398 | writer, read from the code 2026-11-23; second agent, 2026-11-23 (see the second check below) | holds as read |

## Second check (2026-11-23)

Checked by: second agent, 2026-11-23. This is the one record and the one page for the screen: the operate writer's and the configure writer's pages were already one file at the start of this check (one page under configure, no second page under operate); it was read whole against Alerts.tsx, RunAlert.tsx, routes/alerts.ts and kernel/execution/alerts.ts, and run on the instance in my own workspace.

| Claim | Source | Result |
| --- | --- | --- |
| Description, sections, Start a script / Post to a connection (None and the lists), Save "Alerts will go there from the next failure.", Send a test alert ("Sending…", then "The test alert was posted."). | Alerts.tsx; run | holds as run |
| A post to a connection: an HTTP connection of mine at a local address received {"run":{"id","error","script","attempt","workspace"},"text":"Run failed: opchk/boom in operate-check. opchk boom: on purpose"}; the test alert's body has "test": true and the text "Test alert from operate-check. Alerts for failed runs will look like this." | alerts.ts:196-205; run | holds as run |
| Recent alerts: the script's path, "7s ago", Posted, "+1 more" for the second failure, the error, The script it started. | Alerts.tsx:240-340; run | holds as run |
| A second failure within ten minutes was counted: "1 later failure was counted on this alert, not sent on its own." | alerts.ts:260-285; run | holds as run |
| A flow run that failed (a rejected approval) was alerted: "The failure notification was posted." | run | holds as run |
| A member without workspace:write: Save is disabled with "You can see where this workspace's alerts go, not change it. It needs workspace:write. …"; Send a test alert still enabled (connection:write). | run | holds as run |
| "(no longer bound)" beside a connection that is no longer set up. | Alerts.tsx:166 | fault fixed (fb): the string is "no longer set up here" (Alerts.tsx:166), confirmed in the code; the page says so |
| 390 px and dark: no horizontal scroll. | run | holds as run |
