# Findings: api and reference

Slice: [api-and-reference](../inventory/api-and-reference.md), section E, plus the claims in B, C and D. Prefix API. Settled at `270e509` by reading the code and the generated output in `packages/docs/generated/` (no database or instance needed). Nothing was fixed. "M9" is phase 30 milestone 9 (generators). Phase 29 milestones are only named where the fix is in the console or CLI.

Who settles: **M9** = the generator work changes it. **P29** = control-plane or manifest code, outside the generator, so phase 29 should. **Both** = M9 shows it, P29 must fix the source.

### API-01 Kinds pages say "Needed" for fields that only one form of a union needs
- **Outcome:** confirmed by code
- **Severity:** wrong
- **Where:** packages/docs/generators/schema.mjs:27-48
- **Evidence:** a field seen in one form only keeps that form's `required`. The AND at line 46 helps only when the path appears twice. Flow's `nodes.*.values`, `cases`, `seconds`, `cron` show as needed for every node.
- **Fix:** emit one table per union form (keyed by the discriminator, e.g. node `type`) and keep literal types. Test: a flow page where `cron` is needed only under the schedule form. Same in the dashboard and interface kinds (all unions).
- **Size:** M. **Settled by:** M9 (item 1 of the generator ranking). **Milestone:** phase 30 M9

### API-02 The `doc` kind page names the wrong file
- **Outcome:** reproduced (the generated page says `<name>.doc.yaml`, line 6 of `generated/kinds/doc.md`)
- **Severity:** wrong
- **Where:** packages/manifest/src/files.ts:218, 247 (the file is `docs/<path>.md`); packages/docs/generators/ (the sentence)
- **Evidence:** `tenant.ts:239` and `file-schema.ts:49` name every kind `<key>.<kind>.yaml`; `doc` is the exception and the generator does not know it.
- **Fix:** let the kind definition carry its file pattern and have the page read it. Test: every kind page's file name matches `fileFor()`.
- **Size:** S. **Settled by:** M9. **Milestone:** phase 30 M9

### API-03 `entry` and `source` are shown for script, connector and trigger_source, but files do not carry them
- **Outcome:** confirmed by code
- **Severity:** wrong
- **Where:** packages/manifest/src/file-schema.ts:30 (`forFile`) against the body schema the generator reads
- **Evidence:** the generator reads the body schema; `fileSchemas()` is the file shape and already strips them.
- **Fix:** generate from `fileSchemas()` (the inventory's own suggestion). Test: no field on a kind page that the file schema rejects.
- **Size:** S. **Settled by:** M9, with API-01. **Milestone:** phase 30 M9

### API-04 The file envelope and tenant-kind folders are on no kind page
- **Outcome:** missing part (documentation generator)
- **Severity:** rough
- **Where:** manifest/src/file-schema.ts:49; tenant.ts:239 (`definition.folder`)
- **Evidence:** `key`, `path`, `title`, `schemaVersion`, `body` are in no page; titles read "What a app may say".
- **Fix:** one shared "file envelope" section and the folder per kind; fix the article ("a/an") in the title template.
- **Size:** S. **Settled by:** M9. **Milestone:** phase 30 M9

### API-05 Kinds pages have no defaults, enum values, ranges, patterns or examples; 42.96% of fields described
- **Outcome:** missing part
- **Severity:** rough
- **Where:** packages/docs/coverage.json (floor 0.429); theme 2/57, interface 61/137, dashboard 53/129
- **Evidence:** the inventory's numbers are consistent with the floor file. Theme tokens and the shared `source.visual.*` schema are 207 of 328 undescribed fields.
- **Fix:** M9 prints defaults, enums, min/max, patterns. The descriptions are manifest source text and are P29 work: add `description` to the schemas in packages/manifest/src, theme and `source.visual` first, then raise the floor in coverage.json. Test: the coverage gate.
- **Size:** L (descriptions), S (printing). **Settled by:** Both. **Milestone:** phase 30 M9 plus P29

### API-06 The API reference splits into 37 tags, including `Default`, `other` and `Vx-single-sign-on`
- **Outcome:** confirmed by code
- **Severity:** rough
- **Where:** apps/control-plane/src/app.ts:204 (no `tags` list); route `schema.tags` across cp/routes
- **Evidence:** the design document counts 32 operations under `Default` and 2 untagged. Names come from per-route strings, not one registry.
- **Fix:** P29: tag every route from one typed list of tags (with a summary each) so a missing tag fails typecheck. M9 then makes one page per tag and moves worker protocol and SCIM out of the main list. Test: no operation without a tag in the described app.
- **Size:** M. **Settled by:** Both. **Milestone:** phase 30 M9 plus P29

### API-07 Better-auth routes are listed although some are off or unused
- **Outcome:** confirmed by code
- **Severity:** wrong
- **Where:** cp/app.ts:228-252 (merge of better-auth's description); cp/auth.ts
- **Evidence:** 33 operations come from the library with no summary. Sign-up, social, change-email and delete-user are on the list.
- **Fix:** M9 filters the merged description by an allow-list of the paths the instance serves. Where a feature is switched off in the auth config, the allow-list is derived from that config, not typed twice. Test: every listed auth path answers something other than 404.
- **Size:** S-M. **Settled by:** M9. **Milestone:** phase 30 M9 (docs-generator work: left to phase 30, `fixed/fix-close.md`)

### API-08 125 of 410 routes have no description; 35 have no summary; 335 of 664 responses say "Default Response"
- **Outcome:** confirmed by code (counts from the generated `openapi.json`, which is stale by 40 minutes against the others but is a valid reading)
- **Severity:** rough
- **Where:** route declarations in apps/control-plane/src/routes/*.ts; worst: identity 22/39, worker protocol 9/20, single sign-on 31/42, data sources 3/10
- **Evidence:** the same file.
- **Fix:** P29: write the descriptions at the routes, and give each response a description. M9 cannot invent them. Add a test that fails on an undescribed route, with the current ones listed so it ratchets down (as coverage.json does).
- **Size:** L. **Settled by:** P29. **Milestone:** phase 30 M9 gate, P29 text

### API-09 No `securitySchemes`, `servers`, `operationId`, or Problem component; only better-auth routes set `security`
- **Outcome:** confirmed by code
- **Severity:** rough
- **Where:** cp/app.ts:200-215 (info text describes both schemes)
- **Evidence:** no `securitySchemes` anywhere in app.ts; generated components hold better-auth's four schemas.
- **Fix:** P29: add `bearerAuth` (`vxk_`), a cookie scheme, `servers: [{url: "/api/v1"}]`, a `Problem` component and a shared error-response map, and derive `operationId` from method plus path. M9 renders them. Test: every operation has an operationId, unique.
- **Size:** M. **Settled by:** P29. **Milestone:** phase 30 M9 plus P29

### API-10 Error responses are declared on one operation (readyz 503)
- **Outcome:** confirmed by code
- **Severity:** rough
- **Where:** cp/problem.ts:11-29; the route schemas
- **Evidence:** every route can answer problem+json, none says so. 60 codes in manifest/src/errors.ts, all referenced.
- **Fix:** P29 with API-09: a default `4XX/5XX` response on every route, plus per-route codes listed from a typed list. M9 prints "errors this route can answer".
- **Size:** M. **Settled by:** Both. **Milestone:** phase 30 M9 plus P29

### API-11 62 `custom` access routes: 38 do not say what they need; "Anyone" hides that a token is the credential
- **Outcome:** confirmed by code
- **Severity:** wrong
- **Where:** cp/kernel/http.ts (access kinds, `custom` at the `Access` type, line 27 area); webhook and approval-link routes
- **Evidence:** the 410 own routes by access kind are listed in the inventory (259 permission, 62 custom, 30 public).
- **Fix:** P29: `custom` takes a required `says` string (what is decided and by what), and public routes that need a token say which. Make it required at type level. M9 prints it in place of "Decided by what is asked for".
- **Size:** M. **Settled by:** Both. **Milestone:** phase 30 M9 plus P29

### API-12 SCIM `documentationUri` points to a page that does not exist
- **Outcome:** confirmed by code
- **Severity:** broken
- **Where:** cp/routes/scim.ts:479; a grep for `api/v1/docs` finds only this line
- **Evidence:** no route is registered at that path, so a provider that shows the link gets a 404.
- **Fix:** point it at the instance's docs page for SCIM (or drop it). Test: the URL resolves on the test app.
- **Size:** S. **Settled by:** P29. **Milestone:** P29, with the SCIM page

### API-13 Webhook, upload and MCP bodies, SSE and file content are untyped in OpenAPI
- **Outcome:** confirmed by code
- **Severity:** rough
- **Where:** cp/routes/execution.ts (hooks), cp/routes/mcp.ts, cp/routes/stream.ts
- **Evidence:** the inventory's list; the hand-written pages under `content/develop/api/` cover them, which is the sound answer for SSE and MCP.
- **Fix:** do not force these into OpenAPI. Declare `content` types (`text/event-stream`, `application/octet-stream`) on the routes, and link to the written pages. P29 for declarations, M9 for links.
- **Size:** S. **Settled by:** Both. **Milestone:** phase 30 M9

### API-14 `docs:check` ignores `api.md` and `openapi.json`, so nothing fails when they drift
- **Outcome:** confirmed by code
- **Severity:** wrong
- **Where:** packages/docs/generate.mjs:20 (`KEPT`), 44-58 (`stale()` skips them and `expected()` only links api.md if the file exists)
- **Evidence:** read. `KEPT` files are neither compared nor removed.
- **Fix:** M9's no-DB `describeApi()` makes the API a normal generated file inside `expected()`; delete `KEPT`. Until then, CI must regenerate and diff. Test: change a route description, `stale()` reports it.
- **Size:** M. **Settled by:** M9. **Milestone:** phase 30 M9

### API-15 `trustProxy: true`: addresses (rate limits, audit IPs) are what the caller sends when the instance is exposed directly
- **Outcome:** confirmed by code
- **Severity:** security (class: spoofable client address)
- **Where:** cp/app.ts:105; cp/kernel/ratelimit.ts; cp/kernel/http.ts:64 (`guestLimit`)
- **Evidence:** Fastify's `trustProxy: true` reads `X-Forwarded-For` from any peer. Not exercised here; the behavior is the library's documented one.
- **Fix:** make it a config value (default off, or a hop count) and document the proxy requirement in self-hosting. The sibling is the audit IP. Test: with it off, a forged header does not change the limit key.
- **Size:** S. **Settled by:** P29 (code), M9 (the page says so). **Milestone:** P29 and owner question 1

### API-16 No event for a cancelled run, while the flow event carries `status`
- **Outcome:** owner decides
- **Severity:** rough
- **Where:** kernel/execution/runs.ts:557 (only succeeded and failed); kernel/flows/engine.ts:438
- **Evidence:** a flow listening for failures cannot learn that a script run was canceled.
- **Fix:** see owner questions. M9's events registry (item 3) is where it is recorded either way.
- **Size:** S. **Settled by:** the owner, then M9. **Milestone:** none

### API-17 Metric names keep `platform_`, while the product says `volvel-` and cookies `vx_`
- **Outcome:** owner decides
- **Severity:** rough
- **Where:** cp/kernel/metrics.ts:167-182 (and about 20 more series); docs/self-hosting.md:551
- **Evidence:** names are inline literals, so a rename touches dashboards that scrape. The product has no back-compat owed (memory: Volvel name), so a rename is allowed.
- **Fix:** decide before M9's `METRICS` registry fixes the names in a page.
- **Size:** S. **Settled by:** owner, then M9. **Milestone:** none

### API-18 No versioning or deprecation policy for `/api/v1`
- **Outcome:** owner decides
- **Severity:** rough
- **Where:** master-spec.md:180 covers the SDK ("deprecation period") but not the HTTP API. cp/kernel/resolve.ts:184 implements 90-day renamed-path answers.
- **Evidence:** no phase or decision document names an API policy.
- **Fix:** a one-paragraph decision; the written `develop/api` page cites it. M9 does not settle it.
- **Size:** S. **Settled by:** owner. **Milestone:** none

### API-19 Whether `signed-in` routes should open to service accounts
- **Outcome:** owner decides
- **Severity:** security (class: authorization scope) if unintended
- **Where:** cp/kernel/http.ts:249 (the signed-in branch excludes end users and member app sign-ins only)
- **Evidence:** read. A key of a service account passes the hook.
- **Fix:** see questions.
- **Size:** S. **Settled by:** owner. **Milestone:** P29

### API-20 Better-auth's own rate limits
- **Outcome:** owner decides (needs a run to read the default)
- **Severity:** security (class: sign-in throttling)
- **Where:** cp/auth.ts (limiter not configured); the app's limits are in the table in B
- **Evidence:** not run. The library's limiter has its own defaults and storage, which in a multi-replica setup are per process.
- **Fix:** configure it to the same Postgres store as the others, with limits as the end-user sign-in (20 per minute). The page then states one number.
- **Size:** S. **Settled by:** P29. **Milestone:** P29

### API-21 Only 13 of 84 list operations take `cursor`; 71 return `items` with no `nextCursor`
- **Outcome:** confirmed by code (inventory counts from the OpenAPI file)
- **Severity:** rough
- **Where:** cp/pagination.ts; the routes
- **Evidence:** lists are silently capped (bundles 100). A reader cannot know a list is truncated.
- **Fix:** state the cap in each description or paginate; M9 can print "returns up to N, no cursor" only if routes declare it. P29: a typed `listResponse(cap)`.
- **Size:** M. **Settled by:** Both. **Milestone:** P29

### API-22 Generated SDK reference is blocked: only TypeScript 7 (native, no compiler API) is installed
- **Outcome:** confirmed by code
- **Severity:** rough
- **Where:** package manifests; design doc section 6 (pin `typescript@^6` as a docs-only dev dependency)
- **Evidence:** the inventory ran `ts.createProgram` and found it undefined. Not repeated.
- **Fix:** M9 settles it. A docs-only dependency adds a package: the owner approves it (question 3). Undocumented exports (`defineScript`, `defineWebhook`, `defineSchedule`, most `*Options`; sdk 61%, widgets/page 40%) are P29 JSDoc work.
- **Size:** L. **Settled by:** M9, with P29 JSDoc. **Milestone:** phase 30 M9

### API-23 `generated/openapi.json` is stale against the other generated pages
- **Outcome:** not a bug
- **Severity:** rough
- **Where:** the file is gitignored and written by a separate generator
- **Evidence:** a timestamp difference (13:01 vs 13:43) on a local build. It is the symptom of API-14, not a separate fault.
- **Fix:** none beyond API-14.
- **Size:** S. **Settled by:** M9. **Milestone:** phase 30 M9

### Items checked and found sound
Prefix and ID shapes; the credential table; "Authorization other than Bearer vxk_ is 401"; the problem body; the rate-limit table (`guestLimit` is 120 per minute per address, matching); idempotency scope; SSE caps. These are read from code in the inventory and the lines I opened agree. They need no change, only a page.

## Missing parts

None in the console or CLI (this slice has no control to add). The generator backlog is all M9: ranked items 1 to 13 of section C stay as ranked, and these P29 items must come first, so M9 has something to print: API-06, 08, 09, 10, 11.

## Owner decides

1. **Trust the forwarded address?** Options: keep `trustProxy: true`; make it configurable with default off; hop count. Recommend configurable, default a single hop, documented as a proxy requirement.
2. **A cancelled run event?** Options: add `platform/run-canceled` (and flow equivalent); fold into one `platform/run-finished` with `status`; leave. Recommend one `run-finished` event with `status`, as flows already have, keeping the two old names for failed and succeeded.
3. **A docs-only TypeScript 6 dependency for the SDK reference?** Options: pin `typescript@^6` as a dev dependency; parse `.d.ts` by hand. Recommend the pin: it follows re-exports and JSDoc, and the licence is allowed.
4. **Rename `platform_` metrics to `volvel_`?** Recommend yes now, since no back-compat is owed and the page will freeze the names.
5. **API versioning policy.** Options: additive-only within v1 with 90 days' notice (the rename mechanism already does 90), or no promise. Recommend the first.
6. **Service-account keys on `signed-in` routes.** Options: allow, or refuse like end users. Recommend refuse unless a route says otherwise, because the keys act as their owner.
