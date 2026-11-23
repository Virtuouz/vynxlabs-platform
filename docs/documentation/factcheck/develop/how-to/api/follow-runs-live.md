# Fact-check record: develop/how-to/api/follow-runs-live.md

Lines are current at commit `5ebf1c80` (branch phase-31-write-the-docs), under `apps/control-plane/src/` unless a path says otherwise. Written by the writer 2026-11-23; "Checked by" and "Result" are for the second agent.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| `GET /tenants/:t/stream` is `text/event-stream`; one per tenant. | `routes/stream.ts:15-48` | pending | pending |
| Prologue `retry: 3000`, then `ready` (or `snapshot` when `Last-Event-ID` is sent). | `routes/stream.ts:113-117`; run | pending | pending |
| Events `run`, `flow_run`, `step`, `log`; data `{w,k,id,flow?,node?,s?,p?}`. | `routes/stream.ts:20-30`; run (captured 202 run, 64 step, 7 log, 1 flow_run) | pending | pending |
| `log` at most twice a second for each run. | `kernel/stream.ts:71` (LOG_PING_MS = 500) | pending | pending |
| Heartbeat `: ping` every 20 seconds. | `routes/stream.ts:10,118-120` | pending | pending |
| At most 5 streams per caller (per replica); 2 for someone who follows only their own runs; 429 `too_many_streams`. | `kernel/stream.ts:65-69`; `routes/stream.ts:95-102` | pending | pending |
| What a caller is sent: run:read workspaces, flow_run:read, or their own. | `routes/stream.ts:49-82` | pending | pending |
| Rights are read once when the stream opens. | `routes/stream.ts:62-64` | pending | pending |
| Streams of a member whose sessions end are closed. | `kernel/stream.ts:55-62` | pending | pending |
| `x-accel-buffering: no` is sent. | `routes/stream.ts:107-112`; run headers | pending | pending |
| No replay: only `snapshot`. | `routes/stream.ts:117` | pending | pending |
