# Fact-check record: develop/explanation/operate/failure-alerts.md

Lines are current at commit `5ebf1c80` (branch phase-31-write-the-docs). Paths are under the repository root. Written by the writer; "Checked by" is for the second agent.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Alerted: final failure of a script run; flow run failure, not a sub-flow's; source runs. | apps/control-plane/src/kernel/execution/runs.ts:728-738; kernel/flows/engine.ts:472-480; kernel/execution/triggers.ts:715-726,875-890 | writer, read from the code 2026-11-23; second agent: pending | holds as read |
| Handler runs do not alert. | apps/control-plane/src/kernel/execution/alerts.ts:62 | writer, read from the code 2026-11-23; second agent: pending | holds as read |
| onFailure replaces the default; empty onFailure leaves it. | apps/control-plane/src/kernel/execution/alerts.ts:118-126 | writer, read from the code 2026-11-23; second agent: pending | holds as read |
| Handler input and trigger 'alert'. | apps/control-plane/src/kernel/execution/alerts.ts:152-166; apps/console/src/kit/starts.ts:13 | writer, read from the code 2026-11-23; second agent: pending | holds as read |
| Post payload; worker pool. | apps/control-plane/src/kernel/execution/alerts.ts:176-203 | writer, read from the code 2026-11-23; second agent: pending | holds as read |
| Ten-minute window, counted on the first alert, message '(and N more failures since the last alert)'. | apps/control-plane/src/kernel/execution/alerts.ts:131-141,217-260 | writer, read from the code 2026-11-23; second agent: pending | holds as read |
