# Product evolution and platform maturity assessment

Status: assessment complete, nothing implemented. Written 2026-11-14 against `main` at c247273, after phase 8.

This directory holds the discovery, analysis and plan for turning the platform from a capable set of features into a cohesive, mature developer platform. Its premise is to deepen what exists and connect it, not to replace it or copy the reference products.

| Document | Contents |
| --- | --- |
| [01-architecture.md](01-architecture.md) | Subsystems, a diagram, lifecycles, strengths, 15 limitations with evidence |
| [02-feature-inventory.md](02-feature-inventory.md) | About 60 capabilities with maturity, limitations and opportunities |
| [03-competitive-analysis.md](03-competitive-analysis.md) | Capability matrix against Windmill, Kestra, n8n, Trigger.dev, Temporal, Retool and Appsmith, with every claim cited |
| [04-ux-audit.md](04-ux-audit.md) | Information architecture, density, interaction, consistency, execution contexts, and every route page by page |
| [05-journeys.md](05-journeys.md) | Nine end-to-end journeys walked on a seeded instance: clicks, pages, context switches, dead ends, target journeys |
| [06-strategy.md](06-strategy.md) | Target identity, principles, architectural readiness, shared primitives |
| [07-roadmap.md](07-roadmap.md) | P0–P3 with full fields, quick wins, and a sequencing graph |
| [specs/](specs/) | Implementation-ready specs S1–S8 for the top initiatives |
| [decisions/](decisions/) | Decision records. [0001](decisions/0001-execution-boundary.md): the execution boundary, accepted |

## Evidence labels

- **Verified:** read in the code, cited as `path:line`.
- **Observed:** seen in the running console. An isolated instance was built from `main`, seeded with `examples/fernhill`, and driven with Playwright at 1440 px and 390 px.
- **Inferred:** reasoned from code without being run. Say so before relying on it.
- **Competitor claims:** from official vendor docs, checked 2026-11-14, each with its URL. "Unverified" means the docs didn't confirm it.

## Summary

### 1. What the software is

A self-hostable, multi-tenant foundation on which an agency builds and runs its clients' internal apps, workflows and integrations. Each client is a tenant that can be exported whole.

Everything a tenant builds (scripts, flows, triggers, tables, connections, apps, roles) is a manifest resource in an immutable bundle. A bundle is deployed from a git repository by the CLI or composed from console drafts, and promoted dev → prod unchanged. The rest of the system:
- A Fastify control plane on Postgres (pg-boss queue) and S3.
- Pull workers that can run inside a client's network.
- A durable in-house flow engine with CEL.
- Custom tables with Postgres row-level security for a per-tenant end-user pool.
- An MCP server that turns a caller's bindings into tools.

### 2. What it already does well

- **One resource model and one deploy path.** Drafts, CLI deploys, promotion, clones, export and git sync all move the same objects.
- **Governance that fails closed.** Every route declares its access, and a write without an audit entry cannot commit.
- **Data changes that never lose data.** Retire-not-drop, renames, explicit purge.
- **RLS-backed end-user portals.** Stronger than client-side "current user" filtering in internal-tool builders.
- **Durable, version-pinned flows** with approvals by group, and a failure diagnosis that suggests the next step.
- **A calm, coherent console** after phase 8, with overviews that lead with what needs attention.
- **Multi-tenancy, RBAC, SSO, SCIM and audit as core features under a permissive license.** Every comparable product either gates these behind an enterprise edition or restricts reselling.

### 3. What is incomplete or under-polished

The kernel is mature. Maturity falls off at the **operational surface** and at the **bridges between features**.
- **Runs:**
  - capped at 100 and not searchable;
  - detail only in a narrow inspector;
  - no re-run with edited input;
  - **no retry for flows**.
- **Timeouts** don't stop code, and scripts share a process with the worker's credential.
- **Nothing is ever pruned.** Log flushes can be silently dropped.
- **Navigation writes noise into the audit log:** every workspace switch adds an append-only row.
- **Gaps between features:**
  - The App Builder can't run a script or a flow.
  - Connections can't be tested.
  - Triggers can't be created from the Triggers screen.
- **Status:** three status vocabularies, four list implementations, and polling instead of live updates.

### 4. Where the UX creates avoidable friction

These come from the journeys in [05-journeys.md](05-journeys.md).
- **Debugging.** The failed-runs chip opens an unfiltered list. The first matching row was the successful retry, not the failure. From a failure there is no link to its code.
- **Connecting an API** takes about 14 clicks across three areas, and there's no test before the first failed run.
- **Scheduling.** Creating a schedule starts in "All resources". The form takes free-text cron and JSON input, and shows no preview.
- **Search.** ⌘K can't find a script by name.
- **Input.** JSON is required where the platform already knows the schema.

### 5. Which capabilities from comparable platforms would help

Ranked in [03-competitive-analysis.md §3.3](03-competitive-analysis.md#33-patterns-worth-adopting).
- A full run page with replay and retry from a step (Trigger.dev, n8n, Kestra, Windmill).
- Buttons in apps that run backend logic, with confirmation (Retool).
- An entity-aware ⌘K (n8n, Windmill, Retool).
- Run tags and search (Trigger.dev, Temporal).
- Retention by default (n8n, Temporal).
- Schedule previews and overlap policy (Temporal).
- Expression debugging against real output (Kestra).

Deliberately not recommended: many languages, a connector catalog race, a general drag-and-drop builder, an in-browser debugger.

### 6. What the mature architecture looks like

The same kernel, plus five changes ([06-strategy.md](06-strategy.md)):
1. a killable process per run attempt;
2. a run event stream (Postgres NOTIFY → SSE);
3. a retention job with monthly audit partitions;
4. a query cache in the console;
5. run tags and search indexes.

Everything else is new fields on existing kinds and new views over existing records. Not recommended: no new engine, no new runtime, no microservices.

### 7. What to do first

1. **Quick wins:**
   - stop dropping logs;
   - stop auditing preferences;
   - add a 404 page and slug URLs;
   - link failures to their filter and their code.
2. **P0:** hard timeouts and worker isolation (S1), then retention (S2), then one state vocabulary.
3. **P1, the operational loop:** query cache, then the run stream (S5), the full run page with re-run and flow retry (S3), and runs search, tags and paging (S4).
4. **P1, the build loop:** SchemaForm everywhere with schemas from zod (S6), then triggers created from Triggers with previews, and App Builder actions (S7). Then ⌘K over entities (S8), alerts in the console, and a queue panel.

### 8. How to implement without undermining what works

Each spec states its acceptance criteria and dependencies, and keeps existing contracts:
- **The worker protocol is unchanged** (S1 is internal to the worker).
- **Manifests change only by adding optional fields**, with regenerated schemas checked in CI.
- **Migrations are additive**, apart from S2's audit partitioning, which is copy-then-swap with append-only triggers kept.
- **New routes go through the same `config.access` and `mutate()` guards.** The one exception, non-audited preferences in P0-4, is an explicit allowlist with a test.

## Owner decisions

Decided 2026-11-14. Implementation is planned as [phase 9](../phases/phase-9-maturity.md).

| Area | Decision |
| --- | --- |
| Retention defaults (S2) | Runs and logs 30 days, events 30, refusals 7, audit 400 (exported to S3 before it is dropped). Instance default, tenant override |
| Managed workers when client developers hold `code:write` (S1) | Managed workers run as a separate unprivileged user (`vxrun`) that cannot read the control plane's environment. Where the container lacks the capability to switch users, managed workers are refused for tenants whose `code:write` is held by anyone outside the operator, and those tenants use standalone workers |
| Flow retry and approvals (S3) | Approvals that were granted before the failure are kept: a retry copies them like any other succeeded step. Pending or rejected approvals are asked again |
| App Builder action input (S7) | Path mapping first (row column, page filter, fixed value). CEL in the browser later, if needed |
