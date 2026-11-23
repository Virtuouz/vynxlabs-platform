# Fact-check record: console/reference/screens/operate/runs.md

Lines are current at commit `5ebf1c80` (branch phase-31-write-the-docs). Paths are under the repository root. Written by the writer; "Checked by" is for the second agent.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Windows: Last hour, Last 24 hours (default), Last 7 days, Between…, Everything kept. | apps/console/src/screens/Runs.tsx:103-109,169 | writer, run on the instance 2026-11-23; second agent, 2026-11-23 (see the second check below) | holds as run |
| Status chips and their labels; a later run counts under Waiting for a time. | apps/console/src/screens/Runs.tsx:124-133; apps/control-plane/src/kernel/execution/state.ts runState | writer, run on the instance 2026-11-23; second agent, 2026-11-23 (see the second check below) | holds as run |
| Search placeholder, 300 ms, 200 characters, what it finds. | apps/console/src/screens/Runs.tsx:765-771; apps/console/src/kit/addressBox.ts; apps/control-plane/src/routes/operations.ts activity route | writer, read from the code 2026-11-23; second agent, 2026-11-23 (see the second check below) | holds as read |
| Between… : From and To fields, From defaults to 24 h ago, empty To is until now, backwards window notice 'The end is before the start.' | apps/console/src/screens/Runs.tsx:237-242,791-830,834 | writer, run on the instance 2026-11-23; second agent, 2026-11-23 (see the second check below) | holds as run |
| Cancel N queued: shown only with All/Queued chip, not Flows, queued>0, run:write; its text and notice. | apps/console/src/screens/Runs.tsx:407-435,870-877 | writer, read from the code 2026-11-23; second agent, 2026-11-23 (see the second check below) | holds as read |
| Cancel by age…: shown when a run is in progress and run:write or flow_run:write; dialog texts; 10,000 per request; script runs narrowed by search/tags/target, not window. | apps/console/src/screens/Runs.tsx:373,878-882,903-915; apps/console/src/screens/CancelOlder.tsx:23-155; apps/control-plane/src/kernel/execution/bulk-cancel.ts:10 | writer, run on the instance 2026-11-23 (dialog opened); second agent, 2026-11-23 (see the second check below) | holds as run |
| Columns, order and what each shows; Attempt only when attempt>1; unfinished duration shows a dash. | apps/console/src/screens/Runs.tsx:642-740 | writer, run on the instance 2026-11-23; second agent, 2026-11-23 (see the second check below) | holds as run |
| Row menu items and when each shows. | apps/console/src/screens/Runs.tsx:553-640 | writer, run on the instance 2026-11-23 (Open, Run again…, Only runs of…, Copy; Cancel); second agent, 2026-11-23 (see the second check below) | holds as run |
| Checked-row bar: N selected, Cancel, Run again, Clear; texts of both questions. | apps/console/src/screens/Runs.tsx:484-543; apps/console/src/kit/DataTable.tsx:425-440 | writer, read from the code 2026-11-23; second agent, 2026-11-23 (see the second check below) | holds as read |
| API takes at most 100 per kind; console sends slices of 100. | apps/control-plane/src/routes/batch.ts:19,34; apps/console/src/kit/BatchResult.tsx | writer, read from the code 2026-11-23; second agent, 2026-11-23 (see the second check below) | holds as read |
| Batch failure dialog: 'N done, M not done.', request ID, Retry the M not done. | apps/console/src/kit/BatchResult.tsx:132,168 | writer, read from the code 2026-11-23; second agent, 2026-11-23 (see the second check below) | holds as read |
| Header text 'Scripts and flows that ran here…', Kept N days, Updated HH:MM, asked again every 5 s. | apps/console/src/screens/Runs.tsx:749-761 | writer, run on the instance 2026-11-23; second agent, 2026-11-23 (see the second check below) | holds as run |
| Page size 100, Load more, 'N new runs' button, 5 s poll without the stream. | apps/console/src/screens/Runs.tsx:243,333-342,986-1003,1057-1065 | writer, read from the code 2026-11-23; second agent, 2026-11-23 (see the second check below) | holds as read |
| Inspector tabs Logs / Input and output / Details, fields of the Details tab. | apps/console/src/screens/Runs.tsx:1242-1375 | writer, read from the code 2026-11-23; second agent, 2026-11-23 (see the second check below) | holds as read |
| Flow run inspector fields. | apps/console/src/screens/Runs.tsx:1073-1105 | writer, read from the code 2026-11-23; second agent, 2026-11-23 (see the second check below) | holds as read |
| Unknown ID: 'No run has this ID.'; step of a flow run notice. | apps/console/src/screens/Runs.tsx:942-974 | writer, read from the code 2026-11-23; second agent, 2026-11-23 (see the second check below) | holds as read |
| Keys. | apps/console/src/kit/DataTable.tsx:283-359; apps/console/src/kit/keys.ts:41 | writer, read from the code 2026-11-23; second agent, 2026-11-23 (see the second check below) | holds as read |
| Address keys status, kind, when, from, to, q, tag, target, sort, dir, cols, run; ?status=cancelled still works. | apps/console/src/screens/Runs.tsx:166-179,210 | writer, read from the code 2026-11-23; second agent, 2026-11-23 (see the second check below) | holds as read |
| Empty state 'Nothing ran in this time'; filtered 'Nothing matches these filters', Clear filters. | apps/console/src/screens/Runs.tsx:1046; apps/console/src/kit/DataTable.tsx:401-412 | writer, read from the code 2026-11-23; second agent, 2026-11-23 (see the second check below) | holds as read |
| Saved views menu items; 50 per list, 16,384 bytes, name 1-80. | apps/console/src/kit/views.tsx:140-170; apps/control-plane/src/routes/preferences.ts:19-37 | writer, read from the code 2026-11-23; second agent, 2026-11-23 (see the second check below) | holds as read |
| Permissions: activity needs workspace:read; cancel/rerun run:write at workspace or script; bulk cancel run:write; flow runs flow_run:write. | apps/control-plane/src/routes/operations.ts:204; routes/execution.ts:1373,1768; routes/flows.ts:1533 | writer, read from the code 2026-11-23; second agent, 2026-11-23 (see the second check below) | holds as read |
| Row menu counts a grant on the script or flow; batch bar and Cancel N queued use workspace-level permission. | apps/console/src/screens/Runs.tsx:376-388 | writer, read from the code 2026-11-23; second agent, 2026-11-23 (see the second check below) | holds as read |

## Second check (2026-11-23)

Checked by: second agent, 2026-11-23. Method: every bold label and quoted text of the page was searched in apps/console/src and apps/control-plane/src (all found, except the templated ones with a name or a number in them, whose templates were read); the constants (100 a page, 300 ms, 50 views, 16,384 bytes, 80 characters, 100 a batch) and the row menu, the toolbar conditions and the CancelOlder dialog were read; the rest was run on the instance in a workspace of my own (Operate check, in Fernhill's tenant, with scripts of mine).

| Claim | Source | Result |
| --- | --- | --- |
| Cancel N queued: offered with 5 queued runs, asked "Cancel 5 queued runs?" with "Every queued script run from the last 24 hours is canceled, whether or not this page has loaded it. Runs already going carry on, and a flow's steps are left to their flow."; the Queued count went to 0 and Canceled to 5. | Runs.tsx:395-435; run on the instance | corrected: the page now gives the sentence with what narrows it |
| Cancel by age, Script runs: with q=opchk/slow, Amount 5 seconds, Continue showed "This cancels every script run started more than 5 seconds ago that has not finished. It cannot be undone."; 9 runs (queued and the one going) were canceled. | CancelOlder.tsx:56-165; run | corrected: the answer reads "N script runs canceled." (the page said only flow) |
| Cancel by age, Flow runs: "1 flow run canceled." | CancelOlder.tsx:76; run | holds as run |
| Checked rows: "2 selected", Cancel, Run again, Clear; "Cancel 2 runs?" ("opchk/slow, opchk/slow. Runs that have finished are left as they are."), "Run 2 runs again?" with the sentence about scripts and flows. | Runs.tsx:484-543; run | holds as run |
| Load more after 100 runs added the rest (117 rows of the hook shown after it). | Runs.tsx:243; run | holds as run |
| Saved views: Save this view…, Copy a link to this view; after saving, Rename "name"… and Delete "name". | views.tsx; run | holds as run |
| Row menu conditions. | Runs.tsx:553-640 | holds as read |
| At 390 px, 768 px, light and dark: no horizontal scroll, the toolbar wraps. | run | holds as run |

Not run: the 10,000 limit, the failure dialog "N done, M not done".
