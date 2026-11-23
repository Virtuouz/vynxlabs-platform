# Inventory: api and reference

Refreshed 2026-11-23 (phase 30 M0), against the code at `4992c9da`. Written first from the code at `270e509` on 2026-11-22. A brief for the writer, not checked prose.

**What changed in this brief.** Phase 29 made the API describe itself (tags, security schemes, operation IDs, error responses, "needs" text on every route), added `TRUSTED_PROXIES`, renamed the metrics to `volvel_`, added the `platform/run-finished` event, made every draft save name its revision, and set the policy for `/api/v1` (D56). Section B is re-checked line by line and corrected. Section A has new and retyped pages. Section C records which generators now have a source of truth. Section E is closed: each old finding says how phase 29 settled it, or that phase 30 M9 does.

**Counts come from a run of the app on a throwaway database** (`startTestApp`, then `GET /api/v1/openapi.json`; the copy in `packages/docs/generated/openapi.json` is from 22 Nov 13:01 and is stale, so do not read counts from it). Re-run the generator before writing a number into a page.

**Not verified in this refresh:** the per-kind table of described fields (only the total was re-run), the count of audit actions, the field counts of bodies and responses in OpenAPI, the JSDoc table, how many lists have no `nextCursor` (the test `LISTS_NOT_YET_SAID`, `cp/app.test.ts:226`, holds 32 not yet converted), and better-auth's own paths and limits beyond what `fixed/host.md` says.

Paths are relative to the repository root. "cp" is apps/control-plane/src. `generated/` and `dist/` are gitignored (`packages/docs/generated`).

Vocabulary the pages must use: Flow, "access changes" (the route paths and the codes `release_stale`, `own_release` keep the word "release"; say so once, do not rename them), canceled (the stored status value and the event payload are the word `cancelled`: quote it as a value in code font, write "canceled" in prose), Deploy (dev) / Versions (production), "Deploy this version" / "Roll back to this version", Apps. The API itself still says "Activate a bundle" for `POST …/deployments` (cp/routes/execution.ts:759): see E.

# A. Proposed pages

Collection for all of these is Develop unless said. Types: T tutorial, H how-to, R reference, X explanation.

**`content/develop/api/` (to write in phase 31)**

| # | Page | Type | Purpose | Sources |
|---|---|---|---|---|
| 1 | index: base URL, OpenAPI, first call | T | Make the first call with an API key and read the answer | cp/app.ts:88 (prefix), 211-262; cp/api-description.ts:94 |
| 2 | authentication | R | The credentials, what each reaches, the cookie rules, expiry of keys | cp/kernel/principal.ts:11, 47-135; cp/routes/identity.ts:101-144; B "Credentials" |
| 3 | errors and retries | R | Problem bodies, the 61 codes, what to retry | cp/problem.ts; packages/manifest/src/errors.ts:25; cp/api-description.ts:118-133 |
| 4 | rate limits | R | Each limit, per address, and `TRUSTED_PROXIES` | B "Rate limits"; cp/kernel/ratelimit.ts; cp/config-vars.ts:298 |
| 5 | lists, filtering and aggregates | R | `limit`, `cursor`, `nextCursor`, lists with no cursor | cp/pagination.ts:5, 29-52 |
| 6 | rows | R | Filters, sort, expand, insert limits, CSV, reading as someone | cp/kernel/data/rows.ts:505-640; cp/routes/data.ts:52, 134, 332 |
| 7 | runs, flows and idempotency | H | Start a run or a flow run, safely twice | cp/routes/execution.ts:1318, cp/routes/flows.ts:906, cp/routes/mcp.ts:302 |
| 8 | revisions and conflicts | X | Why a save is refused with `draft_changed`, and `create` | cp/kernel/authoring.ts:289-318; cp/routes/authoring.ts:596-610; cp/routes/dashboards.ts:391-421 |
| 9 | how the API changes, and renamed resources | X | The policy (D56), `deprecated`, the 90-day alias and its headers | cp/api-description.ts:83-90; cp/kernel/resolve.ts:4, 184-192 |
| 10 | run event stream (SSE) | R | Events, limits, what a caller is sent | cp/routes/stream.ts:15-125; cp/kernel/stream.ts:67-69 |
| 11 | batch | R | The six routes, 100 items, per-item answers | cp/routes/batch.ts:19, 110-263; cp/routes/authoring.ts:691 |
| 12 | files and uploads | H | Upload a file, a bundle, an app asset, an import | B "Uploads" |
| 13 | webhooks in | H | Start a run from a webhook, verify its signature | cp/routes/execution.ts:3715-3800; cp/kernel/execution/triggers.ts:155, 204 |
| 14 | MCP | H | Connect an agent to a workspace | cp/routes/mcp.ts:599-830 |
| 15 | SCIM | R | What the provider routes accept (the provider setup page stays under Administer) | cp/routes/scim.ts:44, 388-415, 488-510 |
| 16 | worker protocol | R | What a worker calls. Mark it for contributors to the platform | docs/contracts/worker-protocol.md; cp/routes/worker.ts |
| 17 | access changes through the API (new, D53) | H | Plan and apply a tenant's access with a script; YAML is the only file form | cp/routes/access-releases.ts:126-523; fixed/t3-cli-docs.md "tenant release" |
| 18 | errors of one route (not built: the codes one route can answer are not listed, `fixed/api2.md` API-10) | none | Say it is not there; the page says which classes follow from the route | cp/api-description.ts:118-133 |

Page 18 is a note for page 3, not a page.

**`generated/` (mounted as `reference/`, so do not create `content/reference`)**
- Already generated: `permissions`, `settings`, `cli`, `errors`, `kinds/<kind>` and `docs/*` (packages/docs/generated, from packages/docs/generators/reference.mjs:314). Settings is drawn from `cp/config-vars.ts`.
- To generate (M9): `api/<tag>`, one page per tag (33 tags, R); `audit-actions` (R, Administer); `events` (R); `metrics` (R, Self-host); `shortcuts` (R, Console); `flow-nodes`, `widgets`, `page-actions`, `expressions`, `sql-functions`, `connectors`, `trigger-sources` (R); `sdk/{sdk,app,ui,widgets}` (R).
- Worker protocol and SCIM leave the main tag list and get their own pages (API-06 left this to M9, `fixed/api2.md`).

**Not built, say so:** outbound webhooks (alerts notify through a connection); a general rate limit on authenticated traffic; ETag and If-Match; CORS; GET or SSE on the MCP route; bulk, sort and password change in SCIM.

# B. Facts

**Base and headers**
- Prefix `/api/v1` (cp/app.ts:88). One scheme; the policy is in `API_POLICY` (cp/api-description.ts:83-90, D56): within `v1` the API only grows (a route, an answer field, an optional parameter); something to be removed is marked `deprecated` in the description and keeps working at least 90 days after the release that says so.
- IDs are UUIDs. The API takes `{t}/{w}` IDs; the CLI takes slugs.
- 31 paths end in a wildcard `{*}` and carry resource paths (`WildParams`, cp/routes/data.ts:36).
- `GET /api/v1/openapi.json` is public and cached per process. It is our routes plus better-auth's (cp/app.ts:262 on). It carries `tags` (33, each described), `components.securitySchemes` (`bearerAuth`, `cookieAuth`), `servers: [{url: "/"}]` (paths already start `/api/v1`), a `Problem` component, an `operationId` on each of the 453 operations, `x-access` on ours (with `says`), and `x-error-codes` (61, with status and title).
- Responses carry `x-request-id`; an incoming one is kept if it matches `[A-Za-z0-9._-]{1,128}` (app.ts:90, 119-122). They also carry `x-trace-id`; a W3C `traceparent` is joined (app.ts:162-170).
- At a tenant's registered hostname the API answers for that tenant only, and 404 otherwise (kernel/http.ts:266-269).
- A scoped lookup with no standing answers 404, not 403 (`authorize`, kernel/http.ts:169).
- No CORS: no `access-control-*` anywhere in cp/. A cookie plus a foreign `Origin` on a write gets 403 `cross_site` (kernel/principal.ts:81-93).
- The caller's address, used for rate limits and the audit log, is what the proxy saw: `TRUSTED_PROXIES` (default `1`, a count of proxies; `0` for none; or networks) (cp/config-vars.ts:298, app.ts:104-117). The proxy must set `X-Forwarded-For` itself. The library's own address header is rewritten from `request.ip` (`fixed/host.md`, HOST-05). With one hop and no proxy a caller can still write the last entry: tell them to use `TRUSTED_PROXIES=0`.

**Credentials**

| Prefix | What | Where |
|---|---|---|
| `vxk_` | API key, member or service account, optional `expiresAt` (refused once past), shown once | kernel/principal.ts:11, 27-31; routes/identity.ts:101-144 |
| session cookie | prefix `vx_member`, `/auth/*` through better-auth, main address only; 7 days (`CONSOLE_SESSION_DAYS`, D51) | kernel/auth.ts:82, 111; config.ts:125 |
| `vxs_` | app sign-in, cookie `vx_app_<tenant>`; end user 30 days, member 12 hours | kernel/apps/sessions.ts:8-16 |
| `vxw_` | worker | kernel/execution/workers.ts:10 |
| `WORKER_HOST_TOKEN` | host protocol; the routes answer 404 unless `MANAGED_WORKERS=host` | kernel/http.ts:370-382 |
| `vxp_` | SCIM | kernel/sso/scim.ts:26 |
| `vxh_` / `vxf_` | webhook / form address token | kernel/execution/triggers.ts:155-157 |
| approval link | 48 hours, single use, GET decides nothing, POST decides, a rejection needs a comment, 410 `link_expired` | kernel/flows/approval-links.ts:20, routes/approval-links.ts |
| `METRICS_TOKEN` | scrape `/metrics`, or a member or key with `instance:read` | routes/execution.ts:3996-4020 |

- `resolvePrincipal` accepts only `Authorization: Bearer vxk_…`. Any other Authorization header is 401 "The Authorization header must be: Bearer <api key>.", even with a valid cookie (principal.ts:106-114).
- API keys carry no scopes of their own: they act as their owner. A disabled member's keys are refused (principal.ts:45-52).
- Service-account keys reach only their tenant. `signed-in` routes refuse a service account's key, unless the route is declared `signedInOrKey` (D14, API-19): `GET /me` and the batch route (kernel/http.ts:56, 285-289). They also refuse end users and member app sign-ins.
- Access kinds of our 420 operations: 254 permission, 77 custom (each with a `says`), 28 public (8 of them say what token they need), 24 signed-in (2 allow service accounts), 20 worker, 15 SCIM, 2 worker host. The 33 library routes carry none.
- Sessions: `/auth/list-sessions`, `/auth/revoke-session`, `/auth/revoke-other-sessions`, `/auth/change-password` are used by the Account screen (`fixed/t3-account.md`, `fixed/ins2.md`).

**Errors**
- RFC 9457 `application/problem+json`: `type` (always `about:blank`), title, status, detail, instance, code, requestId, `errors[{path,message}]` (cp/problem.ts).
- 61 codes in packages/manifest/src/errors.ts:25, listed with status and title at `x-error-codes`. New since the first reading include `trigger_paused` (a webhook paused alone), `console_code_off`, `staged_elsewhere`, `path_taken`.
- Every own operation declares `5XX` as Problem; `400` when it takes a body, query or header; `401` and `403` unless public; `404` when it has a path parameter or asks a permission (`fixed/api2.md`, API-10).
- Sign-in errors pass on better-auth's code, lowercased.
- Postgres mappings: 23505/23503 to `conflict`; 23514/22P02 to `bad_request`; 25006 to `read_only` (Retry-After 30); pool timeout to `busy` (2 s); 57014 to `busy` (5 s) (problem.ts:81-107).
- SCIM uses SCIM error bodies, not problems (routes/scim.ts:384-415).

**Rate limits** (opt-in per route, fixed window, kept in Postgres, so shared by replicas; routes/…, kernel/ratelimit.ts; `app.ts:211`). Per minute, per address:

| Route(s) | Limit |
|---|---|
| anonymous callers on app-facing routes (`guestLimit`, kernel/http.ts:86) | 120 |
| webhooks (execution.ts:3717) | 120 |
| SCIM (scim.ts:388) | 1200 |
| expression value (flows.ts:331) | 240 |
| SSO (sso.ts:155) , app hand-off (apps.ts:155), OAuth connection callback (execution.ts:3115) | 60 |
| approval links (approval-links.ts:14) | 30 |
| end-user sign-in (endusers.ts:132) | 20 |
| end-user sign-up (endusers.ts:133) | 5 |
| member sign-in, sign-up, change of password or email, reset and verification mail, per address and path (kernel/auth.ts:23) | 20 |

Other better-auth paths keep its own 100 per 10 seconds. Authenticated API traffic has no general limit. File downloads for guests are counted in each replica's memory (`fixed/` lanes t2-docs, t4-gov-docs: `docs/self-hosting.md`).

**Lists**
- `limit` 1 to 200, default 50; `cursor` is opaque; the answer is `{items, nextCursor}` (pagination.ts:5-6). Rows allow `limit` up to 1000 (routes/data.ts:52; kernel/data/rows.ts:639).
- 20 operations take `cursor`. A list with no cursor says in its response description whether it is whole ("Every one there is. The list has no cursor.") or cut ("At most N", `listOf(item, cap)`, pagination.ts:29-52). Caps: clones 50, bundles 100, deployments 100, promotion requests 200, files 200, recent items 20, provider links now page with a cursor. 32 routes still have it said in words only (`app.test.ts:226`).

**Rows**
- `filter` is a JSON string, up to 50 conditions, with `and`/`or` (rows.ts:505).
- Operators: eq, ne, gt, gte, lt, lte, in (1 to 200 values), contains and not_contains (text, case-insensitive), is_null, has (enum_list) (rows.ts:567-601). Omitted `op` means eq.
- `sort=-a,b`; `expand` up to 5; `as` and `asGroup` need `data_all:read` (routes/data.ts:332, 668-680).
- Insert 1 to 1000 rows; row deletions up to 1000; CSV cap 100,000 (data.ts:134, 1099).
- Cursors are keyset for a one-column sort on a table with a non-number key, and offset otherwise (rows.ts:633-740).
- Row changes are not audited one by one (data.ts:928), except through page actions.
- A file an insert or patch names must be a file of this workspace that the caller could read; deleting a row keeps its files for the audit period (D22; `fixed/files.md`).
- A guest cannot start a script or a flow (403): `POST runs` and `POST flow-runs` (D39, `fixed/app.md` APP-02).

**Idempotency**
- Body `idempotencyKey` (1 to 200 characters) on `POST runs` (execution.ts:1318) and `POST flow-runs` (flows.ts:906). Header `idempotency-key` on webhooks only (execution.ts:3740).
- MCP adds an `idempotencyKey` argument, stored as `mcp:<principal>:<key>` (mcp.ts:302, 367).
- Scope is workspace plus script or flow path, former paths included. A replay with different input returns the first run silently.

**Revisions**
- No ETag or If-Match; SCIM says `etag: false` (scim.ts:508). Optimistic concurrency is a body `revision` on drafts and dashboards.
- Drafts: a save names the revision it saw, or says `create: true` for something new. A save that names neither over an existing draft, or names a draft that is gone, is 409 `draft_changed`, for every kind (kernel/authoring.ts:295-318; routes/authoring.ts:601-610). `create: true` over a path that is taken is 409 `path_taken`. Earlier, only `doc` drafts conflicted: that is gone. The history route keeps the newest thirty replaced or set-aside drafts (authoring.ts:836-845).
- Dashboards: `revision` back to be told if it was saved in between (dashboards.ts:391-421).
- Access changes that wait: approving one after the tenant's access changed is 409 `release_stale` (kernel/tenant/releases.ts:1158); approving your own is `own_release`; `approval_needs_two` when nobody else can answer. A route may answer `waiting: true` instead of applying (routes/shared.ts:64-71; access-releases.ts:326, 497). With two-person approval on, a role given straight to a member or to every end user applies at once and the screen says so (D63); groups, service accounts and end-user groups wait. A service account may not approve (D9).
- `staged_elsewhere` is an import staged on another replica (routes/portability.ts:159), not a promotion.

**Renames**
- An old path answers for 90 days with `Deprecation: @<unix>`, `Sunset`, `Volvel-Resource-Moved` and `Warning: 299` (kernel/resolve.ts:4, 184-192).

**SSE**
- `GET /tenants/{t}/stream`. Events: `ready` (or `snapshot` when `Last-Event-ID` is sent), `snapshot`, `run`, `flow_run`, `step`, `log`. Data is `{k,w,id,flow?,node?,s?,p?}`; an event names what changed, never the data (routes/stream.ts:20-117).
- Heartbeat is a `: ping` comment every 20 s, `retry: 3000`. At most 5 streams per caller per replica; a caller who may read no runs anywhere is sent only their own and gets 2. 429 `too_many_streams`. A member who may read runs in another workspace still follows their own runs (APP-01, `fixed/app.md`). No replay: `Last-Event-ID` only yields `snapshot`. Rights are read once when the stream opens; a person whose sessions end loses their streams on that replica (`fixed/acc.md`, INS-02).
- The OpenAPI response is typed `text/event-stream`.

**Batch**
- 6 routes, up to 100 items, each done through its own route as the caller, one at a time, 200 with a per-item `status`: runs, flow-runs, trigger-pauses, drafts/batch-discard and approvals/batch (routes/batch.ts:19-263), and `drafts/batch` (routes/authoring.ts:691), which refuses all when one revision is stale.

**Uploads**
- Bundle 20 MiB (kernel/execution/bundles.ts:21); file 25 MiB, raw body, `?name=` (kernel/data/files.ts:21); app asset 25 MiB, by sha256 (kernel/apps/assets.ts:10); logo 512 KiB (routes/branding.ts:17); icon 256 KiB (kernel/icons.ts:18); tenant import 50 GiB with `x-export-passphrase` (routes/portability.ts:24, 146). File downloads are attachments (routes/sources.ts:692). Files an app no longer names are swept after a deploy, 7 days later (D40, `fixed/app.md`). The OpenAPI description now declares the content type of the uploads and the webhook (`fixed/fix-close.md`, API-13).

**Webhooks in**
- `POST /hooks/{token}`. HMAC sha256 or sha1; hex or base64; prefix; `signed` template; timestamp tolerance 300 s (kernel/execution/triggers.ts:189-230).
- 401 `signature_invalid`; 503 `workspace_paused` (the workspace's triggers are paused) or `trigger_paused` (this webhook, or every trigger in the instance); 202 `{runId}`. `respond: flow` waits up to 25 s and returns `x-flow-run`. `authorization`, `cookie` and `proxy-authorization` are not passed on (triggers.ts:196).
- A renamed webhook or form step changes its address unless the trigger has a `key`; the editor sets `key` to the old name on rename, and a deploy lists the stopped address under breaking changes (D33, `fixed/flw.md`).
- **No outbound webhooks exist**; alerts notify through a connection instead.

**MCP**
- `POST …/workspaces/{w}/mcp`, stateless streamable HTTP, JSON answers, no GET or SSE (mcp.ts:783-830). Also `GET …/service-accounts/{id}/tools` and `POST …/service-accounts/{id}/tools/call` for the console to try an agent's tools (mcp.ts:599, 676).
- Tools are scripts and flows (up to 200), `get_run`, `get_flow_run` and the approval tools. Calls wait 25 s, then return the run ID (mcp.ts:40-42). Another person's run and a waiting approval are masked as on screen; the caller's own are given as they are (D13).

**SCIM**
- Users and Groups; PATCH and filter yes; bulk, sort, etag and changePassword no; max page 200 (scim.ts:44, 503-508). `documentationUri` is removed: no page exists to point at; phase 30 adds it with the SCIM page.

**Route groups.** The route files are no longer the unit; the description's tags are. Operations per tag (453 in all; 420 ours and 33 library): runs 26, flows 23, instance 20, end users 20, tenancy 19, data 18, deploys 16, permissions 15, bindings 15, SCIM 15, authoring 14, git 13, branding 10, data sources 10, apps 10, access 9, workers 9, audit 8, resources 7, portability 7, domains 6, files 5, dashboards 5, docs 4, secrets 4, agents 3, health 2, events 2, worker host 2, identity 41, single sign-on 42, worker protocol 20, sign-in 33 (library). New since the first reading: `GET /instance/settings` (routes/instance-settings.ts, `instance:read`), `GET /instance/audit-facets`, `GET /instance/tenant-imports/staged`, `GET …/allowed?permissions=a,b`, `consoleCode` on tenants, `GET …/deployment-preview`, `message` on `POST promotions`.

**Audit actions**: still no list. Strings are typed inline (`AuditInput.action: string`, kernel/audit.ts:39). A grep of `action: "area.verb"` finds 150 distinct literals; the first reading said 182 by another count, so recount with the generator. About 5 computed families remain (`end_user.*`, `page_action.*`, `identity_provider.*`, `<tenant kind>.created|updated|deleted`, and actions written through a template such as `${x}.created`). The console words them at render time (apps/console/src/screens/Audit.tsx:71-95). Phase 30 M9 makes a typed registry (`fixed/sweep-console.md`, t2-govb).

**Platform events**: `PLATFORM_EVENTS` is now the one list (packages/manifest/src/bundle-check.ts:34), read by the console's editors (apps/console/src/kit/platformEvents.ts):

| Event | Payload |
|---|---|
| `run-succeeded` | `runId`, `script` |
| `run-failed` | `runId`, `script`, `error?` |
| `flow-run-finished` | `flowRunId`, `flow`, `status` (succeeded, failed or `cancelled`) |
| `deployment-created` | `deploymentId`, `bundleVersion` |
| `row-changed` | `table`, `change` (inserted, updated or deleted), `id` |

`platform/run-finished` (`runId`, `script`, `status` of succeeded, failed or `cancelled`, `error?`) is published for every run that ends, canceled ones included (kernel/execution/runs.ts:645, 677-680; D50), and is **not in `PLATFORM_EVENTS`**: see E. The older two stay. Cancel announces after the commit, from the run cancel route, the flow-run cancel route, both bulk cancels and a flow's own advance. Events are stored only when subscribed. Chain depth limit 10. A poll that returns more than 100 items fails its tick and says so (D26).

**Metrics**: every series is `volvel_…` (D55; kernel/metrics.ts:160-215, routes/execution.ts:3837-3990); 22 series; the guide `docs/self-hosting.md` lists each, and `guide.test.ts` and `metric-names.test.ts` check it. Read at `GET /api/v1/metrics` by a member or key with `instance:read`, or a scraper with `METRICS_TOKEN`.

# C. Generators, ranked

| # | Item | Source of truth | Effort |
|---|---|---|---|
| 1 | Kinds | `fileSchemas()` in packages/manifest/src/file-schema.ts, already the true file shape (API-01..05, M9) | S-M |
| 2 | API page per tag | `/api/v1/openapi.json`, which now has tags, `securitySchemes`, `operationId`, `Problem`, `x-error-codes`, and `x-access.says`. Change `needs()` in packages/docs/generators/api.mjs:15-35 to print `says` in place of "Decided by what is asked for" and "Anyone"; filter the library's `sign-in` routes by an allow-list (API-07) | M |
| 3 | Platform events | `PLATFORM_EVENTS` exists; add `run-finished`, and make `platform-events.test.ts:12` see names given as arguments | S |
| 4 | Audit actions | make `AUDIT_ACTIONS` and type `AuditInput.action`; the registry also catches template actions | M |
| 5 | Metrics | `observe` (kernel/metrics.ts:160) and the `# HELP` lines in routes/execution.ts:3837-3990 | S-M |
| 6 | Flow nodes | `CORE_NODES` (packages/nodes/src/index.ts:48); built-in step types from packages/manifest/src/flow.ts | S |
| 7 | Widgets | 15 core widgets (`core/table` to `core/approvals`, packages/widgets-core/src/index.ts; `labs/goal` is now `core/goal`, D37) and `labs/probe` (packages/widgets-labs/src/index.ts:17); reuse the `x-volvel` hints for labels and help | S-M |
| 8 | Page actions and conditions | packages/widget-sdk/src/action.ts:54 (`SERVER_STEPS`: update, create, delete, flow, script), packages/manifest/src/action.ts | S |
| 9 | Shortcuts | apps/console/src/kit/shortcuts.ts | S |
| 10 | Connectors | `BUILTIN_CONFIG_SCHEMAS` (kernel/execution/connectors.ts:5): http, smtp, oauth2 | S |
| 11 | SQL functions | `ALLOWED_FUNCTIONS` and `ALLOWED_TYPES` (kernel/data/query/allowed.ts:13, 59) | S |
| 12 | Expressions (CEL) | no list: cel-js built-ins plus the overloads in kernel/flows/expressions.ts; limits 250 ms, 64 MB (:113-114), 2000 AST nodes, depth 64, 200 list elements and map entries, 16 call arguments (:29) | M |
| 13 | SDK reference | d.ts and JSDoc | L |

**SDK blocker, decided:** the repo has TypeScript 7.0.2 only, native, with no JS compiler API; typedoc and api-extractor are absent. D58: a docs-only TypeScript 6, once its version and license are confirmed. `app` and `ui` export `src` directly, so emit declarations first. The packages are `@volvel/sdk`, `@volvel/app`, `@volvel/ui`, `@volvel/widgets` (with `./action` and `./page`), and `@volvel/sdk/testing` (`runScript`, `testContext`, `memoryTable`; `fixed/t3-cli-docs.md`, CLI-MP5).

# D. Gaps

**Kinds: 248 of 576 fields described (43.1%)**, as `node packages/docs/check.mjs` says now. The floor in packages/docs/coverage.json is 0.429. The per-kind table of the first reading (theme 2/57, interface 61/137, dashboard 53/129, flow 35/72 and so on) was not re-run; the biggest gaps it named were theme and the shared `source.visual.*` schema. Only `doc` and `connection_group` had a body description. Rerun before writing.

**API: 453 operations; 420 ours, 33 better-auth.**
- Every one of ours has a summary and a description, a tag, an `operationId`, `security`, and error responses; no response says "Default Response" (`fixed/api2.md`, API-06, 08, 09, 10).
- The 33 library operations have no summary (API-07, left to M9). Four operations in all have no description.
- Parameters described 128 of 990 (includes `t` and `w`). Body and response field counts were not re-run.
- Declared `deprecated`: 0. Nothing is deprecated yet.
- Descriptions of some routes "say less than they could" (`fixed/api2.md`).

**JSDoc coverage** was a text heuristic at the first reading (sdk 61%, app 77%, ui 70%, widgets 65%, widgets/action 9 of 14, widgets/page 40%). Not re-run. Undocumented in sdk included `defineScript`, `defineWebhook`, `defineSchedule` and most `*Options`.

# E. Findings, settled

1. **Kinds: "Needed" wrong for unions; wrong file name for `doc`; `entry` and `source` shown though files do not carry them; envelope undocumented; no defaults, enum values or examples** (API-01 to 05): not fixed in phase 29; settled as phase 30 M9 (`outcomes.md`). Facts the writer needs: `doc` is `docs/<path>.md`; `forFile` strips `entry` and `source` (packages/manifest).
2. **api.md tags, library routes, "Decided by what is asked for", missing securitySchemes, untyped hooks, uploads and SSE** (API-06, 09, 11, 13): fixed in phase 29 (`fixed/api2.md`, `fixed/fix-close.md`). Left to M9: a page for each tag, the library's routes filtered (API-07), `needs()` printing `says`.
3. **SCIM `documentationUri`** (API-12): removed (`fixed/api2.md`). Phase 30 adds it with the SCIM page.
4. **`docs:check` ignores `api.md` and `openapi.json`** (API-14, 23): `pnpm docs:check` now runs the staleness check before the API generator rewrites (DOC-12), but `KEPT` in packages/docs/generate.mjs still skips both in `stale()`. Left to M9.
5. **`trustProxy: true`** (API-15, 20, D15): fixed by `TRUSTED_PROXIES` and a Postgres-counted sign-in limit (`fixed/host.md`). The guide must name the setting and the three headers.
6. **No event for a canceled run** (API-16, D50): fixed, `platform/run-finished`. New gap: the event is missing from `PLATFORM_EVENTS` (S, M9).
7. **Metric names `platform_`** (API-17, D55): fixed, `volvel_` (`fixed/host2.md`). Dashboards and alerts that used the old names must be renamed: say so in the CHANGELOG and the metrics page.
8. **Versioning policy** (API-18, D56): decided and in the description (`fixed/api2.md`). Page 9 states it.
9. **Service accounts on `signed-in` routes** (API-19, D14): refused unless declared (`fixed/acc.md`). better-auth's own limits are now configured (`fixed/host.md`).
10. **Lists with no cursor** (API-21): described; 32 routes still to convert.
11. **Vocabulary left in the API's own text:** `POST …/deployments` is "Activate a bundle" (cp/routes/execution.ts:759), `POST …/git/release` says "release branch". Owner's words are Deploy and Roll back (D54): change the summaries before the generator draws them, or the page will contradict the console. Not changed in this refresh (inventory only).
12. **Open, asked of the owner or not answered:** `CLI-MP7` (`volvel dev` for interface and docs apps) is decided (D64) and is built in phase 30 M1b, not yet; Git sync and `volvel.yaml` `resources` (D65, the file wins); ACC-27 settled by `fixed/fix-close.md`.
