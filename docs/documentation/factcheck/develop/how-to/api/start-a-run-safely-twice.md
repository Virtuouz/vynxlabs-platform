# Fact-check record: develop/how-to/api/start-a-run-safely-twice.md

Lines are current at commit `5ebf1c80` (branch phase-31-write-the-docs), under `apps/control-plane/src/` unless a path says otherwise. Written by the writer 2026-11-23; "Checked by" and "Result" are for the second agent.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| `POST runs` body: `script`, `input`, `idempotencyKey` (1 to 200), `priority`, `startAfter`; needs `run:write`; guest 403. | `routes/execution.ts:1318-1345` | second agent, 2026-11-23 | checked |
| A first start answers 201, a repeat 200 with the same run. | `routes/execution.ts:608`; `kernel/execution/runs.ts:309-322`; run | second agent, 2026-11-23 | checked |
| `POST flow-runs` takes `flow`, `input`, `idempotencyKey`; needs `flow_run:write`; 201 then 200. | `routes/flows.ts:895-946`; run (201 only; repeat not run for flows) | second agent, 2026-11-23 | not re-checked: backed by the inventory or the writer only |
| The key matches within the workspace and the script path, former paths included. | `kernel/execution/runs.ts:310-322`; `kernel/flows/engine.ts:171-183` | second agent, 2026-11-23 | checked |
| A repeat with different input returns the first run unchanged. | run (hilltop input, same key: 200) | second agent, 2026-11-23 | checked |
| Webhook `idempotency-key` header, 1 to 200 characters; repeat answers 202 with the same `runId`. | `routes/execution.ts:3741-3760`; run | second agent, 2026-11-23 | checked |
| MCP `idempotencyKey` argument. | `routes/mcp.ts:98-130,302,367`; run | second agent, 2026-11-23 | checked |
| Input checked against the script's schema before a key is looked up: 400 "The input does not match the script's schema." | `kernel/execution/runs.ts:297-301` | second agent, 2026-11-23 | checked |
| Schedule, poll, event, form starts have keys of their own. | `kernel/execution/triggers.ts:1061,1135,1294`; `kernel/flows/events.ts:155` | second agent, 2026-11-23 | checked |
| The run answers `idempotencyKey`. | run (keys of `GET runs/<id>`) | second agent, 2026-11-23 | checked |

## Second check (2026-11-23)

Checked by: second agent, 2026-11-23.

- Run: the flow-run repeat (201 then 200, same id), a key of 201 characters (400), 200 characters (201), a script repeat with a different input (200, first run returned).
- Not run: a rename between the two requests, a guest's 403 (read from `kernel/errors.ts` `guestStart`).
