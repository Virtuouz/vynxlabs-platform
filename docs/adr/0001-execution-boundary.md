# Decision 0001: the execution boundary

Status: **accepted** by the owner, 2026-11-14. See "Owner's decisions" at the end.
Date: 2026-11-14.
Prompted by: milestone 6 planning (S6, schemas from zod in console code).

## Summary

The platform began with one trust model: *everyone who writes code works for the operator.* Phase 7 broke that assumption without replacing it. Client developers can now hold `code:write` and write code in the console, and end users reach that code through apps. Milestone 2 fixed the sharpest consequence, scripts running inside a process that held the instance's secrets. But the old assumption still shapes how new features get designed. S6 is the latest example: it would have imported tenant code inside the control plane to read its schema.

This record proposes two rules that put the boundary where the platform now needs it:

1. **The control plane never executes tenant code.** It stores, compiles, validates and orchestrates code. Executing it is always a task for the tenant's execution context.
2. **The control plane does not reach destinations a tenant chooses, except for a short, named list,** each item behind an egress guard. Calls to a tenant's systems are made from the tenant's execution context, which is where the tenant's network position and trust already sit.

It also proposes the mechanism that makes the first rule cheap to follow: **the worker protocol carries tasks of several kinds**, not only script runs. A feature that needs to look inside tenant code, or talk to a tenant's system, adds a task kind instead of a path through the control plane.

## Context

### The original model

The master spec's trust model, which `SECURITY.md` still states for apps on the console's address: "everyone who writes code works for the operator." Under that model, code running anywhere, including the control plane's own process, cost nothing. The early design follows from it:
- Managed workers ran as children of the control plane, as the same user, with the same view of the machine.
- Scripts ran inside the worker process, beside the worker credential.
- Tenant apps were served from the console's own address.

### What changed

- **Phase 7, console authoring:** a tenant's own members can hold `code:write` and write scripts, connectors and trigger sources in the browser. Deploying them runs them.
- **Phase 6–8, end users and apps:** people outside the operator, and outside the tenant's staff, start that code from apps.
- **The agency model:** client developers are expected to work in their own tenants.

Each change was sound. Together they moved who writes code from "the operator" to "anyone the tenant trusts", and the tenant's trust is not the instance's.

### What milestone 2 fixed, and what it didn't

Fixed:
- Each script attempt runs in a process of its own, with no worker credential.
- Managed workers run as `vxrun`, which can read neither the control plane's environment (`MASTER_KEY`, `DATABASE_URL`) nor its memory, nor signal it.
- Where the container can't switch users, tenants whose code is written outside the operator get no managed worker.

Not fixed:
- **The rule itself.** Nothing stops the next feature from executing tenant code in the control plane. S6 would have done so in a `worker_thread`, which shares the control plane's process, environment and memory.
- **Network position.** A managed worker, even as `vxrun`, shares the control plane's network, so a script can reach whatever the control plane can: the Postgres port, the object store, internal services, and a cloud metadata endpoint.

## Decision

### Rule 1: the control plane never executes tenant code

**Tenant code:** anything a tenant, or anyone acting in a tenant, wrote and the platform could run as a program. That is:
- scripts, connectors and trigger sources, from a repository or the console;
- the code of tenant apps;
- anything imported by them.

**Not code** (data, which the control plane handles freely):
- manifests;
- JSON Schemas;
- table and policy definitions;
- interface definitions made in the App Builder;
- CEL expressions.

**CEL is the deliberate exception that proves the rule.** It is a language with no I/O, no unbounded loops and no access to its host. The control plane evaluates it with an interpreter, in a thread with memory, time and stack limits (`kernel/flows/expressions.ts`). Evaluating a CEL expression is reading data, not running a program. That is why CEL was chosen for flows and filters, and it stays the answer whenever the control plane must compute something a tenant wrote.

**Compiling is not executing.** `packages/compose` runs esbuild over console code, with imports locked down to the SDK and `node:` modules. esbuild parses and writes; it runs nothing the tenant wrote. That stays in the control plane.

### Rule 2: the control plane does not reach destinations a tenant chooses, except where named

**A destination a tenant chooses:** a host, URL or connection string that a tenant's configuration supplies.

Calls to such destinations belong in the tenant's execution context, for two reasons:
- **Network position.** A worker in the client's network is how the platform reaches systems the instance cannot, and how the instance avoids reaching the client's internal network on its own.
- **Request forgery.** A control plane that fetches tenant-chosen URLs can be pointed at its own internal network. The term for this is server-side request forgery.

Where the control plane must make such a call, because it is the platform's own work, it is named in the inventory below and goes through an **egress guard**. The guard resolves the host, refuses loopback, private, link-local and metadata addresses unless the operator allows them, refuses redirects to those, and sets a time limit.

### The mechanism: the worker protocol carries tasks

Today a claimed job is always a script run. The proposal is that a job has a **kind**:

| Kind | What it does | Returns | Who asks for it |
| --- | --- | --- | --- |
| `run` | A script attempt, as today | Output or error, logs | Runs, steps, triggers |
| `describe` | Imports the code and reports the shape of its exports: zod `input`/`output` as JSON Schema; a connector's config schema | JSON | Saving console code (S6); later, deploying from the console |
| `test-connection` | Builds a bound connection's client and calls its health check | Status, latency, the error | The connection wizard (roadmap P2-2, P2-7) |
| `deliver` | Sends a platform notification through a tenant's connection | Status | Failure alerts (`kernel/execution/alerts.ts`) |
| `preview` (later) | Runs a draft with stubbed side effects, for the editors | Output | The flow and script editors (P2-1) |

**What every kind shares:**
- the same claim;
- the same process per attempt, user, memory cap and time limit (milestone 2);
- the same credential scoping (the task's tenant and workspace only);
- the same calls back, narrowed to what the kind needs. A `describe` task gets none at all.

When stronger isolation comes (P3-1, a gVisor or Firecracker worker), every kind gets it at once.

**Compatibility:**
- A worker says which kinds it takes when it claims (`kinds: ["run", "describe"]`). A worker that says nothing is given `run` only.
- An old worker keeps working; a task waits for a worker that can take it, and the platform says so, as it already does for a pool with no worker.

**Storage:** tasks are not runs. They don't belong in the runs list, retention's run counts, or the run event stream's run events. They get a small table of their own (`task`: id, tenant, workspace, kind, request, status, result, created, finished), on the same queue mechanism, with a short retention of their own.

### How S6's derivation works under this decision

1. A member saves a console script. The control plane compiles it (allowed), stores the draft, and queues a `describe` task with the compiled code's key.
2. The tenant's worker claims it. Managed workers already start on demand when work is queued, which takes a second or two from cold. The worker imports the code in its per-attempt process, finds the `input` and `output` exports, and calls `z.toJSONSchema` (zod ships with the SDK it bundles). It returns plain JSON.
3. The control plane checks that the result is a valid JSON Schema of bounded size. That is data, so it is the control plane's to check. It stores the result on the draft and announces it on the run event stream as a task event.
4. The console shows "Reading the input from your code…" until the event arrives, then draws the schema with SchemaForm.
   - With no `input` export, the field editor under Settings is used.
   - With no worker reachable, the last schema stays, with a note that it will update once a worker is available.

The CLI is unchanged. `platform build` already does the same on the developer's own machine, which is that developer's execution context.

## Inventory: where the control plane touches tenant code or tenant-chosen destinations today

Verified in the code, 2026-11-14.

| Where | What happens | Verdict | Change |
| --- | --- | --- | --- |
| Script, connector and trigger source runs | On workers, a process per attempt, `vxrun` for managed workers (milestone 2) | Complies | None |
| CEL in flows, event filters and trigger tags (`kernel/flows/expressions.ts`) | Interpreted in a thread with memory, time and stack limits | Complies: CEL is data | None. Keep CEL the only language the control plane evaluates |
| Compiling console code (`packages/compose`) | esbuild, imports locked to the SDK and `node:` | Complies: compiling isn't executing | None |
| S6 as written: importing console code to read zod schemas | Would run tenant code in a control plane thread | **Would violate Rule 1** | `describe` task |
| Failure alerts to a notify connection (`kernel/execution/alerts.ts:135`) | The control plane builds the tenant's HTTP connection and posts to its URL | **Violates Rule 2** | `deliver` task, or the egress guard as a stopgap |
| Data sources (`kernel/data/sources.ts:114`) | The control plane opens a Postgres connection to a tenant-supplied host to read and write rows for apps | **Violates Rule 2** | Named exception for now (apps read through it in the request path); egress guard. Longer term, a data source can be served through the tenant's worker, as its pool's network decides |
| Data source health checks | Same connection, on a schedule | **Violates Rule 2** | Behind the egress guard, with the above |
| Git sync (`kernel/git.ts:144`) | Fetches and pushes to a tenant-supplied remote | Rule 2 | Named exception: it is the platform's own work on the tenant's repository. Egress guard; HTTPS only |
| SSO metadata (`kernel/sso/metadata.ts:57`) | Fetches a tenant-supplied OIDC or SAML metadata URL | Rule 2 | Named exception: sign-in is the control plane's job. Egress guard |
| Domain check (`routes/apps.ts:786`) | Asks a tenant's registered hostname for a fixed address on this instance | Rule 2, tightly bounded | Named exception; already one fixed path, answer compared and never shown. Egress guard |
| OAuth connection token endpoints (`kernel/execution/oauth.ts`), added 2026-11-15 | Exchanges an authorization code, and refreshes tokens, at the token address an OAuth connection's settings give | Rule 2 | Named exception, by amendment below. Egress guard |
| Tenant code apps on the console's address (no `APPS_URL`) | An app's code runs in the browser with the viewer's console session | **The same old assumption, in the browser** | Make a separate app address the default for new instances; keep the shared address only by explicit choice, with the warning `SECURITY.md` already gives |
| Managed workers' network | `vxrun` processes share the control plane's network | **Rule 1's context is too close to the control plane** | See below |

## Managed workers and the network

Moving to `vxrun` keeps a script out of the control plane's process. It does not keep it out of the control plane's network. Three options, in increasing cost and strength:

1. **Egress rules inside the container.** Rules on `vxrun`'s uid (`iptables -m owner`) refuse the database, the object store, metadata addresses and private ranges.
   - Cheap where the container may set them, but it needs `NET_ADMIN` and doesn't fit every runtime.
2. **A worker host beside the control plane.** Managed workers run in a separate container started from the standalone worker image, with its own network that can reach only the control plane's public address. The control plane asks a small "worker host" service to start one, instead of spawning a child.
   - This is the honest version of "tenant execution context", and it keeps the on-demand behavior.
3. **Standalone workers only, for tenants whose code is written outside the operator.** Milestone 2's refusal rule already does this where users can't be switched; it could be the rule everywhere.

**Recommendation:** option 2 for the shared instance, with option 3 as the fallback where a worker host isn't deployed. Option 1 can be added in the image as defense in depth where the runtime allows it.

## Consequences

**Gains:**
- One rule decides every future feature that needs to look inside code or reach a tenant's system: it's a task kind.
- S6's derivation, connection tests (P2-2, P2-7), alert delivery and later editor previews share one isolated path.
- Stronger sandboxing later is one change, not many.
- The security model in `SECURITY.md` can state the boundary plainly instead of listing exceptions.

**Costs:**
- **Latency:** a `describe` after a save waits for a worker. A warm worker answers in well under a second; a cold managed worker in a second or two. The console shows progress through the stream that already exists.
- **Availability:** a tenant with no worker reachable gets no derived schema and no connection test until one is. This is the same dependency runs already have, and the console says so.
- **Work:**
  - task kinds in the protocol and the worker;
  - a `task` table and route;
  - the egress guard;
  - moving alert delivery onto a task;
  - the worker-host question for managed workers.

**Unchanged:**
- the worker protocol for runs;
- the CLI;
- CEL;
- compilation;
- every existing route's behavior.

## Alternatives considered

- **Evaluate in the author's browser.** A sandboxed iframe loads the compiled module and reports its schema.
  - It keeps code off the control plane and needs no worker, which mirrors the CLI.
  - Rejected as the primary path: a draft saved through the API, or by an agent over MCP, gets no schema, and it puts a second execution environment in the platform that has nothing to do with the tenant's.
  - It could still serve as a fast preview while the `describe` task runs.
- **A `worker_thread` on the control plane (S6 as written).** Rejected: it shares the process's environment and memory, which undoes milestone 2.
- **Static analysis of the zod source.** Rejected: it only works for a subset of zod, breaks on helpers and imports, and gives different answers from the CLI.
- **No derivation; a field editor for the schema.** Still worth having for scripts that don't export `input`, but not a replacement for reading the code the author wrote.

## Proposed plan

Insert an **execution plane** milestone before the rest of milestone 6. Milestones 6 and 7 move one place down.

1. **Rule and guard:**
   - state both rules in `SECURITY.md` and the master spec's trust model;
   - add the egress guard (`kernel/egress.ts`) and put the named exceptions behind it: SSO metadata, git, data sources and their health checks, and the domain check.
2. **Task kinds:**
   - `kind` on a claimed job, and `kinds` on the claim;
   - a `task` table and routes `POST /worker/tasks/:id/complete|fail`;
   - the worker's runner takes a task with its kind's narrowed context.
3. **`describe`:** console script saves queue it; the result is validated, stored on the draft and announced on the stream; the console shows it.
4. **`deliver`:** failure alerts through a notify connection move onto a task.
5. **`test-connection`:** the task, with a minimal "Test" button on a binding. The full wizard stays P2-2.
6. **Managed worker network:** decide between options 1–3 above. If option 2, design the worker host as its own item, since it changes deployment.

Then milestone 6 as planned (SchemaForm, triggers, app actions), with S6's derivation built on `describe`.

## Owner's decisions (2026-11-14)

| Question | Decision |
| --- | --- |
| The rules | Both adopted as stated |
| Data sources | Stay on the control plane for now, behind the egress guard, as a named exception. Serving them through the tenant's worker is a later item |
| Managed workers' network | Option 2: a worker host container beside the control plane, on a network of its own. Option 3 is the fallback where no worker host is deployed: in-process managed workers only for tenants whose code only the operator writes. Option 1 is added in the worker host image as defense in depth where its runtime allows |
| Apps' address | A separate app address is the default. Code apps are served on the console's address only when the operator says so explicitly |

## Amendment: OAuth connection token endpoints (2026-11-15)

Phase 10 adds OAuth 2.0 connections (roadmap P2-9). The owner decided the control plane exchanges their codes and refreshes their tokens, and the token endpoints join the named list. The reasons:
- **The refresh token must not reach a worker.** It outlives every run and can mint access for as long as the provider allows. Kept on the control plane, sealed with the tenant's key, a worker is handed only the access token, which lasts minutes or hours.
- **A refresh must happen once.** Providers that rotate refresh tokens invalidate the old one on use, so two workers refreshing at once would leave the connection broken. The control plane refreshes under a lock per connection.
- **The destination is narrow.** It is the one token address the connection's settings name, called with a fixed form body, and its answer is read only for tokens and an error code. It goes through the egress guard like every other named exception.

The authorization itself happens in the member's browser, and calling the API with the token is still a worker's work.

