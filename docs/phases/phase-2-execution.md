# Phase 2: execution

Status: in progress
Last updated: 2026-11-11

Phase 2 delivers the first useful product: a script with visibility. A developer writes a script in a tenant repository, builds and deploys it with the CLI, and it runs on a schedule, a webhook or a manual start, with run history, logs and failure alerts.

**Exit criterion in the master spec:** a real client integration runs in production on the shared instance.

**What this phase proves:** the same thing on the single-host stack, with a sample integration. The production check stays open until there is a hosted instance and a client integration.

## Spec sections implemented

| Master spec section | What phase 2 delivers |
| --- | --- |
| System architecture: worker, SDK and CLI, the two contracts | The worker, the worker protocol, the SDK for scripts, CLI build and deploy |
| Resource model: authoring and compilation | TypeScript definitions compiled to manifests and one bundle |
| Execution: scripts, queue, triggers, worker behavior | All of it except events and custom triggers |
| Environments, deploys and promotion: deploys | Immutable bundles, atomic activation, rollback |
| Extensibility | The trigger and connector interfaces, with the built-in uses written against them |
| Observability and audit: runs, alerts, operator health | Run log, failure alerts, metrics endpoint |

Not in this phase: events and event triggers, flows, custom tables, promotion between linked workspaces, cloning, custom triggers and connectors shipped in bundles, email.

## Owner decisions

| Area | Decision |
| --- | --- |
| Queue | pg-boss, embedded in the control plane |
| Workers | Managed by the control plane, one process per tenant on demand. The same worker also runs standalone |
| SDK schemas | Zod, converted to JSON Schema at build time |
| Exit target | Build and prove locally |

## Findings

- **pg-boss spike passed.** It runs through `packages/db` on an adapter over our pool, so the driver stays confined. Explicit claim, complete and fail suit remote workers. Retries with backoff, delays, priorities, timeouts, cancellation, per-group concurrency limits and heartbeat reclaim all work as needed, on Postgres 16 and 18. It keeps its tables in its own `pgboss` schema and upgrades them itself. Its telemetry module is OpenTelemetry instrumentation, which does nothing unless the operator installs an exporter. It makes no outbound call.
- **A bundle must not name its workspace.** Promotion deploys the same bundle to another workspace without rebuilding. So `workspace` becomes optional in an authored manifest, and the control plane fills it in at deploy. A stored resource always has it.
- **Auditing every run start would drown the audit log.** A schedule that fires each minute would add 1,440 entries a day. A run started by a person or an API key is audited. A run started by a schedule or webhook is recorded on the run itself, which names its trigger.
- **The webhook rate limit is per replica**, like the sign-in limit, until there is shared state for it.

## How it fits together

1. A developer defines resources in TypeScript with the SDK and runs `platform build`. The CLI bundles the code, loads it to read the definitions, and writes one bundle file: manifests, code and metadata.
2. `platform deploy` uploads the bundle and activates it. The control plane reads only the manifests.
3. A trigger creates a **run** and puts a job on the workspace's queue.
4. A worker claims the job over HTTP, downloads the bundle if it does not have it, runs the script, streams logs, and reports the result.
5. The run, its logs and its outcome are visible in the console and the CLI.

## Resource kinds added

| Kind | Family | Body |
| --- | --- | --- |
| `script` | Code-backed | `entry`, `description`, `input` and `output` JSON Schemas, `timeoutSeconds`, `retries`, `concurrency`, `uses` (connections, secrets, variables), `onFailure` |
| `schedule` | Pure data | `script`, `cron`, `timezone`, `input`, `enabled` |
| `trigger` | Pure data | `type: webhook`, `script`, `enabled` |
| `connection` | Pure data | `connector`, `description` |
| `variable` | Pure data | `description`, `default` |

A connection or variable resource is only the definition. Its configuration, credentials and value are bound per workspace and never travel in a bundle.

## SDK

`@vynxlabs/sdk` is the only supported way to define resources in code.

- `defineScript({ path, input, output, connections, secrets, variables, timeoutSeconds, retries, concurrency, onFailure, run })`
- `defineSchedule`, `defineWebhook`, `defineConnection`, `defineVariable`
- The script context: `connection(path)`, `secret(name)`, `variable(path)`, `log`, `run` (ID, attempt, idempotency key, trigger) and `signal`, which aborts on cancellation or timeout.
- A script may read only the connections, secrets and variables it declared. The deploy checks that each one is bound.
- Extension interfaces: `Connector` and `TriggerSource`. The generic HTTP connector and the schedule, webhook and manual triggers are written against them.

A tenant repository exports its resources from one entry file, `src/index.ts` by default.

## Bundle

One JSON file:

| Field | Meaning |
| --- | --- |
| `formatVersion` | 1 |
| `sdkVersion` | The SDK the code was built with |
| `core` | `{ min, below }`: the core versions the bundle works with |
| `manifests` | One authored manifest per resource, without a workspace |
| `code` | The bundled ES module, as text |
| `digest` | SHA-256 over everything above |

A bundle is immutable and gets the next version number in its workspace. Uploading the same digest twice returns the existing bundle.

## Deploy

Activating a bundle happens in one transaction:

1. Refuse it if the core version is outside the bundle's range.
2. Validate every manifest against the kind registry.
3. Refuse it, naming each one, if a connection, secret or variable that a script uses is not bound in this workspace.
4. Sync code-managed resources through the registry: create, update, delete. Unchanged resources are left alone. Kind hooks run, so schedules and webhooks take effect.
5. Point the workspace at the bundle and record the deployment.

Rollback is a deploy of an earlier bundle. A run in progress keeps the bundle it started with. Deploying needs `deployment:write`, which developers do not hold by default.

## Runs and the queue

- Each workspace has its own queue. A job carries only the run ID. The `run` row is the record.
- States: `queued`, `running`, `succeeded`, `failed`, `cancelled`.
- Delivery is at-least-once. A run has an idempotency key, either supplied by the caller or generated, and a second start with the same key for the same script returns the first run.
- Limits: per workspace (default 10 running at once) and per script (`concurrency` in the manifest).
- A final failure is one with no retries left. It fires the failure alerts.
- Input and output up to 256 KB are stored with the run. Larger ones go to file storage and the run holds a reference.

## Worker protocol

The second language-neutral contract, specified in `docs/contracts/worker-protocol.md`. In short:

- HTTP and JSON under `/api/v1/worker`. The worker always calls. The control plane never connects to a worker.
- A worker credential (`vxw_…`) is scoped to a tenant, optionally to one workspace.
- `claim` (long poll), `bundles/{id}`, and per run: `heartbeat`, `logs`, `secrets/{name}`, `variables/{path}`, `connections/{path}`, `complete`, `fail`.
- The heartbeat reply tells the worker when the run was cancelled.
- A worker silent for longer than the heartbeat window loses the job, and the job is retried.

## Workers

- **Managed.** The control plane starts one worker process per tenant when that tenant has work, with a short-lived credential and an environment that holds no instance secrets. The worker exits when idle.
- **Standalone.** `platform-worker --url <url> --token <credential>` runs the same worker anywhere that can reach the control plane.
- `MANAGED_WORKERS=false` turns the managed ones off, for an instance served only by standalone workers.

## Triggers

| Trigger | How it starts a run |
| --- | --- |
| Manual | `POST …/runs`, from the console, the CLI or an API key |
| Schedule | A cron expression with a time zone. The scheduler creates the run when it is due. A missed time is run once, not once per missed slot |
| Webhook | `POST /api/v1/hooks/{token}`. The token is long, random and per trigger. The body becomes the script's input. Rate limited |

## Failure alerts

On a final failure, either or both of:

- start a handler script, with the failed run's details as input;
- POST a summary to a bound HTTP connection, such as a chat webhook.

Set per script with `onFailure`, or per workspace as the default. A failing handler does not alert again.

## Schemas

Migrations 0008 onward.

| Table | Purpose |
| --- | --- |
| `bundle` | Immutable bundles: workspace, version, digest, SDK and core range, storage key |
| `deployment` | Which bundle was activated when, and by whom |
| `workspace` (extended) | `active_bundle_id`, `concurrency_limit`, `failure_alert` |
| `connection_binding` | Per workspace: connection path, configuration, encrypted credentials |
| `variable_value` | Per workspace: variable path, value |
| `run` | The run record |
| `run_log` | Log lines per run, ordered |
| `trigger_state` | Per schedule or webhook: next fire time, encrypted webhook token and its hash |
| `worker_credential` | Hashed credentials for workers |
| `worker` | Workers seen recently, with their last heartbeat |

Built-in roles gain the new permission kinds. A new built-in role, `deployer`, holds `bundle:*` and `deployment:*`.

## API surface

Under `/api/v1/tenants/{t}/workspaces/{w}` unless noted.

| Route | Methods | Permission |
| --- | --- | --- |
| `/bundles` | GET, POST | `bundle:*` |
| `/deployments` | GET, POST | `deployment:*` |
| `/scripts` | GET | `script:read` |
| `/runs`, `/runs/{id}`, `/runs/{id}/logs` | GET, POST | `run:read`, `run:write` |
| `/runs/{id}/cancel` | POST | `run:write` |
| `/triggers` | GET | `trigger:read`. Webhook addresses need `trigger:write` |
| `/connection-bindings`, `/connection-bindings/{path...}` | GET, PUT, DELETE | `connection:*` |
| `/variable-values`, `/variable-values/{path...}` | GET, PUT, DELETE | `variable:*` |
| `/tenants/{t}/worker-credentials`, `/{id}` | GET, POST, DELETE | `worker:*` |
| `/tenants/{t}/workers` | GET | `worker:read` |
| `/hooks/{token}` | POST | Public, rate limited |
| `/worker/*` | | Worker credential |
| `/metrics` | GET | `instance:read` |

## CLI

| Command | Does |
| --- | --- |
| `platform init` | Writes a starter tenant repository |
| `platform build` | Builds the bundle and prints what it contains |
| `platform deploy --tenant <slug> --workspace <slug>` | Builds, uploads and activates |
| `platform run <script> --input <json>` | Runs one script on this machine, with bindings from a local file |
| `platform runs --tenant <slug> --workspace <slug>` | Lists recent runs. With a run ID, shows it and its logs |

## Tests

| Area | Test |
| --- | --- |
| Queue | Retry with backoff, delay, priority, timeout, cancel, group limits, heartbeat reclaim, dead letters |
| Build | The example repository builds to the expected manifests. An invalid definition fails with the field named |
| Deploy | Atomic activation. Core range refused. Missing binding refused by name. Rollback. Unchanged resources untouched. Removed resources deleted |
| Runs | Manual, schedule and webhook each produce a run with input, output, logs and bundle version |
| Pinning | A run started before a deploy finishes on the old bundle |
| Worker | Heartbeat loss leads to retry. Cancellation reaches the script. Output that breaks the schema fails the run. Undeclared secret access is refused |
| Protocol | A credential for tenant A cannot claim or read anything of tenant B. A workspace-scoped credential is confined to its workspace |
| Limits | Workspace and script concurrency limits hold. Two workspaces share a worker fairly |
| Managed workers | Started on demand, one per tenant, exit when idle. The child's environment holds no instance secrets |
| Secrets | Values reach only a run in the same workspace that declared them, and never appear in logs, run records or audit entries |
| Webhooks | Wrong token is 404. Rate limit applies |
| Alerts | A final failure posts the notification and starts the handler script |
| Existing guards | Every route declares access. Every change by a principal is audited. License and migration checks pass |

## Check against the master spec

To be completed when the build is verified.

## Proposed deviations

None. Two interpretations are recorded under Findings: the optional workspace in an authored manifest, and which run starts are audited.
