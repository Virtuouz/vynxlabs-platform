# Inventory: scripts

Read from the code at `270e509` on 2026-11-22. A report, not checked prose: what it calls a bug is settled in [the findings](../findings.md).

R = `.`. AU = `R/apps/console/src/screens/Authoring.tsx`, EX = `…/screens/Execution.tsx`, OP = `…/screens/ObjectPages.tsx`, RU = `…/screens/Runs.tsx`, CP = `R/apps/control-plane/src`, SDK = `R/packages/sdk/src`, WK = `R/packages/worker/src`, CMP = `R/packages/compose/src/index.ts`, KINDS = `R/packages/manifest/src/kinds.ts`. I read code and tests and ran nothing. Items tagged [inferred] come from reading alone.

## A. Pages (under `R/packages/docs/content`)

| Path | Status | Topic | Purpose |
|---|---|---|---|
| build/scripts.md | existing, 13 lines | `build-scripts` (nav.ts:113) | List, inspector, script page, running, offering |
| build/script-editor.md | existing, 11 lines | `build-scripts-editor` (nav.ts:295; `scripts/new` and `scripts/edit/`) | Editor, drafts, test pane |
| build/writing-a-script.md | new | – | Console tutorial: exports, imports, schemas |
| build/script-recipes.md | new | – | Starters and patterns |
| develop/define-script.md | new | – | `defineScript` options, schedules |
| develop/script-context.md | new | – | Every `ctx` member |
| develop/connectors-in-scripts.md | new | – | http, smtp, oauth2, custom, groups |
| operate/how-scripts-run.md | new | – | Claiming, isolation, limits, retries, egress, masking |
| reference/script-limits.md | new | – | All numbers |
| build/extension-editor.md | existing stub | `build-extensions-editor` | Same editor component (other slice) |
| reference/kinds/script | generated | – | Link to it; numbers are missing (D) |

## B. Per page

**Scripts list** (EX:114-336). Needs `script:read` (CP/routes/execution.ts:963).
- Title "Scripts". Primary **New script** shows in dev workspaces only.
- Filter chips ("Show"): All, Failing, Never run, Drafted. URL `?filter=`.
- Columns: Script (path, pill "Draft" or "Draft, never deployed", description or "No description"), Uses (connections and `table x`, else "Nothing outside"), Last run ("N in a row" from 2; streak counted over the last 20 finished runs), Source (Platform for `core/`, Console, Repository).
- Empty: "No scripts yet" / "No script matches".
- Inspector (`?item=`): failure notice, Timeout, Retries, Managed in, connections/tables/secrets/variables, links "Its page: runs, triggers, used by" and "Open the last run". Footer: **Open editor**, **Run**, **Offer to an agent…**.
- **Run** dialog: "Run {path}", or "Run {path}, as deployed" when a draft exists. Undeployed: "Not deployed yet. Deploy it to run it, or try the draft from its editor." Needs `run:write` at the workspace or the script (execution.ts:1175).
- Shortcut `g s`.

**Script page** `/scripts/{path}` (OP:538-655).
- Actions: Run, **Open the code**. Tabs: Runs, Triggers, Used by, Source.
- Triggers (OP:365+): **Add a schedule** (dev only). Row actions: Run it now (schedules), Pause…, Resume. Empty: "Nothing starts it on its own". Columns: Trigger, Kind, State.
- Source: read-only; `?run=` shows the code as that run ran it with the failing line. Needs `bundle:read` (operations.ts:616).
- Palette: "Open the code", "See its runs".

**Run again** (runAgain.ts:30-48): "Run {script} again?", on the original version or "the version deployed now". Keeps input and tags. A flow step's run is refused: "Retry the flow run instead." (execution.ts:1261).

**Offer to an agent…** (OfferToAgent.tsx).
- In the editor it appears only when state is Deployed or From the repository (AU:772).
- Dialog "Offer to an agent": Service account select; buttons Offer, Continue, Cancel, Done. Then "Address for the agent" with "Copy the address", and "Keys and tools of {name}".
- It binds built-in role `agent_runner` (`run:write`, `flow_run:write`; migration 0053) at that one resource. With no accounts: "Create a service account".

**Script editor** (AU:246-1034).
- Header pills: Not saved, Draft, Deployed, From the repository, Unsaved changes (kit/status.tsx:77).
- Buttons: **Offer to an agent…**, **Name and path** (ResourceIdentity: Key, Path, Title; disabled for repository code), **Discard draft** / **Remove** / text "Managed in the repository: the script is removed there.", **Save draft**.
- **Deploy** menu: "This change only" / "Review all drafts" (kit/DeployMenu.tsx). Shown only for a saved, clean draft. The success toast offers "Promote to {name}".
- New script: **Path**, plus **Start from** (starters.ts): "Greet someone", "Total some numbers", "A job on a schedule". Starters are disabled once code changes ("The code has been changed, so starting again from another is off.").
- Path rule (AU:229): lowercase letters, digits, hyphens, underscores, in folders. A taken path gives "Something already exists at this path…".
- **Settings** disclosure (collapsed when editing an existing script): What it does (max 500), Give up after (seconds) 1–3600 (new: 60), Try again (times) 0–10, Connections it uses, Secrets it reads, Variables it reads, and either "Input schema, as JSON Schema" or read-only "Input schema, read from your code".
- Schema status: "Reading the schema from your code…"; after 20 s, "Your schema will be read from the code once a worker is available."; "The schema could not be read from the code: …".
- Split pane (70%). Test pane button: "Save and run" / "Run the draft", ⌘↵. Tabs: **Result**, **Problems (n)**, **Runs**.
  - Result (RU:886): Cancel run ("Cancel this run?" / "Keep running"), Open full view, Copy as curl, Why it failed, "Go to line N", diagnosis with "Open {section}", Attempts, tabs Logs / Input and output / Details, then "Events it published".
  - Problems: line:column, tag "Build".
  - Runs: last 20; State, Started ("· test"), Took.
- Autosave 3 s after the last change, drafts and deployed scripts only. A new script waits for first Save; a browser copy is kept, offered as "Restore it" / "Discard".
- Keys: ⌘S, ⌘↵, ⌘K palette, F1 help, Ctrl+Space as Monaco. Plain textarea fallback when Monaco does not load.
- Read-only: production (ProductionNotice), repository code (file picker), `core/`.
- "Edit in dev" from a failed run (`?fromRun=ws:run`) carries its input; masked values must be entered again (AU:409-446).
- Permissions: save `resource:write` + `code:write`; test `run:write` + `code:write` (authoring.ts:1164,1261); deploying drafts that contain code also needs `code:write` (authoring.test.ts:243). Tenant switch `console_code` off gives 403 `console_code_off`.
- Draft history keeps 30 versions (kernel/authoring.ts:321). A conflicting save gets `draft_changed`.

**Console script format / compile** (CMP)
- The default export runs: "needs a default export. That is what runs." Optional exports `input` and `output` (zod).
- Imports: `@volvel/sdk` and `node:` only, else "Code written in the console may import only @volvel/sdk and node: modules, not "x"…". No cross-script imports, dynamic imports by literal path, SDK subpaths or tsconfig.
- 256 K characters per source (KINDS:112). Target node24. Types are not checked at build. Errors carry `path.script.ts:line`.
- `__vx_describe` runs on a worker. Derived schema max 64 KB (kernel/authoring.ts:625). Task: 30 s, 256 MB, waits up to 10 min.

**defineScript** (SDK/index.ts:168-292; KINDS:134-283)
- `path`, `key`, `title`, `description`, `mcp.name`, `input`, `output`, `connections`, `connectionGroups`, `secrets`, `variables`, `events`, `tables`, `sources`.
- `timeoutSeconds` 300 default, 1–3600. `memoryMb` 512 default, 64–4096.
- `retries {limit 0–10, delaySeconds default 30 (0–3600), backoff default true}`.
- `concurrency` 1–64, or `{key: "input.a.b", limit}` (1–5 fields deep; a missing value shares one lane; a value over 200 chars is hashed, runs.ts:152). `worker` pool name.
- `onFailure {script, notify}`: the handler gets `{run: {id, script, attempt, error}}`; one alert per script per 10 min (alerts.ts:201); a handler's failure triggers nothing; per-script settings override the workspace's.
- `node {label ≤60, icon, category ≤40, takes: connection|table|event}`.
- There is no schedule or trigger option on a script. Use `defineSchedule` (index.ts:295: cron, timezone, input, enabled, source, overlap `allow|skip`, tags), `defineWebhook`, `defineForm`, `defineEventTrigger`.
- Deploy refuses unbound connections, secrets, variables without a default, sources, and the notify connection (deploy.ts:29-130).

**ctx** (SDK/context.ts; implementation WK/context.ts:131)
- `connection<Client>(path)`; `connections(group).get(key)` / `.keys()` (1,000 max); `secret(name)`; `variable(path)` (always a string).
- `table(def|path)` → `find, get, insert, insertMany, update, delete, aggregate, as(principalId)`. find limit 50, max 1,000; insertMany 1–1,000, atomic; filter max 50 conditions; aggregate 3 groups, 5 measures, limit 200/1,000; ops eq ne gt gte lt lte in contains is_null.
- `source(path).table(name)`: `as` is ignored there.
- `files.put(name, content, type?)` → `{id}` (25 MB), `files.get(id)`. Not declared: any file in the workspace by ID.
- `events.publish(event, payload)`: schema-checked; chain depth 10.
- `log.debug/info/warn/error(msg, fields?)`.
- `run`: `id`, `attempt`, `idempotencyKey`, `trigger`, `startedBy`, `tag(...)` (10 per run; `[a-z0-9_.:-]{1,64}`). `signal`.
- **These do not exist:** `ctx.rows`, `ctx.sources`, `ctx.http`, `ctx.smtp`, `ctx.oauth2`, `ctx.state`, `ctx.idempotency`, `ctx.logging`. HTTP, mail and OAuth are connection clients; state goes in a table; idempotency is `ctx.run.idempotencyKey`.
- HttpClient (SDK/http.ts): `request/get/post`, options `method headers query json body allowFailure`; throws `HttpError {status, response}`; own origin only. `post(path, json)` ignores `body`; no put/patch/delete helpers. SmtpClient.send (smtp.ts, WK/smtp.ts). oauth2 returns an HttpClient with the access token only.

**How scripts run**
- A run is validated by JSON Schema before queuing, pinned to a bundle, claimed, then run in a process per attempt (WK/worker.ts:162). Env only PATH, TZ, LANG, TMPDIR, NODE_EXTRA_CA_CERTS; nice 10; no credential. `ctx` calls go over IPC and are allow-listed (WK/context.ts:290).
- Memory: heap = memoryMb; whole process memoryMb + 64 MB, checked every 500 ms: "The script ran out of memory (N MB)." Low machine: "The script was stopped: the machine ran low on memory."
- Timeout: "The run took longer than its limit of N seconds."; 3 s grace, then SIGKILL. Cancel is noticed at the next heartbeat (10 s).
- Worker lost after 30 s silence (retry counts as an attempt). Workspace concurrency default 10. Worker default 4 runs; a managed worker exits after 60 s idle. Slots from memory (machine.ts:75).
- Logs: 500 per request, 8,000 chars per message (truncated by the server), 5,000 buffered, 3 final tries, "N log lines could not be saved." Viewer window 50,000 lines (EX:402).
- Errors: 8,000-char message, 32,000-char stack. Input/output over 256 KB is stored in file storage.
- Source maps resolve console and repository frames (operations.ts:556-590).
- Masking (redact.ts): input/output shown as `[redacted]` by key name/suffix, `writeOnly`, `format: "password"`, `x-secret`. Stored values and what scripts receive are unchanged.
- Test runs: trigger `manual` with `draft: true`. Preview bundles and their runs are deleted after 7 days (bundles.ts:192).

## C. Gotchas

1. In console scripts zod is only read for schema: no parse at run time, so `.default()`, coerce and transforms do nothing (CMP:281 exports the raw function). Output is never checked. Repository scripts parse both (index.ts:284). The "Totals" starter works around this.
2. Settings cannot declare tables, events, sources, connection groups, memory, concurrency, pool, onFailure, node or retry delay. A script made only in the console therefore cannot use `ctx.table` or `events.publish`. They survive a save if set through a file (`*.script.yaml`).
3. Console retries default to delay 0, no backoff; SDK 30 s with backoff. Timeouts 60 vs 300 s.
4. `console.log` goes to the worker's log, not the run.
5. Logs are sent only at each 10 s heartbeat or at the end, so live logs arrive in steps.
6. Log fields and error messages are not masked; only input and output are.
7. A test run composes **all** drafts (authoring.ts:1269), so someone else's broken draft blocks yours. The Problems tab filters to your file and may show "No problems found."
8. Without `.as()`, a script reaches every row.
9. The editor shows the error "Cannot find module" for `node:` imports, `Buffer` and `process` [inferred]: no Node types are loaded (editor/monaco.ts:26-71), though they build and run.
10. Removing the `input` export keeps the last schema for hand editing.
11. `volvel run` (local) has no tables, sources, files or `connections()`, and treats every connection as http (R/packages/cli/src/local.ts:100).
12. Retries re-run everything: at-least-once even with 0 retries.

## D. Docs wrong, stale or missing

- scripts.md: "**Remove** is on the list's inspector" is false for scripts (EX:274-292). "**Keep this script**" is never shown, as AU has no `removed` state.
- script-editor.md: nothing on tabs, limits, autosave.
- Settings reference (`generated/settings.md`, from CP/config-vars.ts:284): EGRESS_ALLOW says it governs "scripts and connections". `guardedFetch` is control-plane only (SSO, git, OAuth token, data sources, hostname check; docs/self-hosting.md:299 is right). Scripts use plain `fetch`; they are restricted only by the worker host's network and firewall (self-hosting.md:196).
- generated/kinds/script.md omits minimum/maximum/default and has blank descriptions (timeoutSeconds, retries, concurrency).
- docs/sdk-guide.md has no script or ctx reference. docs/contracts/worker-protocol.md is accurate where I checked it.

## E. Likely bugs and questions

1. `diagnose.ts`: the HTTP pattern needs "status/HTTP NNN", but HttpError says "answered 401."; the timeout pattern misses "longer than its limit of". Both common failures get no advice [inferred].
2. `deriveSchemas` uses `entryFor("script", draft.path)` (kernel/authoring.ts:667) but entries use the key: after a rename nothing is found and `schemaSource` is dropped [inferred].
3. `aggregate` in routes/worker.ts:962 announces a "deleted" row with id "undefined"; `event.source_id` is uuid, so the insert fails and is logged when anything listens to `platform/row-changed`.
4. No `bodyLimit` on `/complete`, `/logs`, `/data`: Fastify's 1 MiB applies. Output over 1 MiB fails the run with "…/complete answered 413"; a 500-line log batch over 1 MiB can never send and blocks later lines [inferred].
5. Opening a draft that removes a script shows an empty, editable editor with "Discard draft"; saving replaces the removal.
6. List inspector offers "Offer to an agent…" for undeployed drafts (404 notice).
7. `console_code` has no UI, API or CLI: DB only. Intended?
8. Describe and notify tasks always go to the default pool, so a tenant with only named-pool workers never gets schemas.
9. `onFailure` uses the currently deployed body, not the run's bundle (alerts.ts:60).

## F. Screenshots and examples

Screenshots: list with inspector; New script with Start from; editor + test pane with failed run and "Go to line"; Problems with Build tag; Settings with a code-read schema; Deploy menu; Offer dialog, before and after; Script page Triggers tab.

Code: the three starters; `input`/`output` export; `R/examples/acme/src/index.ts:79-110` (syncOrders: retries, concurrency, onFailure, idempotency header, `ctx.signal`); `R/examples/fernhill/src/scripts.ts:189,614` (`.as`, idempotencyKey); `SDK/scripts.test.ts` (per-customer concurrency); connection group; a cursor kept in a table; `*.script.yaml` declaring `uses.tables`; failure handler input.
