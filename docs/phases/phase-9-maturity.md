# Phase 9: maturity

Status: built. All eight milestones are built and tested locally, on branch `phase-9-maturity`, not yet merged or released. See [the summary](#summary) at the end.
Last updated: 2026-11-14

Phase 9 builds the P0 and P1 items of the [evolution roadmap](../evolution/07-roadmap.md). It changes no part of the platform's model. It makes what already exists dependable and connected:
- runs stop when they should, and are kept only as long as promised;
- failures are found, read and recovered from in one place;
- every live screen updates without polling;
- inputs are forms, not JSON;
- apps can start the automation they sit beside.

The evidence and reasoning are in [`docs/evolution/`](../evolution/README.md). P2 and P3 items follow in later phases, as client work asks for them.

**Exit criterion:** on a fresh instance, on a laptop and again on a phone-sized screen, a member can:
- open the header failed-runs count and read the failed run's error and log line in three clicks;
- follow links to the script at that run's version;
- re-run it with edited input from a form;
- retry a failed flow from its failed step;
- watch every state change arrive without the page polling;
- find any run by search or tag;
- make a schedule for a flow from Triggers;
- start a script from a button in a no-code app.

A script that ignores its timeout is killed, and nothing older than the retention period is left in the database.

## Spec sections implemented

| Master spec section | What phase 9 delivers |
| --- | --- |
| Worker behavior | A process per attempt, killed at its timeout or on cancel; memory caps; managed workers as their own user |
| Observability | Runs searchable and tagged; retention per tenant; a live event stream; queue and RED metrics |
| Flows: control flow | Retry from the failed step; re-run with edited input |
| Triggers | Created from Triggers; schedule preview and fire now; schedules that start flows |
| Admin console | One state vocabulary; a full run page; schema forms; command palette entities and actions; alerts |
| Apps | Action buttons and row actions that start scripts and flows |

## Owner decisions

| Area | Decision |
| --- | --- |
| Shape | One branch, `phase-9-maturity`, in eight milestones, one commit each (seven planned; the execution plane added by decision 0001) |
| Scope | P0 and P1 of the roadmap. P2 and P3 wait |
| Retention defaults | Runs and logs 30 days, events 30, refused webhooks 7, audit 400 (exported to S3 before it is dropped). Instance default, tenant override within instance bounds |
| Managed workers | Run as an unprivileged `vxrun` user, which needs `CAP_SETUID` and `CAP_SETGID` on the container. Without them, managed workers are refused for tenants whose `code:write` is held outside the operator, and those tenants use standalone workers |
| Flow retry and approvals | Granted approvals upstream of the failure are copied like other succeeded steps, keeping who approved. Pending or rejected approvals are asked again |
| App action input | Dotted-path mapping from page state, or constants. CEL later, if needed |
| The execution boundary ([decision 0001](../evolution/decisions/0001-execution-boundary.md)) | The control plane never executes tenant code, and reaches tenant-chosen destinations only on a named list behind an egress guard. Work that looks inside code or talks to a tenant's system is a task kind on the tenant's worker |
| Managed workers' network | A worker host container beside the control plane, on a network of its own. Where none is deployed, in-process managed workers only for tenants whose code only the operator writes |
| Apps' address | A separate app address by default; code apps on the console's address only by the operator's explicit choice |

## Design in brief

The specs in [`docs/evolution/specs/`](../evolution/specs/) hold the design. In short:

- **The worker protocol does not change.** Isolation (S1) is internal to the worker: the parent keeps the credential and answers `ctx` calls over IPC.
- **Manifests change only by optional fields** (`memoryMb`, schedule `target` and `overlap`, interface `action`), with regenerated schemas.
- **Migrations are additive**, apart from partitioning `audit_entry`, which is copy-then-swap with its append-only triggers kept on every partition.
- **New routes go through `config.access` and `mutate()`.** The single exception is a preference write (`PUT /me/recent`), on an allowlist that a test enforces.
- **One state vocabulary, derived on the server**, and one `StatePill`. Every later screen renders it.
- **A cache, then a stream.** TanStack Query sits behind `useLoad`'s signature. Stream events invalidate cache keys, and screens fall back to polling when the stream fails.

## Milestones

| # | Milestone | Roadmap items | Spec |
| --- | --- | --- | --- |
| 1 | Quick wins: logs that are never dropped silently, preferences out of the audit log, a 404 page and slug URLs, links that close loops | P0-3, P0-4, P0-6, P1-11 | [roadmap](../evolution/07-roadmap.md#p0-3--stop-dropping-logs-silently) |
| 2 | Execution isolation: a process per attempt, memory caps, the `vxrun` user, shared rate limits, one managed worker per tenant | P0-1, P0-7 | [S1](../evolution/specs/S1-execution-isolation.md) |
| 3 | Retention: tenant policy, the pruner, monthly audit partitions | P0-2 | [S2](../evolution/specs/S2-retention.md) |
| 4 | One state vocabulary, the console query cache, the run event stream | P0-5, P1-9, P1-4 | [S5](../evolution/specs/S5-run-event-stream.md) |
| 5 | The operational loop: full run page, re-run and retry, runs search, tags and paging | P1-1, P1-2, P1-3 | [S3](../evolution/specs/S3-run-page-and-retry.md), [S4](../evolution/specs/S4-runs-search-tags-paging.md) |
| 6 | The execution plane: the egress guard, task kinds on the worker protocol (`describe`, `deliver`, `test-connection`), the worker host for managed workers, a separate apps address by default | Decision 0001; part of P2-7 | [0001](../evolution/decisions/0001-execution-boundary.md) |
| 7 | The build loop: SchemaForm everywhere, schemas derived from zod through `describe`, triggers from Triggers, app actions | P1-5, P1-6, P1-7 | [S6](../evolution/specs/S6-schema-form.md), [S7](../evolution/specs/S7-app-actions.md) |
| 8 | Alerts in the console, palette entities and actions, the queue panel and RED metrics | P1-8, P1-10, P1-12 | [S8](../evolution/specs/S8-command-palette.md) |

Each milestone ends with `pnpm typecheck`, `pnpm lint` and `pnpm test` passing, and `pnpm e2e` for the milestones that change the console.

## Tests

Each item's acceptance criteria are in the roadmap and its spec. New suites this phase adds:
- `packages/worker`: log delivery under failure, kill at timeout and cancel, memory cap, no credential in the child.
- Control plane: the preference allowlist, retention pruning and partitions, retry seeding, stream fan-out across two replicas, runs search.
- Console: NotFound and slug redirects, the Re-run menu, SchemaForm constructs, the palette.

## Findings

- **A worker sent at most 500 log lines per request, but sent everything it held at once.** A run that logged more than 500 lines between heartbeats had the whole batch refused, and the refusal was swallowed. Fixed with P0-3: lines are sent in batches of 500.
- **A link inside a row that opens on click fired both.** Adding target links to Triggers rows showed it: the row's selection ran after the link's navigation and rewrote the address. `Link` now stops the click from reaching the row.
- **The `Changes` screen was dead, but its tests covered behavior the live Release screen has.** They were moved to `Release.test.tsx` instead of being deleted.
- **`cap_add` alone gives the control plane nothing.** Docker drops a non-root user's capabilities when it starts a program, so the image keeps `node-cp`, a copy of node that holds `CAP_SETUID` and `CAP_SETGID` as file capabilities, and runs only the control plane on it. Workers and scripts run on plain node, and cannot switch back: checked in the image, a script running as `vxrun` gets EPERM from `setuid` and EACCES reading the control plane's `/proc/1/environ`.
- **With capabilities dropped, the kernel refuses to start `node-cp` at all.** A plain `CMD ["node-cp", …]` would have left the control plane down under `cap_drop: [ALL]`. `platform-start` tries `node-cp` and falls back to plain node, and the control plane then applies the refusal rule. Checked in the image.
- **`no-new-privileges` did not stop the file capabilities under Docker 29**, against what the plan assumed. The docs say runtimes differ, and the log says which way it went.
- **A worker's credential was readable by its own scripts through `/proc`.** Deleting `PLATFORM_WORKER_TOKEN` from `process.env` does not change `/proc/<pid>/environ`. Managed workers now get the credential on standard input (`--token-stdin`), and standalone workers are advised to use it.
- **Connection clients cannot cross into a script's process; their configuration can.** The runner builds clients from the bound connection's configuration, as the worker did, so the credential a script reaches is its own connection's, as before, and never the worker's.
- **A script's process runs as its worker's user.** With `kernel.yama.ptrace_scope` at 0 it could read the worker's memory; the worker warns at start when it is. Separating them is the P3 sandboxing item.
- **"Outside the operator"** is anyone with `code:write` in the tenant, wildcards included, who holds no instance-wide role: a member, a member of a group, or any service account. A tenant's admins usually match, so without the capability most tenants get no managed worker.
- **`health_check` does not grow; `scim_refusal` does.** The first holds one row per checked thing, updated in place, and is not pruned. Refused SCIM pushes are pruned with refused webhook requests.
- **Flow runs go as whole trees.** A script run points at its flow run, and a child flow run at its parent, with no cascade, so a tree is removed from its finished top run down, in one transaction, and passed over while any part of it is still going.
- **Stored payloads are removed after their rows,** not before as S2 had it: at worst an object is left behind and logged, never a row pointing at nothing.
- **The object store takes whole buffers,** so an audit month is exported in gzipped parts of 50,000 entries with a manifest of counts and checksums. The month is dropped only when its row count, taken under lock, matches the export.
- **Imports make the audit months they bring.** Without that, imported entries would sit in the default partition and never age out.
- **The documented restore needed CSV mode.** Text-mode `COPY` reads backslashes as escapes and breaks the JSON of an entry. Checked by round-tripping entries with quotes, tabs, backslashes and newlines.
- **Measured on 1,000,000 finished runs with 5 log lines each** (434 MB of runs, 896 MB of logs), on the dev stack: deleting a batch of 500 runs and their 2,500 lines took 8 ms at the median and 133 ms at most over 100 batches, on the new `run_retention_idx`. A run inserted every 20 ms meanwhile took 1.3 ms at the median and 137 ms at most. S2 asked for no lock held over 2 s.
- **Database triggers announce run changes,** not the code that makes them. A status changes in a dozen places (claim, complete, fail, cancel, requeue, reap, the flow engine, approvals); a trigger on `run`, `flow_run` and `step_run` misses none, and `pg_notify` is sent only on commit. A bulk load sets `vx.quiet` to stay silent; the tenant import does.
- **One stream per tab, at the tenant,** not one per workspace as S5 had it: the header counts and the tenant overview need every workspace. What a subscriber may read is decided per workspace when it connects, with the checks `/activity` uses: script runs with `run:read`, flow runs and steps with `flow_run:read`.
- **Approval "events" are step changes carrying identifiers only.** The approvals a browser then reads are filtered to those who may decide, so S5's rule became: no flow or step events to someone who may not read that workspace's flows.
- **No separate log stream.** A run's log lines are announced on the same stream, at most twice a second per run, and the run view reads them with the existing `logs?after=`.
- **A flow whose sub-flow waits for a person shows `running`,** and the sub-flow `waiting_approval`. `waiting_time` is shown only while nothing but delays is waiting.
- **The cache changed one test's timing, not its meaning.** A promotion test changed a select as soon as its label appeared; the options now arrive a tick later. The test waits for the option.
- **A write outside any tenant invalidated every read,** and the console makes one itself: `PUT /me/recent`, when the member's place settles. In a browser on the dev stack it showed as one extra Runs request after each arrival. A write under `/me` now invalidates only `/me`. Checked in Chromium against the built console: a run inserted from outside appeared on an open Runs page in 92 ms, over one stream, with one list request on arrival and none in the next 12 seconds.
- **A retry keeps its own copies of what it reuses.** The engine reads a code step's output from its script run and a sub-flow step's from its flow run, and retention removes the original tree after its period. A retry still waiting by then would read nothing. So a kept step's output, and any stored object behind it, is copied into the retry, and the step names where it came from instead of pointing at it.
- **What a retry keeps:** a step that succeeded, was skipped, or failed with its failure handled, with every step before it kept too. A granted approval is a succeeded step; a pending or rejected one is not, and is asked again.
- **The error summary is kept by a trigger, not a generated column.** An import, and the upgrade test, write rows whole, and Postgres refuses a value for a generated column.
- **A run's address is its page now.** The list's inspector moved to `?run=<id>`, beside its filters. Every link to a run, from triggers, the overview and approvals, opens the page.
- **Searching 5,000 runs:** the first page of the list answered in 15 ms in the test suite; S4 asked for under 150 ms.
- **Walked in Chromium on a built instance, at 1440 and 390 px:** from the workspace to a failed script run's error and log line in 3 clicks at both widths (the header's failed-runs count at 1440, the overview's "Open failed runs" at 390, where the header has no room for it), the target S3 set. Retrying a failed flow from its failed step said what runs again and what is kept before it ran, and the new run showed "Succeeded" by itself within 1.3 s of its page opening. No page scrolls sideways at 390.
- **The walk found two things the tests did not.** A kept step carried its original times, so the retry's timeline stretched back to the first run and listed it before the trigger; kept steps are now drawn at the retry's start, marked "kept", after the trigger. And the run page had no side margin on a phone; it has the console's gutter now.
- **Open:** the timeline's axis labels overlap at 390 px. The timeline component predates this phase; left for the console polish in milestone 7.

- **The egress guard checks the address connected to, not one looked up beforehand.** `fetch` goes through an undici agent whose DNS lookup refuses internal addresses, so a name cannot pass the check and then point elsewhere. A host given as an IP address is never looked up, so literals are checked separately, on every redirect hop. Postgres takes the same lookup through a socket of its own; its host is also checked before the pool opens.
- **What the guard covers:** SSO metadata and OIDC discovery and token calls, Git remotes (isomorphic-git through a client of our own on the guard), data sources and their health checks, and the domain check. The tests and the dev `.env.example` allow loopback, which the local identity provider and test servers use.
- **A task is offered before a run, and only to a worker that names its kind.** Old workers send no `kinds` and are never given one, so the protocol stays at version 1. A task holds no attempt number: it is done once, and one whose worker goes silent for a minute, or that nobody takes in time, is failed with the reason.
- **A task asks the control plane for nothing.** The worker reads the connection a task names before it starts the task's process and hands it over; a call the process makes anyway is refused by the worker. Tested with a bundle whose `__vx_describe` tries.
- **`deliver` made the alert's `notified` arrive later.** The control plane records the alert, then a worker posts it and sets `notified`. A worker can finish before the first write, so the first write merges under what is already there instead of replacing it.
- **`describe` is a composed export, not an import of the SDK by the control plane.** Compose adds `__vx_describe(entry)` to the console section of a bundle, built with the SDK it compiles against, and a save of a console script queues a `describe` task with a preview bundle of that draft alone. A draft that does not build, or names a connection the workspace has not got, is saved all the same and not read. The result is written only to the revision it was read from, and does not move the revision.
- **The connection test is `POST …/connection-tests` with the path in the body,** not `connection-bindings/<path>/test`: a binding's path is a wildcard, and a suffix after it is ambiguous.
- **`MANAGED_WORKER_USER=same` now also says everyone who writes code works for the operator.** In `process` mode the instance starts workers only for tenants whose code only the operators write; `same` is the dev stack's setting, and without this the seeded tenants would run nothing locally.
- **The worker host must not run workers as its own user.** A process of the same user can read another's `/proc/<pid>/environ`, and the host's environment holds the token that leases any tenant. The host runs as root with `SETUID`, `SETGID` and `NET_ADMIN` only, starts each worker as `vxrun`, and refuses to start if it is `vxrun` itself.
- **Firewall rules are set once, at the host's start,** for the control plane's address then. A control plane recreated on another address needs the host restarted; documented.
- **Code apps without `APPS_URL` answer an explanation, not the app.** `/api/v1/instance` says `appsAddress` (`separate`, `console` or `none`), and the Apps page warns when repository apps are not served. Most suites set `APPS_ON_CONSOLE_ADDRESS=true` to keep their single address; the default is tested on its own.
- **Checked in the image, with `deploy/compose` and the worker host:** a script on a managed worker ran as uid 10001, reached the control plane and `example.com`, could not resolve `postgres` or `objectstore`, and was refused `169.254.169.254`. A connection test through the worker answered 200 in 76 ms. The tenant's Workers state said `host`.
- **Docker's name server broke the first firewall rules.** Docker rewrites DNS to 127.0.0.11 on a port of its own before the filter table sees the packet, so a rule for port 53 never matched and every worker lookup was refused as loopback. The rule now allows the name server's address on any port.
- **One webhook test failed once under the full parallel run** and passed alone and on the next full run. Left as noted.
- **The kit's `Form` was left as it was.** It serves flat forms: a row's fields, a connection's settings. `SchemaForm` is new beside it and serves input. Rebuilding `Form` on it, as the plan had it, would have changed every row form for nothing they need.
- **SchemaForm checks what it draws itself, not with Ajv.** Ajv builds validators with `new Function`, which the app pages' content security policy forbids, and an action's form runs there. The server checks every input fully, and its `/input/...` errors are put on the fields they name.
- **A form that started as JSON started empty**, and one whose schema arrived after it was drawn stayed JSON: both found by the schedule editor's tests. The form now shows what it was given, and is drawn again when its schema arrives.
- **The Triggers page's "last run" never matched a schedule.** A schedule names itself in its run's trigger as `schedule`, every other trigger as `trigger`, and the list looked for `trigger` only. Both are looked for now.
- **A schedule resource could not name a flow in its own bundle,** because flows were applied after schedules. Flows go first now; nothing a flow refers to comes after it.
- **Starting a flow from a resource-level schedule passed `""` as the trigger node,** which the engine read as a node named nothing. It passes none, and the flow starts from its manual trigger.
- **Action paths name widgets, not tables,** as planned. A widget whose chosen row an action reads lets rows be chosen even when nothing else follows it.
- **After an action succeeds the whole page reads again,** not only the widgets named in `result.refresh`, which is kept for later. The result is said in a notice on the page rather than a toast: the app runtime has no toasts.
- **Who would not see an action** is worked out from the bindings that hold the app's audiences (groups, end-user groups, every end user, anyone) and those that grant starting the target, at the tenant, the workspace or the target. A single person bound to an app is not checked one by one.
- **`GET …/interface-targets` is a GET,** with the targets in the query: as a POST it would have been refused by the guard that every change goes through the write path, though it changes nothing.
- **One flow test failed once under the full parallel run** (an approval decided 34 ms in) and passed alone and on the next run. Noted with the webhook one from milestone 6.
- **Walked in Chromium on a built instance, at 1440 and 390 px:**
  - Start flow on a flow whose manual trigger takes a product code, a quantity, a choice and a list of notes showed them as fields, and the run got typed input (`quantity: 10`, `lines: [{text: …}]`);
  - a schedule for that flow was made from Triggers in 5 clicks (New trigger, Schedule, the target box, the flow, Save draft), and once deployed its first time matched the preview;
  - an end user in the finance group pressed Remind on a row of an interface app, was asked for the note the action does not map, confirmed "Send a reminder for INV-102 to Fernhill Clinic?", and was told what the script does; both runs say `started_by: end_user`.
  
  No page scrolled sideways, and no page threw. `pnpm e2e` passes (16), against an instance of its own.
- **Alerts are deduped per script or flow, under a lock per script or flow,** and the alert's own record says when it was sent (`alertedAt`), written before the lock is let go. Two failures at once cannot both send. The handler script is held back with the notification, since starting a run is the larger cost.
- **On the walk instance, 12 failures of one script in a few seconds** made one post to the stand-in chat endpoint, an alert with "+11 more", and `platform_alerts_total` of 1 delivered and 11 suppressed.
- **The queue metrics are new series beside the old ones.** The plan had `platform_runs_queued` gain labels. Changing a series' labels breaks a dashboard that sums it, so `platform_runs_queued` stays the instance total and `platform_workspace_runs_queued{tenant,workspace,pool}` is added.
- **Counted series are kept by workspace ID and written with slugs,** so a renamed workspace keeps one series, and one whose workspace is gone is written as `gone`.
- **Search is permission-checked once per workspace and kind, then per row only where that fails,** for someone bound to single resources. Over 2,000 seeded resources the median answer through the whole stack was under 100 ms in the test suite, as S8 asked. Results come shortest-path first within a workspace, after an exact match.
- **A run is found by an ID prefix with a range on the key,** not by casting IDs to text, so it uses the primary key's index.
- **Actions in the palette are not filtered by permission.** `/me` says nothing per workspace, so the palette offers what the workspace can do and the server refuses what the member may not, with its reason in a toast. New script and New flow are offered only in a dev workspace.
- **Starting from the palette opens the run's page,** rather than a toast with Open run: the console's toasts carry text only.
- **The palette's ⌘↵ hint is hidden on a phone,** and a result's name keeps its room before its kind and workspace: both found on the walk at 390 px.
- **Walked in Chromium on a built instance, at 1440 and 390 px:** `reminders` in the palette found the script, the flow and the schedule, in this workspace; a pasted run ID opened its run; `/run`, then `agent/find-client`, opened its form and started the run; the Alerts page showed the one alert with "+11 more"; the Workers page said "Runs are waiting in sandbox", with the `plant` pool's five runs; `?` opened the shortcuts. No page scrolled sideways, and no page threw. `pnpm e2e` passes (16), against an instance of its own.

## Summary

Phase 9 built the roadmap's P0 and P1 items in eight milestones, one commit each, on `phase-9-maturity`.

| # | Milestone | Commit |
| --- | --- | --- |
| 1 | Quick wins: logs kept, preferences out of the audit log, a 404, links that close loops | `3a4cf6e` |
| 2 | Execution isolation: a process per attempt, memory caps, managed workers as their own user, shared limits | `2824abc` |
| 3 | Retention: history kept for a period, audit months exported, then dropped | `2af302f` |
| 4 | One state vocabulary, a console cache, live runs | `d1ec682` |
| 5 | The run page, re-run and retry, runs found by search and tag | `e0cfd7d` |
| 6 | The execution plane (decision 0001): the egress guard, tasks, the worker host, apps on their own address | `bcd7acb` |
| 7 | The build loop: schema forms, triggers from Triggers, app actions | `1cf10f0` |
| 8 | Alerts in the console, the command palette, the queue and metrics | this commit |

**What moved from the first plan:** [decision 0001](../evolution/decisions/0001-execution-boundary.md) was taken during the phase. The control plane no longer runs tenant code or reaches tenant-chosen addresses unguarded, which inserted milestone 6 and moved reading schemas from zod onto the workers (`describe`), where S6 had the control plane evaluate them.

**The exit criterion** was walked in parts, milestone by milestone, at 1440 and 390 px:
- the failed run's error and log in three clicks (milestone 5);
- re-run, and retry from the failed step (5), with input from a form (7);
- live state (4), search and tags (5);
- a schedule for a flow from Triggers (7);
- a button in a no-code app (7).

The timeout kill (2) and retention (3) are tested. It has not been walked as one session from a fresh instance; that is the first thing to do before merging.

**Upgrading** needs the operator steps in the changelog: `WORKER_HOST_TOKEN` and the worker host, `APPS_URL` or `APPS_ON_CONSOLE_ADDRESS=true`, `EGRESS_ALLOW` for internal addresses, and retention periods to keep longer than the defaults. Migrations 0046 to 0051 run on start.

**Open:**
- the timeline's axis labels at 390 px (milestone 5);
- the Fly worker-host setup, written and not run (6);
- per-workspace permissions in `/me`, which would let the palette hide what a member may not do (8).

**Next:** the P2 items, as client work asks for them.

### Found in CI after the pull request was opened

- **The expression time limit counted the evaluator's own start-up.** An expression's 250 ms began when it was sent, so loading the expression library in a new thread, and waiting behind other expressions, counted against it. One timeout replaced the thread, and the next expression paid for its start-up again. On a busy machine, valid expressions were refused at upload and trigger tags were left off. The two tests noted as flaky in milestones 6 and 7, and the one failing on `main` since phase 7, were all this. The clock now starts when the thread begins an expression, and those waiting behind one that runs too long are asked of the new thread.
- **CI ran eight test files at once on four cores,** and a CLI test that builds the example repository four times ran past its 30 s. CI now runs four at once, and that test has the 120 s its neighbours have.
- **CI's own stack configuration predated milestone 6:** it had no `WORKER_HOST_TOKEN`, and the browser test's instance did not allow the loopback addresses of Keycloak and its Git server. Both are set as `.env.example` sets them.

