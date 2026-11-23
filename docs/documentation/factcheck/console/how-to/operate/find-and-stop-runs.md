# Fact-check record: console/how-to/operate/find-and-stop-runs.md

Lines are current at commit `5ebf1c80` (branch phase-31-write-the-docs). Paths are under the repository root. Written by the writer; "Checked by" is for the second agent.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Every control named in the steps and its behavior. | apps/console/src/screens/Runs.tsx (see the record of the Runs reference page) | writer, run on the instance 2026-11-23; second agent, 2026-11-23 (see the second check below) | holds as run |
| Cancel run question texts; confirm labels. | apps/console/src/screens/Runs.tsx:484-501,605-616; apps/console/src/screens/RunPage.tsx:286-298 | writer, run on the instance 2026-11-23; second agent, 2026-11-23 (see the second check below) | holds as run |
| Cancel by age flow and its warning. | apps/console/src/screens/CancelOlder.tsx:95-155 | writer, run on the instance 2026-11-23 (dialog opened, not confirmed); second agent, 2026-11-23 (see the second check below) | holds as run |
| Cancel announced as platform/run-finished with cancelled. | apps/control-plane/src/kernel/execution/runs.ts:677-682 | writer, read from the code 2026-11-23; second agent, 2026-11-23 (see the second check below) | holds as read |
| 10,000 a time; 'More are left: cancel again.' | apps/control-plane/src/kernel/execution/bulk-cancel.ts:10; apps/console/src/screens/Runs.tsx:428-430; apps/console/src/screens/CancelOlder.tsx:73-77 | writer, read from the code 2026-11-23; second agent, 2026-11-23 (see the second check below) | holds as read |
| A run waiting for a time has no Cancel run on its page. | apps/console/src/screens/RunPage.tsx:260,395 | writer, run on the instance 2026-11-23; second agent, 2026-11-23 (see the second check below) | holds as run |

## Second check (2026-11-23)

Checked by: second agent, 2026-11-23. Run in a workspace of my own (Operate check, a dev workspace in Fernhill's tenant, with scripts, flows and triggers of mine deployed by the CLI, and a production workspace linked to it): Cancel N queued, a confirmed Cancel by age (script runs, then flow runs), checked-row Cancel and Run again, Load more, Saved views. See the run log.

| Claim | Source | Result |
| --- | --- | --- |
| Steps 1 to 4 under "Cancel runs", the dialogs and their buttons. | Runs.tsx; CancelOlder.tsx; run | holds as run |
| Notices after Cancel by age. | CancelOlder.tsx:76 | corrected: "N script runs canceled." added |
| "A run that waits for a time has no Cancel run on its page." | RunPage.tsx:260 | fault fixed (fb): a waiting run's page offers Cancel run, confirmed in the code; the troubleshooting item is removed. |
