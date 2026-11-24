# Fact-check record: console/reference/flows/steps

Code as of branch `phase-31-write-the-docs`, 2026-11-23. Written by the page's writer. Checked by: second agent, 2026-11-23.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Max 1000 items in For each | apps/control-plane/src/kernel/flows/engine.ts:40 | second agent, 2026-11-23 | checked: labels matched against the console source |
| Answer body 256 K characters | engine.ts:484 | second agent, 2026-11-23 | checked: labels matched against the console source |
| Flow depth 10 | engine.ts:1197 | second agent, 2026-11-23 | checked: labels matched against the console source |
| Approval fields and options | FlowEditor.tsx:2207-2250; FlowStepFields.tsx:300-380 | second agent, 2026-11-23 | checked: labels matched against the console source |
| Mail up to 50, links 48 hours | kernel/flows/approvers.ts:248; approval-links.ts:20 | second agent, 2026-11-23 | checked: labels matched against the console source |
| Rejecting sentence | apps/console/src/kit/approvals.ts:6 | second agent, 2026-11-23 | checked: labels matched against the console source |

| Script inputs up to 50; grants 20 each | schemas/kinds/flow.v1.schema.json:394,407-429 | second agent, 2026-11-23 | checked: labels matched against the console source |
| Set 1 to 50 values | schema:461 | second agent, 2026-11-23 | checked: labels matched against the console source |
| Branch 1 to 20 cases | schema:482-483 | second agent, 2026-11-23 | checked: labels matched against the console source |
| Answer status 200 to 599, headers up to 20 | schema:524-525,540 | second agent, 2026-11-23 | checked: labels matched against the console source |
| For each: How many at once 1 to 20; flows list 1 to 50 | schema:607-608,594-595 | second agent, 2026-11-23 | checked: labels matched against the console source |
| Wait 1 s to 30 days (2592000) | schema:685-686 | second agent, 2026-11-23 | checked: labels matched against the console source |
| Approval Give up after to 30 days | schema:718-719 | second agent, 2026-11-23 | checked: labels matched against the console source |
| Run a flow: 1 to 50 flows it may start | schema:790-791 | second agent, 2026-11-23 | checked: labels matched against the console source |
| Nodes 200, edges 1000 | schema:20,833 | second agent, 2026-11-23 | checked: labels matched against the console source |
| Core nodes' limits (60 s HTTP, rows at most 1000 default 50, 30 s event) | packages/nodes/src/index.ts | second agent, 2026-11-23 | checked: labels matched against the console source |

## Second check, 2026-11-23

Checked by: second agent, 2026-11-23. Every label and quoted string was searched for in `apps/console/src` and the manifest source by script; the ones below were read in the code or run on the instance (http://localhost:8091, own workspace `flows-check` and own flows `flows-…`).

- Set values buttons are **Add a value** and **Remove value**, headers **Add a header** and **Remove header** (FlowEditor.tsx:3004,3071); corrected. Limits 50 values, 20 cases, 20 headers, 599 status, 20 at once: kinds.ts:783-876, FlowEditor.tsx:260; wait and approval 30 days: kinds.ts:895,917; nodes' 60/30 s: packages/nodes/src/index.ts:56-317; rows max 1000: nodes/index.ts:230.
