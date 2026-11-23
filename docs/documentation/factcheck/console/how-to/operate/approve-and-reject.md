# Fact-check record: console/how-to/operate/approve-and-reject.md

Lines are current at commit `5ebf1c80` (branch phase-31-write-the-docs). Paths are under the repository root. Written by the writer; "Checked by" is for the second agent.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Console steps, prompts and toasts. | apps/console/src/screens/Operate.tsx:1148-1182 | writer, run on the instance 2026-11-23; second agent: pending | holds as run |
| Flow run page buttons and lines. | apps/console/src/screens/Flows.tsx:828-905 | writer, run on the instance 2026-11-23; second agent: pending | holds as run |
| Mail and link behavior and texts. | apps/control-plane/src/kernel/flows/approval-links.ts; apps/console/src/screens/ApproveLink.tsx | writer, read from the code 2026-11-23; second agent: pending | holds as read |
| Decided list shows Declined and the reason. | apps/console/src/screens/Operate.tsx:1270-1287 | writer, run on the instance 2026-11-23; second agent: pending | holds as run |
