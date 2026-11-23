# Fact-check record: console/how-to/operate/set-failure-alerts.md

Lines are current at commit `5ebf1c80` (branch phase-31-write-the-docs). Paths are under the repository root. Written by the writer; "Checked by" is for the second agent.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Steps and texts of the Alerts screen. | apps/console/src/screens/Alerts.tsx | writer, run on the instance 2026-11-23; second agent: pending | holds as run |
| onFailure in a script definition. | packages/sdk/src/index.ts:221,281-285 | writer, read from the code 2026-11-23; second agent: pending | holds as read |
| Body JSON of the post. | apps/control-plane/src/kernel/execution/alerts.ts:142-148,185-195 | writer, read from the code 2026-11-23; second agent: pending | holds as read |
| Not alerted: canceled, steps, handler runs; ten-minute window. | apps/control-plane/src/kernel/execution/alerts.ts:62-65,217-260; kernel/execution/runs.ts:728-738 | writer, read from the code 2026-11-23; second agent: pending | holds as read |
| Error text for a missing connection. | apps/control-plane/src/kernel/execution/alerts.ts:178-180 | writer, read from the code 2026-11-23; second agent: pending | holds as read |
