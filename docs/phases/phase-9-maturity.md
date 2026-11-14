# Phase 9: maturity

Status: in progress. Milestones 1 (quick wins) and 2 (execution isolation) built and tested locally, milestone 2 also in the image on the dev stack. Milestones 3 to 7 not started.
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
| Shape | One branch, `phase-9-maturity`, in seven milestones, one commit each |
| Scope | P0 and P1 of the roadmap. P2 and P3 wait |
| Retention defaults | Runs and logs 30 days, events 30, refused webhooks 7, audit 400 (exported to S3 before it is dropped). Instance default, tenant override within instance bounds |
| Managed workers | Run as an unprivileged `vxrun` user, which needs `CAP_SETUID` and `CAP_SETGID` on the container. Without them, managed workers are refused for tenants whose `code:write` is held outside the operator, and those tenants use standalone workers |
| Flow retry and approvals | Granted approvals upstream of the failure are copied like other succeeded steps, keeping who approved. Pending or rejected approvals are asked again |
| App action input | Dotted-path mapping from page state, or constants. CEL later, if needed |

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
| 6 | The build loop: SchemaForm everywhere, triggers from Triggers, app actions | P1-5, P1-6, P1-7 | [S6](../evolution/specs/S6-schema-form.md), [S7](../evolution/specs/S7-app-actions.md) |
| 7 | Alerts in the console, palette entities and actions, the queue panel and RED metrics | P1-8, P1-10, P1-12 | [S8](../evolution/specs/S8-command-palette.md) |

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

