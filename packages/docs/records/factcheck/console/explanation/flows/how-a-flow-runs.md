# Fact-check record: console/explanation/flows/how-a-flow-runs

Code as of branch `phase-31-write-the-docs`, 2026-11-23. Written by the page's writer. Checked by: second agent, 2026-11-23.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |

| Sweep every 2 s, up to 200 runs; three failed passes fail the run | apps/control-plane/src/kernel/flows/engine.ts:1370,1394 | second agent, 2026-11-23 | checked: labels matched against the console source |
| Foreach 1000 items; flow depth 10; answer 256 K | engine.ts:40,1197,484 | second agent, 2026-11-23 | checked: labels matched against the console source |
| 200 steps, 1000 connections | schemas/kinds/flow.v1.schema.json:20,833 | second agent, 2026-11-23 | checked: labels matched against the console source |
| First path starts a step; Join waits for paths that can still arrive | engine.ts:709-712 | second agent, 2026-11-23 | checked: labels matched against the console source |
| Workspace concurrency limits script runs only | apps/control-plane/src/kernel/execution/runs.ts:471 | second agent, 2026-11-23 | checked: labels matched against the console source |
| Events started by events 10 deep | apps/control-plane/src/kernel/flows/events.ts:13 | second agent, 2026-11-23 | checked: labels matched against the console source |
| A canceled run publishes platform/run-finished with status cancelled | apps/control-plane/src/kernel/execution/runs.ts:645,680 | second agent, 2026-11-23 | checked: labels matched against the console source |

## Second check, 2026-11-23

Checked by: second agent, 2026-11-23. Every label and quoted string was searched for in `apps/console/src` and the manifest source by script; the ones below were read in the code or run on the instance (http://localhost:8091, own workspace `flows-check` and own flows `flows-…`).

- Sweep every 2000 ms (background.ts:29), 200 runs a pass (engine.ts:1349-1371), failed after 3 tries (engine.ts:1393). Depth 10 (engine.ts:1197, events.ts:13), 256 K response (engine.ts:484), 25 s answer wait (engine.ts:487), 1000 for each items (engine.ts:40), 1000 edges (kinds.ts:972).
- Corrected: canceling a flow run does not publish `platform/flow-run-finished` (cancelFlowTree, engine.ts:1202-1240, never reaches afterFlowRun); it cancels script runs, each publishing `platform/run-finished` with `cancelled` (execution/runs.ts:677-680). fault fixed (fa): a canceled flow run now publishes `platform/flow-run-finished` with `cancelled` (engine.ts:494, publishFlowRunFinished), so the page now says so, confirmed in the code.
- Link to develop/reference/platform-events resolves to the generated page (packages/docs/generated/develop/reference/platform-events.md).
