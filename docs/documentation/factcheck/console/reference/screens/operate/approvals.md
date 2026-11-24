# Fact-check record: console/reference/screens/operate/approvals.md

Lines are current at commit `5ebf1c80` (branch phase-31-write-the-docs). Paths are under the repository root. Written by the writer; "Checked by" is for the second agent.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Three chips and their counts; ?show=. | apps/console/src/screens/Operate.tsx:1069,1184-1202 | writer, run on the instance 2026-11-23; second agent, 2026-11-23 (see the second check below) | holds as run |
| Description text of the page and of Waiting for others. | apps/console/src/screens/Operate.tsx:1090-1092,1210-1211 | writer, run on the instance 2026-11-23; second agent, 2026-11-23 (see the second check below) | holds as run |
| Columns of each view. | apps/console/src/screens/Operate.tsx:1213-1249,1269-1316,1334-1380 | writer, run on the instance 2026-11-23; second agent, 2026-11-23 (see the second check below) | holds as run |
| Approve and Reject prompts; reason required (Reject disabled until typed); toasts. | apps/console/src/screens/Operate.tsx:1148-1182 | writer, run on the instance 2026-11-23; second agent, 2026-11-23 (see the second check below) | holds as run |
| Batch prompts and labels; slices of 100. | apps/console/src/screens/Operate.tsx:1102-1145 | writer, read from the code 2026-11-23; second agent, 2026-11-23 (see the second check below) | holds as read |
| Inspector fields and commands. | apps/console/src/screens/Operate.tsx:1414-1485 | writer, run on the instance 2026-11-23; second agent, 2026-11-23 (see the second check below) | holds as run |
| Decided: last 100; By shows email or service account name; 'decided from the mail'. | apps/control-plane/src/routes/flows.ts:1652,960-980; apps/console/src/screens/Operate.tsx:1262-1316 | writer, run on the instance 2026-11-23; second agent, 2026-11-23 (see the second check below) | holds as run |
| Empty texts. | apps/console/src/screens/Operate.tsx:1257,1321,1410-1413 | writer, read from the code 2026-11-23; second agent, 2026-11-23 (see the second check below) | holds as read |
| Who may decide: approval:write plus approvers; a service account has no member ID so is not an approver of a step that names any. | apps/control-plane/src/kernel/flows/approvers.ts:121-127,301-318 | writer, read from the code 2026-11-23; second agent, 2026-11-23 (see the second check below) | holds as read |
| Flow editor fields: What is being approved, Detail to show, Give up after, Who may decide, Where it waits; limits 200, 20, 2,592,000. | apps/console/src/screens/FlowEditor.tsx:2205-2250; apps/console/src/screens/FlowStepFields.tsx:290-375; packages/manifest/src/kinds.ts:905-940 | writer, read from the code 2026-11-23; second agent, 2026-11-23 (see the second check below) | holds as read |
| Mail: subject, 50 approvers, 48 h or step time limit, single use, [Test] prefix, no mail without configuration. | apps/control-plane/src/kernel/flows/approval-links.ts:41,66-160; kernel/flows/approvers.ts:248 | writer, read from the code 2026-11-23; second agent, 2026-11-23 (see the second check below) | holds as read |
| Link page texts; 410 text; rate limit 30 a minute. | apps/console/src/screens/ApproveLink.tsx:20-166; apps/control-plane/src/routes/approval-links.ts:14 | writer, read from the code 2026-11-23; second agent, 2026-11-23 (see the second check below) | holds as read |
| Permissions approval:read / approval:write. | apps/control-plane/src/routes/flows.ts:1724,1757,1836 | writer, read from the code 2026-11-23; second agent, 2026-11-23 (see the second check below) | holds as read |
| Rejecting sentence. | apps/console/src/kit/approvals.ts:5 | writer, read from the code 2026-11-23; second agent, 2026-11-23 (see the second check below) | holds as read |

## Second check (2026-11-23)

Checked by: second agent, 2026-11-23. Method: every label and quoted text searched in the console source; constants read (2,000 characters of a note: flows.ts:1844; 100 decided: flows.ts:1652; links 48 hours, 50 people, 30 a minute: approval-links.ts:20, approvers.ts:248, routes/approval-links.ts:14; 2,592,000 seconds: kinds.ts:895); the instance had MAIL_CAPTURE_DIR set, so the mail was read from its capture folder.

| Claim | Source | Result |
| --- | --- | --- |
| The mail "Approval needed: Approve an opchk thing" sent to the two members who may decide (Maya Brooks, Rowan Ellis); it names the flow, the workspace and tenant, the detail and "Approve or reject it here: <link>"; "The link is yours. It works once, until <time>, or until someone decides. Opening it decides nothing: you choose on the page." The link ended at the step's time limit (1 hour), not 48 hours. | approval-links.ts:60-140; run | corrected: the page says the mail holds the detail (cut at 1,500 characters), the flow, workspace and tenant |
| The link's page, with no sign-in: tenant and workspace with DEV, the title, "The flow opchk/approve waits for a decision, since <time>.", the detail, Comment (needed to reject), Approve, Reject, "Asked of Maya Brooks. This link is yours and works once, until <time>, or until someone decides." Reject with no comment: "Say why it is rejected: whoever asked reads it." Approve: "Approved. Thank you, Maya Brooks." "The flow carries on. Your decision and your comment are recorded under your name." Open the run. A reload: "Nothing to decide here", "This link has been used, the approval was decided, or it ran out." At 390 px dark, no horizontal scroll. | ApproveLink.tsx; run | holds as run |
| Decided shows "Approved", “op-docs mailed approve” · decided from the mail, with the decider's email. | run | holds as run |
| Batch: 2 rows checked, "Approve 2 decisions?" with the titles and "Note (optional), kept with each decision"; both decided with one note. | run | holds as run |
| Waiting for others (signed in as Devi Shah, who is not in the group): the row with "the Practice managers group" and Open the run, no buttons; Waiting for you is empty with "Nothing is waiting for you". | run | holds as run |
| A step with a 5 second limit failed the flow with "Nobody decided before the approval timed out." and is not in Decided. | run | holds as run |
