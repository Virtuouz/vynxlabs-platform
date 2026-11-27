# S5: Run event stream

Roadmap: [P1-4](../07-roadmap.md#p1-4-run-event-stream-s5). Priority P1. Complexity M.

## Problem (verified)

- There is no push channel anywhere (no `EventSource` or `WebSocket` in the console or the control plane).
- Polling sits in `Runs.tsx:102` (5 s, only while something is live), `Execution.tsx:309` (1.5 s), `Flows.tsx:570` (1.5 s for as long as the run is `running`, which includes days spent waiting for an approval) and `Authoring.tsx:988`.
- The overview, approvals, shell counts and workers never refresh.

## Design

**Producer.** Wherever a run, flow run or step changes status, the same transaction runs `pg_notify('vx_runs', json)`. The places are `kernel/execution/runs.ts` (claim, complete, fail, cancel, requeue), `kernel/flows/engine.ts` (`advance`, approvals) and `kernel/execution/triggers.ts` (trigger fired).

The payload is small:

```json
{"t":"<tenant>","w":"<workspace>","k":"run|flow_run|step|approval|trigger","id":"…","s":"<display state>","p":"<path>"}
```

Log lines are not included. Logs are streamed separately (below).

**Fan-out.**
- Each replica holds one `LISTEN vx_runs` connection, a dedicated `pg` client outside the pool, and an in-memory subscriber registry keyed by workspace.
- **Delivery after a missed message** (notify is fire-and-forget): every event carries the server time. A client that reconnects sends `Last-Event-ID`, and the server answers with a fresh `snapshot` event for the views that asked for it. A replay log is not needed.

**Endpoint.**
- `GET W/stream?topics=runs,approvals,triggers` returns `text/event-stream`.
- Auth uses the same session or API key.
- Topics are filtered with `check()` once at connect (`workspace:read`). Approval events go only to principals who can decide (`kernel/flows/approvers.ts`).
- A heartbeat comment is sent every 20 s.
- At most 5 streams per session.

**Logs.**
- `GET W/runs/:id/logs/stream` streams `run_log` rows as they are inserted, through a per-run notify `vx_log_<run>` sent by the log ingest route.
- It ends when the run is terminal.

**Console.**
- A `useStream(topics)` hook in `apps/console/src/api.ts` invalidates query-cache keys (P1-9): `activity`, `summary`, `approvals`, `runs/:id`.
- The shell counts, Overview, Runs, the run page, Approvals and Triggers subscribe.
- When the stream fails, they fall back to today's polling.

**Apps** (P2-5). The same endpoint is reachable with an app session, filtered by the bindings that already govern `startFlow` and `runScript`. `@vynxlabs/app` gets `useRun(id)`.

## Acceptance criteria

1. A run started from the API appears on an open Runs list within 1 s, with no poll requests in the network panel.
2. A flow waiting for approval updates on its page when it's approved from another browser.
3. The header failed-runs count updates without navigation.
4. With two control-plane replicas, a run completed through replica A is seen by a stream held on replica B.
5. A principal without approval rights receives no approval events (test).
6. Killing the `LISTEN` connection makes the replica reconnect within 5 s and send a `snapshot` hint to its subscribers.
7. A log line written by a worker shows on the run page within 1 s while the run is in progress.

## Dependencies and risks

- **Dependency:** P1-9 (query cache).
- **Risk: proxies that buffer SSE.** Set `X-Accel-Buffering: no` and document it in `docs/self-hosting.md`.
- **Risk: the NOTIFY payload limit (8 KB).** The payload is kept to IDs and state.
