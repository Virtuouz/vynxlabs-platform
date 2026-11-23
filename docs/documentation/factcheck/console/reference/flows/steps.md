# Fact-check record: console/reference/flows/steps

Code as of branch `phase-31-write-the-docs`, 2026-11-23. Written by the page's writer. "Checked by" is left for the second agent.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Max 1000 items in For each | apps/control-plane/src/kernel/flows/engine.ts:40 | writer (read) | |
| Answer body 256 K characters | engine.ts:484 | writer (read) | |
| Flow depth 10 | engine.ts:1197 | writer (read) | |
| Approval fields and options | FlowEditor.tsx:2207-2250; FlowStepFields.tsx:300-380 | writer (read) | |
| Mail up to 50, links 48 hours | kernel/flows/approvers.ts:248; approval-links.ts:20 | writer (read) | |
| Rejecting sentence | apps/console/src/kit/approvals.ts:6 | writer (read) | |

| Script inputs up to 50; grants 20 each | schemas/kinds/flow.v1.schema.json:394,407-429 | writer (read) | |
| Set 1 to 50 values | schema:461 | writer (read) | |
| Branch 1 to 20 cases | schema:482-483 | writer (read) | |
| Answer status 200 to 599, headers up to 20 | schema:524-525,540 | writer (read) | |
| For each: How many at once 1 to 20; flows list 1 to 50 | schema:607-608,594-595 | writer (read) | |
| Wait 1 s to 30 days (2592000) | schema:685-686 | writer (read) | |
| Approval Give up after to 30 days | schema:718-719 | writer (read) | |
| Run a flow: 1 to 50 flows it may start | schema:790-791 | writer (read) | |
| Nodes 200, edges 1000 | schema:20,833 | writer (read) | |
| Core nodes' limits (60 s HTTP, rows at most 1000 default 50, 30 s event) | packages/nodes/src/index.ts (read in phase 30 brief; second agent to confirm) | writer (read) | |
