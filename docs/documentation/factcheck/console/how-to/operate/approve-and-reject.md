# Fact-check record: console/how-to/operate/approve-and-reject.md

Lines are current at commit `5ebf1c80` (branch phase-31-write-the-docs). Paths are under the repository root. Written by the writer; "Checked by" is for the second agent.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Console steps, prompts and toasts. | apps/console/src/screens/Operate.tsx:1148-1182 | writer, run on the instance 2026-11-23; second agent, 2026-11-23 (see the second check below) | holds as run |
| Flow run page buttons and lines. | apps/console/src/screens/Flows.tsx:828-905 | writer, run on the instance 2026-11-23; second agent, 2026-11-23 (see the second check below) | holds as run |
| Mail and link behavior and texts. | apps/control-plane/src/kernel/flows/approval-links.ts; apps/console/src/screens/ApproveLink.tsx | writer, read from the code 2026-11-23; second agent, 2026-11-23 (see the second check below) | holds as read |
| Decided list shows Declined and the reason. | apps/console/src/screens/Operate.tsx:1270-1287 | writer, run on the instance 2026-11-23; second agent, 2026-11-23 (see the second check below) | holds as run |

## Second check (2026-11-23)

Checked by: second agent, 2026-11-23. Every label and quoted text of the page was searched in the source; the claims about who may decide, the link (48 hours or the step's limit, once), the mail and the batch were read (approvers.ts, approval-links.ts, ApproveLink.tsx) and run in a workspace of my own (Operate check, a dev workspace in Fernhill's tenant, with scripts, flows and triggers of mine deployed by the CLI, and a production workspace linked to it).

| Claim | Source | Result |
| --- | --- | --- |
| The mailed link, read from the instance's mail capture: subject, the link, opening it decides nothing, Reject without a comment is refused, Approve decides, a second visit says "Nothing to decide here". | approval-links.ts; ApproveLink.tsx; run | holds as run |
| Several at once: "N selected", Approve, one note kept with each. | run | holds as run |
| Waiting for others for a member outside the group; "Decided" says "decided from the mail". | run | holds as run |
| A flow with no error path fails when rejected, and when the step times out ("Nobody decided before the approval timed out."). | run | holds as run |
