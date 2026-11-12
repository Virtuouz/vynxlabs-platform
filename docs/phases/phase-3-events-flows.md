# Phase 3: events and flows

Status: built and verified locally
Last updated: 2026-11-11

Phase 3 adds orchestration: an event bus, and flows, which are declarative graphs of steps that the platform runs durably.

**Exit criterion:** a multi-step flow survives a restart and is visible as a graph.

## Spec sections implemented

| Master spec section | What phase 3 delivers |
| --- | --- |
| Execution: events, triggers | The event bus, persisted events, event triggers, platform events |
| Flows | The graph model, several triggers per flow, control flow, data wiring with expressions, durability, the read-only graph |
| Extensibility: step | The built-in nodes. Custom nodes from a bundle are not in this phase |
| Observability and audit: runs | Flow runs with step-level detail |

Not in this phase: visual editing of flows, the larger node pack, custom nodes shipped in a bundle, events shared between workspaces, ETL staging tables (they need the data phase).

## Owner decisions

| Area | Decision |
| --- | --- |
| Flow engine | Built in-house on the queue |
| Flow authoring | Explicit nodes and edges |
| Expression language | CEL, after a spike against JSONata |

## Expression language spike

CEL and JSONata were run against the same wiring cases and the same hostile inputs.

- Both handled the wiring. JSONata is more compact at reshaping data. CEL is stricter: a field or step that does not exist is an error, where JSONata silently gives `undefined`.
- Neither is safe to evaluate directly in the control plane. Three nested passes over a 3,000-item list blocks the process in both.
- In a worker thread with a 250 ms limit and a memory cap, every hostile CEL expression was stopped cleanly, at about 0.08 ms of overhead per evaluation. JSONata crashed the whole process from inside that thread by building a 200 MB string.

So flows use CEL, through `@marcbachmann/cel-js` (MIT, no dependencies), always inside that sandbox. Numbers from step outputs are doubles, as in other CEL implementations that read JSON, so arithmetic is written with `1.0` or with `int(...)`. The error for getting this wrong says so. An optional field is written with `has(...)`. There are no custom functions: anything CEL cannot express becomes a code step, which keeps the language exactly the published one.

## Findings

- **A trigger resource starts scripts. A flow carries its own triggers.** The spec puts trigger entry nodes inside the flow, so a flow needs no separate trigger resource, and the standalone `trigger` kind stays script-only. It gains the `event` type.
- **A platform event is stored only when something subscribes to it.** Subscriptions are deployed resources, so they exist whether or not anything is running, and nothing can be missed. Storing an event for every run of every script that nobody listens to would only add writes.
- **Outputs too large for the run row are not visible to expressions.** They are kept in file storage under the existing 256 KB rule, and an expression sees a reference in their place. This is the spec's rule that large datasets never travel through flow state.
- **The engine keeps no queue of its own.** The plan had advancing requested through queue jobs. Building it showed that the tables already say everything: a flow run with something to do can be found by a query. So advancing is asked for directly where that is quick, and a sweep finds anything that was missed. Code steps are still ordinary jobs on the queue.
- **A node that two paths lead into, and is not a join, runs once**, when the first path arrives. To wait for several paths, use a join.
- **The graph in a flow run's view is the flow as it is deployed now.** A run that started on an older bundle is drawn on the current graph. Its steps and statuses are its own.
- **A code step that fails inside a flow does not alert by itself.** The flow decides: an error path handles it, or the flow fails and the workspace's failure alert fires once.

## Events

- The `event` kind declares a named event and a JSON Schema for its payload. The event's name is the resource's path.
- Publishing validates the payload, stores the event, and starts a run for each subscriber, all in one transaction. A subscriber gets exactly one run per event.
- Three ways to publish: `ctx.events.publish(name, payload)` in a script, `POST …/events`, and the platform itself.
- Platform events: `platform/run-succeeded`, `platform/run-failed`, `platform/flow-run-finished`, `platform/deployment-created`.
- An event subscription may have a CEL `filter` over `event.name` and `event.payload`.
- Each event carries the depth of its chain of causes. Past 10, it is stored but starts nothing, and that is logged.

## Flow manifest

The `flow` kind. Its body:

- `description`
- `nodes`: a map from node ID to a node.
- `edges`: a list of `{ from, to, output, error }`.

| Node type | Fields | What it does |
| --- | --- | --- |
| `trigger` | `trigger`: manual, schedule (`cron`, `timezone`), webhook, or event (`event`, `filter`) | An entry point. Its output is the trigger's input |
| `script` | `script`, `input` | Runs a script as a code step. Its output is the script's output |
| `set` | `values`: name to expression | Computes values. Its output is the object of results |
| `branch` | `cases`: list of `{ name, when }` | Takes the first case whose condition is true, or `otherwise` |
| `foreach` | `items`, `script` or `flow`, `input`, `concurrency` | Runs the script or sub-flow once per item. Its output is the list of results, in order |
| `join` | | Waits for every incoming path that can still arrive |
| `delay` | `seconds` | Waits |
| `approval` | `title`, `detail`, `timeoutSeconds` | Pauses for a person. Approving continues. Rejecting or timing out fails the step |
| `subflow` | `flow`, `input` | Runs another flow from its manual trigger and waits for it |
| `fail` | `message` | Fails the step on purpose |

- `input`, `items`, `when`, `detail`, `message` and each of `values` are CEL expressions.
- An expression can read `trigger` (the trigger's input), `steps.<node>.output`, and inside a `foreach`, `item` and `index`.
- An edge with `output` leaves a `branch` by that case. An edge with `error: true` is the node's error path.
- Several edges leaving a node run in parallel.

### Rules the build and the control plane both check

- Every edge names nodes that exist. A branch edge names a case that exists.
- Every node can be reached from at least one trigger. A trigger has no incoming edges.
- No cycles. Repetition is `foreach`.
- A `join` has at least two incoming edges.
- Every expression parses.
- Every script, flow and event referred to exists in the bundle.
- A sub-flow has a manual trigger, and flows do not contain each other in a loop.

### Layout

Node positions are kept in their own table, keyed by flow. They are not part of the manifest, so moving a node changes no version and no behaviour. A flow with no saved positions is laid out automatically.

## Engine

- A **flow run** is one trigger firing. Only the nodes reachable from that trigger take part.
- A **step run** is one node's execution within a flow run, or one item of a `foreach`.
- **Advancing** a flow run is one function, run in one transaction under a lock per flow run: find the nodes that are ready, start them, record results, repeat until nothing more can move.
- A node is ready when one of its incoming edges has been taken. A `join` is ready when every incoming edge is settled and at least one was taken. A node whose incoming edges are all dead is skipped, and that passes downstream.
- A failed step takes its error path if it has one. Otherwise the flow run fails and its other steps are cancelled.
- Advancing is asked for at once when a flow run starts, when a code step's run ends, and when an approval is decided.
- It does not depend on being asked. A sweep, every two seconds, finds every flow run that has something to do: one that just started, one whose step's run has ended, one whose child flow has ended, one whose wait is over. This is what makes a flow run survive a restart. Whatever was lost when the control plane stopped is found by the sweep when it starts again.
- Advancing a flow run twice, or a hundred times, is harmless: it only acts on what the tables say.
- A code step is an ordinary run with a link to its step. Its idempotency key is derived from the flow run, node and item, so starting it twice gives the same run.
- A flow run, and every script it starts, is pinned to the bundle the flow run started on.
- A step that has finished is never started again.

## Schemas

Migrations 0010 onward.

| Table | Purpose |
| --- | --- |
| `event` | Stored events: workspace, name, payload, source, depth, time |
| `flow_run` | Flow, bundle, trigger node, status, input, output, error, parent step for sub-flows |
| `step_run` | Flow run, node, item, status, chosen output, output, error, linked run or child flow run, wake time, decision |
| `run` (extended) | A link to the flow run and step the run belongs to |
| `trigger_state` (changed) | One row per trigger node, so a flow can have several. Targets a script or a flow. Adds the event name and filter |
| `flow_layout` | Node positions per flow |

Built-in roles gain the permission kinds `flow`, `flow_run`, `event` and `approval`.

## API surface

Under `/api/v1/tenants/{t}/workspaces/{w}` unless noted.

| Route | Methods | Permission |
| --- | --- | --- |
| `/flows`, `/flows/{path...}` | GET | `flow:read` |
| `/flow-layouts/{path...}` | PUT | `flow:write` |
| `/flow-runs`, `/flow-runs/{id}` | GET, POST | `flow_run:read`, `flow_run:write` |
| `/flow-runs/{id}/cancel` | POST | `flow_run:write` |
| `/approvals` | GET | `approval:read` |
| `/flow-runs/{id}/approvals/{node}` | POST | `approval:write` |
| `/events` | GET, POST | `event:read`, `event:write` |
| `/tenants/{t}/approvals` | GET | Lists what the caller may decide |
| `/worker/runs/{id}/events` | POST | Worker credential. An addition to the worker protocol |

## SDK

- `defineFlow({ path, nodes, edges })`, with a constructor per node type: `trigger.manual()`, `trigger.schedule(…)`, `trigger.webhook()`, `trigger.event(…)`, `step.script(…)`, `step.set(…)`, `step.branch(…)`, `step.foreach(…)`, `step.join()`, `step.delay(…)`, `step.approval(…)`, `step.subflow(…)`, `step.fail(…)`.
- `defineEvent({ path, payload })`.
- `defineEventTrigger({ path, event, script, filter })`.
- `ctx.events.publish(event, payload)` in a script. A script declares the events it publishes.

## Console

- A Flows tab: the list, and a graph per flow. Nodes can be dragged to arrange them.
- A flow run view: the graph with each step's status, and the selected step's output, error and link to its run.
- An Approvals page per tenant.
- An Events tab.

## Tests

| Area | Test |
| --- | --- |
| Expressions | The spike's wiring cases and hostile cases, permanently |
| Events | Publish from a script, the API and the platform. Schema enforced. One run per subscriber per event. A rolled-back publish starts nothing. Filters. The depth limit |
| Build | The example flow builds to the expected manifest. Each kind of mistake names the flow, node and field |
| Engine | Linear, branch, parallel with join, foreach with a limit, delay, sub-flow, error path, failure without an error path, `set`, `fail` |
| Durability | The engine is stopped between steps and during a step. The flow run completes afterwards and no step ran twice |
| Several triggers | Two triggers in one flow each walk only their own branch |
| Approvals | Waits. Approve continues. Reject and timeout fail the step. Only permitted principals decide. Decisions are audited |
| Pinning | A flow run started before a deploy finishes on its own bundle |
| Layout | Saving positions changes no resource version |
| Isolation | Another tenant sees none of it |
| Existing guards | Every route declares access. Every change by a principal is audited |

## Check against the master spec

Checked on 2026-11-11 against the build on the `phase-3-events-flows` branch.

### Guiding principles

| Principle | Result |
| --- | --- |
| 1. One platform, one experience | Met. Flow runs, approvals and events use the same identity, permission check, audit path, API and console |
| 2. Everything is a resource | Met. Flows and events are resources with the common envelope |
| 3. Code first, git as the source of truth | Met. Flows are defined in the repository and arrive through a deploy |
| 4. Language-neutral core | Met. A flow is data: nodes, edges and CEL expressions. The engine tests run flows written as plain JSON, with no SDK |
| 5. Same software everywhere | Met. Nothing was added to the deployment |
| 6. Minimal footprint | Met. Flow state lives in Postgres. No container was added |
| 7. No central dependency | Met. The expression library makes no outbound call |
| 8. Tenant portability | Not weakened. Every new row carries the tenant ID |
| 9. The core uses its own SDK | Met for triggers: a flow's triggers go through the same registration as trigger resources. The built-in nodes are not yet behind a published step interface, because custom nodes are not in this phase |
| 10. Reuse libraries and engines, not applications | Met. cel-js and dagre are libraries |
| 11. Keep the end-user version possible | Met. The manifest is the graph, positions are stored apart, and every node is described by JSON Schema, so an editor can read and write flows |
| 12. Kernel before features | Met. No visual editor, no node pack |

### Ownership promise

Not weakened by anything in this phase. Webhook tokens of flow triggers are encrypted with the tenant's key.

### Verification

| Check | Result |
| --- | --- |
| Every test on Postgres 16 and 18 | Passed |
| The example flow, built with the SDK and deployed by the CLI: event in, check, approval for a large order, ERP import, refusal with a reason | Passed, in `packages/cli/src/example.test.ts` |
| **Exit criterion on the single-host stack.** A flow of two slow steps with a delay between them. The control plane container was restarted during the delay, and again while the second step was running | Passed. The flow run finished 30 seconds after the second restart. One run per step. The interrupted step's run was retried as attempt 2 |
| The flow is visible as a graph, and the run is drawn on it with each step's status | Passed, in a real browser |
| Dragging a node saves its position, which survives a reload, and the flow's version does not change | Passed |
| Approving on the flow run page, and rejecting from the Approvals page, with the error path then taken | Passed |

### Known gaps

- Custom nodes through the step extension point.
- Visual editing of flows.
- A `foreach` runs at most 1,000 items, and a flow has at most 200 nodes.
- Approvers are whoever holds `approval:write` in the workspace. There are no per-step approver lists.
- Events stay inside their workspace.
- Event, run and flow run retention is not enforced.
- The sweep runs on every replica. It is correct, because advancing is locked per flow run, but with many replicas it is repeated work.

## Proposed deviations

None. The interpretations are listed under Findings.
