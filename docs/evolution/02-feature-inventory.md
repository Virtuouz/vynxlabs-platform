# 2. Feature inventory

Every capability found in the code, with its maturity. The classifications are based on code and observed behavior.

**Maturity key:**
- **M** Mature: complete, cohesive, well implemented.
- **FI** Functional but immature.
- **PI** Partially implemented.
- **Fd** Foundational: the infrastructure exists, but user-facing capability is limited.
- **Inc** Inconsistent: behaves differently across the platform.

**Opportunity columns:** **F** function, **U** usability, **R** reliability or performance.

## Product identity (what the code says it is)

- **Purpose.** One self-hostable foundation on which an agency (Vynxlabs) builds and runs custom internal apps, workflows, integrations and data pipelines for client businesses. Each client is a tenant, and the agency or the client operates the instance (`docs/master-spec.md` "Purpose and scope").
- **Users.**
  - **Developers:** the agency's own and, since phase 7, clients' developers.
  - **Client staff:** members who operate, approve and build screens.
  - **End users:** clients' customers and front-line staff, in a per-tenant pool.
  - **Guests.**
- **Core problems it solves:**
  - running many small client integrations with full run history, without a deployment each;
  - giving each client portals and back-office tools on the same data, with row-level rules;
  - letting the client own the code and keys (export, git, permissive license, no call-home).
- **Architectural philosophy.** Code first, git as the source of truth, everything a manifest resource, a language-neutral core, pull workers, tenant portability, minimal footprint. The console builds drafts that become the same bundles the CLI makes.
- **Differentiators against the reference products** (verified in [03-competitive-analysis.md](03-competitive-analysis.md)):
  - multi-tenancy with export and import between instances;
  - an **end-user identity pool with Postgres row-level security** across custom apps, no-code screens and the API;
  - **MCP tools derived from the caller's bindings**;
  - a no-data-loss table migration model;
  - an audit log that cannot be bypassed;
  - a permissive license.
  
  Windmill and Kestra hold RBAC, multi-tenancy or audit logs behind enterprise editions. Here they are core.
- **Most important workflows** (from the examples and phase exit criteria):
  - deploy a repository and bind its connections;
  - watch and debug runs;
  - approve flow steps;
  - promote dev to production;
  - publish an app to end-user groups that see different rows.

## Kernel: tenancy, identity, governance

| Feature | What, and how it's used | Implementation | Maturity | Limitations | F / U / R opportunities |
| --- | --- | --- | --- | --- | --- |
| Instance, tenants, workspaces | Hierarchy with dev/prod flag; console and API | `routes/tenants.ts`, `workspaces.ts`, migration 0003 | **M** | Workspace URLs only by UUID; slug URL gives raw validation error | U: slug routes, 404 page |
| Members, groups, roles, bindings | RBAC with `kind:verb` and wildcards at instance, tenant, workspace and resource scope | `kernel/authorize.ts`, `routes/permissions.ts` | **M** | 2–3 SQL per check, uncached; no "why can X do Y" view | U: effective-permissions view. R: per-request binding cache |
| Operator access grants | Time-boxed, audited operator entry into a tenant | `access_grant`, `http.ts:137-148` | **M** | — | — |
| Audit log | Append-only, written in the same transaction; instance and tenant views | `kernel/audit.ts`, migration 0007 | **M**, with a defect | Navigation preference `member.recent_set` is audited (17 rows from one walk); no retention possible; no facet filters | R: stop auditing preferences; partitioned retention. U: filters, export |
| API keys and service accounts | `vxk_` keys, hashed, expiry, last four characters, "last here" | `routes/tenants.ts`, `identity.ts` | **M** | No per-key scopes beyond the principal's bindings | F: key scopes |
| SSO (OIDC, SAML) for members and end users | Providers, domains, links, group maps; recovery codes | `kernel/sso/*` | **M** (locally) | Not tried against more than Keycloak; no single logout or step-up (phase 7) | F: SLO |
| SCIM 2.0 | Provisioning users and groups per tenant and instance | `kernel/sso/scim.ts` | **FI** | No bulk operations or ETags (phase 7) | F: bulk |
| End-user pool | Per-tenant users with password, invite and reset, groups, attributes | `kernel/endusers.ts`, `routes/endusers.ts` | **M** | Spec open question on the pool design; no CSV bulk invite | U: bulk invite |
| Secrets | AES-256-GCM envelope per tenant, bound per workspace, "Used by" | `kernel/crypto.ts`, `secrets.ts` | **M** | No master-key rotation; connection credentials stored apart from Secrets | R: rotation. U: one secrets view |
| Variables | Per-workspace values with defaults | `variable_value` | **M** | — | — |
| Branding (instance and tenant), domains, portal hostname | Tokens, logo, DNS verification | `routes/branding.ts`, `apps.ts` | **M** | Domain check lacks "check now" | U |
| Tenant export and import | ustar of JSONL with re-wrapped keys; staged import | `kernel/tenancy/export.ts`, `import.ts` | **M** | No export history | U |
| Dedicated tenant databases | Custom tables in a tenant's own Postgres | `packages/db/src/datastore.ts` | **FI** | Cross-database writes not atomic (`audit.ts` `transact`) | R: an outbox or a compensating record |

## Execution

| Feature | What, and how it's used | Implementation | Maturity | Limitations | F / U / R opportunities |
| --- | --- | --- | --- | --- | --- |
| Scripts | TS with zod I/O, `ctx` API, declared `uses` | `packages/sdk`, `kernel/execution/runs.ts` | **M** | One language; no "call another script" from a script (phase 7 open) | F: `ctx.run(script)` |
| Runs and queue | pg-boss, idempotency, large payloads in S3, concurrency per workspace and per script | `runs.ts`, `packages/db/src/queue.ts` | **FI** | Claim loop is O(workspaces) per 500 ms per slot; no priority control in the UI | R: claim index or queue per tenant |
| Retries and backoff | `retries{limit, delaySeconds, backoff}` on scripts | `packages/manifest/src/kinds.ts:121-132` | **M** for scripts, **PI** for flows | No per-step retry in flows | F: step retry override |
| Timeouts and cancel | AbortSignal and `Promise.race` | `packages/worker/src/worker.ts:426-430` | **PI** | Code that ignores the signal keeps running; no CPU or memory cap | R: kill the process for each run |
| Workers (managed and standalone), pools | Pull over HTTP, heartbeat, requeue, pools as records | `packages/worker`, `supervisor.ts`, `routes/pools.ts` | **FI** | Managed workers share the control plane's container and uid; module cache never evicts; log flush drops silently; no queue view | R: isolation, durable logs. U: queue panel |
| Run log and logs | `run_log` rows, viewer with search, level filter, download | `routes/execution.ts`, `packages/ui/src/LogViewer.tsx` | **FI** | Logs only on heartbeat (10 s), not streamed; no retention | R: SSE, retention |
| Failure alerts | `onFailure` script or notify connection, workspace default | `kernel/execution/alerts.ts` | **FI** | Not visible or configurable in the console; no digest or dedupe | U: alerts page. F: subscriptions |
| Diagnosis | Suggested next step for known failure shapes | `kernel/execution/diagnose.ts`, `runs/:id/insight` | **M** (distinctive) | Covers known shapes only | F: more shapes (rate limit, schema mismatch) |
| Run history UI | Activity list, inspector | `screens/Runs.tsx` | **Inc** | 100-row cap, no search, filters not in URL, narrow inspector, no edit-and-rerun, three state maps | See [04-ux-audit.md](04-ux-audit.md) D1, D2, X2–X4 |
| Metrics and health | `/metrics` (4 gauges), `/healthz`, `/readyz`, connection and data source health | `routes/execution.ts:2124`, `kernel/data/health.ts` | **Fd** | No histograms, error rates, flow metrics or tracing | R: RED metrics, OTel |

## Triggers and events

| Feature | What, and how it's used | Implementation | Maturity | Limitations | F / U / R opportunities |
| --- | --- | --- | --- | --- | --- |
| Schedules | Cron with time zone; polling trigger sources with a cursor | `kernel/execution/triggers.ts` | **FI** | Script only (flows use a trigger node); console form is free cron, free time zone, JSON input, no preview; no "fire now" | U: preview, combobox, schema form, fire now |
| Webhooks | Token URL, HMAC, idempotency header, synchronous respond, refusals kept, pause | `routes/execution.ts:2021-2121` | **M** | Rate limit per process; Stripe-style multi-value signatures need a trigger source | R: shared limiter |
| Forms | Served forms with 7 field types, `anyone` or `signed_in` | `defineForm`, `submitForm` | **FI** | No file upload (phase 7) | F: file field |
| Events | Publish from scripts, API or the platform; CEL filters; depth limit 10 | `kernel/flows/events.ts` | **M** | Event list search by exact name only; no retention | U: prefix search, subscriber runs |
| Trigger pause | Per workspace and per trigger, with reason | `trigger_pause` | **M** | No bulk pause | U: bulk |
| Triggers workbench | List with pause, last refusal, next and last fire, copy URL | `screens/Operate.tsx:51` | **FI** | No create; no fire now | U |

## Flows

| Feature | What, and how it's used | Implementation | Maturity | Limitations | F / U / R opportunities |
| --- | --- | --- | --- | --- | --- |
| Flow engine | Durable DAG, advisory lock, state per step, pinned bundle | `kernel/flows/engine.ts` | **M** | Loads bundles and evaluates CEL inside a DB transaction | R: evaluate before locking where possible |
| Control flow | branch, foreach (concurrency, `continueOnError`), join, delay, fail, subflow (chosen by data), respond | `packages/manifest/src/flow.ts` | **M** | No while loop; no per-step retry or timeout | F: step retry |
| Approvals | Approval step with approver groups or roles, timeout, comment; tenant queue; MCP tools | `kernel/flows/approvers.ts`, `ApprovalsQueue` | **M** | No bulk; payload as JSON; no "mine to decide" filter | U |
| Expressions (CEL) | `trigger`, `steps.x.output`, `now`, `item` | `kernel/flows/expressions.ts` | **FI** | No completion or evaluated preview in the editor or SDK | U: expression field |
| Flow editor | React Flow canvas, palette with core and labelled nodes, problems list, autosave after first save | `screens/FlowEditor.tsx` | **FI** | No undo; "Run by hand" sends `{}`; no test with input; no step test | U: test panel, undo |
| Flow run view | Timeline and Graph, step facts, approvals in place | `screens/Flows.tsx:555` | **FI** | No retry or re-run; graph clipped; no step input; shows "Running" while waiting for a person | F: retry from step. U: fit view, input |
| Core node pack | http-request, send-email, table-read, table-write, publish-event | `packages/nodes` | **FI** | No tests; HTTP node can call any address without `code:write` (flagged in phase 7) | R: tests; policy on addresses |

## Data

| Feature | What, and how it's used | Implementation | Maturity | Limitations | F / U / R opportunities |
| --- | --- | --- | --- | --- | --- |
| Custom tables and migrations | Declarative tables; plan/apply; rename keeps data; retire, not drop | `kernel/data/plan.ts`, `apply.ts` | **M** (distinctive) | — | — |
| Row policies (RLS) | Owner policy and rules by group or attribute, enforced by Postgres | `kernel/data/apply.ts:184,464-498` | **M** (distinctive) | Cannot hide a column from someone who can read the row (phase 7) | F: column rules |
| Table studio | Grid with cursor paging, row sheets | `screens/Data.tsx` | **FI** | No column filters or CSV export | U |
| External data sources | Postgres only, health-checked, browse, `ctx.source` | `packages/db/src/external.ts` | **FI** | Postgres only (spec defers others) | F: MySQL, SQL Server when a client needs them |
| Files | `ctx.files`, S3 | `kernel/data/files.ts` | **Fd** | End users get no file access (open question); no file field in forms | F |

## Environments and delivery

| Feature | What, and how it's used | Implementation | Maturity | Limitations | F / U / R opportunities |
| --- | --- | --- | --- | --- | --- |
| Bundles and deploy | Immutable, digest-signed; one-transaction activation; binding checks | `kernel/execution/deploy.ts` | **M** | — | — |
| Promotion | Same bundle activated in the linked production workspace; preview; release branch; `promotion:write` | `kernel/execution/promote.ts`, `Release.tsx` | **M** | Change descriptions open (phase 8); no request-to-promote handoff | U: request promotion |
| Rollback | Re-activate an earlier deployment | `deployments` | **FI** | Not prominent in the UI | U |
| Workspace clone | Dev clone linked to its source | `kernel/tenancy/clone.ts` | **M** | No PII masking (deferred) | — |
| Console drafts and authoring | Drafts for every kind, draft history, push drafts, compose into a bundle | `kernel/authoring.ts`, `packages/compose` | **FI** | Console code can't import npm; schema written by hand; repo resources read-only | F: schema from zod in console code |
| Git sync | Push, pull, compare, release branch over HTTPS tokens | `kernel/git.ts` | **FI** | No `platform pull`; no in-file merge (phase 7) | F: CLI pull |
| CLI | `init`, `build`, `deploy`, `promote`, `run`, `dev`, `runs`, `tenant export/import`, `login`, `status` | `packages/cli` | **FI** | `platform run` lacks tables, events and files; no `pull`; no `logs --follow`; assumes at most 200 tenants | F: local fakes, `pull`, `logs` |

## Apps and interfaces

| Feature | What, and how it's used | Implementation | Maturity | Limitations | F / U / R opportunities |
| --- | --- | --- | --- | --- | --- |
| Code apps | React/Vite directory, `@vynxlabs/app` client, served by path, second address or hostname | `packages/app`, `kernel/apps/*` | **M** | Apps can import only repository files with no imports; `platform dev` acts as the developer, not as an end user | F: "dev as end user" |
| App Builder (no-code screens) | Pages of table, card, cards, chart, figure, form, text; linked selection; preview as group; publish | `packages/screens`, `screens/Interfaces.tsx` | **PI** | **No action widget (cannot run a script or flow)**; Form only inserts a row | F: action widget |
| Dashboards | Personal, over tables; share read-only by group | `screens/Dashboards.tsx` | **FI** | Overlaps App Builder | U: "Save as app" |
| Sharing and audiences | Bindings to groups, end users and anonymous; "what they can read" | `Apps.tsx` ShareDialog | **M** | — | — |
| UI kit | Tokens, Form from JSON Schema (flat), Table, Chart, LogViewer, Timeline, dialogs, toasts | `packages/ui` | **FI** | Kit components unused by the console (Skeleton, Pagination); Form is flat-only | U: a SchemaForm with nesting |

## Agents and extensibility

| Feature | What, and how it's used | Implementation | Maturity | Limitations | F / U / R opportunities |
| --- | --- | --- | --- | --- | --- |
| MCP server | Per-caller tools from bindings; run and flow tools with schemas; run and approval tools; audited `via: "mcp"` | `routes/mcp.ts` | **FI** (distinctive) | Not tried with a real agent product; no "try a tool" in the console; no OAuth | U: offer-to-agent action, try-a-tool |
| Agent access screen | Address, config snippet, tool preview per service account | `screens/Tenant.tsx` (service account) | **FI** | — | — |
| Connectors | `http`, `smtp`, custom `defineConnector` | `kernel/execution/connectors.ts` | **FI** | No test connection; settings that aren't simple fields need the API | F: Test |
| Connection groups | Pick a credential by data | `connection_group_member` | **FI** | Hidden until one exists | U |
| Trigger sources | Webhook or poll mode, custom code | `defineTriggerSource` | **Fd** | Phase 7 marks the authoring and nodes "not started" in part | F |
| Extensions in the console | Write connectors and trigger sources in the editor | `screens/Authoring.tsx` | **Fd** | No test harness per kind | F |

## Console shell

| Feature | What, and how it's used | Implementation | Maturity | Limitations | F / U / R opportunities |
| --- | --- | --- | --- | --- | --- |
| Navigation (rail, panel, header) | Five workspace areas, tenant, instance; live counts | `Shell.tsx`, `nav.ts` | **M** | No visible breadcrumb; no 404 | U |
| Overviews | Workspace and tenant "needs attention" | `Overview.tsx`, `TenantOverview` | **M** | No auto-refresh; audit noise | R: SSE |
| Command palette | ⌘K over destinations | `kit/CommandPalette.tsx` | **PI** | No entity search, no actions | F |
| Theming and responsive layout | Light, dark, system; widths 390, 768, 1440 tested | `theme.ts`, `e2e/redesign.spec.ts` | **M** | Arbitrary text sizes remain | — |
| Data layer | `useLoad` per component | `api.ts:68` | **Fd** | No cache or invalidation; per-screen loading and error handling | R: a query cache |

## Summary by maturity

| Class | Count | Features |
| --- | --- | --- |
| Mature | 29 | Tenancy, RBAC, audit (with one defect), operator grants, keys, SSO, end users, secrets, variables, branding, export/import, scripts, retries (scripts), diagnosis, webhooks, events, trigger pause, flow engine, control flow, approvals, tables and migrations, RLS, bundles and deploy, promotion, clone, code apps, sharing, navigation and overviews, theming |
| Functional but immature | 25 | Queue, workers, run log, alerts, schedules, forms, triggers workbench, expressions, flow editor, flow run view, core nodes, studio, data sources, dedicated databases, SCIM, rollback, drafts, git sync, CLI, dashboards, UI kit, MCP, agent access, connectors, connection groups |
| Partially implemented | 4 | Timeouts and cancel, flow step retries, App Builder actions, command palette |
| Foundational | 5 | Metrics and tracing, files, trigger sources, console extensions, console data layer |
| Inconsistent | 1 (broad) | Run history and status presentation across screens |

**The pattern.** The kernel (identity, resources, deploy, data, flow engine) is mature. Maturity drops toward the **operational surface**, meaning observing, debugging, retrying and alerting, and toward the **bridges between features**: app → script, run → code, trigger → target, connection → test. That is where the roadmap concentrates.
