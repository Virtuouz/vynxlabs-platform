# Fact-check record: develop/how-to/apps/follow-a-run-from-an-app.md

Lines are current at commit `14f7d5b9` (branch phase-31-write-the-docs). Paths are under `apps/console/src` or `apps/control-plane/src` or `packages` as written. Written by the writer; "Checked by" is for the second agent.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| startFlow returns the flow run at once; idempotencyKey option. | `packages/app/src/client.ts:333-345` | writer, run on the instance 2026-11-23; second agent, 2026-11-23 | holds as run |
| useFlowRun returns data, error, ended, live; polls every 2 s without a stream. | `packages/app/src/hooks.ts:88-160` | writer, run on the instance 2026-11-23; second agent, 2026-11-23 | holds as run (status moved running to succeeded) |
| Flow run statuses; run statuses. | `client.ts:Run, FlowRun` | writer, run on the instance 2026-11-23; second agent, 2026-11-23 | holds |
| runScript waits, timeoutMs 60,000, RunError, the run goes on. | `client.ts:runScript` | writer, run on the instance 2026-11-23; second agent, 2026-11-23 | holds as run (script ran, row appeared) |
| runFlow and FlowRunError; useRun; scriptRun, flowRun. | `client.ts`; `hooks.ts` | writer, read in code, not run; second agent, 2026-11-23 | holds |
| A guest's refusal text "Sign in to start a …". | `apps/control-plane/src/kernel/errors.ts:43` | writer, read in code, not run; second agent, 2026-11-23 | holds; guest without a public app got 401 on the instance |
| A form can start a run for a guest. | inventory APP-02, D39 | writer, read in code, not run; second agent, 2026-11-23 | not re-read; second agent to check |
| Roles to start: flow_run:write at the flow, run:write at the script; built-in portal roles lack them. | migrations; run: end user started both with defined role | writer, run on the instance 2026-11-23; second agent, 2026-11-23 | holds as run |
| Stream: one EventSource, closed 5 s after last listener, limits 2 and 5 per replica, 429 too_many_streams, guest 401, refused not retried. | `stream.ts:60-125`; `routes/stream.ts:99-104`; `kernel/stream.ts:67-69` | writer, run on the instance 2026-11-23; second agent, 2026-11-23 | 429 seen once on the instance; the page kept working by polling |
| No row-change subscription. | `packages/app/src/index.ts` exports | writer, read in code, not run; second agent, 2026-11-23 | holds |
| A failed flow shows the step's message. | run: "The step \"add\" failed: POST /runs/…/data answered 403: This needs a declared use of the table \"visits\"." | writer, run on the instance 2026-11-23; second agent, 2026-11-23 | holds as run |

## Second check, 2026-11-23 (Checked by: second agent, 2026-11-23)

- Step code and statuses: against `packages/app/src` (see the app client record). Run: `startFlow`, `useFlowRun`, `runScript` under `volvel dev` (run log).
- Guest 403 text: `kernel/errors.ts:39-46`; the call order (authorize before the guest check) at `routes/flows.ts:915-920` and `routes/execution.ts:1331-1336`: corrected on the page (401 without a binding, 403 with one); run.
- Stream limits, the 5 s close and no retry of a refused stream: `kernel/stream.ts:67-69`, `packages/app/src/stream.ts:95-111`. A guest's stream 401: read in code, not run.
