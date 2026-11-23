# Fact-check record: console/reference/screens/operate/approvals.md

Lines are current at commit `5ebf1c80` (branch phase-31-write-the-docs). Paths are under the repository root. Written by the writer; "Checked by" is for the second agent.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Three chips and their counts; ?show=. | apps/console/src/screens/Operate.tsx:1069,1184-1202 | writer, run on the instance 2026-11-23; second agent: pending | holds as run |
| Description text of the page and of Waiting for others. | apps/console/src/screens/Operate.tsx:1090-1092,1210-1211 | writer, run on the instance 2026-11-23; second agent: pending | holds as run |
| Columns of each view. | apps/console/src/screens/Operate.tsx:1213-1249,1269-1316,1334-1380 | writer, run on the instance 2026-11-23; second agent: pending | holds as run |
| Approve and Reject prompts; reason required (Reject disabled until typed); toasts. | apps/console/src/screens/Operate.tsx:1148-1182 | writer, run on the instance 2026-11-23; second agent: pending | holds as run |
| Batch prompts and labels; slices of 100. | apps/console/src/screens/Operate.tsx:1102-1145 | writer, read from the code 2026-11-23; second agent: pending | holds as read |
| Inspector fields and commands. | apps/console/src/screens/Operate.tsx:1414-1485 | writer, run on the instance 2026-11-23; second agent: pending | holds as run |
| Decided: last 100; By shows email or service account name; 'decided from the mail'. | apps/control-plane/src/routes/flows.ts:1652,960-980; apps/console/src/screens/Operate.tsx:1262-1316 | writer, run on the instance 2026-11-23; second agent: pending | holds as run |
| Empty texts. | apps/console/src/screens/Operate.tsx:1257,1321,1410-1413 | writer, read from the code 2026-11-23; second agent: pending | holds as read |
| Who may decide: approval:write plus approvers; a service account has no member ID so is not an approver of a step that names any. | apps/control-plane/src/kernel/flows/approvers.ts:121-127,301-318 | writer, read from the code 2026-11-23; second agent: pending | holds as read |
| Flow editor fields: What is being approved, Detail to show, Give up after, Who may decide, Where it waits; limits 200, 20, 2,592,000. | apps/console/src/screens/FlowEditor.tsx:2205-2250; apps/console/src/screens/FlowStepFields.tsx:290-375; packages/manifest/src/kinds.ts:905-940 | writer, read from the code 2026-11-23; second agent: pending | holds as read |
| Mail: subject, 50 approvers, 48 h or step time limit, single use, [Test] prefix, no mail without configuration. | apps/control-plane/src/kernel/flows/approval-links.ts:41,66-160; kernel/flows/approvers.ts:248 | writer, read from the code 2026-11-23; second agent: pending | holds as read |
| Link page texts; 410 text; rate limit 30 a minute. | apps/console/src/screens/ApproveLink.tsx:20-166; apps/control-plane/src/routes/approval-links.ts:14 | writer, read from the code 2026-11-23; second agent: pending | holds as read |
| Permissions approval:read / approval:write. | apps/control-plane/src/routes/flows.ts:1724,1757,1836 | writer, read from the code 2026-11-23; second agent: pending | holds as read |
| Rejecting sentence. | apps/console/src/kit/approvals.ts:5 | writer, read from the code 2026-11-23; second agent: pending | holds as read |
