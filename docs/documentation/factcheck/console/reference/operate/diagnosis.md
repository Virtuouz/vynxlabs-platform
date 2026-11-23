# Fact-check record: console/reference/operate/diagnosis.md

Lines are current at commit `5ebf1c80` (branch phase-31-write-the-docs). Paths are under the repository root. Written by the writer; "Checked by" is for the second agent.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Every row of the table, its cause, next step and section, in the order checked. | apps/control-plane/src/kernel/execution/diagnose.ts:21-195 | writer, read from the code 2026-11-23; second agent, 2026-11-23 (see the second check below) | holds as read |
| 'It failed on all N attempts.' when attempt >= maxAttempts > 1. | apps/control-plane/src/kernel/execution/diagnose.ts:80-82 | writer, read from the code 2026-11-23; second agent, 2026-11-23 (see the second check below) | holds as read |
| Open <section> buttons. | apps/console/src/screens/RunPage.tsx:559-566; apps/console/src/screens/Runs.tsx:1209-1214 | writer, read from the code 2026-11-23; second agent, 2026-11-23 (see the second check below) | holds as read |
| Diagnosis shown for a flow step's script run. | apps/console/src/screens/Flows.tsx:1048-1050 | writer, read from the code 2026-11-23; second agent, 2026-11-23 (see the second check below) | holds as read |

## Second check (2026-11-23)

Checked by: second agent, 2026-11-23. diagnose.ts (the whole file) was read against the table: the order, every cause and next step, the buttons ("Open " plus the section, RunPage.tsx:560) and the 413 and status rules match.

| Claim | Source | Result |
| --- | --- | --- |
| The 22 rows in the order checked. | apps/control-plane/src/kernel/execution/diagnose.ts:80-190 | holds as read |
| The texts say "Bind … under Connections", "nothing bound", "the platform refused", "reach the platform". | diagnose.ts:107-108,158,... | holds as read; fault fixed (fb, fc): the texts say "not set up", "Set it up under Connections" and Volvel, confirmed in the code (diagnose.ts:95-160); the page now quotes them. |
