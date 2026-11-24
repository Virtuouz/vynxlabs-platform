# Lane mask2: the flow editor's Last test panel, the preview, and string approval details

Rows: WLK-13, WLK-14. One commit, one cause: the flow-level readers masked by key and schema only, never by the values a run was served. Decisions: D13, D44 (same piece as `fixed/mask.md`).

## The piece
`kernel/flows/known.ts` `flowKnown(kernel, db, flowRunId, cache?)`: for a flow run, what each script step was served (`servedValues`, once per script) plus the secret strings of the trigger input (by the event's schema and key names) and of each step's input and output (by the script's schema). Built into `Known` for `redact`/`redactText`. Looking one up never stops the reader. `secretStrings` and `maskedNames` are new in `kernel/execution/redact.ts`; `approvalDetail(detail, known?)` (`kernel/flows/approval-detail.ts`) now takes the flow run's known values.

## WLK-13
- The flow run page (what the Last test panel reads), `routes/flows.ts` `GET flow-runs/:id`: input, output, every step's input, output, error and detail, and the run's error and summary, masked by `flowKnown` as well as by key and schema, for a reader who may read all flow runs and for one who may read only their own.
- The expression preview (`GET expressions/value`): the context is masked with `flowKnown` before it is evaluated, and an expression (or foreach items) that names a masked field, or reads a step whose whole output is masked, is not computed. The answer is a note: "This reads a secret, which a preview does not show, so it cannot be previewed here." (`size(trigger.api_key)` no longer gives the length of the mask.) The console already shows a note when there is no value (`ExpressionField.tsx` `Preview`); no console change.
- MCP `get_flow_run` for another's flow run: output and error masked with `flowKnown` (`routes/mcp.ts` `showFlowRun`; was key-only, error unmasked).
- Tests (each failed before): `flow-editor.test.ts` "shows what the run page shows..." (rewritten: a read of a masked field says it cannot be previewed; the whole `trigger` still shows the mask); `flows.test.ts` "the flow run page and the approval queue hold what a step was served, wherever it turns up" (a step's output key `echo` holds a declared secret); `mcp.test.ts` "is masked as it is on screen..." (flow run error).

## WLK-14
Every reader of an approval's detail now passes the flow run's known values: queue (`routes/flows.ts` `toApproval`, one lookup per flow run in a request), widget (`kernel/pages/approvals.ts` `fieldsOf`, waiting and decided), mail text (`kernel/flows/approval-links.ts`), the link page (`routes/approval-links.ts`), MCP `list_approvals` (`routes/mcp.ts`). A detail written as a text from a secret field (`'Pay with ' + trigger.apiKey`) shows "Pay with [redacted]".
- Tests (each failed before): `approval-links.test.ts` "a detail written as a text from a secret field is masked in the mail, the link's page and the queue"; `page-approvals.test.ts` "a field written as a text from a secret input is masked in the widget too".

## Sweep: every path that returns or sends a run's or step's input, output, error, log, detail or an event payload
Masked by the one piece, with the test that covers it:
- Run `GET runs/:id` (input, output, error), `GET runs/:id/logs`: `execution.test.ts` (mask lane).
- Worker `/logs`, `/fail`, `/complete` summary, `failRun` (so alert, `onFailure` input, `platform/run-failed` event, flow step errors): `execution.test.ts` (mask lane).
- Run list, run `error_summary`, alerts list: from the stored, already masked text (mask lane).
- Flow run page, its steps, the Last test panel: this lane, `flows.test.ts`.
- Expression preview: this lane, `flow-editor.test.ts`.
- Events list and the event-started run/flow run input: `flows.test.ts` (mask lane).
- Approval queue, widget, mail, link page, MCP: this lane (above); the mask lane covered the map form.
- MCP `get_run`, `get_flow_run` for another's work: `mcp.test.ts`.
- Not payloads, looked at: stream (statuses only), summary (counts), operations run detail (error from stored masked text, diagnosis), tenant export (the owner's own data export, raw by design), worker routes that hand a run its own input (by design), app/page actions that return a script's output to the app (the script's own answer).

## Siblings and what a person sees
Other readers of `expressionContext`: only the preview. Other users of `approvalDetail`: the five listed. A person who tests an expression on a secret field sees a plain note instead of a computed value. The flow run list (`toFlowRun`) is not masked by value on read: it shows `error` and `errorSummary` as stored (a step's error is masked when stored; a flow-level expression error is not).

## Screens to walk
Flow editor: Test the draft then an expression on a secret trigger field (note, no value) and on a plain one (value); Last test panel on a step whose output holds a secret; approvals page, a mail and its link page with a detail written as text. No layout or copy changed except the one note above. Polish gate: states (note replaces value), lifecycle, keyboard unchanged.

## Found
- The approval's title is evaluated from an expression and shown in lists, mail and the decided list unmasked by value (only `detail` is masked). Not changed.
- Flow-level (non-step) expression errors on the flow run list are not masked by value.
- Expression refusals for event filters (`recordRefusal`) quote the engine's message, which may hold payload values.

## Lines for packages/docs/content and CHANGELOG
- The flow run page, the editor's Last test panel, approval details and an agent's view of a flow run now mask the secrets and credentials a flow's steps were given, also inside text. An expression preview does not compute on a masked field and says so.
