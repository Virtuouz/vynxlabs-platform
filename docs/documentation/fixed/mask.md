# Lane mask: what is shown and sent outside is masked, and big logs and outputs get through

Rows: SCR-01, SCR-02, SCR-03, OPS-01, OPS-02, OPS-03, FLW-01. Decisions: D13, D44. One commit for all, because the masking rows share one piece (`kernel/execution/redact.ts`) and the size rows share `routes/worker.ts`.

## The masking piece
`apps/control-plane/src/kernel/execution/redact.ts`: `redact(value, schema, known)`, `redactText`, `redactError`, `maskFor`. `kernel/execution/served.ts`: `servedValues(run)` (declared secrets, connections' credentials, secret-named settings, OAuth tokens, group members' credentials, flow-granted connections), `taskValues`. Values are masked by value in text, in their URL-encoded, JSON-escaped and base64 forms, a "Bearer x" credential also without its scheme, each long line of a multi-line one. A value under 4 characters is masked only as a whole word. Stored inputs scripts receive are unchanged. `kernel/flows/approval-detail.ts`: `approvalDetail`, the one function for an approval's shown detail.

## SCR-01 (D44 too)
- Stored masked: `/logs` message and fields (`routes/worker.ts`), `failRun` (`kernel/execution/runs.ts`, so the alert, the `onFailure` input, the platform event and flow step errors get the masked text), task `/fail`, `output_summary` at completion.
- Read masked: `GET runs/:id` (error, input, output), `GET runs/:id/logs` (`routes/execution.ts`).
- SDK `HttpError` drops query, fragment and credentials from its message (`packages/sdk/src/http.ts`).
- D44: the runner routes `console.log/info/debug/warn/error/trace` to the run's log (`packages/worker/src/runner.ts`). Test: `worker.test.ts` "writes console output to the run's log".
- Tests: `execution.test.ts` "a log line, an error and the run read back hold the values the run was given"; `redact.test.ts` "masking values the run was given" (short values, partial forms, regex characters, multi-line). Failed before the fix.
- Siblings looked at: flow step errors (come from `run.error`, masked at store), run list and `error_summary` (derived from the stored error), stream, CLI `logs` (read `/logs`), exports (history holds stored, masked text). Not done: lines stored before this change are masked on read by value, key names too, but a secret that has since been rotated cannot be found.

## SCR-02, SCR-03
- Worker sends logs in parts of about 512 KB, halves a part on 413, drops and counts (`logsLost`) a single refused line; fields over 32 KB become a note (`packages/worker/src/worker.ts`). `#call` errors carry `status`.
- Control plane: `/logs` bodyLimit 4 MB and fields cap 32 KB; `/complete` accepts 10 MB (`MAX_OUTPUT_BYTES`), `/data` 8 MB, task `/complete` 2 MB so its own 400 words show. The worker refuses an output over 10 MB before reporting done, with "The output is larger than 10 MB". An older worker keeps working: its 1.5 MB batches now fit.
- Contract updated: `docs/contracts/worker-protocol.md`. No schema change in `schemas/`.
- Tests: `execution.test.ts` "a batch over 1 MiB is taken", "an output of 2 MB is kept..."; `worker.test.ts` "log lines of any size" (4 tests). Failed before.
- Left out: `diagnose` text for the 413 (not touched). A run that fails for an oversized output is still retried by its retry policy: the protocol has no "do not retry".

## OPS-01, OPS-02, OPS-03, FLW-01
- OPS-01: mail text and link page use `approvalDetail` (`kernel/flows/approval-links.ts`, `routes/approval-links.ts`), as the queue (`routes/flows.ts`) and widget (`kernel/pages/approvals.ts`). Test `approval-links.test.ts` "shows what the queue shows".
- OPS-02 (D13): `list_approvals` masked; `get_run` and `get_flow_run` masked when the run is not the caller's, the caller's own are given as they are (`routes/mcp.ts`). Test `mcp.test.ts` "what an agent is shown of another's work".
- OPS-03: events list masks the payload with the event's schema (`eventSchema` in `kernel/flows/events.ts`); a run started by an event masks its input by that schema too (`routes/execution.ts`). Test `flows.test.ts` "an event is listed as the run it started shows it". Left out: only key-name masking is tested, not `x-secret`.
- FLW-01: the preview's context is masked before evaluation (`expressionContext` takes a `shield`, `routes/flows.ts`), by script output schema, event schema and key names. Test `flow-editor.test.ts` "shows what the run page shows". Other readers of `expressionContext`: none.

## Screens to walk
No screen layout changed. Walk: run detail and its log (a run that logs a secret), flow run page, flow editor expression preview, approvals page, an approval mail and its link page, events page. Polish gate: states and lifecycle unchanged; no new copy except "[redacted]" and the log note "The fields of this line were N bytes, and only 32 KB are kept."

## Found
- `routes/worker.ts` imports `forbidden` unused (pre-existing lint warning).
- Flow run page masks a trigger's input by key names only, not by the event's schema.

## Lines for packages/docs/content and CHANGELOG
- Run logs, errors, alerts and approval mail now mask the secrets and credentials a run was given. `console.log` goes to the run's log. Worker route limits: logs 4 MB, output 10 MB.
