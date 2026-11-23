# Inventory: operate

Read from the code at `270e509` on 2026-11-22. A report, not checked prose: what it calls a bug is settled in [the findings](../findings/README.md).

Paths: `S/` = `apps/console/src/screens/`, `CP/` = `apps/control-plane/src/`, `X/` = `CP/kernel/execution/`, `M/` = `packages/manifest/src/`. [read] = traced in code; none of the bugs in (E) were reproduced live.

## (A) Pages (under `packages/docs/content`)

| Path | State | Purpose / topic |
|---|---|---|
| `operate/runs.md` | stub | list, filters, views, bulk actions / `operate-runs` (also `flow-runs/*`, nav.ts alias) |
| `operate/run-page.md` | new | script and flow run page, logs, diagnosis, re-run, cancel |
| `operate/comparing-runs.md` | new | "Since it last worked" and compare page |
| `operate/run-states.md` | new | states, retries, timeouts, masking, retention |
| `operate/events.md` | stub | / `operate-events` |
| `operate/triggers.md` | stub | list, pause, fire now / `operate-triggers` |
| `operate/triggers/{schedules,webhooks,forms,event-triggers}.md` | new | field reference per type |
| `operate/approvals.md` | partial | / `operate-approvals` |
| `operate/approval-mail.md` | new | mail links and `/approve/:token` |
| `tenant/approvals.md` | partial | / `tenant-approvals` |
| `configure/alerts.md` | stub | / `configure-alerts` |
| `instance/triggers.md` | stub | / `instance-triggers` |

`runs/:id` and compare show the `operate-runs` topic unless given their own.

## (B) Per page

### Runs list (S/Runs.tsx)
- **URL keys** (133-144): `status, kind, when, q, tag(list), target, sort, dir, cols, run`.
- **Search** "A path, a run ID, a tag or an error": path prefix, exact tag, error-summary substring, exact ID (CP/routes/operations.ts:133-150). Max 200 chars, 300 ms debounce.
- **Kind**: Scripts and flows / Scripts / Flows. **When**: Last hour / Last 24 hours (default) / Last 7 days / Everything kept.
- **Status chips with counts** (91-100): All, Failed, Running, Waiting for approval, Waiting for a time, Queued, Succeeded, Canceled.
- **Target/tag chips**: "Of x ✕", "Tagged x ✕"; tags AND together.
- **Columns** (513-611): State, Target (kind icon, tags), Result, Trigger, Started (sortable), Duration (sortable), Attempt (only when >1), Run ID (last 8). State cannot be hidden.
- **Toolbar**: Columns dialog ("Show every column", "Done", drag or arrows), density (compact default), Saved views, "Cancel N queued".
- **Saved views** (kit/views.tsx): private per member; "Save this view…", "Save over", Rename, Delete, "Copy a link to this view". Limits: 50 per list, 16,384 bytes, name 80 chars (CP/routes/preferences.ts:22-37). Also on Events and Audit.
- **Row menu** (428-511): Open; Run again…; Retry from the failed step…; Again from the start…; Cancel; Only runs of X; Copy the run ID; Copy a link to it.
- **Checked rows**: Cancel, Run again. Batch max 100 per kind (CP/routes/batch.ts:19), each replayed as the caller. Failure dialog "N done, M not done", request ID, retry failed.
- **Loading**: page size 100, "Load more"; pill "N new runs"; polls every 5 s without the stream.
- **Inspector tabs** (script): Logs / Input and output / Details; "Open full view"; copy as curl.
- **Keys** (kit/DataTable.tsx:258-331): ↑↓/j k, ←→, Home/End (Ctrl = whole table), PgUp/PgDn, Enter (⌘/Ctrl = new tab), Space/x check, Shift+arrows range, ⌘/Ctrl+A, Esc. j/k/x can be disabled.
- **Permissions**: list needs `workspace:read` plus `run:read` or `flow_run:read` (only readable kinds shown). Script cancel/rerun `run:write`; flow cancel/retry `flow_run:write`.

### Run page
- **Script** (S/RunPage.tsx:245-641): header ID, state "attempt n of m", waited/ran, trigger link, version link (source tab), "Re-run of a run", "Run again N times", Trace ID, tags. "Cancel run". **Re-run** menu: With the same input / With other input… / On the version deployed now. "Edit with this input" or "Edit in <dev>". Copy as curl.
- **Left pane**: Attempts, Received, Started, Finished, Worker, Time limit, Concurrency key, Uses (Bound/Not bound), failure handler link, suppressed-alert note.
- **Right**: Why it failed, diagnosis, waiting reason, log, "Since it last worked", Input, Output/Error (`?io=`).
- **Palette**: Cancel this run, Run again with the same input, Run again on the version deployed now, Open in editor, Compare with the last success, Copy the run ID.
- **Waiting text** (CP/routes/execution.ts:1323-1398): no worker of pool / tenant's own workers / same concurrency key.
- **Flow** (S/Flows.tsx:730-1090; header S/RunPage.tsx:643-873): tabs Timeline (legend "Waiting for a worker", "Running", "Waiting on purpose") and Graph (`?view=`, `?step=`); step panel Started, Waited for a worker, Ran, Run ID, input, log, output, "Kept from the run this one retries"; inline Approve/Reject. Re-run: Retry from the failed step…; …on vN (deployed now)…; Again from the start; Again, with other input…; On the version deployed now.
- **Logs** (packages/ui/src/LogViewer.tsx): search (Enter/Shift+Enter), Only matching, level toggles, Wrap, Follow, Copy, Download, `#L42`, virtualised past 500 rows. 50,000 newest lines held (S/Execution.tsx:402), "Download the whole log". Message cut at 8,000 chars (CP/routes/worker.ts:115).
- **Diagnosis** (X/diagnose.ts): unbound connection, secret/variable not set, timeout, unreachable, schema mismatch, HTTP 401/403, 404, 400/409/422, 429, 5xx. Otherwise none.

### States (X/state.ts; labels kit/status.tsx)
queued, running, waiting_approval, waiting_time ("Waiting until …"), succeeded, failed, canceled, skipped (steps). `status` in the API still spells `cancelled`. Payload over 256 KB goes to file storage; max 10 tags, pattern `[a-z0-9_.:-]{1,64}` (X/runs.ts:16,94-96). Output summary 200 chars. Secret-looking keys shown `[redacted]` (X/redact.ts). Kept 30 days by default (`RETENTION_RUNS_DAYS`); events 30; refusals 7.

### Compare (S/RunCompare.tsx, CP/routes/compare.ts)
Only against the last earlier success of the same path. Rows Input / Version / Took; "Show the input's difference"; "Compare the source/flow" → `runs/:id/compare/:other`.

### Events (S/Operate.tsx:636-841; CP/routes/flows.ts:1662-1803)
- Filter by exact name ("Show", "Show every event"), saved views. Columns When, Event, From, Started ("Nothing listens"/"Nothing"). Inspector: Published by, Listening, Event ID, What it started, Payload.
- **No console publish button.** `ctx.events.publish` or `POST …/events {name,payload}` (`event:write`); payload must match schema; `platform/` refused. Max chain depth 10 (kernel/flows/events.ts:13).
- **Platform events**: `platform/run-succeeded`, `run-failed`, `flow-run-finished`, `deployment-created`, `row-changed {table,change,id}` (inserted/updated/deleted). Stored only if an enabled, unpaused trigger subscribes.

### Triggers (S/Operate.tsx:31-634; X/triggers.ts)
- **Types**: schedule, webhook, event, form; `manual` in flows only. **No mail trigger; table change = event trigger on `platform/row-changed`.**
- "New trigger" → Schedule/Webhook/Form/Event (disabled in production). Columns Trigger, Starts, State, Last fired. Inspector: Fire now, Pause this trigger, Resume, Edit, deploy menu, address with Copy, last refusal, skip reasons. Batch Pause/Resume.
- Pause reason optional, 500 chars; survives deploys. `trigger:write` to pause or see an address; Fire now `run:write`.
- **Schedule** (S/ScheduleForm.tsx; M/kinds.ts:303): What it starts, What it is for (500), Often used (5 presets), When as a cron line, Time zone, next five times, overlap, Trigger source, Input, Turned on; `tags` (10 CEL) code-only. Exactly five fields; IANA zone; manifest default UTC, console writes the workspace's zone. Scheduler tick 2 s.
- **Overlap default**: schedule resource `allow`; flow schedule node `skip`.
- **Missed times**: fires once, then next time. Backlog: ≥200 queued (`SCHEDULE_BACKLOG_LIMIT`, 0 off) skips.
- **Webhook** (S/FlowSteps.tsx:229; M/kinds.ts:349): The flow is given (body / whole request); The request is answered (at once / by the flow, 25 s); Each request is checked (address / signature / trigger source). Signature: HMAC SHA-256/SHA-1, header, secret, Hex/Base64, prefix. Code-only: `signed`, `timestampHeader`, `toleranceSeconds` (default 300, max 86400).
- `POST /api/v1/hooks/vxh_…` (CP/routes/execution.ts:3245): 202 `{runId}`, 401, 400, 404, 503 paused, 120/min, `idempotency-key` ≤200, `x-flow-run`. `authorization`, `cookie`, `proxy-authorization` not passed. Flow answer ≤256 KB.
- **Form** (M/form.ts; S/FlowSteps.tsx:421): title 120, 1-30 fields, types text(500)/textarea(5000)/email(320)/number/date/select(100 options)/checkbox; reserved `website,key,return`; access anyone/signed in; 20 posts/min per IP and tenant; `/portal/<tenant>/forms/vxf_…`.
- **Event trigger**: Event, "Only when (optional)" CEL over `event`.
- **Workspace pause**: Workspace settings (S/Environments.tsx:88-113). New dev workspaces start paused.
- **Instance** (S/InstanceTriggers.tsx): "Pause every trigger" with Why; `instance:write`; read cached 2 s; `TRIGGERS_PAUSED` overrides.

### Approvals (S/Operate.tsx:898-1327; CP/routes/flows.ts:1340-1636)
- Chips Waiting for you / Waiting for others / Decided (`?show=`). Columns Decision, Waiting, Who decides; Decided: Decision, Flow, By, When ("decided from the mail"). Last 100 decided; timed-out ones excluded. Batch decide with one comment; comment 2000.
- **Rule**: `approval:write` plus, if named, member of a group or bound to a role (max 20 each). Groups are resolved by ID when the wait begins; *membership* is checked at decision time. Tenant page shows only `surface: tenant`.
- Step `timeoutSeconds` ≤ 2,592,000 (30 days). **No delegation, escalation or reminders.** MCP: `list_approvals`, `decide_approval`. App Builder Approvals widget also decides (`POST …/page-approvals`).
- **Mail** (kernel/flows/approval-links.ts): needs SMTP; max 50 people (kernel/flows/approvers.ts); 48 h or step timeout; single use; 30 req/min; other links die once decided. Page states: form, "Approved/Rejected. Thank you", "Nothing to decide here".

### Alerts (S/Alerts.tsx; X/alerts.ts)
- Workspace default: "Start a script" (input `{run:{id,script,attempt,error}}`), "Post to a connection" (bound `http` only), Save (`workspace:write`), Send a test alert (`connection:write`). Sections "Set by scripts themselves", "Recent alerts" (50/page, "Older alerts").
- Only condition: final failure of a script run or top-level flow run. 10-minute window per path; later ones counted "+N more".
- Body `{text, run:{id,script,attempt,error,workspace}}`, sent by a worker.

## (C) Gotchas
1. Search is limited by When: an ID older than 24 h needs "Everything kept". `?run=` links are not limited.
2. Steps and sub-flows are not in the Runs list; a step cannot be re-run alone (409).
3. Re-run defaults to the original version. Retry on a newer version requires unchanged kept steps. Granted approvals are kept; rejected or pending are asked again.
4. Attempts come from log lines: an attempt that logged nothing is absent, and one `error` line marks it failed even if the run succeeded (operations.ts:510-520, 575).
5. Diagnosis and Uses read the currently deployed script, not the run's version.
6. Rejecting fails the step: an error path continues, otherwise the flow fails and an **alert is sent**. Same for timeouts.
7. Console and mail require a reason to reject; the raw API does not.
8. Nothing stops a requester approving their own request. Service accounts can decide only steps naming nobody.
9. Alerts skip canceled runs, flow steps and handler runs. Script `onFailure` merges per field with the default (alerts.ts, `{...workspace, ...own}`), so `notify` alone still starts the default script.
10. Paused webhook 503 and form 503; paused event is stored but not replayed; paused schedule fires once on resume.
11. "Listening" counts disabled and paused triggers.
12. Event filter errors or bad payloads skip that subscriber silently (server log only).
13. Built-in `developer` lacks `trigger:write`, `approval:write`, `workspace:write`.
14. Webhook source answers start at most 100 runs.
15. Input marked different may show no diff when the change is in masked values.

## (D) Wrong, stale, missing
- `configure/alerts.md`: "or a queue backs up" is **false**.
- Four other stubs are empty; `operate/index.md` trigger line is fine.
- `docs/self-hosting.md:290` says "Cancel queued runs"; the button is "Cancel N queued".
- `batch.ts:113` comment says `run:execute`; real permission `run:write`.
- Permission text for `trigger:write` (M/permissions.ts) omits pausing.
- Approvals description "rejecting fails that step", toast "takes its rejected path" and the link page "The flow stops here" contradict each other.
- Undocumented: `platform/*` events, `?step`/`?view`/`?io`.

## (E) Likely bugs / questions
1. **Approval mail and link page show `detail` unredacted** (approval-links.ts:125, routes/approval-links.ts:60), while the queue redacts (flows.ts:1367). [read]
2. Flow schedule nodes show no cron and zone "UTC": `cron: body.cron` reads the flow body (execution.ts:1834). [read]
3. Schedule runs do not link to their trigger: detail key is `schedule`, UI reads `trigger` (RunPage.tsx:219, Runs.tsx:1079). [read]
4. Fire now ignores `source` and starts the target directly (triggers.ts:842). The button stays on a turned-off schedule.
5. Over 100 rows of one kind checked (after Load more) is refused whole.
6. "Cancel N queued" ignores the Status chip, though the dialog says "this list shows".
7. Copy as curl contains `[redacted]`.
8. `platform/row-changed` always depth 0: a script that writes the table it listens to can loop unbounded.
9. Script/flow pages pass `workspacePaused={false}` (S/ObjectPages.tsx:461), so a workspace pause is not shown. Instance pause seems unshown on workspace screens; I found no reference.
10. Alerts always `editable` (S/Tenant.tsx:690): Save 403s for developers.
11. Flow editor shows only title, detail and surface (S/FlowEditor.tsx:1667): **no approvers or timeout fields**; code only. Event picker in ResourceEditor lists only declared events, so `platform/*` is not offered there (flow editor not checked).
12. Deploying rewrites trigger config, clearing "last skipped". Skips from a busy polling source are not recorded.
13. DST behaviour is cron-parser's; no test found.

## (F) Screenshots / examples
Screenshots: Runs with checked rows and inspector; failed script run with diagnosis and compare; flow Timeline and Graph; input diff; trigger inspector with address and refusal; New schedule with next times; Approvals three chips; approve link page; Alerts; instance pause.

Examples: GitHub (`sha256=` prefix) and Slack (`v0:{timestamp}:{body}`) webhook verify; curl with `idempotency-key`; CEL filter; event publish and listener; approval with `approvers`, `timeoutSeconds` and error path; alert handler script; alert JSON body; `volvel runs cancel --tenant … --workspace … [--queued|--all] [--older-than <s>]` (10,000 per request, API-level `more`).
