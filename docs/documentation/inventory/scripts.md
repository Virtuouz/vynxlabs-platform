# Inventory: scripts

Read from the code at `270e509` on 2026-11-22. A report, not checked prose: what it calls a bug is settled in [the findings](../findings/README.md).

**Refreshed 2026-11-23** against the code on `phase-30-docs-system` (after phase 29). What changed in this brief:
- Section A: every page has a collection and a Diátaxis type, a purpose and sources. Added: a tutorial, "Test a script", "Run a script and run it again", "Offer a script to an agent", "Script settings", "Test scripts in code" (`@volvel/sdk/testing`), "Turn code in the console off", and an explanation of how scripts run (it was in "operate/"). `how-scripts-run` moved from Operate to Develop (explanation); worker-host limits go to the Self-host pages.
- Section B: line numbers moved and were re-read. New since the first read: the script page has a **Settings** tab that can change settings (MP-1); the editor's Settings hold memory, runs at once, pool, tables, sources, events, groups, `onFailure` and "Use as a flow step"; "Wait between tries" and "Wait longer after each failed try"; a test uses only its own and the drafts it names (D32); "Keep this script"; the run dialog's Start and Priority; "Published" events on a script run page; `console.log` goes to the run's log (D44); masking of logs, errors and alerts; larger log and output limits; `onFailure` replaces the workspace default (D29); a guest cannot start a script (D39); `volvel run` takes connection groups.
- Section C: gotchas 1, 2, 3, 4, 6, 7, 9, 11 were wrong or are fixed; rewritten. Section D: the stale-docs list is now what phase 29 left for phase 31. Section E: every item is settled, with the outcome cited.
- Not verified: no browser walk, and no run on an instance (phase 29's lanes say the same). Numbers I did not re-read and carry from the first read: workspace run concurrency 10, worker default 4 runs, 60 s managed-worker idle exit, 30 s silence before a run is lost (`HEARTBEAT_SECONDS = 30`, `packages/db/src/queue.ts:12`, is the one I did read), the 10 s heartbeat and the memory slot rule in `machine.ts`. The test pane's Problems and Runs tab bodies were read only by their labels.
- Vocabulary: Flow, Deploy (dev) / Versions (production), canceled, Apps. Page copy says "Deploy", not "Activate" or "Release".

R = `.`. EX = `R/apps/console/src/screens/Execution.tsx`, AU = `…/screens/Authoring.tsx`, CS = `…/screens/CodeSettings.tsx`, OP = `…/screens/ObjectPages.tsx`, RU = `…/screens/Runs.tsx`, RP = `…/screens/RunPage.tsx`, CP = `R/apps/control-plane/src`, SDK = `R/packages/sdk/src`, WK = `R/packages/worker/src`, CMP = `R/packages/compose/src/index.ts`, KINDS = `R/packages/manifest/src/kinds.ts`. Items tagged [inferred] come from reading alone.

## A. Pages (under `R/packages/docs/content`)

The collections are Get started, Console, Develop, Administer, Self-host. Paths below are the current content tree; phase 30 may move them, and the collection and type are what matter.

| Path | Status | Collection, type | Purpose | Sources |
|---|---|---|---|---|
| build/writing-a-script.md | new | Get started, tutorial | Make a script from "Greet someone" or "Total some numbers", test it, deploy it, run it, read the run | AU:260-1034, `starters.ts`, EX:410-447, RP |
| build/scripts.md | existing, 13 lines; rewrite | Console, reference | The Scripts list, its inspector, and a script's page with its five tabs (Runs, Triggers, Used by, Settings, Source) | EX:154-390, OP:490-830; topic `build-scripts` (`nav.ts:124`) |
| build/script-editor.md | existing, 11 lines; rewrite | Console, reference | The editor: header, states, Name and path, Save draft, Deploy menu, Start from, split pane, autosave, keys, read-only states, draft conflicts | AU:260-1034; topic `build-scripts-editor` (`nav.ts:315`, `scripts/new`, `scripts/edit/`) |
| build/script-settings.md | new | Console, reference | Every field of a script's Settings, in the editor and on the script page, and what each means | CS:100-310, AU:598-760, OP:831-1100 |
| build/test-a-script.md | new | Console, how-to | Try a draft without deploying: the test pane, "Build with all drafts", Problems, Runs, "Edit in dev" from a failed run | AU:560-600, 777-800, 1189-1445, `routes/authoring.ts:1274`, `fixed/flw2.md` D32 |
| build/run-a-script.md | new | Console, how-to | Run a deployed script now or later, with a priority; run it again on the same or the current version; cancel | EX:410-447, `InputDialog.tsx:70-135`, `runAgain.ts:30-135`, RP:288-330 |
| build/offer-a-script.md | new | Console, how-to | Give a script to an agent: pick a service account, copy the address | `OfferToAgent.tsx`, AU:848-856, EX:332-345 |
| build/script-recipes.md | new | Develop, how-to | Starters and patterns: schedule it, call an API, keep a cursor in a table, one lane per customer, a failure handler | `starters.ts`, `R/examples/acme/src/index.ts:76-110`, `R/examples/fernhill/src/scripts.ts:189,614`, `SDK/scripts.test.ts` |
| develop/define-script.md | new | Develop, reference | `defineScript` options, defaults and limits; the other `define*` that start a script | SDK/index.ts:167-293, 325-345; KINDS:131-283 |
| develop/script-context.md | new | Develop, reference | Every `ctx` member, and what does not exist | SDK/context.ts:1-75; `worker/src/context.ts` |
| develop/connectors-in-scripts.md | new | Develop, how-to | Call an API, send mail, use OAuth, a connector of your own, a group of connections | SDK/http.ts, smtp.ts, oauth2.ts, `SDK/context.ts:36-50` |
| develop/test-scripts-in-code.md | new | Develop, how-to | `@volvel/sdk/testing` (`runScript`, `testContext`, `memoryTable`) and what `volvel run` cannot do | `SDK/testing.ts`, `packages/sdk/package.json:12`, `packages/cli/src/local.ts:105-190` |
| develop/how-scripts-run.md | new (was `operate/`) | Develop, explanation | Claiming, a process per attempt, limits, retries, masking, at-least-once, what the platform does and does not check | WK/worker.ts, `CP/kernel/execution/*`, `redact.ts` |
| reference/script-limits.md | new | Develop, reference | All the numbers in one table | KINDS, SDK, WK, CP (cited in B) |
| administer/code-in-the-console.md | new (owner may be the tenants slice) | Administer, how-to | Turn writing and testing code in the console off or on for a tenant (D17) | `CP/routes/tenants.ts:62,183,308`, `Environments.tsx:1617-1665`, `routes/authoring.ts:211-224` |
| self-host: worker host and network | other slice | Self-host, reference | `WORKER_EGRESS_ALLOW`, one user for each worker, memory slots. Link from `how-scripts-run`, do not repeat | `CP/config-vars.ts:292,331`; `fixed/host.md` HOST-03 |
| reference/kinds/script | generated | Develop, reference | Link to it. It now prints Minimum, Maximum, Default (SCR-14); `timeoutSeconds` has none in the manifest | `packages/docs/generators/schema.mjs` |
| build/extension-editor.md | existing stub | Console, reference | Same editor component (other slice: extensions) | AU |

Say it is not there: a script has no schedule or trigger option (use `defineSchedule`); there is no `ctx.query`, `ctx.rows`, `ctx.sources`, `ctx.http`, `ctx.smtp`, `ctx.oauth2`, `ctx.state`, `ctx.idempotency` or `ctx.logging`; no put, patch or delete helper on an HttpClient; no CLI command for the console-code switch (the API and the console have it).

## B. Per page

**Scripts list** (EX:154-390). The route needs `script:read` (CP/routes/execution.ts:1086). The screen's own notice names `resource:write`.
- Title "Scripts". Primary **New script** shows in dev workspaces only (`editable`).
- Filter chips ("Show"): All, Failing, Never run, Drafted, with counts. URL `?filter=`.
- Columns: Script (path; pill "Draft" or "Draft, never deployed"; description or "No description"), Uses (connections and `table x`, else "Nothing outside"), Last run (state and when; "N in a row" from 2; the streak is counted over each script's latest 20 finished runs, CP/routes/execution.ts:1182-1194), Source (Platform for `core/`, Console, Repository).
- Empty: "No scripts yet" (dev: write one, or `volvel deploy`; production: promote, or `volvel deploy`) / "No script matches".
- Inspector (`?item=`), footer **Open editor**, **Run**, **Offer to an agent…**. Each is greyed unless the person holds `resource:write`, `run:write`, `binding:write` (the last two count a grant on the script alone); the first missing one is named (EX:171-186, 330-360; `fixed/fix-last.md` item 2). **Offer to an agent…** is not drawn for a script that is not deployed (SCR-12). Body: a failure notice, description, Timeout, Retries, Managed in, the connections, tables, secrets and variables it uses, links "Its page: runs, triggers, used by" and "Open the last run".
- **Run** dialog: "Run {path}", or "Run {path}, as deployed" when a draft exists. Fields: the input form, **Start** (Now or Later, "Starts at"), **Priority** (whole number -100 to 100). A script that is only a draft shows "Not deployed yet. Deploy it to run it, or try the draft from its editor." (EX:420-428, 439). Needs `run:write` at the workspace or at the script (execution.ts:1303). A guest of an app cannot start one: "Sign in to start a script" (APP-02, D39; `kernel/errors.ts:39`). Say so on the app-client page too.
- There is no Remove on the list's inspector. A script is removed in its editor.
- Shortcut `g s` (`kit/shortcuts.ts:37`).

**Script page** `/scripts/{path}` (OP:666-830).
- Header: "Last run {state} {when}" or "Not run yet". Actions: Run (greyed with the reason when `run:write` is missing), **Open the code**. Tabs: Runs, Triggers, Used by, **Settings**, Source.
- Triggers (OP:490+): **Add a schedule** (dev only; production says "Triggers change in a dev workspace and reach production by promotion."). Row actions: Run it now (schedules, not paused), Pause…, Resume. A pause by the workspace or the instance is said on the row (OPS-21). Empty: "Nothing starts it on its own" / "It runs when started by hand." Columns: Trigger, Kind, State.
- Settings (OP:831-1100): the settings a script runs with: Stops after, Tries again, Memory, Runs at once, Worker pool, Connections, Secrets, Variables, Tables, Data sources, Events it may publish, Connection groups, what it starts and sends when it fails for the last time. A draft shows its own, with a note. **Change the settings** (not in production, not for repository code, which says "The repository holds this script: change its settings there.") opens the editor's own fields and **Save as a draft**; nothing that runs changes until it is deployed. Not on this page: "Use as a flow step" and the schema.
- Source: read-only; `?run=` shows the code as that run ran it, with the failing line. Route needs `bundle:read` (CP/routes/operations.ts:640-642).
- Palette: "Open the code", "See its runs".

**Run again** (runAgain.ts:30-48; routes/execution.ts:1386): "Run {script} again?", on the original version or "the version deployed now". Keeps input and tags. A flow step's run is refused: "This run is a step of a flow run. Retry the flow run instead." (execution.ts:1404). "Copy as curl" gives `POST …/runs/:id/rerun {bundle: "original"}` (runAgain.ts:133).

**Offer to an agent…** (OfferToAgent.tsx).
- In the editor it appears only when state is Deployed or From the repository (AU:848-856).
- Dialog "Offer to an agent" (OfferToAgent.tsx:45): Service account select; buttons Offer, Continue, Cancel, Done. Then "Address for the agent" with "Copy the address", and "Keys and tools of {name}". With no accounts: "Create a service account".
- It binds built-in role `agent_runner` (`run:write`, `flow_run:write`; migration `0053_agent_runner.sql`) at that one resource. Needs `binding:write`.

**Script editor** (AU:260-1034).
- Header pills: Not saved, Draft, Deployed, From the repository, Unsaved changes (`kit/status.tsx:77-81`), and "Removing" for a script drafted for removal (AU:840).
- Buttons: **Offer to an agent…**, **Name and path** (ResourceIdentity: Key, Path, Title; hidden for repository code), **Discard draft** / **Remove** / text "Managed in the repository: the script is removed there." (`kit/RemoveDraftButton.tsx:28-76`), **Save draft**. A script drafted for removal opens read-only with the notice "This script is removed in your drafts…" and **Keep this script** takes the removal back; no autosave (SCR-11, `fixed/draft.md`).
- **Deploy** menu (the dev word; production says Versions): "This change only" / "Review all drafts" (`kit/DeployMenu.tsx:115-117`). Shown only for a saved, clean draft. The toast: "Deployed {path} as version N." with "Promote to {name}". Deploying drafts that contain code needs `code:write`.
- New script: **Path**, plus **Start from** (starters.ts:19,38,63): "Greet someone", "Total some numbers", "A job on a schedule". Starters are off once the code changes: "The code has been changed, so starting again from another is off." (AU:967).
- Path rule (AU:253, 294): lowercase letters, digits, hyphens, underscores, in folders. A taken path: "Something already exists at this path…".
- **Settings** disclosure (collapsed when editing an existing script). Fields, in order (CS:100-310, AU:598-760):
  - What it does (max 500).
  - Give up after (seconds) 1 to 3600 (new script: 60).
  - Try again (times) 0 to 10; **Wait between tries (seconds)** 0 to 3600; **Wait longer after each failed try** (new script: 0 tries, 30 s, backoff on; AU:227, SCR-15, D43).
  - Connections it uses; Secrets it reads; Variables it reads.
  - Worker pool (hint: Test and failure alerts use it too).
  - Memory (MB) 64 to 4096 (empty: 512); Runs at once 1 to 64; One lane for each value of (`input.customer`).
  - Tables it reads and writes; Data sources it uses; Events it may publish; Connection groups it picks from.
  - "When a run fails for the last time": "If it fails for the last time, start" (a script) and "and send a summary through" (an HTTP connection). Its own choice replaces the workspace's default alert as a whole (D29).
  - **Use as a flow step**: Step name (max 60; empty keeps it out of the flow editor), Icon, Group (max 40), "A step may hand it" (a connection, a table, an event) (EXT-08).
  - Either "Input schema, as JSON Schema" or read-only "Input schema, read from your code".
- Schema status: "Reading the schema from your code…"; after 20 s, "Your schema will be read from the code once a worker is available."; "The schema could not be read from the code: …".
- Split pane. Test pane button: "Save and run" / "Run the draft", ⌘↵; checkbox **Build with all drafts** (off: this script's draft and the drafts it names; on: every draft, so another broken draft stops the test; D32). Tabs: **Result**, **Problems (n)**, **Runs**.
  - Result (RU:1100-1290): Cancel run ("Cancel this run?" / "Keep running"), Open full view, Copy as curl, Why it failed, "Go to line N", diagnosis with "Open {section}", Attempts, tabs Logs / Input and output / Details, then "Events it published" (AU:1434; "None." when empty).
  - Problems: line:column, tag "Build" (build errors are matched by `<path>.script.ts`; AU:1189).
  - Runs: last 20 (AU:1225); State, Started ("· test"), Took.
- Autosave 3 s after the last change (AU:482-491), drafts and deployed scripts only. A new script waits for first Save; a browser copy is kept, offered as "Restore it" / "Discard" (AU:1028).
- Keys: ⌘S, ⌘↵, ⌘K palette, F1 help. A plain textarea if Monaco does not load. The editor knows `node:` modules, `process` and `Buffer` (SCR-13, `editor/nodeTypes.ts`).
- Read-only: production (ProductionNotice), repository code (file picker), `core/`.
- "Edit in dev" from a failed run (`?fromRun=ws:run`) carries its input; masked values must be entered again (AU:436-474).
- Permissions: save `resource:write` + `code:write`; test `run:write` + `code:write` (routes/authoring.ts:211, 639, 1274-1385); deploying drafts that contain code also needs `code:write`. A tenant whose `console_code` is off answers 403 `console_code_off` (routes/authoring.ts:218-224) and an operator or tenant admin turns it back on (see the Administer page).
- Draft history keeps 30 versions (`kernel/authoring.ts:396`). A save from an older revision gets `draft_changed` and the clash notice (routes/authoring.ts:609).

**Console script format / compile** (CMP)
- The default export runs: "needs a default export. That is what runs." (CMP:285). Optional exports `input` and `output` (zod).
- A console script's `input` and `output` ARE parsed, as `defineScript` does: defaults, coercion and transforms apply; a mismatch throws the SDK's `SchemaError` (CMP:125-141, SCR-05).
- Imports: `@volvel/sdk` and `node:` only, else "Code written in the console may import only @volvel/sdk and node: modules, not "x". Put shared code and packages in the repository." (CMP:205). No cross-script imports, dynamic imports by literal path, SDK subpaths or tsconfig.
- 256 K characters per source (`MAX_SOURCE_LENGTH`, KINDS:112). Target node24 (CMP:263). Types are not checked at build. Errors carry `path.script.ts:line`.
- `__vx_describe` runs on a worker, in the script's own `worker` pool (SCR-10). Derived schema max 64 KB (`kernel/authoring.ts:753`). Task: 30 s, 256 MB, waits up to 10 min [carried, not re-read].

**defineScript** (SDK/index.ts:167-293; KINDS:131-283)
- `path`, `key`, `title`, `description`, `mcp.name`, `input`, `output`, `connections`, `connectionGroups`, `secrets`, `variables`, `events`, `tables`, `sources`.
- `timeoutSeconds` 300 default, 1 to 3600. `memoryMb` 512 default, 64 to 4096.
- `retries {limit 0 to 10, delaySeconds default 30 (0 to 3600), backoff default true}` (index.ts:258-262).
- `concurrency` 1 to 64, or `{key: "input.a.b", limit}` (1 to 5 fields deep; a missing value shares one lane; a value over 200 chars is hashed, `kernel/execution/runs.ts` [carried]). `worker` pool name.
- `onFailure {script, notify}`: the handler gets `{run: {id, script, attempt, error}}`; one alert per script per 10 min (`ALERT_WINDOW_MS`, `kernel/execution/alerts.ts:217`); a handler's failure triggers nothing (alerts.ts:61); the script's own `onFailure` replaces the workspace's default as a whole, so a script that names only `notify` does not also start the default's script (index.ts:213-218, D29, OPS lane opsb). It reads the script as deployed now, not the run's bundle: deliberate (SCR-17).
- `node {label ≤60, icon, category ≤40, takes: connection|table|event}`.
- There is no schedule or trigger option on a script. Use `defineSchedule` (index.ts:325: cron, timezone, input, enabled, source, overlap `allow|skip`, tags), `defineWebhook`, `defineForm`, `defineEventTrigger`.
- Deploy refuses unbound connections, secrets, variables without a default, sources, and the notify connection (`kernel/execution/deploy.ts:32`, `missingBindings`; a source's secrets, connections and variables count too, EXT-01). `onFailure.notify` must be an HTTP connection (CFG lane, `bundle-check.ts`). In production, a missing binding refuses a promotion; in dev it warns (D23).

**ctx** (SDK/context.ts:33-75; implementation `WK/context.ts`)
- `connection<Client>(path)`; `connections(group).get(key)` / `.keys()` (1,000 max); `secret(name)`; `variable(path)` (always a string).
- `table(def|path)` gives `find, get, insert, insertMany, update, delete, aggregate, as(principalId)`. find limit 50, max 1,000; insertMany 1 to 1,000, atomic; filter max 50 conditions; aggregate 3 groups, 5 measures, limit 200/1,000; ops eq ne gt gte lt lte in contains is_null. Time columns compare by the whole millisecond (TAB lane). Rows a script changes are announced as `platform/row-changed` with the table's path and the run's chain depth; `aggregate` announces nothing (SCR-04). Rows changed by a reference's rule are not announced (D28).
- `source(path).table(name)`: `as` is ignored there.
- `files.put(name, content, type?)` gives `{id}` (25 MB), `files.get(id)`. Not declared: any file in the workspace by ID (a script is trusted; `fixed/files.md`).
- `events.publish(event, payload)`: schema-checked; chain depth 10.
- `log.debug/info/warn/error(msg, fields?)`. `console.log`, `info`, `debug`, `warn`, `error`, `trace` also go to the run's log (D44, `WK/runner.ts:72`).
- `run`: `id`, `attempt`, `idempotencyKey`, `trigger`, `startedBy` (`member`, `end_user`, `service_account`, or `system`), `tag(...)` (10 per run; `[a-z0-9_.:-]{1,64}`). `signal` aborts on cancel or timeout.
- **These do not exist:** `ctx.query`, `ctx.rows`, `ctx.sources`, `ctx.http`, `ctx.smtp`, `ctx.oauth2`, `ctx.state`, `ctx.idempotency`, `ctx.logging`. HTTP, mail and OAuth are connection clients; state goes in a table; idempotency is `ctx.run.idempotencyKey`.
- HttpClient (SDK/http.ts:35-37): `request/get/post`, options `method headers query json body allowFailure`; throws `HttpError {status, response}` whose message is `GET https://… answered 401.` with the query left out (http.ts:53-62); own origin only: a redirect to another origin is refused with "…sent the request on to {origin}. A connection only calls its own address…" (http.ts:171-175, D11), at most 5 redirects (http.ts:67). `post(path, json)` ignores `body`; no put/patch/delete helpers. SmtpClient.send (smtp.ts:31, WK/smtp.ts). oauth2 returns an HttpClient with the access token only.

**How scripts run**
- A run is validated by JSON Schema before queuing, pinned to a bundle, claimed, then run in a process per attempt (WK/worker.ts). Env only PATH, TZ, LANG, TMPDIR, NODE_EXTRA_CA_CERTS (worker.ts:136); no credential. `ctx` calls go over IPC and are allow-listed (WK/context.ts:287-317). Each managed worker has a user of its own on the host (D1, `fixed/host.md`).
- Reach: scripts use plain `fetch`, not the control plane's guard. What they reach is the worker host's firewall: private, loopback and link-local addresses are closed unless `WORKER_EGRESS_ALLOW` opens them; `EGRESS_ALLOW` is only for the instance's own calls (`CP/config-vars.ts:292-295, 331-334`, D20).
- Memory: heap `--max-old-space-size` = memoryMb (worker.ts:196); whole process memoryMb + 64 MB, checked every 500 ms (worker.ts:158): "The script ran out of memory (N MB)." Low machine: "The script was stopped: the machine ran low on memory." (worker.ts:173-175).
- Timeout: "The run took longer than its limit of N seconds." (worker.ts:553); 3 s grace (worker.ts:129), then SIGKILL. Cancel is noticed at the next heartbeat.
- Worker lost after 30 s of silence (`HEARTBEAT_SECONDS`, `packages/db/src/queue.ts:12`; `kernel/execution/runs.ts:795`); a retry counts as an attempt. Workspace concurrency default 10 [carried]. Worker default 4 runs; a managed worker exits after 60 s idle [carried]. Slots from memory (`machine.ts:137`).
- Logs: 500 per request (worker.ts:115), about 512 KB per request, halved on a 413; 8,000 chars per message, truncated by the server (`routes/worker.ts:122`); fields over 32 KB become a note; 5,000 buffered (worker.ts:113); 3 final tries (worker.ts:123), "N log lines could not be saved." The server takes 4 MB per log request (`routes/worker.ts:130`). Viewer window 50,000 lines (EX, `LOG_PAGE`).
- Errors: 8,000-char message, 32,000-char stack [carried]. Input/output over 256 KB is stored in file storage (`kernel/execution/runs.ts:16`). Output may be up to 10 MB (`MAX_OUTPUT_BYTES`, worker.ts:121; `routes/worker.ts:132`): over it, the run fails with "The output is larger than 10 MB (it is N MB). The script's work was done and is not repeated." and is not retried (SCR-03). 
- Source maps resolve console and repository frames (`routes/operations.ts:595-609`).
- Masking (`kernel/execution/redact.ts`, `served.ts`): input and output shown as `[redacted]` by key name or suffix, `writeOnly`, `format: "password"`, `x-secret` (redact.ts:6-15, 87). Also masked, by value (plain, URL-encoded, JSON-escaped, base64; under 4 characters only as a whole word): log lines and fields, errors, failure alerts, the `onFailure` input, the `platform/run-failed` event, flow step errors, and what MCP and the events list show (SCR-01, D13; `fixed/mask.md`, `mask2.md`). Stored values and what scripts receive are unchanged.
- Test runs: trigger `manual` with `draft: true`; they compose the script's draft and the drafts it names (or all, "Build with all drafts"). Preview bundles and their runs are deleted after 7 days (`PREVIEW_DAYS`, `kernel/execution/bundles.ts:194`).
- Events: a finished run publishes `platform/run-finished` with `{runId, script, status, error?}` for succeeded, failed and canceled; `run-succeeded` and `run-failed` stay (D50). A script's run page lists "Published" events (RunAlert.tsx:67-97) and what its failure alert did.

## C. Gotchas

1. A console script's `input` and `output` are parsed at run time, so `.default()`, coerce and transforms work (SCR-05; the "Total some numbers" starter relies on the default). Repository scripts parse both too (SDK/index.ts:289-293).
2. The console's Settings now declare tables, data sources, events, connection groups, memory, runs at once and its lane key, pool, `onFailure` and the flow step (MP-1, SCR-08). Retry delay and backoff are editable too. Not in the console: `mcp.name`, `key` and `title` beyond Name and path, and `entry`; these come from a file or the API.
3. Defaults still differ: a script made in the console times out at 60 s, the SDK's at 300 s. Retries now match: 30 s, backoff on (D43).
4. `console.log` goes to the run's log, masked (D44). (It used to go to the worker's.)
5. Logs are sent only at each heartbeat or at the end, so live logs arrive in steps [carried].
6. Log lines, fields, errors and alerts are masked by value, as are input and output (SCR-01). A secret that was rotated since a line was stored cannot be found by value.
7. A test run composes the draft and the drafts it names, not every draft (D32). With "Build with all drafts" on, someone else's broken draft blocks yours. The Problems tab filters to your file and may show "No problems found."
8. Without `.as()`, a script reaches every row.
9. The editor no longer reports "Cannot find module" for `node:` imports, `Buffer` and `process` (SCR-13; the test runs `tsc` with the editor's options, but it was not seen in a browser).
10. Removing the `input` export keeps the last schema for hand editing.
11. `volvel run` (local) has no tables, sources or files; it says "Tables live in a workspace, so they are not available to a local run…" (local.ts:20-22, 184-186). Connections come from the connector the bundle names (`http`, `oauth2`, a repository's own); mail connections are refused; connection groups work with members under `groups` in the bindings file (local.ts:113-180, SCR-19). Test code against fakes with `@volvel/sdk/testing`.
12. Retries re-run everything: at-least-once even with 0 retries.
13. A run whose output is too large is not retried; one whose process failed is (SCR-03).
14. A script's step name, once cleared, loses its icon and group in the saved draft; they come back when the name is typed again in the same session (EXT-08, `fixed/ext2.md`, `t2-walk-flow.md`).

## D. For phase 31: what the docs say wrong or lack now

The phase's lanes left these lines for `packages/docs/content` (the files were not edited in phase 29):
- `build/scripts.md`: the inspector has Open editor, Run and Offer (Offer only for a deployed script); there is no Remove on the list; "Keep this script" is in the editor for a script drafted for removal (the old inventory's note that it was never shown is out of date).
- `build/script-editor.md`: Settings hold timeout, tries, wait between tries and backoff, memory, runs at once, pool, uses, `onFailure` and the flow step; new scripts wait 30 s and back off; `input` and `output` are parsed (`fixed/scr2.md`, `fix-close.md`, `t3-config.md`).
- Script page: the Settings tab changes settings, saved as a draft (MP-1).
- `operate`: failure advice reads the platform's own texts (`diagnose.ts`); Test and alerts run in the pool of the script that uses the connection (D42).
- `configure/settings.md`, `configure/variables.md`, `index.md`: "scripts and flows read variables" is wrong; scripts and trigger sources do (`fixed/cfg2.md`).
- Settings reference: EGRESS_ALLOW and WORKER_EGRESS_ALLOW are rewritten in `config-vars.ts`; regenerate with `pnpm --filter @volvel/docs generate`.
- Events page: `platform/run-finished` (`fixed/api2.md`).
- App-client page: `runScript` and `runFlow` need a signed-in person (APP-02).
- `docs/sdk-guide.md` has no script or ctx reference; write them as `define-script.md` and `script-context.md`. `docs/contracts/worker-protocol.md` was updated for the new limits.
- CHANGELOG lines named in the fixed files: console scripts parse `input`/`output`; wait between tries is editable; console.log in the run's log; the `console_code` switch.

## E. Findings: settled in phase 29

All of the first read's list is settled. Outcomes in `fixed/` unless said:
1. Failure advice (SCR-06): fixed, one ordered table of the platform's texts, then `answered NNN` (`scr2.md`; `kernel/execution/diagnose.ts`).
2. Rename and schemas (SCR-07): fixed, `describeIn` uses `draft.key` (`scr2.md`).
3. `aggregate` announced a "deleted" row (SCR-04, TAB-26): fixed (`trg.md`, `tab2.md`).
4. Body limits and 1 MiB (SCR-02, SCR-03): fixed, log 4 MB, output 10 MB (`mask.md`).
5. A draft that removes a script (SCR-11): fixed, opens as a removal with "Keep this script" (`draft.md`).
6. Offer for an undeployed draft (SCR-12): fixed (`scr2.md`).
7. `console_code` has no UI (SCR-16, D17): built, a console switch for an operator and a tenant admin, audited; no CLI command, the API takes it (`sweep-server.md`).
8. Describe and notify tasks and pools (SCR-10, D42): fixed (`scr2.md`).
9. `onFailure` reads the deployed body (SCR-17): not a bug; say it on the how-scripts-run page (`findings/scripts.md`).
Also settled: SCR-01 (masking, `mask.md`), SCR-05, SCR-08 and MP-1 (`t3-config.md`, `sweep-console.md`, `fix-close.md`), SCR-09 (D32, `flw2.md`), SCR-13, SCR-14, SCR-15, SCR-18 (gotchas that stay; 4 and 6 changed, see C), SCR-19 (`scr2.md`).
Open, and not a script matter: `volvel dev` for file apps, interfaces and docs (CLI-MP7; D64 decided it, phase 30 builds it).

## F. Screenshots and examples

Screenshots: list with inspector (a drafted script and a deployed one); New script with Start from; editor + test pane with a failed run and "Go to line"; Problems with the Build tag; Settings (the new fields) and one with a code-read schema; Deploy menu; Offer dialog, before and after; script page Triggers tab and Settings tab with "Change the settings"; the run dialog with Start and Priority.

Code: the three starters; `input`/`output` export; `R/examples/acme/src/index.ts:76-110` (syncOrders: retries, concurrency, onFailure, idempotency header, `ctx.signal`); `R/examples/fernhill/src/scripts.ts:189,614` (`.as`, idempotencyKey); `SDK/scripts.test.ts` (per-customer concurrency); `SDK/testing.test.ts` (a test with fakes); a connection group; a cursor kept in a table; `*.script.yaml` declaring `uses.tables`; failure handler input.
