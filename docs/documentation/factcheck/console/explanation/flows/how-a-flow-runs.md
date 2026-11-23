# Fact-check record: console/explanation/flows/how-a-flow-runs

Code as of branch `phase-31-write-the-docs`, 2026-11-23. Written by the page's writer. "Checked by" is left for the second agent.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |

| Sweep every 2 s, up to 200 runs; three failed passes fail the run | apps/control-plane/src/kernel/flows/engine.ts:1370,1394 | writer (read) | |
| Foreach 1000 items; flow depth 10; answer 256 K | engine.ts:40,1197,484 | writer (read) | |
| 200 steps, 1000 connections | schemas/kinds/flow.v1.schema.json:20,833 | writer (read) | |
| First path starts a step; Join waits for paths that can still arrive | engine.ts:709-712 | writer (read) | |
| Workspace concurrency limits script runs only | apps/control-plane/src/kernel/execution/runs.ts:471 | writer (read) | |
| Events started by events 10 deep | apps/control-plane/src/kernel/flows/events.ts:13 | writer (read) | |
| A canceled run publishes platform/run-finished with status cancelled | apps/control-plane/src/kernel/execution/runs.ts:645,680 | writer (read) | |
