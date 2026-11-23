# Fact-check record: console/reference/screens/configure/alerts.md

Lines are current at commit `5ebf1c80` (branch phase-31-write-the-docs). Paths are under the repository root. Written by the writer; "Checked by" is for the second agent.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Description and section names. | apps/console/src/screens/Alerts.tsx:157-170,214,226 | writer, run on the instance 2026-11-23; second agent: pending | holds as run |
| Start a script and Post to a connection selects; None; stale values kept as '(not found)' / '(no longer bound)'; only bound http connections. | apps/console/src/screens/Alerts.tsx:116-137,172-205 | writer, read from the code 2026-11-23; second agent: pending | holds as read |
| Save toast; Send a test alert states and texts. | apps/console/src/screens/Alerts.tsx:96-110,60-71,209-236 | writer, run on the instance 2026-11-23 (Save); second agent: pending | holds as run |
| Set by scripts themselves list and From the repository tag. | apps/console/src/screens/Alerts.tsx:240-262 | writer, run on the instance 2026-11-23; second agent: pending | holds as run |
| Recent alerts: 50 a page, Older alerts, Posted/Not posted, +N more, The script it started, empty text. | apps/console/src/screens/Alerts.tsx:264-340; apps/control-plane/src/routes/alerts.ts:33 | writer, run on the instance 2026-11-23; second agent: pending | holds as run |
| Permissions run:read / resource:read / connection:write / workspace:write. | apps/control-plane/src/routes/alerts.ts:35,99,161; routes/workspaces.ts:398 | writer, read from the code 2026-11-23; second agent: pending | holds as read |
