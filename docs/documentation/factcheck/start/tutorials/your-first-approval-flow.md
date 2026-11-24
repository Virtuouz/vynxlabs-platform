# Fact-check record: start/tutorials/your-first-approval-flow

Code as of commit `5ebf1c80`, 2026-11-23. Written by the page's writer; run 2026-11-23 (run log). "Checked by" is left for the second agent.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| The starter "Decide, then answer" is a branch `size` on `trigger.amount > 100` with set steps `large` and `small` | `apps/console/src/screens/starters.ts` (flow starters), run | writer, run | holds |
| The step list offers Approval, "Pauses until a person decides." | `apps/console/src/screens/FlowEditor.tsx:233` | writer, run | holds |
| Approval fields: What is being approved, Detail to show, Give up after (optional), Groups, Roles, Where it waits | `FlowEditor.tsx` approval inspector, run | writer, run | holds |
| A test run waits at an approval and shows Waiting for approval | run | writer, run | holds |
| Approvals lists Waiting for you / Waiting for others / Decided; Approve and Reject | `apps/console/src/screens/Approvals.tsx`, run | writer, run | holds |
| Reject asks "Why is it rejected?" and needs text | `Approvals.tsx`, run | writer, run | holds |
| Rejecting fails the step: error path or the flow fails (screen text) | `Approvals.tsx` header text, run | writer | holds (text only; the failing run was not opened) |

## Second check (2026-11-23)

Checked by: second agent, 2026-11-23. Walked as Maya then Rowan in Fernhill Sandbox with the path tut-approve2 (tut-approve already existed from the writer's run); a fresh tenant cannot follow this page (needs Fernhill's group and people). Corrected: 'Steps in order' is a landmark, the list reads 'Steps (N)'; 'Steps to add' is an unlabelled menu; the group option shows its key practice-managers (Esc closes the list, which otherwise blocks Save draft by keyboard-free click); test step order is not fixed; Open the run offered; counts of Waiting for you depend on leftovers. Decision with note, output approve.comment/approved confirmed.
