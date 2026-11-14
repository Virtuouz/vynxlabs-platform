# 3. Competitive capability analysis

The reference products are Windmill, Kestra, n8n, Trigger.dev, Temporal, Retool and Appsmith. They are used as sources of ideas, not specifications.

**How the research was done.** Every competitor claim was taken from the vendor's official documentation, checked on **2026-11-14**, and carries its URL. "Unverified" means the docs did not confirm it, not that the feature is absent. Some details came from search-result excerpts rather than a full page read, and are marked so. Vendors move fast, so re-check before quoting externally. **EE** means enterprise edition or a paid tier.

## 3.1 Where the platform stands

The reference products split into three groups:

| Group | Products | Overlap with this platform |
| --- | --- | --- |
| Script and workflow platforms | Windmill, Kestra, n8n | Scripts, flows, triggers, runs, approvals, workers, git, MCP |
| Code-first durable execution | Trigger.dev, Temporal | Durable runs, retries, idempotency, observability, local development |
| Internal-tool builders | Retool, Appsmith | Apps, data binding, end-user permissions, environments |

**Positioning in one sentence.** This platform is the only one of the eight that treats **multi-tenant client delivery** (one tenant per client, with exportable tenants, end-user pools, row-level security and per-client branding) as core rather than as an enterprise add-on. It does so under a permissive license.

That position is not marketing; the licenses and editions back it up:
- **Windmill.** The Community Edition terms forbid reselling, managed-service use and wrapping without an agreement. White-labeling is commercial ([LICENSE](https://github.com/windmill-labs/windmill/blob/main/LICENSE), [brand](https://www.windmill.dev/brand)).
- **Kestra.** Apache 2.0, but RBAC, SSO, multi-tenancy, audit logs and Apps are EE ([oss-vs-paid](https://kestra.io/docs/oss-vs-paid)).
- **n8n.** Sustainable Use License, which n8n calls fair-code and says is not open source. Projects, environments, SSO and Git are Business or Enterprise ([community features](https://docs.n8n.io/deploy/host-n8n/configure-n8n/community-edition-features.md)).
- **Retool.** Proprietary. Self-hosting needs a license key that checks in daily ([Docker](https://docs.retool.com/self-hosted/self-managed/tutorials/docker)). This conflicts with the platform's "no call home" rule.
- **Appsmith.** Apache 2.0. SAML/OIDC, SCIM, custom environments and CI/CD are Enterprise ([pricing](https://www.appsmith.com/pricing)).

The roadmap should therefore **deepen** what the platform already does rather than chase breadth. For example, Windmill supports about 20 languages and claims 200+ resource types ([scripts](https://windmill.dev/docs/getting_started/scripts_quickstart), [resources](https://windmill.dev/docs/core_concepts/resources_and_types)). Matching that is a different product. Matching Windmill's run page, Trigger.dev's replay and Retool's "app button runs a backend action" is not.

## 3.2 Capability matrix

**Status in this platform:**
- **Done well:** at or ahead of the references.
- **Incomplete:** exists, but meaningfully behind.
- **Poorly exposed:** the capability exists but users can't find or use it.
- **Missing.**
- **Skip:** would add complexity without matching value.

**Priority** refers to [07-roadmap.md](07-roadmap.md).

### Script development and execution

| Capability | This platform | Verified reference | Opportunity | Status | Priority |
| --- | --- | --- | --- | --- | --- |
| Languages | TypeScript only, by design (`docs/master-spec.md` non-goals) | Windmill: about 20 languages and SQL ([scripts](https://windmill.dev/docs/getting_started/scripts_quickstart)). Kestra: Python, R, Julia, Ruby, Node, Shell via runners ([scripts](https://kestra.io/docs/scripts)) | Keep one language. The worker protocol already allows a second worker later | Skip (now) | P3 |
| Input schema → form | zod → JSON Schema in the manifest; console form for flat schemas only; console-authored scripts need hand-written JSON Schema | Windmill derives the form from the `main()` signature, with objects, arrays, enums, files and dynamic selects ([JSON schema](https://windmill.dev/docs/core_concepts/json_schema_and_parsing)). Kestra has typed inputs, including FILE and SECRET, with `dependsOn` ([inputs](https://kestra.io/docs/workflow-components/inputs)) | One SchemaForm with nesting and arrays, used everywhere; derive the schema from zod in console code | Incomplete | P1 |
| Test run while editing | Save and run with JSON input, result inline | Trigger.dev Test page: JSON payload, saved templates, prefill from recent runs, version and queue overrides ([run tests](https://trigger.dev/docs/run-tests.md)) | Prefill the test input from a recent run; save named test inputs | Incomplete | P1 |
| Debugger | None | Windmill: breakpoints for Python and Bun ([debugger](https://windmill.dev/docs/script_editor/debugger)) | Not worth it in the browser yet. Invest in logs and `platform run` | Skip | — |
| Local development | `platform run` (no tables, events or files), `platform dev` for apps | Windmill: `wmill dev` live preview, mocked resources ([local dev](https://windmill.dev/docs/advanced/local_development)). Trigger.dev: `dev` with process per run and watch ([CLI dev](https://trigger.dev/docs/cli-dev-commands.md)) | `platform run --remote` to run against a dev workspace's real context; in-memory tables and events locally | Incomplete | P2 |
| Versioning | Immutable bundles; each run pinned to one; draft history | Windmill: an immutable hash per deploy, History with restore ([versioning](https://windmill.dev/docs/core_concepts/versioning)) | Link from a run to "code at this version"; a diff between versions | Poorly exposed | P1 |
| Execution controls | Timeout (signal only), retries, concurrency per script and workspace, cancel | Kestra: concurrency limit with QUEUE, CANCEL or FAIL ([concurrency](https://kestra.io/docs/workflow-components/concurrency)). Trigger.dev: `concurrencyKey`, debounce, ttl, priority ([triggering](https://trigger.dev/docs/triggering.md)) | **Real** timeouts (kill). A concurrency key (for example per customer) is cheap on pg-boss singleton keys | Incomplete | P0 (kill), P2 (key) |

### Workflow orchestration

| Capability | This platform | Verified reference | Opportunity | Status | Priority |
| --- | --- | --- | --- | --- | --- |
| Visual editor | React Flow canvas, node palette, problems list | Kestra: YAML, no-code canvas, topology and docs panels kept in sync ([flows UI](https://kestra.io/docs/ui/flows)) | Keep the canvas. Add a test panel and undo | Done well (structure) | P1 |
| Branch, parallel, loop, join, subflow | All, plus subflows chosen by data | Kestra: Parallel, Switch, Loop, LoopUntil, DAG ([flowable](https://kestra.io/docs/workflow-components/tasks/flowable-tasks)). Windmill: branches, for, while ([loops](https://windmill.dev/docs/flows/flow_loops)) | A while/until loop only if a client needs one (polling covers most cases) | Done well | — |
| Per-step retries | Inherited from the script | Kestra: per task, plus flow-level RETRY_FAILED_TASK ([retries](https://kestra.io/docs/workflow-components/retries)). Windmill per step ([retries](https://windmill.dev/docs/flows/retries)) | `retry` and `timeoutSeconds` overrides on a step node | Incomplete | P1 |
| Error handling | Error edges, `fail`, workspace and script `onFailure` | n8n error workflow with execution context ([error handling](https://docs.n8n.io/flow-logic/error-handling/)). Windmill error-handler step ([error handler](https://windmill.dev/docs/flows/flow_error_handler)) | Already equivalent. Expose the alert configuration in the console | Poorly exposed | P1 |
| Human approval | Approval step, approvers by group or role, timeout, MCP decide | Windmill: approval count, Slack and Teams buttons; group restriction is EE ([approval](https://windmill.dev/docs/flows/flow_approval)). Trigger.dev waitpoint tokens with a URL ([wait for token](https://trigger.dev/docs/wait-for-token.md)) | **Approve from a link** (signed, single-use) for email or chat; a "wait for token" step for external callbacks | Done well (core) | P2 |
| Data passing | CEL over `trigger`, `steps`, `item` | Windmill JS expressions ([architecture](https://windmill.dev/docs/flows/architecture)). Kestra "Debug Expression" against outputs ([executions](https://kestra.io/docs/ui/executions)) | An expression field with an evaluated preview against the last test run | Incomplete (UX) | P1 |
| Durability and versioning | State per step, pinned bundle | Temporal: Worker Versioning, Pinned vs Auto-Upgrade ([worker versioning](https://docs.temporal.io/worker-versioning.md)). Trigger.dev locks a run to a version ([versioning](https://trigger.dev/docs/versioning.md)) | Already right. Show the version on the run | Done well | — |
| Retry, re-run, restart from a step | **None for flows** | n8n retry with current or original workflow ([executions](https://docs.n8n.io/build/understand-workflows/understand-executions/view-all-executions.md)). Windmill restart from a step, with version choice (EE for deployed flows) ([test flows](https://windmill.dev/docs/flows/test_flows)). Kestra replay from the Gantt ([executions](https://kestra.io/docs/ui/executions)). Temporal reset (search excerpt) | **Retry from failed step** on the original bundle, and re-run with edited trigger input | Missing | **P1** |
| Execution visualization | Timeline and Graph tabs | Kestra topology and Gantt. Trigger.dev trace view with spans ([logging](https://trigger.dev/docs/logging.md)) | Fit-to-view; step input and output; step logs inline | Incomplete | P1 |
| Schedules | Cron and time zone, catch-up fires once | Temporal: overlap policies, backfill, upcoming runs in the UI ([schedule](https://docs.temporal.io/schedule.md), [web UI](https://docs.temporal.io/web-ui.md)). Kestra backfill ([triggers](https://kestra.io/docs/workflow-components/triggers)). n8n catch-up choice ([schedule](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.scheduletrigger.md)) | Next-run preview, fire now, an overlap policy (skip if running), backfill later | Incomplete | P1 (preview), P2 (overlap) |
| Webhooks and forms | HMAC, idempotency, synchronous respond, refusal log; forms with 7 field types | n8n multi-page forms with file fields ([form](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.form.md)). Windmill HTTP routes plus Kafka, CDC and SQS triggers ([triggers](https://windmill.dev/docs/triggers)) | A file field; leave queue triggers to trigger sources | Done well | P2 (file) |

### Applications and interfaces

| Capability | This platform | Verified reference | Opportunity | Status | Priority |
| --- | --- | --- | --- | --- | --- |
| No-code builder | Pages of 7 widget types over tables, linked selection, preview as group | Retool classic: about 130 components, 12-column grid ([components](https://docs.retool.com/apps/reference/components)). Appsmith: 47 widgets ([widgets](https://docs.appsmith.com/reference/widgets)). Windmill marks its low-code builder legacy in favor of full-code apps ([full-code apps](https://windmill.dev/docs/full_code_apps)) | Don't chase the component count. Add **actions** | Incomplete | **P1** |
| Buttons that run backend logic | **Missing** in the builder; `runScript` in code apps | Retool event handlers run queries or workflows, with confirmation, debounce and "only run when" ([event handlers](https://docs.retool.com/apps/guides/interaction-navigation/event-handlers), [run behavior](https://docs.retool.com/queries/guides/run-behavior)). Retool runs a workflow from an app as the user ([workflows](https://docs.retool.com/queries/guides/workflows)) | An Action widget and a table row action bound to a script or flow, with a schema form, confirmation and a link to the result run | Missing | **P1** |
| Code apps | React/Vite, `@vynxlabs/app`, served with tenant branding | Retool's new builder generates React 19 code ([comparison](https://docs.retool.com/build/apps/concepts/classic-app-comparison)). Windmill full-code apps with a generated backend client ([full-code apps](https://windmill.dev/docs/full_code_apps)) | Validates the direction. Add `platform dev --as <end user>` | Done well | P2 |
| Row-level permissions for app users | Postgres RLS by owner, group or attribute, enforced for the API, apps and screens | Retool `current_user` in queries plus spoofing prevention; access policies are Enterprise per a search excerpt ([RLS](https://docs.retool.com/queries/concepts/row-level-security)). Appsmith's server-side user placeholder is not in Community ([context](https://docs.appsmith.com/reference/appsmith-framework/context-object)) | Stronger by design; RLS can't be spoofed from the client. Say so in positioning | Done well | — |
| External users and portals | End-user pool, groups, attributes, SSO, branded portal hostname | Retool External apps on Business and Enterprise ([external apps](https://docs.retool.com/org-users/concepts/external-apps-users)). Appsmith public apps and embedding; private embedding is Enterprise ([embed](https://docs.appsmith.com/advanced-concepts/embed-appsmith-into-existing-application)) | Already ahead for agency delivery | Done well | — |
| Responsive | Every console screen at 390 px; apps are the author's choice | Appsmith responsive layout is Alpha ([responsive](https://docs.appsmith.com/reference/responsive-widgets)) | Make App Builder pages responsive by default (`packages/screens`) | Incomplete | P2 |

### Resources and integrations

| Capability | This platform | Verified reference | Opportunity | Status | Priority |
| --- | --- | --- | --- | --- | --- |
| Connectors | `http`, `smtp`, custom `defineConnector` | n8n built-in and community nodes ([community](https://docs.n8n.io/integrations/community-nodes/)). Windmill: 200+ resource types from its Hub ([resources](https://windmill.dev/docs/core_concepts/resources_and_types)) | No catalog race. Ship **recipes** (examples) for the common client systems the agency meets | Skip (catalog) | P3 |
| Credentials per environment | Bound per workspace; credentials stored in the binding | Retool and Appsmith: per environment with a test per environment ([Appsmith envs](https://docs.appsmith.com/connect-data/how-to-guides/setup-datasource-environments)) | Equivalent model. Add the test | Done well (model) | — |
| Test connection | **Missing** (phase 8 open) | n8n tests a credential when it is saved ([credentials](https://docs.n8n.io/build/understand-workflows/create-and-edit-credentials.md)). Appsmith tests each environment ([envs](https://docs.appsmith.com/connect-data/how-to-guides/setup-datasource-environments)) | **Test on a worker** in the workspace's pool, with a result kept as health | Missing | **P1** |
| OAuth connections | Not built in | Windmill OAuth with refresh ([resources](https://windmill.dev/docs/core_concepts/resources_and_types)). Retool per-user OAuth ([API auth](https://docs.retool.com/data-sources/guides/authentication/api)) | An OAuth2 connector kind (authorization code, then refresh) when a client system needs it | Missing | P2 |
| Secrets | Envelope encryption per tenant, used-by | Kestra OSS reads only environment variables; the UI store is EE ([secret](https://kestra.io/docs/concepts/secret)) | Ahead. Add master-key rotation | Done well | P2 (rotation) |

### Platform management

| Capability | This platform | Verified reference | Opportunity | Status | Priority |
| --- | --- | --- | --- | --- | --- |
| Workspaces and RBAC | Tenant → workspace; roles, bindings, resource scope; all core | Windmill custom roles are EE ([roles](https://windmill.dev/docs/core_concepts/roles_and_permissions)). Kestra RBAC is EE ([rbac](https://kestra.io/docs/enterprise/auth/rbac)) | Add an effective-permissions view | Done well | P2 |
| Workers, queue, concurrency | Pools as records, managed or standalone; workspace and script limits | Windmill worker tags, queue metrics (EE) ([worker groups](https://windmill.dev/docs/core_concepts/worker_groups)). Trigger.dev named queues with pause ([queues](https://trigger.dev/docs/queues.md)) | A queue panel (depth and age per workspace and pool); pause a queue | Incomplete | P1 |
| Environments and promotion | Linked dev → prod, the same bundle activated, preview, release branch | Windmill forks with a Compare & Deploy diff; git sync is EE ([forks](https://windmill.dev/docs/advanced/workspace_forks)). Kestra Promote is EE, with drift states ([promote](https://kestra.io/docs/enterprise/governance/promote)) | Show drift between dev and prod (In sync / Out of sync); a per-resource diff | Done well (model) | P2 |
| Git integration | Server push and pull, release branch | n8n source control is Business or Enterprise ([source control](https://docs.n8n.io/source-control-environments/)) | `platform pull` | Incomplete | P2 |
| Audit log | Append-only, unbypassable, core | Windmill: 14 days CE, 365 EE ([audit](https://windmill.dev/docs/core_concepts/audit_logs)). Retool Business+ ([audit](https://docs.retool.com/org-users/guides/monitoring/audit-logs)) | Ahead. Fix the preference noise; add retention by partition | Done well | P0 (noise) |
| Retention | **None** | n8n prunes by default (14 days or 10,000 executions) ([execution data](https://docs.n8n.io/deploy/host-n8n/configure-n8n/scaling/manage-execution-data.md)). Kestra purge flows ([purge](https://kestra.io/docs/administrator-guide/purge)). Temporal: 72 h default plus archival ([namespaces](https://docs.temporal.io/self-hosted-guide/namespaces.md)) | A retention policy per tenant with a pruning job | Missing | **P0** |
| Metrics and tracing | 4 Prometheus gauges | Windmill Prometheus plus OTel ([instance settings](https://windmill.dev/docs/advanced/instance_settings)). Trigger.dev OTel traces per run ([logging](https://trigger.dev/docs/logging.md)) | RED metrics and flow metrics now; OTel later | Incomplete | P1 (metrics), P3 (OTel) |
| Alerts | `onFailure` script or notify connection; not in the UI | Trigger.dev email, Slack or webhook alerts on failure and on error groups ([alerts](https://trigger.dev/docs/troubleshooting-alerts.md)). Windmill critical alerts (EE) ([critical alerts](https://windmill.dev/docs/core_concepts/critical_alerts)) | An alerts page per workspace: rules, channels, recent alerts; dedupe and digest | Poorly exposed | P1 |

### Developer experience

| Capability | This platform | Verified reference | Opportunity | Status | Priority |
| --- | --- | --- | --- | --- | --- |
| Command palette | Destinations only | n8n ⌘K with workflow, navigation and execution actions ([shortcuts](https://docs.n8n.io/build/keyboard-shortcuts.md)). Windmill ⌘K with prefixes; full-text search is EE ([search](https://windmill.dev/docs/core_concepts/search_bar)). Retool ⌘K runs queries ([palette](https://docs.retool.com/apps/management/concepts/command-palette)) | Entities and actions, recents first, prefixes | Incomplete | **P1** |
| Runs list | 100 rows, status, kind and window filters | Windmill: chart of runs (duration or concurrency), filters over arguments, results and labels, batch re-run with edited inputs ([runs](https://windmill.dev/docs/core_concepts/monitor_past_and_future_runs)). Temporal saved views by URL ([web UI](https://docs.temporal.io/web-ui.md)). Trigger.dev tags and bulk replay ([tags](https://trigger.dev/docs/tags.md), [bulk](https://trigger.dev/docs/bulk-actions.md)) | Paging, search, tags, URL filters, bulk re-run and cancel | Incomplete | **P1** |
| Replay with an edited payload | Script "Run again" with the same input | Trigger.dev replay with an edited payload and an environment choice ([replaying](https://trigger.dev/docs/replaying.md)). Temporal "Start Workflow Like This One" ([web UI](https://docs.temporal.io/web-ui.md)). n8n Debug in editor with pinned data ([debug](https://docs.n8n.io/workflows/executions/debug/)) | Re-run with edit; "Open as test input" in the editor | Incomplete | **P1** |
| Live updates | Polling | Trigger.dev realtime by run or tag, with React hooks ([realtime](https://trigger.dev/docs/realtime/overview.md)). Windmill log streaming over SSE ([jobs](https://windmill.dev/docs/core_concepts/jobs)) | SSE per workspace; the same stream exposed to `@vynxlabs/app` (`useRun`) | Missing | **P1** |
| Result rendering | JsonView | Windmill renderers for table, HTML, Markdown, PDF, image and file ([rich display](https://windmill.dev/docs/core_concepts/rich_display_rendering)) | A small set: table for arrays of objects, Markdown, image and file links, picked by output shape | Missing | P2 |
| AI assistance | None (by choice so far) | Windmill AI chat, copilot and fix ([AI](https://windmill.dev/docs/core_concepts/ai_generation)). n8n Assistant with your own provider ([assistant](https://docs.n8n.io/build/ways-of-building-workflows/n8n-assistant.md)). Kestra Copilot ([copilot](https://kestra.io/docs/develop-with-ai/ai-copilot)) | Later, and only operator-configured (no call home): "Explain this failure" and "Write a script for…" through the tenant's own provider connection | Missing | P3 |
| MCP | Per-caller tools from bindings, audited | Windmill: selected scripts and flows as tools with path-scoped tokens and OAuth ([MCP](https://windmill.dev/docs/core_concepts/mcp)). n8n MCP Server Trigger per workflow ([MCP trigger](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-langchain.mcptrigger.md)). Trigger.dev and Temporal MCPs are for operators, not for exposing work as tools ([Trigger.dev MCP](https://trigger.dev/docs/mcp-introduction.md), [Temporal AI](https://docs.temporal.io/with-ai.md)) | Ahead on authorization. Add OAuth for MCP clients and "Offer to an agent" | Done well | P2 |
| Idempotency | Keys on runs, webhooks and MCP | Trigger.dev scoped keys with TTL and a reset button ([idempotency](https://trigger.dev/docs/idempotency.md)) | Show the key on the run; TTL | Done well | P3 |

## 3.3 Patterns worth adopting

Ranked by value to this platform's users, with what each touches here.

1. **Run page as the debugging home** (Trigger.dev run trace, Kestra Gantt with replay, Windmill job page). One full page: timeline, attempts, logs, input and output, and actions. Touches `Runs.tsx` and `Flows.tsx`, and revives `RunDetail`.
2. **Replay with an edited input, and retry from a failed step** (Trigger.dev, n8n, Windmill, Kestra). Touches `kernel/flows/engine.ts` and `runs.ts`.
3. **App actions that run backend logic, with confirmation** (Retool event handlers and run behavior). Touches `packages/screens` and `Interfaces.tsx`.
4. **Entity-aware ⌘K with actions** (n8n, Windmill, Retool). Touches `kit/CommandPalette.tsx` and a search endpoint.
5. **Run tags and search** (Trigger.dev tags, n8n custom execution data, Temporal search attributes). Touches `ctx.run.tag()`, a `run.tags` column and `/activity`.
6. **Retention by default** (n8n, Temporal). Touches a background job and a tenant setting.
7. **Upcoming runs and schedule overlap policy** (Temporal). Touches `ResourceEditor` and `triggers.ts`.
8. **Expression debugging against real outputs** (Kestra Debug Expression, n8n pinned data). Touches the flow editor and `expressions.ts`.
9. **Approve from a link or chat** (Windmill resume URLs, Trigger.dev waitpoint token URL). Touches approvals and mail.
10. **Drift view between environments** (Kestra Promote, Windmill fork diff). Touches `promote.ts` and `Release.tsx`.

## 3.4 Deliberately not recommended

| Idea | Why not |
| --- | --- |
| Many languages | A non-goal in the spec. The worker protocol keeps the door open. Cost: runtime images, dependency management, editor support |
| A connector catalog race | Agency work meets a long tail of client systems. `http` plus a custom `defineConnector` plus recipes fits better than hundreds of thin integrations to maintain |
| A general drag-and-drop app builder | A spec non-goal. Windmill has moved its own low-code builder to legacy, and Retool's new builder generates code. The widget pages plus code apps split is right |
| A spreadsheet formula engine | A spec non-goal |
| An in-browser step debugger | Low value next to good logs, replay and `platform run` |
| Workflows-as-code alongside the graph | Two flow models would split the engine. The graph, pinned bundles and CEL are coherent |
