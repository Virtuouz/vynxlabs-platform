# Changelog

Versions before 1.0 may change the API, the manifest format and the worker protocol. Each entry says what an operator and a tenant developer need to do.

## Unreleased: phase 15, expert efficiency

### For operators

- **Database change.** Migration 0066 adds `member_preference` (a member's own settings) and `member_saved_view` (saved views of a list). Both are preferences: they are never audited, and are not exported with a tenant. Saved views go when their tenant does.
- **Preferences API.**
  - New `GET /me/preferences`, `PUT /me/preferences/:key {value}` and `DELETE /me/preferences/:key`.
  - Only the keys the console keeps are accepted: `theme`, `panel`, `shortcuts.single-key`, `editor.*`, `density:*`, `split:*`, `palette.pins:<tenant>`.
  - Each value may be at most 4 KB, and a member keeps at most 200.
- **Saved views API.** New `GET /me/views?tenant=&workspace=&list=`, `POST /me/views`, `PATCH /me/views/:id` and `DELETE /me/views/:id`. Views are private to their maker, and names are unique per list, ignoring case. A member keeps at most 50 views per list.
- **The console's theme, table density, pane sizes and editor tabs follow a member between browsers.** The first sign-in after upgrading moves what this browser had kept onto the server.
- **Keyboard.**
  - Every shortcut is listed under "Keyboard shortcuts" in the account menu and the palette, as well as on `?`.
  - Single-key shortcuts (`?`, `/`, `j`, `k`, `x`, `g` then a letter) can be turned off there.
  - New shortcuts: `g` then `o`, `r`, `f`, `s`, `t` or `a` goes to the overview, runs, flows, scripts, triggers or approvals; `/` searches the list on screen; ⌘S saves at once in the flow editor, the app builder and dashboards.
  - ⌘K now opens the palette from inside the code editor.
- **Command palette.**
  - With a run, script, flow, trigger or approval open, ⌘K first offers what can be done with it: run again, retry, cancel, start, pause, approve.
  - Anything found can be pinned (⌘P, or "Pin to the palette"), and pins come before recent items.
  - Results are grouped under headings.
  - Every result opens its own page: a script opens its page rather than its editor, a person opens their member page, and an app opens in its list.
  - A failed search says so, with the request ID and Try again, rather than "Nothing matches".
  - ⌘↵ "Run again" now asks first.
- **Batch API.**
  - New `POST runs/batch {action: cancel|rerun, ids}`, `POST flow-runs/batch {action: cancel|retry|restart, ids}`, `POST trigger-pauses/batch {paused, reason?, triggers}`, `POST drafts/batch-discard {paths}` and `POST /tenants/:t/approvals/batch {decision, comment?, approvals}`.
  - Each takes up to 100 items. Each item is done by its single action's own route, as the caller, so it is checked and audited exactly as it would be alone.
  - The answer is `{results: [{id, ok, status, detail?, requestId?, runId?}], done, failed}`.
- **Batch actions in the console.**
  - Rows can be checked on the runs list (Cancel, Run again), approvals (Approve or Reject, with one comment) and triggers (Pause, Resume). Shift and a click checks a range.
  - When some items are not done, a dialog lists each one with why and its request ID, and offers to retry just those.
  - Release deploys, or sets aside, only the drafts chosen.
  - The triggers list's kind filter is now kept in the address.

### For tenant developers

- **New in `@vynxlabs/ui`:**
  - `Tooltip`, `TooltipProvider` and `Kbd`;
  - `Button` takes `tooltip` and `keys`. A disabled button with a tooltip is wrapped so that it can still be focused and say why it is disabled.


## Unreleased: phase 14, one design system

### For operators

- **Database change.** Migration 0064 records when, and by whom, each stored credential was last set: connection and data source credentials, connection group members, the Git token and identity providers' secrets. A trigger stamps it whenever the sealed value changes. Credentials stored before the migration take their row's last change as their date, with no name. Every change's transaction now sets `vx.actor_type` and `vx.actor_id` locally for this.
- **Rows API.**
  - Row cursors now point after the last row seen (keyset), wherever a table has a key and is sorted by one column or none. Pages no longer repeat or skip rows when rows are added meanwhile, and deep pages cost the same as the first. Cursors stay opaque, and old offset cursors still work.
  - New `POST rows-deletions/*`, written `POST /workspaces/:w/row-deletions/<table> {ids}`. It deletes up to 1,000 rows the policy allows, in one statement, and returns `deleted` and `missing`.
  - New `GET rows-export/<table>?filter=&sort=` streams the rows the caller may read as CSV, up to 100,000. Values a spreadsheet would run as a formula start with an apostrophe.
- **Database change.** Migration 0065 adds two indexes to the audit log, by actor and by target, for searching a tenant's log. Made on the partitioned table, they reach every month's partition.
- **Audit API.**
  - `GET audit` takes `targetType`, `workspaceId` and `q` (text in the action, target or kind of target), and its entries carry `targetLabel`, what the target is called now.
  - New `GET audit/:id` for a link to one entry.
  - New `GET audit-facets` gives the actions, actors and kinds of target among the entries the same filters keep, with counts.
  - New `GET audit-export` streams the same entries as CSV, up to 100,000.
- **People API.**
  - New `GET principals?q=` finds members, groups, service accounts, end users and groups of end users by name or email.
  - `POST members` takes optional `bindings` (role, and workspace), given in the same change as the membership. Each needs `binding:write` where it applies.
- **Creating a tenant can make its creator a member.** `POST /tenants {addCreator: true}` makes the operator a member of the new tenant holding `tenant_admin`, in the same change and in its audit log. The console's dialog offers it, checked by default. Without it, as before, an operator works inside only through an access grant.
- **Workspace summary.** `GET /workspaces/:w/summary` adds `scripts` and `flows` (deployed or in draft), `everRan` and `workersOnline`, for a new workspace's first steps.
- **Scripts list.** `GET scripts` lists scripts that are only drafts too, with `draft` and `deployed` on each.
- **New API.** `POST /workspaces/:w/secrets {name, value}` makes a secret and refuses a name already in use (409). `PUT secrets/:name` still sets or replaces one. Connection, data source, group member, Git repository and identity provider responses carry `credentialSetAt` and `credentialSetBy`.

### For tenant developers

- **The kit's tokens are version 2, and apps built on `@vynxlabs/ui` look slightly different.** What moved:
  - **Type.** New roles `text-display-lg` (26 px), `text-emphasis` (15), `text-body-sm` (13), `text-code` (13, mono) and `text-code-sm` (12, mono). `text-display` is now 20 px (was 26), `text-title` 16 (was 18), `text-meta` 12 (was 12.5) and `text-label` 11 (was 12). Line heights are whole pixels. `text-telemetry` and `text-micro` are gone: use `font-mono text-code` and `text-meta`.
  - **Corners.** Panels are 8 px (was 10). New `rounded-inner` (2 px inside the control radius, for tags, chips and cells) and `rounded-overlay` (dialogs and sheets). A theme's `radius-panel` still overrides it.
  - **Elevation and layers.** `shadow-overlay` (menus, popovers, toasts), `shadow-modal` (dialogs, sheets) and `shadow-drag`, deeper in dark. `layer-sticky`, `layer-sheet`, `layer-dialog`, `layer-popover`, `layer-toast` and `layer-skip` in place of z-index numbers.
  - **Controls.** `h-control` is the page's control height: 36 px by default, set by `--vx-control-height`. `Button` takes `size="large"` (always 36 px) beside `regular` and `small`, and shows a pressed state. Inputs pad 12 px.
  - **Motion.** Dialogs fade and settle, sheets slide in from their edge, menus and comboboxes fade in (`motion-fast`, `motion-base`, `motion-slow`). Nothing moves under `prefers-reduced-motion`.
  - **Prose** is set to one measure, `max-w-measure` (72ch).
- **What to do.** Nothing, unless an app used `text-telemetry` or `text-micro`, or depends on the old sizes. Look over your app's screens after upgrading.
- **Fields** (`TextField`, `SelectField`, `TextAreaField`, `NumberField`, `DateField`, `ComboboxField`): the error is tied to its control by `aria-describedby`, beside the hint, which now stays. An invalid control has a danger edge. `required` shows a mark, and `required={false}` shows "optional". The marks are hidden from assistive technology, which hears the control's own `required`, so labels and accessible names are unchanged. `FieldFrame` is exported, to give a field of your own the same label, hint and error.
- **Toasts** take a `title`, a `link` to the result and an `info` tone. Three show at a time, and Esc dismisses one. `ToastProvider` takes `navigate` to follow links through your router.
- **`Button loading`** shows a spinner beside the label, sets `aria-busy` and refuses a second press.
- **Served apps lay out by the room they are given** (container queries), not by the window's width. The page switches to its 12-column grid once it has 672 px, about a tablet's width. A page embedded in something narrower stacks as a phone's does, and the App Builder's phone and tablet previews now show what a phone and a tablet would.
- **`Grid navigation="grid"`** follows the WAI-ARIA grid pattern:
  - one tab stop, with arrow keys, Home/End and Page keys between cells;
  - Enter or F2 to edit, Escape to put a value back, Space to check a row;
  - a sticky header and a pinned first column;
  - `density` (`compact` rows are 28 px), and checkboxes through `checked` and `onCheck`.
  
  Without it, the grid works as before.

## Unreleased: phase 13, the debugging and authoring loop

### For operators

- **Database changes.** Migration 0062 adds a short output summary to runs and flow runs, and 0063 adds a workspace's time zone. Runs that ended before 0062 have no summary.
- **Payloads are masked where they are shown.** `GET runs/:id` and `GET flow-runs/:id` (input, output, each step's input, output and detail) and the approvals list replace secret-looking values with `"[redacted]"`. A value is masked when its schema marks it `writeOnly`, `format: "password"` or `x-secret`, or when its key names a secret (`password`, `token`, `apiKey`, `authorization`, `clientSecret`, and keys ending that way). What is stored, what workers receive and what a run again uses are unchanged. Clients that read payloads from the API, such as scripts that check another run's output, see the masked form.
- **Workspaces have a time zone,** `UTC` until set in workspace settings or with `PATCH /workspaces/:id {"timeZone": "Europe/Berlin"}`. New schedules start in it; existing ones keep their own.
- **"Cancel queued runs" from a filtered runs list cancels only what the list shows.** It used to cancel every queued script run in the workspace, flow steps included. `POST runs/cancel` takes the list's `filters`; without them it behaves as before.

### For tenant developers

- **New API:**
  - `GET activity` takes `sort=started|duration` and `dir`, and its rows have `outputSummary` and `scheduledFor`.
  - `GET connection-bindings/*` and `GET variable-values/*` read one.
  - `GET triggers?target=`.
  - `GET references?drafts=true`.
  - `GET flow-runs/:id/definition` (the flow as the run ran it).
  - `GET script-source/*?run=|bundle=`.
  - `retry-plan?bundle=` reports `bundleVersion` and `changed`.
  - `POST test-runs` takes `triggerNode` and `testFrom {flowRunId, node}`, and runs the deployed version when there are no drafts.
  - `schedule-firings` takes `node`.
- **A flow run can be retried from its failed step on a newer version** (`bundle: "active"` or `bundleId`), as long as the steps it keeps are the same there. It is refused, naming them, otherwise. `runs/:id/rerun` takes `bundleId` too. A step retry still keeps the original input.
- **Bundles carry the console's sources and a source map** (`consoleSources`), so a failure in code written in the console points at its line.
- **`LogViewer` from `@vynxlabs/ui`:**
  - Search finds and steps through matches, and "Only matching" narrows to them.
  - Lines are numbered and link as `#L42`.
  - Lines, a selection or everything can be copied, and fields open in place.
  - A mark starts each attempt, and follow pauses when scrolled up.
  - Levels are chips with counts, where they were a `<select>`.
  - Logs past 500 lines draw only the lines in view. The default height is now `min(70vh, 48rem)`.
  - New optional props: `fill` and `firstLine`. `LogLine` gains `attempt`.
  - Tests that read `role="list"` or the level select should use the `Log lines` region and the level buttons.

## Unreleased: phase 12, trust and access

### For operators

- **`GET /api/v1/instance` returns `publicUrl`,** the address set in `PUBLIC_URL`. The console fills it into the command that starts a standalone worker.
- **Console branding warns about colors that are hard to read.** The preview lists each pair under 4.5:1 for text, or 3:1 for the edges of controls. Saving is still allowed.

### For tenant developers

- **The kit's default colors are darker where they were hard to read,** to meet WCAG 2.2 AA:
  - in the light theme, `ink-muted` is `#4b5666`, `ink-subtle` is `#586474`, `attention` is `#9a4707` and `success` is `#1b6e45`;
  - in the dark theme, `ink-subtle` is `#8a97a7`.

  A new token, `line-control` (`#748090` light, `#6b7b90` dark), draws the edges of inputs, selects and secondary buttons at 3:1 or more. Apps and portals on the defaults look slightly darker. A theme that sets these tokens keeps its values, and can set `line-control` too.

- **Toasts from `@vynxlabs/ui` read better and wait for people.** A `danger` toast stays until it is dismissed instead of leaving after five seconds, and is announced as an alert. Other toasts wait while they are pointed at or focused, and are announced once, as they are added to the toast stack, which is a live region of its own. Failures sit together below the others. The same message shown twice no longer stacks. `show`, `success` and `danger` take an optional `{ action: { label, onClick } }`, such as Undo, and a toast with one stays twice as long. Tests that found toasts by `role="status"` should look for their text.

## Unreleased: phase 11, holding up under load

### For operators

- **Database change.** Migration 0059 adds the machine a worker runs on.
- **A machine that runs scripts is held to its run slots.** The scripts running there, across all its workers and tenants, never go past `RUN_SLOTS`, which by default comes from its memory. While others wait, a tenant takes no more than its share. Below `RUN_MEMORY_FLOOR_MB` of free memory no worker takes more work, and when memory still runs low the largest script is stopped. The worker host takes `--run-slots` and `--memory-floor`, and by default starts at most twice its run slots in workers, down from 50. `MANAGED_WORKERS_MAX` caps managed workers in `process` mode. See "Sizing" in the self-hosting guide.
- **Scripts run at a lower CPU priority** than the control plane and the workers.
- **`deploy/fly/fly.toml` asks for 1 GB and 512 MB of swap,** up from 512 MB and none.
- **New metrics:** `platform_machine_running`, `platform_memory_available_bytes`, and `platform_db_pool{pool,state}`.
- **Each tenant has a share of the table connections.** On the platform database a tenant's table requests past `DATA_TENANT_CONNECTIONS` (a third of the pool by default) wait their turn, and the others' go on.
- **Every data request has a time limit,** `DATA_STATEMENT_TIMEOUT_MS`, 15 seconds by default.
- **Pool sizes can be set:** `DATABASE_POOL_SIZE` and `DATA_POOL_SIZE`, each 10 by default as before.
- **A database that takes no writes no longer takes the instance down.** One whose disk is full keeps serving reads, and `/readyz` stays 200 with `readOnly: true`. Changes and sign-ins are answered 503 `read_only`, and the queue and background work stop. They start again on their own once writes come back. The instance also starts this way: migrations are checked by reading alone when none are pending. Pooled connections are renewed each minute.
- **A busy database is a 503 with `Retry-After`,** no longer a 500.
- **Database change.** Migration 0060 adds the instance's own switches.
- **An emergency stop for triggers.** **Instance → Triggers**, or `PUT /api/v1/instance/triggers`, pauses every schedule, source, webhook, form and event in every tenant at once. `TRIGGERS_PAUSED=true` does the same from the environment.
- **A workspace with a long queue gets no more from its schedules:** past `SCHEDULE_BACKLOG_LIMIT` queued runs (200), a schedule passes over its time and says why.
- **Database change.** Migration 0061 lets a clone wait its turn.
- **One clone copies rows at a time across the instance,** in pages of 5,000 with a pause between, so a large copy no longer slows every tenant's tables. Others wait as `queued`. A clone is still one transaction, never half-copied. A clone still waiting when its instance restarts fails, as a running one does, and can be started again.
- **Waiting workers are woken when work arrives** rather than every half second. A foreach went from about 150 to 530 items a minute on a development machine. A database that takes no writes, such as one whose disk is full, is a 503 `read_only`.

### For tenant developers

- **`memoryMb` now covers all of a script's memory,** Buffers and native memory included, plus 64 MB for Node itself. It used to cover only the JavaScript heap. A script that held large files, images or downloads in Buffers past its `memoryMb` now fails with "The script ran out of memory": raise its `memoryMb`.
- A run stopped because its machine ran low on memory fails with "The script was stopped: the machine ran low on memory." Its retries apply.
- **A table request that runs past 15 seconds is stopped** and answered 422 `too_slow`. Narrow its filter, or add an index on the columns it filters and sorts by. It used to run as long as it took, and hold a connection all the while.
- **A flow's schedule passes over a time while its last run from that trigger is still going.** It used to start another beside it, so a flow that took longer than its interval piled up. Say `overlap: "allow"` on the trigger (`trigger.schedule(cron, { overlap: "allow" })`) to keep the old behaviour. `defineSchedule` takes `overlap` and `tags` too, as the manifest already did.
- **A new dev workspace starts with its triggers paused,** so a schedule you try there does not run beside production's. Resume them in its settings, or create it with `triggersPaused: false`. Existing workspaces are unchanged.
- **Runs can be cancelled in bulk:** **Cancel queued runs** on a workspace's Runs, `POST …/runs/cancel` and `POST …/flow-runs/cancel`, and `platform runs cancel`.
- **Scripts and `@vynxlabs/app` try a busy request again by themselves,** twice, after the wait the platform asks for. Your own code that calls the API should do the same on a 503 with `Retry-After`.

## Unreleased: phase 10, platform expansion

### For operators

- **Database changes.** Migration 0052 adds who started a run to the run events the database announces; the control plane uses it to choose who receives an event, and never passes it on. Migration 0053 adds the built-in role `agent_runner`.
- **The master key can be rotated.** `MASTER_KEY_SECONDARY` is a second key the instance opens with and never seals with; while it is set, what it sealed is sealed again with `MASTER_KEY`, at start, every ten minutes, and with `node dist/main.js rekey` in the image. `GET /api/v1/instance/master-key` says when the second key can be removed. See "Rotating the master key" in the self-hosting guide, which also gives the order for several replicas.
- **The data role's password is made from a secret kept in the database,** no longer from the master key itself. Migration 0055 adds the table; the first start after upgrading writes the secret from the master key you have, so the password does not change. A rotation never changes it.
- **Database change.** Migration 0054 adds the concurrency key a run was given.
- **Database change.** Migration 0058 adds approval links.
- **Approvers are mailed,** when the instance sends mail. `MAIL_CAPTURE_DIR` keeps mail as files instead, for development and tests. See "Approval mail" in the self-hosting guide.
- **Database change.** Migration 0057 adds promotion requests.
- **Database change.** Migration 0056 adds OAuth tokens to connection bindings, sealed with the tenant's key, and the authorizations in progress.
- **OAuth connections call the provider's token address from the control plane,** through the egress guard, and providers send members back to `<PUBLIC_URL>/api/v1/oauth/connections/callback`. See "OAuth connections" in the self-hosting guide. Decision 0001 names the token endpoints among the control plane's exceptions.
- **End users can follow their own runs live.** The run event stream (`GET /api/v1/tenants/<id>/stream`) now accepts someone who may read no runs in the tenant, such as an end user of an app, and sends them the events of the runs and flow runs they started, at most two streams each. A proxy must not buffer that path on the apps' address either.

### For tenant developers

- **A script can limit its runs per value of its input,** such as one at a time per customer: `concurrency: { key: "input.customerId", limit: 1 }` in the SDK or the manifest, beside the plain number, which is unchanged. Runs for other values go ahead. A run whose input has no value there shares one lane with the others that have none. A key naming a field the input schema does not list is refused at deploy. The run page shows a run's key, and a queued run held back by it says so. An addition to schema version 1 that needs this core.
- **Run output is shown by its shape.** A list of records is a table, `{ markdown }` is formatted text, and an address is a link, or an image once asked for, on the run page, beside a run in the list, and on a flow's steps. The JSON is one click away. Markdown is never read as HTML.
- **`@vynxlabs/app` follows runs live.** `useRun(id)` and `useFlowRun(id)` keep a run or flow run up to date from the platform's stream, and look every two seconds where there is none. `runScript` and `runFlow` learn that a run ended as it happens. `scriptRun(id)` reads a run once.
- **A script or flow can be offered to an AI agent.** **Offer to an agent…** on a script, and on a flow with a manual trigger, binds a service account to the new Agent runner role at that script or flow alone. An agent connecting with the account's key is offered it as a tool, and sees nothing else of the workspace: a binding to single scripts or flows now reaches a workspace's MCP server, for those tools only.
- **Connections are set up in one place.** **New connection** on a workspace's Connections opens one sheet: what it is, its settings drawn from its connector's schema (nested settings included), its secret, then a Test from one of the workspace's workers. A connection nothing declares yet is declared in a draft. **Set up** and **Change** on a row open the same sheet.
- **A Test is kept as the connection's health.** The list shows "Reached" with how long it took, or "Failed" with the status, until the next Test or until the settings change. Tests run only when someone asks.
- **OAuth 2.0 connections.** `connector: "oauth2"` is built in: settings name the API, the provider's authorization and token addresses, the client ID and the scopes; the secret is the client's. A member presses **Connect** and agrees at the provider. Google and Microsoft are filled in for you. Scripts use it as an http client, `ctx.connection("google")`, with the access token sent as a bearer token and refreshed unattended. A provider that refuses a refresh marks the connection **Needs reconnecting**, and runs fail with that message until a member reconnects it. A connection group cannot be an OAuth one yet.
- **A draft flow is tested from its editor.** **Test** opens a panel under the graph: input for its manual trigger, then the run's steps as they go. Each step's state and how long it took show on the editor's own graph, and the paths the run took are drawn strong. Choosing a step shows its **Last test** beside its settings, with its output drawn by its shape. Nothing is deployed, and you stay in the editor.
- **An expression shows what it gives.** Under each expression field of a flow, a moment after you stop typing, is its value against the last test run, worked out as the engine would, with the engine's own error when it fails. A foreach's input is shown for its first item, and a branch case that gives something other than true or false says so. The API is `GET …/expressions/value`, with `flow_run:read`.
- **Undo and redo in the flow editor,** with ⌘Z and ⇧⌘Z (Ctrl+Z and Ctrl+Y), or the header's buttons: adding, removing, connecting, moving and changing steps, a hundred changes back. Typing in a field stays the field's own undo. Autosave keeps what was undone.
- **`platform pull`** writes the workspace's console resources, drafts included, as the `platform/` files a build reads, and keeps a file you changed since the last pull unless you say `--force`. A deploy of the repository clears the drafts the pull took (`settleDrafts` on a deployment), and any deploy clears drafts it made true, so the console's Changes screen is empty after pull, edit, deploy. `GET …/resource-files` is the route under it.
- **`platform run <script|flow> --remote`** tries a local build on the platform, in a dev workspace, and follows it. The build is uploaded as a preview (`POST …/bundles?preview=true`), which is never deployed and is removed after a week, and a test run starts from it (`bundleId` on `POST …/test-runs`).
- **`platform logs <run> [-f]`** prints a run's logs, or a flow run's steps with each step's logs, and with `-f` follows it to its end over the instance's event stream, or by looking every two seconds without it. It exits 0 when the run succeeded, 1 when it failed and 3 when it was canceled.
- **Fixed: a test run in a dev workspace with nothing deployed yet waited for ever.** Workers took runs only from workspaces with a deployed bundle.
- **A promotion can be asked for.** One who may not promote sees **Request promotion** in place of the Promote button, with a note. Those who may promote to that workspace see it under "Needs attention" on the tenant's overview, review what it would change, and promote or decline it there; declining says why, to the one who asked. A request is for the version the dev workspace ran when asked, and promoting it promotes that one. The API is `…/promotion-requests`, and the promotion preview says `canPromote`.
- **Drift: how dev differs from production, now.** The Release screen's promote step lists each resource as changed in dev, only in dev, only in production or in sync, with what differs in words and line by line (`GET …/drift`). One made in production's console that a promotion leaves alone says so.
- **Why someone can do what they can.** A member has a page of their own, and a service account's page an Access section: every permission they hold in the tenant, where, and the binding or operator access that gives it, through which group, each linking to its binding on the access list, which shows it marked. A box answers whether they hold one permission, and where (`GET /tenants/:t/access/:type/:id`). A suspended member's bindings are shown as not counting.
- **Fixed: a question asked from a side sheet opened behind it.** Dialogs now open above side sheets, and menus, pickers and messages above both.
- **Approve from the mail.** When a flow waits for an approval, each member who may decide it is mailed a link of their own. It opens a page with what is asked and Approve and Reject, with no sign-in; the decision is theirs, with their comment, in the audit log and the console's Approvals, which now shows each decision's comment. A link works once, for 48 hours or until the step's timeout, and stops working when anyone decides. `GET` and `POST /api/v1/approval-links/:token`.
- **A tool can be tried from the console.** On a service account's Agent access, **Try** calls a tool as the account would, with a form drawn from its input, and shows what the agent would be told (`POST /tenants/:t/service-accounts/:id/tool-calls`, with `service_account:write`). The call is real, made as the account, and the audit log names the member who asked.

## Unreleased: phase 9, maturity

### For operators

- **History is no longer kept forever.** A retention pass runs every ten minutes, on one replica at a time. On the first pass after upgrading it removes runs (with their logs, steps and stored inputs and outputs) and events older than 30 days, refused webhook and SCIM requests older than 7 days, and audit entries older than 400 days. **To keep more, set `RETENTION_RUNS_DAYS`, `RETENTION_EVENTS_DAYS`, `RETENTION_REFUSALS_DAYS` or `RETENTION_AUDIT_DAYS` before upgrading.** A tenant can set its own periods, from 1 day (90 for audit) to 3650, under Retention. See "Retention" in the self-hosting guide.
- **The audit log is kept a month to a partition.** Migration 0047 moves the existing entries, in one transaction, at start. A month past every tenant's period is exported to the object store under `audit/<yyyy-mm>/` and then dropped. Entries stay append-only one by one.
- **Database changes.** Migrations 0046 (rate-limit counters) and 0047 (retention and the audit partitions) run on start.
- **Each script attempt runs in a process of its own,** ended at its time limit or when canceled, whatever it is doing, and limited to the script's `memoryMb` (512 MB by default). It never holds the worker's credential.
- **Managed workers run as a user of their own,** `vxrun` (uid 10001), where the container may switch users; Docker's defaults allow it. Where it may not, a tenant whose code is written outside the operators gets no managed worker. Set `MANAGED_WORKER_USER=same` on a development machine. See "Workers the instance starts" in the self-hosting guide.
- **Standalone workers can read their credential from standard input,** with `--token-stdin`, which keeps it out of reach of the scripts they run.
- **Rate limits are shared across replicas,** counted in the database, and each tenant has at most one managed worker however many replicas run.
- **Runs update live.** The console keeps one stream of run events open per tab (`GET /api/v1/tenants/<id>/stream`, server-sent events), and each replica one more database connection to listen for them. A proxy must not buffer that path; see the self-hosting guide. Migration 0048 adds the triggers that announce changes.
- **Runs, flow runs and steps have a `state`** beside their `status`: `queued`, `running`, `waiting_approval`, `waiting_time`, `succeeded`, `failed`, `canceled` or `skipped`. A flow waiting for a person is no longer shown as running. `status` is unchanged.
- **A run has a page of its own,** at `/t/<tenant>/workspaces/<workspace>/runs/<id>`, for script runs and flow runs alike. The old `/flow-runs/<id>` addresses send the browser there. The runs list opens a run beside it with `?run=<id>`.
- **Runs are run again from their page.** A script run, with the same input or another, on the version it ran or the active one (`POST …/runs/<id>/rerun`). A flow run, from the start, or from its failed step (`POST …/flow-runs/<id>/retry`), which keeps what already succeeded, granted approvals included, and runs the rest; `GET …/flow-runs/<id>/retry-plan` says which steps are which.
- **Runs can be searched and tagged.** `/activity` takes `q` (a path's start, a run ID, a tag, or words of the error) and `tag`, and pages with `cursor`. A script tags its run with `ctx.run.tag(...)`; a webhook, event or schedule trigger with `tags`, CEL expressions over what it was given. Migration 0049 adds the columns, and `pg_trgm` where the database allows it.
- **Moving between workspaces is no longer audited.** It is remembered, and the console opens where the member last was.
- **The control plane no longer runs a tenant's code, and reaches a tenant's chosen addresses only behind a guard** (decision 0001). Two changes need you before upgrading:
  - **Apps written as code need `APPS_URL`.** Without it they are no longer served at `PUBLIC_URL`; their page says why, and the Apps page says so too. Set `APPS_URL` to a second hostname, or set `APPS_ON_CONSOLE_ADDRESS=true` to keep serving them at the console's address knowingly. Apps made in the App Builder are served as before.
  - **Managed workers move to a worker host.** `deploy/compose` now runs a `worker-host` service on a network of its own, and needs `WORKER_HOST_TOKEN` in `.env` (`openssl rand -hex 32`). `MANAGED_WORKERS` takes `host`, `process` or `false`; `true` means `process`. In `process` mode, workers beside the control plane serve only tenants whose code only the operators write.
- **The instance refuses internal addresses a tenant chose:** an identity provider, a Git remote, a data source or a registered hostname at a loopback, private or link-local address answers 400 `egress_refused`. List the ones it may reach in `EGRESS_ALLOW` (networks and host names) before upgrading, if you use any.
- **Tasks on the worker protocol.** A worker that says it takes them is given `describe`, `deliver` and `test-connection` tasks before runs; one that says nothing gets runs only. Failure alerts through a connection are now posted by a worker, so `alert.notified` is set a moment after the run fails. Migration 0050 adds the tasks table; finished tasks are kept 7 days. See "Tasks" in `docs/contracts/worker-protocol.md`.
- **A connection can be tested** from its row on the Connections page (`POST …/connection-tests`), by one of the workspace's workers.
- **A console script's schema is read from its code.** Saving a script that exports `input` or `output`, made with `z`, has a worker read them as JSON Schema onto the draft. The schema is then shown, not edited by hand.

- **More metrics.** `/api/v1/metrics` adds the queue by workspace and pool, flow runs and tasks by state, and, counted by each replica, histograms of run duration and queue wait, runs and flow runs finished, refused webhooks and alerts. Workspaces are labeled by slug; `METRICS_WORKSPACE_LABELS=false` leaves them out. Existing series are unchanged. See "Metrics" in the self-hosting guide.
- **Database change.** Migration 0051 adds an index for finding resources by name and the table of what each member opened last.

### For tenant developers

- **Input is asked for as fields everywhere a schema is known:** running a script, starting a flow, the flow editor's Run by hand (it no longer sends `{}`), running again with other input, a schedule's input, and an action's. Nested objects, lists, choices, dates and unions are drawn as fields; a part the form cannot draw is asked for as JSON on its own, and the whole form can be switched to JSON and back.
- **A new console script exports its input with zod.** The starter now declares `export const input = z.object(...)`, and Try it draws its form from it.
- **A schedule can start a flow**, from its manual trigger: `flow:` in place of `script:` in the `schedule` kind. A flow with no manual trigger is refused at deploy. **`overlap: skip`** passes over a time while the run it started last is still going; the Triggers page says when it last skipped. Both are additions to schema version 1, and need this core.
- **Triggers are made from the Triggers page.** **New trigger** opens a schedule form with the next five times as the scheduler works them out, a time zone list, and its input drawn from what it starts; webhooks, forms and events open their editors. **Fire now** starts one run of a schedule, marked `manual: true`, without moving its next time (`POST …/schedule-firings`). `GET …/schedule-preview?cron=&timezone=` gives the next times.
- **Interfaces have actions.** An `action` widget is a button, and a table can have up to five row actions. Each starts a script, or a flow from its manual trigger, as whoever presses it, with input mapped from the page (`row.<column>`, `selection.<widget>.<column>`, `filters.<filter>.value`) or constants; what is required and not mapped is asked for, and a confirmation can show the row's values. An action is hidden from anyone who may not start its target, and the builder names the audiences who would not see it. Interfaces without actions are unchanged.
- **Failure alerts are set and read in the console**, under Configure → Alerts: the workspace's default handler script and connection, a test alert, the scripts that set their own, and the alerts sent. **A script or flow that keeps failing alerts once per ten minutes**: the failures in between are counted on that alert (`repeats`), and the next alert says how many there were. A run whose alert was counted says so on its page.
- **The palette (⌘K) finds things, not only screens:** scripts, flows, apps, tables, triggers, connections and events by name, runs by ID or tag (`>`), people (`@`), and actions (`/`): run a script, start a flow, pause or resume a trigger, switch workspace. ⌘↵ runs, starts or re-runs what is chosen. What you opened last comes first. `?` lists the shortcuts. `GET /tenants/:t/search` is the same search.
- **The Workers page shows the queue:** what waits in each workspace and pool and for how long, and what each worker is running, with workers too old to take tasks marked.
- **Resources apply flows before schedules**, so that a schedule can name a flow in the same bundle.

## 0.5.0, not yet released

Authoring in the console (phase 7).

### For operators

- **Database change.** Migrations 0019 to 0032 run on start.
- **The console is sent compressed.** The image carries Brotli and gzip copies of the console's files and sends them itself. A proxy in front no longer needs to compress them.
- **Old try-out bundles are removed.** A bundle made only to try a draft out is removed a week later, with the test runs that ran on it.
- **A pull from a repository has a size limit:** 2000 files and 8 MB in the repository's folder.
- **Provisioning over SCIM.** An identity provider can push people and groups to `/api/v1/scim/v2/<provider>` with a token made under the provider's Provisioning tab. The provider must be able to reach the instance. It was tested against the request shapes Entra ID and Okta send, not against a live tenant of either. See "Provisioning (SCIM)" in the self-hosting guide.
- **Members can be suspended in a tenant, and accounts disabled.** A suspended member holds nothing in that tenant until resumed. A disabled account can sign in nowhere, and its API keys are refused. A provider does both by push; an admin and an operator can by hand.
- **Removing a member from a tenant, or an end user,** now also removes their ties to the tenant's identity providers.
- **Tenants can send mail through their own mail server,** with an `smtp` connection. Workers make the outbound connection to it. The instance's `SMTP_URL` stays for the platform's own invitations and is not lent to tenants.
- **Forms are served under a tenant's portal,** at `/portal/<tenant>/forms/<token>`, to anyone given the address unless the form asks for a sign-in. They are held to the portal's rate limit for forms.
- **A webhook can be held open for up to 25 seconds** while a flow answers it. A proxy in front of the instance must allow a request that long. The answer is the tenant's own, and is sent with a sandboxing content security policy.
- **Workers run connectors and trigger sources of a tenant's own.** They are code from the tenant's bundle, like scripts, and need `code:write` to be written in the console.
- **Apps can be made in the console,** with no code, over a workspace's tables. The image carries the app that draws them, under `SCREENS_DIR`. An instance run from source needs `pnpm build`, which builds it.
- **Three new built-in roles' worth of access:** `app_maintainer` builds and deploys apps made in the console and no code; `portal_reader` opens apps and reads rows; `developer`, `workspace_admin` and `app_maintainer` may keep dashboards.
- **Sharing an app with `viewer` shows every row.** That role reads everything, a table's every row included. Share with `portal_reader` or `portal_user`, which the Share button does.
- **Single sign-on.** A tenant can connect an identity provider over OIDC or SAML, for its members or its end users, and operators can connect one for themselves under Instance. The control plane makes outbound requests to the provider. Nothing new has to run. See "Single sign-on" in the self-hosting guide.
- **The console's sign-in asks for the email first,** then for a password or the organization's sign-in.
- **A tenant can require single sign-on.** Passwords are then refused for the people a provider covers. Members bound at the instance keep theirs: keep one such account.
- **An imported tenant's identity providers arrive paused,** with their domains to be proved again.
- **End users have groups and attributes,** and a table's rows can be ruled by them. New permissions: `end_user_group` and `sso`, both held by `tenant_admin`.
- **Code can be written in the console.** Whoever holds `code:write` in a dev workspace can write a script there and deploy it, and workers run it as it is. `tenant_admin` and `developer` hold it. Set `console_code` to false on a tenant to turn it off there.
- **The control plane compiles TypeScript.** It never runs what it compiles. The image now carries esbuild.
- **A tenant can connect a git repository** over HTTPS with an access token. The control plane makes outbound requests to it.
- **Exporting a tenant** is now the permission `export:write`. Roles that held `tenant:*` are given it.
- The console is a React application. Nothing changes for an operator.

### For tenant developers

- **Apps are built with React.** Replace `preact` with `react` and `react-dom`, `@preact/preset-vite` with `@vitejs/plugin-react`, `preact/hooks` imports with `react`, and `class=` with `className=`. The kit's text, number and date fields report through `onChange`.
- **A `platform/` folder in the repository** holds resources managed in the console, one `<path>.<kind>.yaml` each, with source beside it as `<path>.<kind>.ts`. `platform build` includes them. A path defined in the code and in a file is an error.
- Code written in the console may import `@vynxlabs/sdk` and `node:` modules only.
- A bundle from an older CLI still deploys, and keeps the workspace's console-managed resources.
- `defineWebhook`, and `trigger.webhook()` in a flow, take `input: "request"` to be given headers, query, method and the raw body, and `verify` to check an HMAC signature against a workspace secret. A webhook's address also takes forms and text.
- A sub-flow step may choose its flow when it runs: `flowFrom` with `allow`.
- `@vynxlabs/app` gains `startFlow`, `flowRun` and `runFlow`. `flow_run:write` can be bound at one flow.
- **Totals.** `table().aggregate({ group, measures, filter })` in apps and `ctx.table().aggregate(...)` in scripts give counts, sums, averages, the least and the most, over rows or groups of them, under the table's row policy. `GET …/aggregate/{table}` over HTTP.
- **Settings can be made in the console.** Connections, connection groups, variables, events, schedules and triggers are made and changed under Resources in a dev workspace, and deployed like any draft.
- **A repository that uses a core node builds as bundle format 3.** Deploying it keeps what was made in the console, as a bundle of an older format does.
- **Build with the 0.5.0 SDK** to deploy to a 0.5.0 instance with new features. A bundle built with an earlier SDK, back to 0.2.0, keeps deploying.
- **Connectors.** `defineConnector({ path, configSchema, create })` says how a kind of connection reaches an outside system, and a connection names it with `connector`. `smtp` is built in beside `http`: a script is given `send({ to, subject, text })`.
- **Trigger sources.** `defineTriggerSource({ mode: "webhook" | "poll", run })` decides what a webhook's request or a schedule's tick starts. `defineWebhook`, `defineSchedule` and a flow's triggers take `source`.
- **Nodes.** `defineScript({ node: { label, category, takes } })` puts a script in the flow editor's palette, with a form made from its input schema. A step can hand it a connection, a table or an event with `with`, and give an expression per field with `inputs`.
- **Core nodes.** `core/http-request`, `core/send-email`, `core/table-read`, `core/table-write` and `core/publish-event` can be named in any flow. The build adds them. Paths under `core/` are the platform's.
- **A flow can answer its webhook.** `trigger.webhook({ respond: "flow" })` and `step.respond({ status, headers, body })`.
- **Forms.** `trigger.form({ title, fields })` in a flow, or `defineForm` for a script, makes a page the platform serves. What is sent is the input.
- `defineInterface` declares pages of widgets over tables, and `defineApp({ interface })` serves one as an app with no code. Most are made in the console instead.
- The widget interface grew: a widget can be handed the chosen row, more rows to ask for, and ways to edit and delete. `card` and `cards` are new, and `chart` takes `mark`, `x` and `y` in place of a spec. An app's own widgets keep working.
- `defineTable` takes `policy: { rules: [...] }`: a rule allows `read`, `write` or `all` when a column holds the person's ID, names a group they are in, or equals one of their attributes. `{ owner }` works as before.
- `defineBinding` can name a group of end users: `{ type: "end_user_group", name }`.
- An app that draws its own sign-in screen can list the tenant's identity providers at `GET /tenants/{id}/end-user-auth/providers` and send the browser to each one's path under the tenant's sign-in pages.
- `defineConnectionGroup` declares a set of connections of one kind. Members are added per workspace in the console with no deploy, and a script that lists the group in `connectionGroups` picks one when it runs: `await ctx.connections("shops").get(input.shop)`.

### Changed

- Bundle format 3: a manifest's `ownership` may be `ui`. A script's body may carry `source` and `node`.
- `GET /permissions` lists every permission. The audit routes take `area`, `actorId`, `target`, `from` and `to`, and entries carry `actorLabel`.
- A flow run's steps carry `pickedUpAt`.
- The worker protocol gains two routes for connection groups. A tenant's own worker must be upgraded before it runs a script that uses one.
- `POST /tenants/:t/workspaces/:w/mcp` is a Model Context Protocol server over the API: the scripts and flows a caller may start, as tools.

## 0.4.0, not yet released

Apps (phase 6): interfaces built from a tenant's repository and served by the instance, end users, the addresses apps are served at, and branding.

### For operators

- **Database change.** Migration 0018 runs on start. Upgrading from any earlier version is supported and tested.
- **Where apps are served.** By path at `PUBLIC_URL`, with nothing to set. Set `APPS_URL` to a second hostname to serve them there and keep them away from the console's address: do this on an instance with more than one tenant. A tenant can register hostnames of its own, each for one app. Your proxy holds the certificates. See the self-hosting guide.
- **Mail is optional.** `SMTP_URL` and `MAIL_FROM` let the instance send end users' invitations and password resets. Without them nothing is sent and staff pass the links on.
- **Workers.** A 0.3.0 worker keeps working. It does not tell scripts who started a run, so upgrade tenants' own workers before they deploy a script that uses `ctx.run.startedBy`.
- The proxy in front must pass the `Host` header through and set `X-Forwarded-Proto`.

### For tenant developers

- `defineApp` declares an app from a directory with an `index.html`. `platform build` compiles it with the repository's own Vite: add `vite` and `@preact/preset-vite` to `devDependencies`. `platform dev` serves it with reload against a workspace.
- `@vynxlabs/app` is the browser client: `table`, `runScript`, `useQuery`, `useSession`. `@vynxlabs/ui` is the component kit, with forms from a JSON Schema and charts from a Vega-Lite spec.
- `defineBinding` and `defineRole` say who may open an app and read a table. Principals now include `{ type: "end_users" }`, every signed-in end user of the tenant, and `{ type: "end_user", email }`. The built-in `portal_user` role opens apps and reads and writes rows under each table's policy.
- `defineTheme` sets a workspace's colors where they differ from the tenant's.
- `ctx.run.startedBy` says who started a run. `ctx.table(t).as(ctx.run.startedBy.id)` reads and writes as that person.
- A script can be started, and its run read, by someone who holds `run:write` at that script alone.
- **Rebuild to deploy apps.** A bundle with an app is format 2 and needs the 0.4.0 SDK and CLI. A repository without apps still builds as format 1, and bundles built with 0.2.0 and 0.3.0 keep deploying.

### Changed

- The claim answer of the worker protocol gained `startedBy`. A data request's `as` must now be a member or an end user of the tenant.
- A binding's `principalType` may be `end_user` or `end_users`.
- A tenant export also carries end users, the files of apps, and branding. Hostnames and sign-ins are not carried.
- `POST …/runs` and `GET …/runs/{id}` check the permission at the script as well as at the workspace.
- A request that arrives with a session cookie and changes something is refused when its `Origin` is another site.

## 0.3.0, not yet released

Environments and portability (phase 5), on top of data (phase 4) and events and flows (phase 3).

### For operators

- **Database change.** Migrations 0010 to 0017 run on start. Upgrading from any earlier version is supported and tested.
- **A new database role.** The platform now creates one sign-in per database for requests for tenants' rows. The Postgres user must be allowed to create roles. Custom tables made by an earlier version are handed over to it on start.
- **Dedicated databases.** A tenant's custom tables can live in a database registered under Instance, Database locations.
- **Tenant export and import**, and deleting a tenant.
- **Bundles keep working across the upgrade.** A bundle built with the 0.2.0 SDK still deploys, promotes and rolls back.
- A standalone worker can be run from `deploy/worker`.
- **A stop under load is fixed.** An export, a deploy or a worker asking for work could hold a database connection while waiting for another. With enough of them at once, every connection was held and the instance stopped answering. Each now uses the connection it has. A request that finds every connection busy fails after five seconds instead of waiting without limit. The queue keeps two connections of its own, so an instance opens up to two more than before.

### For tenant developers

- Tables, external data sources and files: `defineTable`, `defineDataSource`, `ctx.table`, `ctx.source`, `ctx.files`.
- Events and flows: `defineEvent`, `defineFlow`.
- `platform promote` activates a dev workspace's bundle in the workspace it is linked to. `--preview` shows what would change.
- A script can name the worker pool it runs on: `worker: "plant"`.
- A deploy lists what it changed, including what it did to the data. A deploy or a rollback never drops data.

### Changed

- The deploy summary gained `data` and `changes`.
- A workspace has `triggersPaused`. A tenant has `dataLocation` and `managedWorkers`.
- A run has `pool` and `waitingFor`.

## 0.2.0

Execution (phase 2): the SDK, bundles, deploys, workers, the queue, schedules, webhooks and the run log.

## 0.1.0

The kernel (phase 1): tenants, workspaces, members, roles, secrets, the audit log and the console.
