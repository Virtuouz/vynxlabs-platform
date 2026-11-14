# 6. Product evolution strategy

## 6.1 Target product identity

> **The platform an agency uses to build, run and hand over its clients' internal software, and that a client's own developers can work in without the agency.**

A mature version is judged by two things:

1. **The loop from idea to observable, reusable automation is short and stays in one place.** A developer writes a script, runs it with a form, ships it, and sees it run. When it fails, they go from the failure to the line of code and back to a retry without searching. A staff member gets a button for it in an app.
2. **Running many clients is calm.**
   - Each tenant's history is bounded, searchable and live.
   - Failures reach a person.
   - A tenant can be lifted out whole.
   - Nothing a client author writes can reach another tenant or the instance's keys.

Three things it should keep being, because they are its strengths and its differentiators:

- **Code first, with the console as a peer.** The repository and the console produce the same bundles. Every console capability round-trips through the manifest.
- **One kernel.** One resource model, one run record, one audit stream, one permission check. New capabilities extend these, never fork them.
- **Owned by the client.** Self-hostable, exportable, permissive license, no call home. This rules out some conveniences, such as a hosted AI, a license server or a central connector hub, and that is a feature.

## 6.2 Principles

These decide design disputes, alongside the twelve principles in `docs/master-spec.md`.

| Area | Principle | In practice |
| --- | --- | --- |
| Developer ergonomics | **Every reference is a link, every identifier is copyable** | Run → script at its version → trigger → connection binding → bundle. No plain-text pointers |
| | **Forms from schemas, JSON on request** | One SchemaForm everywhere an input is entered. The JSON toggle is the escape hatch |
| | **Test where you edit** | Script, flow, connection and expression each have an in-place test with real data. No page change |
| Operational visibility | **Live by default** | Operational screens subscribe to one stream. Polling only as a fallback |
| | **Lead with the reason** | A failed row shows its error; a waiting row shows what it waits for |
| | **Bounded history, findable history** | Retention by policy; search by ID, path, tag and error text |
| Density | **Tables for operations, pages for work, inspectors for a peek** | Dense rows for collections. A full page for a run, a flow or a connection. Inspectors never hold the only copy of a detail view |
| Navigation | **Create where you see** | Every list has its own New. "All resources" is an advanced view |
| | **Keep context** | Acting on something (approve, retry, pause) doesn't leave the screen. Results open beside it |
| Progressive disclosure | **Simple default, the whole model one click away** | Schedule form → preview and schema form, advanced cron and overlap behind "More" |
| Consistency | **One primitive per job** | One list (`CollectionView`), one state vocabulary (`StatePill` on one enum), one load-state wrapper, one SchemaForm |
| Discoverability | **⌘K knows everything you can see** | Entities, actions and recent items |
| Extensibility | **New capability = new kind or new field** | Prefer a manifest field (step `retry`, run `tags`) over a new subsystem. The core uses the same extension points (spec principle 9) |
| Reliability | **What a status says is true** | "Timed out" means stopped. "Succeeded" means its logs arrived. "Running" is never shown for "waiting for a person" |
| Performance | **Cost scales with work, not with tenants** | No per-workspace scans per tick; caches that survive replicas or are safe without them |

## 6.3 Feature strategy

The [roadmap](07-roadmap.md) follows four moves, in order.

1. **Make the foundations honest (P0).**
   - Real timeouts and worker isolation.
   - Retention.
   - Logs that are never dropped silently.
   - An audit log free of noise.
   - One state vocabulary.

   These are cheap next to their risk, and later features rely on them. A retry button is worthless if the "failed" run is still running.
2. **Close the operational loop (P1).**
   - Full run page.
   - Retry and re-run with edit.
   - Runs search, paging and tags.
   - Live stream.
   - ⌘K over entities.
   - Alerts in the console.
   - Queue panel.

   This is where the platform is furthest behind the reference products, and where agency staff spend their day.
3. **Close the build loop (P1/P2).**
   - SchemaForm everywhere, with the schema derived from zod in console code.
   - Test panels in the flow editor and the connection wizard.
   - Triggers created from Triggers.
   - App Builder actions.

   These are the bridges that turn separate tools into one platform.
4. **Extend reach (P2/P3).**
   - `platform pull` and remote `platform run`.
   - Approve from a link.
   - OAuth connections.
   - Drift view.
   - Result renderers.
   - OTel.
   - Then multi-language workers, sandboxing and an operator-configured AI assistant.

## 6.4 Architectural direction

### Readiness

| Area | Ready? | Why |
| --- | --- | --- |
| Resource model, deploy, promotion | **Yes** | Adding a field to a kind flows through drafts, bundles, git, export and MCP |
| Authorization and audit | **Yes** | One `check()` and an enforced `mutate()` cover new routes automatically |
| Flow engine | **Mostly** | Retry-from-step needs a "resume from node" entry into `advance()`. State is already per step |
| Execution runtime | **No** | No hard timeout; managed workers share the control plane's uid. This must change before client developers get `code:write` widely, and before more languages |
| Live data | **No** | No push channel. Polling is spread across four screens |
| Retention | **No** | No policy, and the audit table can't be pruned by design |
| Console data layer | **Weak** | `useLoad` has no cache or invalidation, so every new live or bulk feature re-implements state |
| Runs query | **Weak** | `/activity` filters by status, kind and window only. Search and tags need columns and indexes |

### Shared primitives

The roadmap should build on these and avoid parallel versions of them.

| Primitive | Exists as | Make it the one way to… |
| --- | --- | --- |
| **Resource** (manifest + version) | `resource`, `resource_version` | Define anything: steps' retry, run tags spec, alert rules, retention policy |
| **Run record** | `run`, `flow_run`, `step_run` | Represent every execution, including connection tests and trigger-source polls, so they get logs, status and retention for free |
| **Run event** | (new) `NOTIFY run_events` with payload `{workspace, kind, id, status}` | Drive every live view, alerts and app hooks (`useRun`) |
| **Schema** | JSON Schema from zod | Validate input, draw forms (SchemaForm), describe MCP tools, describe app actions |
| **Binding** | `binding` | Grant who may run, approve, promote or receive alerts. No new ACLs |
| **Trigger** | trigger kinds + `trigger_state` + `trigger_pause` | Start anything, including a flow from a standalone schedule. One "New trigger" form per kind |
| **Approval** | `step_run` with approvers | Human decisions beyond flows: request promotion, approve from a link |
| **Collection view** | `kit/CollectionView.tsx` | List anything in the console |
| **StatePill + state enum** | `kit/status.tsx` | Show any lifecycle state |

### Changes recommended, and only these

1. **Process per attempt in the worker** (child process or `worker_threads` with `resourceLimits`) that is killed at the timeout. Managed workers run as a separate unprivileged user, or, where the container can't switch users, are refused for tenants whose `code:write` is held outside the operator. See [spec S1](specs/S1-execution-isolation.md).
2. **Run event stream**: Postgres `LISTEN/NOTIFY` → one SSE endpoint per workspace. See [spec S5](specs/S5-run-event-stream.md).
3. **Retention job** with a per-tenant policy; audit partitioned by month so old partitions can be detached and archived without UPDATE or DELETE. See [spec S2](specs/S2-retention.md).
4. **A query cache in the console** (TanStack Query; phase 7 already lists it as not built) behind the existing `api` client, so invalidation follows writes and the stream.
5. **Runs index**: `tags text[]`, an error summary column, and a GIN or trigram index for search on `run` and `flow_run`.

Not recommended: a new orchestration engine, a separate apps runtime, an ORM, microservices, or a plugin marketplace.
