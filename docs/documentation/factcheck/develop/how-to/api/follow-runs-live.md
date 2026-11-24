# Fact-check record: develop/how-to/api/follow-runs-live.md

Lines are current at commit `5ebf1c80` (branch phase-31-write-the-docs), under `apps/control-plane/src/` unless a path says otherwise. Written by the writer 2026-11-23; "Checked by" and "Result" are for the second agent.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| `GET /tenants/:t/stream` is `text/event-stream`; one per tenant. | `routes/stream.ts:15-48` | second agent, 2026-11-23 | checked |
| Prologue `retry: 3000`, then `ready` (or `snapshot` when `Last-Event-ID` is sent). | `routes/stream.ts:113-117`; run | second agent, 2026-11-23 | checked |
| Events `run`, `flow_run`, `step`, `log`; data `{w,k,id,flow?,node?,s?,p?}`. | `routes/stream.ts:20-30`; run (captured 202 run, 64 step, 7 log, 1 flow_run) | second agent, 2026-11-23 | checked |
| `log` at most twice a second for each run. | `kernel/stream.ts:71` (LOG_PING_MS = 500) | second agent, 2026-11-23 | checked |
| Heartbeat `: ping` every 20 seconds. | `routes/stream.ts:10,118-120` | second agent, 2026-11-23 | checked |
| At most 5 streams per caller (per replica); 2 for someone who follows only their own runs; 429 `too_many_streams`. | `kernel/stream.ts:65-69`; `routes/stream.ts:95-102` | second agent, 2026-11-23 | checked |
| What a caller is sent: run:read workspaces, flow_run:read, or their own. | `routes/stream.ts:49-82` | second agent, 2026-11-23 | checked |
| Rights are read once when the stream opens. | `routes/stream.ts:62-64` | second agent, 2026-11-23 | checked |
| Streams of a member whose sessions end are closed. | `kernel/stream.ts:55-62` | second agent, 2026-11-23 | checked |
| `x-accel-buffering: no` is sent. | `routes/stream.ts:107-112`; run headers | second agent, 2026-11-23 | checked |
| No replay: only `snapshot`. | `routes/stream.ts:117` | second agent, 2026-11-23 | checked |

## Second check (2026-11-23)

Checked by: second agent, 2026-11-23.

- Run: a stream held open for 50 seconds with a 26-second run: `ready`, then `run` events queued, running, then `: ping`, then succeeded; `too_many_streams` for the sixth stream of one caller (429, "At most 5 streams may be open at once. Close one first."). The shared admin account already held 5 streams (other work), which also gave the 429.
- Corrected: added the 429 message.
