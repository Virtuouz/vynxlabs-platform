# Findings: scripts and execution

Settled from [the inventory](../inventory/scripts.md) at `270e509`, in the pinned tree `tree29`. Scratch tests (`triage-scr*`, run against the development Postgres, now removed) reproduced what is marked `reproduced`. Nothing here is fixed. Paths are relative to the repository root. WK = `packages/worker/src`, CP = `apps/control-plane/src`.

## Rows

### SCR-01 Run logs, errors and failure alerts show secrets as written
- **Outcome:** reproduced
- **Severity:** security
- **Where:** `CP/routes/worker.ts:535-560` (stored as sent), `CP/routes/execution.ts:1506-1520` (logs read as stored), `execution.ts:1446-1447` (only input and output go through `redact`), `CP/kernel/execution/alerts.ts:177-190` (alert text), `packages/sdk/src/http.ts:45,147` (error text carries the full URL with its query), `WK/worker.ts:176-181` (stderr kept in the stack).
- **Evidence:** A claimed run posted a log line whose message and `fields.token` held a secret-looking value. `GET /runs/:id/logs` returned both unchanged. A run failed with a message holding `?api_key=…` came back unchanged from `GET /runs/:id`. The alert sends `Run failed: … {error}` to an outside connection, and the `onFailure` handler gets the same error. Holders of `run:read`, and an end user reading their own run, see it. This also contradicts the inventory's gotcha 6.
- **Fix:** One masking step in the control plane, applied where logs and errors are stored (`/logs`, `/fail`, tasks' `/fail`) and where they are read, sent or alerted: key-name masking from `redact.ts`, plus exact values of the secrets and credentials that run was served (`/secrets/:name`, `/connections/*`). In the SDK, `HttpError` should drop the query from its message. Siblings (POLISH-013): flow step errors (`kernel/flows/engine.ts`), the run list summary, the stream, MCP results, CLI `logs`, history in exports. First failing test: a run that logs a served secret, then reads of logs, run, alert and handler input.
- **Size:** M. **Milestone:** M1.

### SCR-02 A log batch over 1 MiB can never be sent, and blocks every later line
- **Outcome:** reproduced
- **Severity:** data
- **Where:** `CP/routes/worker.ts:520-560` (no `bodyLimit`, so Fastify's 1 MiB), `WK/worker.ts:88-90,440-452`.
- **Evidence:** 500 lines of 3,000 characters (each is under the 8,000 cap) gave 413. A single line with 1.1 MB of `fields` also gave 413. The worker puts the whole batch back, retries the same batch at every heartbeat, and the later lines wait behind it until 5,000 are pending, when the oldest are dropped and counted. Fields have no size cap.
- **Fix:** Batch by bytes in the worker (stop a batch near 512 KB, and send an over-large line alone), cap `fields` in the route and say so in the line, and give `/logs` an explicit `bodyLimit`. A 413 for one line must drop that line, not hold the queue. Test first: a 1.5 MB batch is delivered in parts.
- **Size:** S. **Milestone:** M2.

### SCR-03 A run's output over 1 MiB fails a run that already did its work
- **Outcome:** reproduced
- **Severity:** data
- **Where:** `CP/routes/worker.ts:1037-1060` (`/complete`), `WK/worker.ts:556,566`, `CP/kernel/execution/runs.ts:15`.
- **Evidence:** `/complete` with 1.1 MB of output gave 413. 500 KB was accepted, which proves the 256 KB "stored in file storage" path starts working only below 1 MiB. The worker then reports `/fail` with "…/complete answered 413", the run fails, and a retry runs the script again after its side effects. `/data` (up to 1,000 rows per insert) has the same 1 MiB ceiling. `diagnose` has no text for it.
- **Fix:** Give `/complete` and `/data` a `bodyLimit` that matches a stated output limit (say 8 MB), or have the worker refuse early with "The output is larger than N" before the script's work is reported done. Siblings: `/tasks/:id/complete` (limit is 256 KB by its own check, but anything over 1 MiB gets 413, not the 400 it words). Test first: 2 MB output.
- **Size:** S. **Milestone:** M2.

### SCR-04 A script's `aggregate` announces a deleted row with the id "undefined"
- **Outcome:** reproduced
- **Severity:** broken
- **Where:** `CP/routes/worker.ts:957-975` (every op that is not `find` or `get` is announced; an aggregate counts as "deleted"), `CP/routes/data.ts:199-218`.
- **Evidence:** With a trigger on `platform/row-changed` deployed, one `aggregate` answered 200, then the log held "a platform event could not be published" with `invalid input syntax for type uuid: "undefined"`. The insert after it stored an `inserted` event. Without a listener nothing is stored, so it hides until someone subscribes.
- **Fix:** Announce only `insert`, `update` and `delete`, and only when an id exists. Do it in one shared helper that the row routes in `data.ts` also use. Test first: an aggregate with a listener stores no event and logs no error.
- **Size:** S. **Milestone:** M2.

### SCR-05 Console scripts never parse their zod `input` and `output`
- **Outcome:** confirmed by code
- **Severity:** broken
- **Where:** `packages/compose/src/index.ts:276-278` (`execute` is the raw default function), against `packages/sdk/src/index.ts:284-290`.
- **Evidence:** `.default()`, `coerce`, `transform` and the output check do nothing. Only the JSON Schema check before queuing (`CP/kernel/execution/runs.ts:246`, Ajv with no `useDefaults`) applies. The editor says the schema is read "so a run's input is checked against it", and the "Totals" starter works around the missing default.
- **Fix:** In the compose wrapper, run `input.safeParse` and `output.safeParse` when those exports exist and throw the SDK's `SchemaError`. Siblings: connectors and trigger sources in the same wrapper. Update the "Totals" starter. Test first: a console script with `.default()` receives it.
- **Size:** M. **Milestone:** M4.

### SCR-06 Failure advice matches almost none of the real error texts
- **Outcome:** reproduced
- **Severity:** wrong
- **Where:** `CP/kernel/execution/diagnose.ts:25-135`.
- **Evidence:** Real texts gave no advice: "GET https://… answered 401." (and 404, 429, 503), "The run took longer than its limit of 60 seconds.", "The script ran out of memory (512 MB).", "…machine ran low on memory.", "GET /runs/r1/secrets/TOKEN?attempt=1 answered 404: The secret TOKEN was not found." (same for variables and connections), "…answered 403: This needs a declared use of the connection…", "The worker did not report for 30 seconds." Wrong matches: any message with the word "schema" (a Postgres relation, a JS property) gets "The data did not match the schema"; a URL containing "timeout" gets the timeout advice. The 429 advice points at Settings for a "longer delay", which the editor cannot set (see SCR-08).
- **Fix:** Match on the texts the platform itself writes (they are fixed strings in `WK/worker.ts` and the worker routes), and carry structured fields from the run: an `HttpError` status and an end code (`timeout`, `memory`, `lost`). One table, with a test per real text in `operations.test.ts`.
- **Size:** M. **Milestone:** M4.

### SCR-07 After a rename, a script's schemas are no longer read from its code
- **Outcome:** confirmed by code
- **Severity:** broken
- **Where:** `CP/kernel/authoring.ts:667` (`entryFor("script", draft.path)`), against `:197` and `packages/compose/src/index.ts:97` (entries are made from the key). Result handling at `authoring.ts:733-745`.
- **Evidence:** After a rename the path differs from the key, so `__vx_describe` finds nothing and returns `{}`. The handler then deletes `schemaSource` and keeps the stale schema, so the editor turns the schema into a hand-edited box. The report that the schema is dropped is right in part: `input`/`output` stay and `schemaSource` goes.
- **Fix:** Use `draft.key`. Siblings: `packages/nodes/src/index.ts:349` makes entries from a node's path, check it. Test first: save, rename, save again; `schemaSource` stays `code`.
- **Size:** S. **Milestone:** M4.

### SCR-08 Settings cannot say most of what the script kind holds
- **Outcome:** missing part
- **Severity:** broken
- **Where:** `packages/manifest/src/kinds.ts:134-283`, against the Settings fields in `apps/console/src/screens/Authoring.tsx:560-680`.
- **Evidence:** See Missing parts (MP-1). Consequence: a script made only in the console cannot use `ctx.table`, `ctx.source`, `ctx.events.publish` or connection groups, because the route needs a declared use (`worker.ts:906-936`), and nothing in the console lets one declare it.
- **Fix:** See MP-1.
- **Size:** L. **Milestone:** M4.

### SCR-09 A test run builds every draft, so someone else's broken draft blocks yours
- **Outcome:** confirmed by code
- **Severity:** broken
- **Where:** `CP/routes/authoring.ts:1269` (`composeDrafts(kernel, db, workspace)` with no path), against `kernel/authoring.ts:638` which passes `[draft.path]`.
- **Evidence:** The call composes all drafts, so an error in another draft refuses the run, while the Problems tab filters to this file and may say "No problems found.".
- **Fix:** Compose this script's draft with what is deployed (as `deriveSchemas` does). If the other drafts are meant to be tested together, show their problems, not none. Test first: two drafts, one broken, the other still runs.
- **Size:** S. **Milestone:** M4.

### SCR-10 Describe, deliver and test-connection tasks only go to the default pool
- **Outcome:** confirmed by code
- **Severity:** broken
- **Where:** `CP/kernel/authoring.ts:660`, `CP/kernel/execution/alerts.ts:177`, `CP/routes/alerts.ts:186`, `CP/routes/execution.ts:2656` (no `pool` given), against `CP/kernel/execution/tasks.ts:122-124` (`pool is not distinct from` the credential's pool).
- **Evidence:** A tenant whose workers all use named pools never has a schema read, a failure posted, or a connection tested. Nothing says so: the schema shows "once a worker is available".
- **Fix:** Let a task go to any pool of the workspace's tenant when no pool is named, or take the pool from the workspace's script. Test first: a credential with a pool claims a describe task.
- **Size:** M. **Milestone:** M4.

### SCR-11 A draft that removes a script opens as an ordinary draft, and saving undoes the removal
- **Outcome:** confirmed by code
- **Severity:** data
- **Where:** `apps/console/src/screens/Authoring.tsx:366-369` (`open(found.body, "draft", …)` ignores `found.deleted`, field at `:222`), `CP/kernel/authoring.ts:262` (`deleted: input.deleted === true`).
- **Evidence:** The editor shows the code as editable with "Discard draft", with nothing saying it will be removed. Autosave runs 3 s after any change and writes `deleted: false`, so the removal decided earlier is lost without a word.
- **Fix:** In the editor, a removed state: read-only code, "This script is removed in your drafts", "Keep this script". That is also the button the docs describe (SCR-17). Siblings: the same editor serves connectors and trigger sources; flows and queries have the same draft kind. Test first: open a removal draft, no autosave.
- **Size:** M. **Milestone:** M2.

### SCR-12 The list's inspector offers "Offer to an agent…" for a script that is not deployed
- **Outcome:** confirmed by code
- **Severity:** rough
- **Where:** `apps/console/src/screens/Execution.tsx:279-290`, against `Authoring.tsx:772` (editor shows it only when deployed).
- **Evidence:** `RunButton` is given `deployed`, the Offer button is not. The dialog meets a 404.
- **Fix:** Share one condition between the editor and the list (`OfferButton`). Siblings: flows list in `Flows.tsx`.
- **Size:** S. **Milestone:** M4.

### SCR-13 The editor shows false errors for `node:` imports, `Buffer` and `process`
- **Outcome:** confirmed by code
- **Severity:** wrong
- **Where:** `apps/console/src/editor/monaco.ts:26-71` (`lib: ["es2023","webworker"]`, no Node types, no ignored diagnostic codes).
- **Evidence:** The compiler accepts these (`packages/compose/src/index.ts`, `node:` allowed), the editor underlines them in red as "Cannot find module". Not walked in a browser.
- **Fix:** Add Node's declarations for the modules scripts may use, or ignore the module code for `node:`. Test first: an `Authoring` editor model with `import fs from "node:fs"` has no markers.
- **Size:** S. **Milestone:** M4.

### SCR-14 Docs say things the code does not do
- **Outcome:** confirmed by code
- **Severity:** wrong
- **Where:** `packages/docs/content/build/scripts.md:11` ("Remove is on the list's inspector", "Keep this script"), `CP/config-vars.ts:284-288` (EGRESS_ALLOW says scripts reach only what it lists; `guardedFetch` is used by Git, SSO, OAuth and data sources, and scripts use `fetch`, `packages/sdk/src/http.ts:123`; `docs/self-hosting.md:196` is right: a worker host's firewall guards scripts), generated `kinds/script` (no minimum, maximum or default), `build/script-editor.md` (no tabs, limits, autosave).
- **Evidence:** The script list's inspector (`Execution.tsx:262-292`) has Open editor, Run, Offer only. The editor has Remove, but no "Keep this script" (see SCR-11).
- **Fix:** Correct the text. For EGRESS_ALLOW, the generator's description is the shared piece, so the settings page and the table in `self-hosting.md` agree. Make the generator print `minimum`, `maximum`, `default`.
- **Size:** S. **Milestone:** M4.

### SCR-15 Console and SDK scripts differ in defaults, and the console cannot set the difference
- **Outcome:** owner decides
- **Severity:** wrong
- **Where:** `Authoring.tsx:192,202-203` (60 s, no delay, no backoff) against `packages/sdk/src/index.ts:196-205` (300 s, 30 s, backoff).
- **Evidence:** A console script that fails on a 429 retries at once, and the delay is not an editor field. See the owner's question Q1.
- **Fix:** After the decision, change `Authoring.tsx`'s defaults, or the SDK's. Test first: the new-script body matches the SDK's.
- **Size:** S. **Milestone:** M4.

### SCR-16 `console_code` is a setting only a database edit can change
- **Outcome:** owner decides
- **Severity:** rough
- **Where:** `CP/routes/authoring.ts:209-215`, `docs/phases/phase-7-authoring.md:231,459`. No route or screen writes it.
- **Evidence:** The phase says the setting "turns code authoring off for a tenant", with no way to do so. See Q2.
- **Fix:** After the decision, `PATCH` on the tenant and a toggle under Configure.
- **Size:** M. **Milestone:** M1.

### SCR-17 `onFailure` is read from the script as deployed now, not from the run's bundle
- **Outcome:** not a bug
- **Severity:** rough
- **Where:** `CP/kernel/execution/alerts.ts:60-70` (`resource` body by `resource_id`).
- **Evidence:** An old run being rerun uses today's handler, a handler removed since does not fire, and a deleted script falls back to the workspace's. That is what an alert is for (who to tell now). The inventory's list item 9 reads it as pinning by mistake; nothing in a phase document says the run's own settings decide.
- **Fix:** None. Say it in `operate/how-scripts-run.md`.
- **Size:** S. **Milestone:** M4.

### SCR-18 Gotchas that stay as they are
- **Outcome:** not a bug
- **Severity:** rough
- **Where:** gotcha 4 (`WK/worker.ts:166`, stdout inherited, so `console.log` goes to the worker's log, not the run), 5 (logs go at each heartbeat, `worker.ts:~460`), 8 (no `.as()` reaches every row: the route says so, `worker.ts:~870`), 10 (removing `input` keeps the last schema: the handler's comment says so, `authoring.ts:737`), 12 (at-least-once, in the SDK's `retries` comment).
- **Evidence:** Each is deliberate in code. The cost is that a person typing `console.log` in the console sees nothing. Q3 asks whether stdout should be captured.
- **Fix:** Write them on the pages the inventory lists. For 10 and gotcha 11 below, an on-page note.
- **Size:** S. **Milestone:** M4.

### SCR-19 `volvel run` locally has no tables, sources, files, connection groups, and treats every connection as http
- **Outcome:** confirmed by code
- **Severity:** rough
- **Where:** `packages/cli/src/local.ts:100-135` (`notLocal`).
- **Evidence:** Messages say "not local", so it is honest. A script using `ctx.connections(group)` fails with a TypeError there, and an OAuth or smtp connection gets an http client. Belongs to the CLI slice too.
- **Fix:** Add `connections` to the local context saying "not local"; name the connector kind in the error for non-http. Test first: `local.test`.
- **Size:** S. **Milestone:** M4.

## Missing parts

### MP-1 Script Settings: what the kind takes and the editor cannot say (1)
- **Takes** (`packages/manifest/src/kinds.ts`): `memoryMb` 64-4096 (`:154`), `retries.delaySeconds` 0-3600 and `backoff` (`:161-170`), `concurrency` as a number or `{key, limit}` (`:171-197`), `worker` pool name (`:198`), `uses.connectionGroups`, `uses.events`, `uses.tables`, `uses.sources` (`:205-245`), `onFailure {script, notify}` (`:246-254`), `node {label, icon, category, takes}` (`:255-280`). The editor's `uses` type already keeps unknown keys (`Authoring.tsx:126`), so a save keeps what a file set.
- **Control belongs** in the Settings disclosure of the editor, in `Authoring.tsx`, as one shared field set that the script's page and the list inspector read (they already show Timeout and Retries). Choices come from existing list routes (tables, events, sources, connection groups, pools, scripts, connections), as `useChoices` already does for connections, secrets and variables.
- **Siblings:** connector and trigger-source editors share the component, so the fields show only for a script; flows' `with` grants ("takes") and the Alerts screen's workspace default for `onFailure`.
- **Permissions:** `resource:write` + `code:write` to save (`authoring.ts:1164`); `table`, `event` and `source` uses need nothing more but are refused at deploy if unbound.
- **Size:** L.

## Owner decides

- **Q1.** Should a new console script get the SDK's retry delay (30 s, backoff) and timeout (300 s), or keep 0 s and 60 s? Options: align console to the SDK, keep and show both fields in Settings, or keep. Recommend: align the delay and backoff, keep 60 s for the first run, and add the delay and backoff fields (MP-1).
- **Q2.** Should `console_code` get a control (API, console, CLI) or be removed? Recommend a toggle under tenant Configure, for an operator or tenant admin, with an audit entry.
- **Q3.** Should `console.log` and `console.error` in a script go into the run's log at `info`/`error`? Recommend yes, through the same path as `ctx.log` and the masking in SCR-01, so the console, with no shell, shows what its author printed.
