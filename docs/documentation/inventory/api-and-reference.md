# Inventory: api and reference

Read from the code at `270e509` on 2026-11-22. A report, not checked prose: what it calls a bug is settled in [the findings](../findings/README.md).

Paths are relative to .. "cp" is apps/control-plane/src. Counts come from a local run of the generators' modules and from `generated/openapi.json` (v0.5.0). That file was written 22 Nov 13:01, before the other generated pages (13:43). `generated/` and `dist/` are gitignored.

# A. Proposed pages

**`content/develop/api/` (written)**
1. index: base URL, versioning, OpenAPI, first call
2. authentication
3. errors, retries and limits
4. lists, filtering and aggregates
5. rows
6. runs, flows and idempotency
7. revisions and conflicts
8. renamed resources (deprecation headers)
9. run event stream (SSE)
10. batch
11. files and uploads
12. webhooks in, with signature verification
13. MCP
14. SCIM (the provider setup page stays under tenant)
15. worker protocol (from docs/contracts/worker-protocol.md)

**`generated/` (mounted as `reference/`, so do not create `content/reference`)**
- `api/<tag>` split
- audit-actions, events, metrics, shortcuts, flow-nodes, widgets, page-actions, expressions, sql-functions, connectors, trigger-sources
- sdk/{sdk,app,ui,widgets}

# B. Facts

**Base and headers**
- Prefix `/api/v1` (cp/app.ts:82). There is no other versioning scheme.
- IDs are UUIDs. The API takes `{t}/{w}` IDs, while the CLI takes slugs.
- 31 wildcard `{*}` paths carry resource paths (`WildParams`, cp/routes/data.ts:30).
- `GET /api/v1/openapi.json` is public and cached per process. It is our routes plus better-auth's (cp/app.ts:228-252).
- Responses carry `x-request-id`; an incoming one is kept if it matches `[A-Za-z0-9._-]{1,128}`. They also carry `x-trace-id`, and a W3C `traceparent` is joined (app.ts:84, 107, 154-161).
- At a tenant domain the API answers for that tenant only, and 404 otherwise (kernel/http.ts preHandler).
- A scoped lookup with no standing answers 404, not 403 (`authorize`).
- No CORS: no `access-control-*` anywhere in cp/. A cookie plus a foreign `Origin` on a write gets 403 `cross_site` (kernel/principal.ts `refuseCrossSite`).

**Credentials**

| Prefix | What | Where |
|---|---|---|
| `vxk_` | API key, member or service account, optional `expiresAt`, shown once | principal.ts:11, identity.ts:90, 812-861 |
| session cookie | `vx_member` prefix, `/auth/*` via better-auth, main address only | auth.ts |
| `vxs_` | app sign-in, cookie `vx_app_<tenant>`, SameSite=Lax; end user 30 d, member 12 h | apps/sessions.ts:8-26 |
| `vxw_` | worker | execution/workers.ts:10 |
| `WORKER_HOST_TOKEN` | host protocol; 404 unless `MANAGED_WORKERS=host` | kernel/http.ts:323 |
| `vxp_` | SCIM | sso/scim.ts:24 |
| `vxh_` / `vxf_` | webhook / form address token | execution/triggers.ts:137-139 |
| approval link | 48 h, single use, GET decides nothing, POST decides, reject needs a comment, 410 `link_expired` | flows/approval-links.ts:18, routes/approval-links.ts |
| `METRICS_TOKEN` | scrape | routes/execution.ts ~3580 |

- `resolvePrincipal` accepts only `Bearer vxk_…`. Any other Authorization header is 401, even with a valid cookie.
- API keys carry no scopes of their own: they act as their owner. A disabled member's keys are refused.
- Service-account keys reach only their tenant.
- `signed-in` routes refuse end users and member app sign-ins; nothing in the hook excludes service accounts.
- Access kinds (410 own routes): 259 permission, 62 custom, 30 public, 22 signed-in, 20 worker, 15 scim, 2 worker-host.

**Errors**
- RFC 9457 `application/problem+json`: `type` (always `about:blank`), title, status, detail, instance, code, requestId, `errors[{path,message}]` (cp/problem.ts:11-29).
- 60 codes in packages/manifest/src/errors.ts. All are referenced in cp.
- Sign-in errors pass on better-auth's code, lowercased.
- Postgres mappings: 23505/23503 → `conflict`; 23514/22P02 → `bad_request`; 25006 → `read_only` (Retry-After 30); pool timeout → `busy` (2 s); 57014 → `busy` (5 s).
- SCIM uses SCIM error bodies, not problems (routes/scim.ts:384-415).

**Rate limits** (opt-in, fixed window, in Postgres, shared by replicas, kernel/ratelimit.ts). Per minute, per address:

| Route(s) | Limit |
|---|---|
| anonymous callers on app-facing routes (`guestLimit`, http.ts:64) | 120 |
| webhooks | 120 |
| SCIM | 1200 |
| expression value | 240 |
| SSO, hand-off, OAuth callback | 60 |
| approval links | 30 |
| end-user sign-in | 20 |
| end-user sign-up | 5 |

Authenticated API traffic has no general limit. better-auth's own limiter is not configured here; check its defaults.

**Lists**
- `limit` 1-200, default 50; `cursor` is opaque; response `{items,nextCursor}` (pagination.ts). Rows allow `limit` up to 1000.
- Only 13 operations take `cursor`. 71 of 83 `items` lists have no `nextCursor`; some have fixed caps, such as 100 bundles.

**Rows**
- `filter` is a JSON string, up to 50 conditions, with `and`/`or`.
- Ops: eq, ne, gt, gte, lt, lte, in (≤200 values), contains (text), is_null, has (enum_list) (kernel/data/rows.ts:450-535). Omitted `op` means eq.
- `sort=-a,b`; `expand` ≤5; `as`/`asGroup` need `data_all:read`.
- Insert 1-1000 rows; row-deletions ≤1000; CSV cap 100,000.
- Cursors are keyset for most sorts, offset for multi-column sorts or keyless tables (data.ts:66-84).
- Row changes are not audited one by one (data.ts:779), except through page actions.

**Idempotency**
- Body `idempotencyKey` (1-200 chars) on runs (execution.ts:1182) and flow-runs (flows.ts:748). Header `idempotency-key` on webhooks only.
- MCP adds an `idempotencyKey` argument, renamed with underscores if taken, stored as `mcp:<principal>:<key>`.
- Scope is workspace plus script/flow path, former paths included. It outlives nothing but the run row; a replay with different input returns the first run silently.

**Revisions**
- No ETag or If-Match; SCIM says `etag: false`. Optimistic concurrency is a body `revision`, on drafts (authoring.ts:562, kernel/authoring.ts:241-255) and dashboards (dashboards.ts:365).
- 409 `draft_changed` on drafts. For `doc` drafts omitting the revision is itself a conflict; other kinds overwrite.
- Access releases use `release_stale`; promotions use `staged_elsewhere`.
- Access changes may answer `waiting: true` instead of applying (`Waiting`, shared.ts).

**Renames**
- An old path answers for 90 days, with `Deprecation: @<unix>`, `Sunset`, `Volvel-Resource-Moved` and `Warning: 299` (kernel/resolve.ts:184).

**SSE**
- `GET /tenants/{t}/stream`. Events: `ready`, `snapshot`, `run`, `flow_run`, `step`, `log`. Data is `{k,w,id,flow?,node?,s?,p?}`.
- Ping every 20 s, retry 3000 ms, ≤5 streams per caller per replica (2 for own-runs callers), 429 `too_many_streams`. No replay: `Last-Event-ID` only yields `snapshot`.

**Batch**
- 5 routes, ≤100 items, sequential replay through each single route, 200 with per-item `status` (routes/batch.ts).

**Uploads**
- Bundle 20 MiB, file 25 MiB (raw body, `?name=`), app asset 25 MiB by sha256, logo 512 KiB, icon 256 KiB, import 50 GiB with `x-export-passphrase`. File downloads are attachments.

**Webhooks in**
- `POST /hooks/{token}`. HMAC sha256/sha1; hex/base64; prefix; `signed` template; timestamp tolerance 300 s (triggers.ts:189-220).
- 401 `signature_invalid`, 503 `workspace_paused`, 202 `{runId}`. `respond: flow` waits ≤25 s and returns `x-flow-run`. `authorization` and `cookie` are not passed on.
- **No outbound webhooks exist**; alerts `notify` through a connection instead.

**MCP**
- `POST …/workspaces/{w}/mcp`, stateless streamable HTTP, JSON answers. No GET/SSE.
- Tools are scripts, flows (≤200), `get_run`, `get_flow_run` and approvals. Calls wait 25 s, then return the run ID.

**SCIM**
- Users and Groups, PATCH and filter yes; bulk, sort, etag and changePassword no; max page 200.

**Route groups (cp/routes, route count: purpose)**

| File | Routes | Purpose |
|---|---|---|
| access | 1 | explain a principal's permissions |
| access-releases | 8 | plan, release, approve, roll back access |
| alerts | 3 | failure alerts |
| approval-links | 2 | mail approvals |
| apps | 18 | apps, domains, hand-off, assets, portal |
| auth | 1 | better-auth wildcard |
| authoring | 13 | drafts, changes |
| batch | 5 | bulk actions |
| branding | 6 | instance look |
| compare | 2 | compare runs / flow runs |
| dashboards | 5 | dashboards |
| data | 13 | tables, rows |
| docs | 3 (+ terms 1) | workspace docs, glossary |
| drift | 2 | workspace drift |
| endusers | 19 | users, groups, sign-in |
| environments | 5 | workspace types, clones |
| execution | 42 | bundles, deploys, runs, triggers, connections, workers, webhook, metrics |
| flows | 19 | flows, runs, approvals, events |
| git | 12 | repository sync |
| health | 2 | liveness, readiness |
| icons | 6 | icons |
| identity | 18 | me, keys, members, audit |
| instance / instance-control | 1 / 2 | info / pause triggers |
| interfaces | 2 | deployed interfaces |
| locations | 3 | database locations |
| master-key | 1 | rotation status |
| mcp | 3 | agents |
| operations | 4 | queue, operations |
| page-actions / page-approvals | 1 / 1 | app actions |
| permissions | 15 | roles, bindings, audit facets/CSV |
| pools | 4 | worker pools |
| portability | 6 | export/import |
| preferences | 7 | own preferences, saved views |
| promotion-requests | 5 | promotions |
| queries | 5 | SQL, saved, visual |
| scim | 20 | 15 provider + token admin |
| search | 3 | search, recent |
| sources | 15 | data sources, files |
| sso | 20 | identity providers |
| stream | 1 | SSE |
| summary | 3 | overview figures |
| tenants | 24 | tenants, members, groups, service accounts |
| widget-choices / widget-data | 1 / 2 | widget reads |
| worker / worker-host | 20 / 2 | protocol |
| workspaces | 14 | workspaces, resources, secrets |

Counts are declarations from a grep; sso and scim register some routes for both tenant and instance.

**Audit actions**: no list exists. Strings are typed inline (`AuditInput.action: string`, kernel/audit.ts:39). 182 literal actions, plus about 5 computed families:
- `end_user.*` (kernel/endusers.ts:69, routes/endusers.ts:323)
- `page_action.*` (kernel/pages/act.ts:569)
- `identity_provider.*` (sso/providers.ts:625)
- `<tenant kind>.created|updated|deleted` (tenant/releases.ts:451, 514)

Areas: access, access_grant, alert, api_key, app_domain, app_session, approval, binding, bundle, bundle_asset, connection, connection_group, dashboard, data_source, database_location, deployment, end_user, end_user_group, event, file, flow, flow_run, git_repository, group, group_member, identity_domain, identity_link, identity_provider, instance, member, operator, portal, promotion, resource, role, run, schedule, scim, scim_token, secret, service_account, sql, sso, table, tenant, tenant_import, tenant_member, trigger, variable, worker_credential, worker_pool, workspace, workspace_git. The console words them at render time (apps/console/src/screens/Audit.tsx:88).

**Platform events**: no list either; only the prefix `platform/` (manifest/src/bundle-check.ts:25).

| Event | Payload | Where |
|---|---|---|
| run-succeeded, run-failed | `runId, script, error?` | execution/runs.ts:557 |
| flow-run-finished | `flowRunId, flow, status` | flows/engine.ts:438 |
| row-changed | `table, change, id`, depth always 0 | routes/data.ts:211 |
| deployment-created | `deploymentId, bundleVersion` | execution.ts:707, 930; promotion-requests.ts:451 |

Stored only when subscribed (events.ts:140). Chain depth limit 10.

# C. Generators, ranked

| # | Item | Source of truth | Effort |
|---|---|---|---|
| 1 | Fix kinds generator (section E) | `fileSchemas()` in manifest/src/file-schema.ts, already the true file shape | S-M |
| 2 | API: page per tag, parameters, bodies, responses, limits, errors | openapi.json; add securitySchemes, servers, operationId, Problem | M |
| 3 | Platform events | make a registry from 5 names, type `publishPlatformEvent` by it | S |
| 4 | Audit actions | make `AUDIT_ACTIONS`, type `AuditInput.action`; mechanical, about 190 strings | M |
| 5 | Metrics | split: `observe` (kernel/metrics.ts:160) and inline `# HELP` in execution.ts:3399-3526; 22 series. docs/self-hosting.md hand-lists 15 | S-M |
| 6 | Flow nodes | `CORE_NODES` (packages/nodes), 5 nodes, schemas well described; built-in step types from manifest/src/flow.ts | S |
| 7 | Widgets | `CORE_WIDGETS` + `LABS_WIDGETS`: 15 widgets; 3 of 200 config fields have `description`, but 97 `x-volvel` hints carry labels/help to reuse | S-M |
| 8 | Page actions and conditions | widget-sdk/src/action.ts (SERVER_STEPS, 9 tests), manifest/src/action.ts | S |
| 9 | Shortcuts | console/src/kit/shortcuts.ts, one declared list | S |
| 10 | Connectors | `BUILTIN_CONFIG_SCHEMAS` (kernel/execution/connectors.ts:5): http, smtp, oauth2 | S |
| 11 | SQL functions | `ALLOWED_FUNCTIONS`/`ALLOWED_TYPES` (kernel/data/query/allowed.ts): names only, grouped by comment | S |
| 12 | Expressions (CEL) | no list: cel-js built-ins plus one overload (flows/expressions.ts:28), limits 250 ms/64 MB. Hand-write, or keep a list checked against the library | M |
| 13 | SDK reference | d.ts + JSDoc | L |

**SDK blocker:** the repo has TypeScript 7.0.2 only, native, with no JS compiler API (`ts.createProgram` is undefined). typedoc and api-extractor are absent. Options: pin TypeScript 5/6 as a docs-only dev dependency, or parse d.ts. `app` and `ui` export `src` directly, so emit declarations first.

# D. Gaps

**Kinds: 247 of 575 fields described (42.96%).** Floor 0.429 in packages/docs/coverage.json. Described / total:

| Kind | | Kind | |
|---|---|---|---|
| theme | 2/57 | interface | 61/137 |
| dashboard | 53/129 | flow | 35/72 |
| table | 11/30 | script | 19/34 |
| trigger | 18/29 | trigger_source | 5/12 |
| query | 4/8 | connector | 3/6 |
| role | 0/3 | tenant_role | 0/2 |
| variable | 0/2 | data_source | 0/2 |
| connection, connection_group, event, service_account | 1/2 each | schedule | 8/10 |
| app | 8/10 | binding | 6/8 |
| tenant_binding, group, end_user_group | 3/5 each | doc | 1/1 |

- Only `doc` and `connection_group` have a body description; 23 of 25 kinds have none.
- **Biggest wins:** theme (55 tokens) and the shared widget `source.visual.*` schema, counted in both interface and dashboard. Those two and theme are 207 of 328 undescribed fields.
- Other undescribed spots: all of table's policy rules; flow's nodes, edges, cases, delay, approval groups and cron/timezone/event; trigger's form fields; script's retries and source; `description` on nearly every kind.

**API: 443 operations; 410 ours, 33 better-auth**
- No summary: 35 (favicon and webmanifest, plus all 33 better-auth).
- **No description: 125 of our 410** (129 of all 443). Worst by tag (described/total): identity 22/39, worker protocol 9/20, single sign-on 31/42, data sources 3/10, permissions 8/15, tenancy 8/15, files 1/5, instance 13/18, data 13/18, SCIM 10/15, bindings 10/15.
- Parameters described 91/907 (includes `t`/`w` path IDs); body fields 48/391; response fields 701/3389.
- 335 of 664 responses say "Default Response".
- Error responses: 1 operation declares any (readyz 503).
- 0 operationIds, 0 `servers`, 0 `deprecated`. No Problem component; components hold only better-auth's 4 schemas.
- 62 `custom` routes: 24 name a permission in their description, 38 do not.

**JSDoc coverage** (text heuristic over re-exports; treat as ±5%)

| Package | Exports documented | Members |
|---|---|---|
| @volvel/sdk | 104/171, 61% | 254/436 |
| @volvel/app | 36/47, 77% | 43/87 |
| @volvel/ui | 137/197, 70% | 148/277 |
| @volvel/widgets | 43/66, 65% | 80/135 |
| @volvel/widgets/action | 9/14 | 5/13 |
| @volvel/widgets/page | 17/43, 40% | 30/66 |

Undocumented in sdk include `defineScript`, `defineWebhook`, `defineSchedule` and most `*Options`.

# E. Bugs, gotchas, open questions

1. **Kinds: "Needed" is wrong for unions.** `fieldsOf` (schema.mjs) keeps `required` from the one form that has the field. flow shows `nodes.*.values`, `cases`, `seconds`, `cron` as needed for every node. Types are lost too: `nodes.*.type` prints only `"trigger"`. Step types cannot be read from the page, so one table per form is needed.
2. **Wrong file name:** the page says `doc` is `<name>.doc.yaml`; it is `docs/<path>.md`. `entry` and `source` are shown for script, connector and trigger_source, but `forFile` strips them from files.
3. **Envelope undocumented:** `key`, `path`, `title`, `schemaVersion`, `body` appear on no kind page. Tenant kinds' folders (roles, groups, end-user-groups, service-accounts, bindings) are not shown. Titles are generic ("What a app may say").
4. No defaults, enum-list values, min/max or patterns; no examples.
5. api.md splits into 37 tags including `Default`, `other` and `Vx-single-sign-on`. better-auth lists routes that are off or unused (sign-up, social, change-email, delete-user): hide or curate. `worker protocol` and SCIM should leave the main list.
6. api.md prints `x-access` custom as "Decided by what is asked for" (62 rows): weak. "Anyone" for webhooks and approval links hides that the token is the credential.
7. SCIM's `documentationUri` points to `/api/v1/docs`, which does not exist (routes/scim.ts:479).
8. `securitySchemes` is missing although the info text describes both. Only better-auth operations set `security`.
9. Webhook, file upload and MCP bodies are not described in OpenAPI; SSE, file content and MCP are typed as plain JSON or string.
10. `docs:check` in CI runs the API generator (needs Postgres), but `stale()` skips `api.md` and `openapi.json`, so nothing fails when they change. Gate or snapshot before publishing.
11. `trustProxy: true` (app.ts:105): per-address limits and audit IPs trust the forwarded header, so a directly exposed instance lets callers choose theirs. Document as a proxy requirement.
12. `run-cancelled` has no platform event, while `flow-run-finished` carries `status`. Intentional?
13. Metric names keep the prefix `platform_`, while the product headers say `volvel-` and cookies `vx_`. Confirm before documenting as stable.
14. Versioning: no stated policy for `/api/v1` changes, or for deprecating routes. Needs an owner decision before the page is written.
15. better-auth's own limits, and whether `signed-in` routes should be open to service accounts, need confirming.
