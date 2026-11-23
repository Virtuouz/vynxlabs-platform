# Fixed by lane api2

Rows: API-06, 08, 09, 10, 11, 12, 21 (phase 29 half), DOC-02, 05, 06, 07, 08, 09, 12; decisions D50 and D56. No migration. Schemas: `schemas/kinds/app.v1.schema.json` and `schemas/files/app.v1.schema.json` changed in text only (DOC-06).

## Shared pieces

- `apps/control-plane/src/api-description.ts` (new): `API_TAGS` (the one list of tags, each with a summary), `API_DESCRIPTION` and `API_POLICY` (D56), `SECURITY_SCHEMES`, `errorCodeList()`, `operationIdOf()`, `accessSentence()`, and `finish()`, which brings the described app to the shape a reference is drawn from. `app.ts` `describe()` calls it.
- `kernel/http.ts`: `Access` `custom` now requires `says`; `public` may carry `says`. `access.custom(says)` is a function; `access.publicWith(says)` is new.
- `pagination.ts`: `listOf(item, cap?)`, the response of a list with no cursor.
- `kernel/docs/product.ts`: `buildDocs(config, app, resources)`, `PRODUCT_CLASHES`.

## Done

- **API-06**: `/api/v1/openapi.json` carries `tags` (33, each with a description), every own route is tagged from the list, the library's sign-in routes share the tag `sign-in` (no `Default`, `other`, `Vx-...`), and the three summary routes that said `tenants` and `workspaces` say `tenancy` (`routes/summary.ts`). Test: "every operation is tagged from the one list, and each tag in it is used" (`app.test.ts`). Left for phase 30 M9: a page for each tag, and moving worker protocol and SCIM out of the main list. The compile-time check of a route's tag was not possible: `@fastify/swagger` types `tags` as `string[]`, so the test holds it.
- **API-08**: all 118 routes without a description have one (`routes/*.ts`, only `description:` lines); every response has a description (`finish()` replaces "Default Response" by the status's meaning, and a `description` on a response schema wins). Test: "every route has a summary and a description of its own" and "every operation has an identifier, no two the same, and every response a description". The text of descriptions was kept to what the summary, the schema and the handler show: a few say less than they could.
- **API-09**: `components.securitySchemes` `bearerAuth` (`vxk_` keys) and `cookieAuth`; `servers: [{ url: "/" }]` (paths already begin `/api/v1`, so `/api/v1` as the server would double it); a `Problem` component; an `operationId` for each operation, from its method and path (`getTenantsByTWorkspacesByWTables`); `security` on each operation (`[]` for public). Test: "it says how to authenticate, where it is served, and what an error looks like". The library's own routes get an `operationId` only where it had none.
- **API-10**: each of our routes answers `5XX` as `Problem`; `400` when it takes a body, query or header; `401` and `403` unless public; `404` when it has a path parameter or asks a permission. `x-error-codes` at the root lists all 60 codes with status and title, from `ERROR_CODES`. Left: a list of the codes one route can answer (needs each handler read); the classes are derived from what the route declares.
- **API-11**: `custom` takes a required `says` (62 routes written, each from the handler's own `authorize` calls); `public` routes that need a token say which (`access.publicWith`: webhook, both approval-link routes, app-session start, end-user password token, SSO callback and ACS, `/metrics`). `finish()` appends it to the operation's description. Test: "a route that decides for itself, or asks for a token, says what it needs". M9 should print `x-access.says` in place of "Decided by what is asked for" (`packages/docs/generators/api.mjs` `needs()`, not changed).
- **API-12**: `documentationUri` removed from the SCIM `ServiceProviderConfig` (`routes/scim.ts`): no page exists to point at, and the field is optional in RFC 7643. Test: "a provider has an address and tokens..." now follows the URI if there is one and wants it to answer below 400 (failed before with 404). Phase 30 adds it with the SCIM page.
- **API-21**: `listOf(item, cap)` used on 38 list routes; the response description says "Every one there is. The list has no cursor." or "At most N...". Caps checked against the handler: clones 50, bundles 100, deployments 100, promotion requests 200, files 200, recent items 20, provider links 1000. Test: "a list that has no cursor says whether it is whole or cut short", with `LISTS_NOT_YET_SAID` (32 routes with an inline multi-line `items` schema, to be converted; the list may only get shorter).
- **D50**: `platform/run-finished` with `{ runId, script, status, error? }` is published for a run that succeeded, failed or was canceled; `platform/run-succeeded` and `platform/run-failed` still are. A cancel announces after the transaction commits (`takeCanceled`/`announceCanceled` in `kernel/execution/runs.ts`), at the run cancel route, the flow run cancel route, both bulk cancels and a flow's own advance. Test: "one event says how any run ended, a canceled one too, and the two older events stay" (`flows.test.ts`, timed out before).
- **D56**: `API_POLICY` is in the API's `info.description`: only additions within `v1`, 90 days' notice for a removal, marked `deprecated`. Test: "it says how the API changes".
- **DOC-02**: `packages/ui/src/Doc.tsx` passes every option it is given to the renderer (rest props, held by `useShallowStable`), so `glossary` and any option added later reach it. Test: "a glossary given to the page is drawn where ::glossary is written" (`docComponents.test.tsx`). Siblings: `Docs.tsx:1645` and `DocEditor.tsx:532` pass `glossary` and now show it; `HelpPanel` passes none (30-M2/M7).
- **DOC-05**: `glossary` is in the Insert menu (`kit/markdown/insert.ts`); `NOT_IN_MENU` lists `product` and `screenshot` with why. Test: "every component the registry can insert is in the menu, or says why it is not".
- **DOC-06**: the app kind's `feedback` text names the six columns (`packages/manifest/src/kinds.ts`); schemas re-emitted. Test: "what the app kind says of its feedback table" (`docs-apps.test.ts`; names every key of `FEEDBACK_COLUMNS`).
- **DOC-08**: `buildDocs()` at the draft preview (`kernel/apps/front.ts`), the docs search (`routes/docs.ts`) and the terms route (`routes/terms.ts`); `docsOf` and deploy already passed the product. The preview does not draw the issues (they are the editor's).
- **DOC-09**: `GET /docs` answers `issues` (term and topic clashes with the product's names), the Documentation screen shows a notice (`screens/docs/Docs.tsx`, `model.ts`), and the served-site path logs once for each bundle and app (`warnOfClashes`). Tests: "a page that takes a name the product's help has is said to..." (`docs-apps.test.ts`), "says when a page takes a name the product's own help has" (`Docs.test.tsx`). Not done: `names.lock` and namespacing (30-M4).
- **DOC-12**: `pnpm docs:check` runs `check.mjs --staleness` before the API generator rewrites every page. Tests: `scripts/docs-check.test.mjs` (both failed before).

## For packages/docs/content and CHANGELOG (not edited here)

- `build/documentation.md:46`, DOC-07: replace "A table of any other kind, or one whose columns are not the feedback columns, is still refused." with "Any other table, or this table with other columns, is still refused."
- Events page: add `platform/run-finished` (payload `runId`, `script`, `status` of `succeeded`, `failed` or `cancelled`, and `error` when failed); `run-succeeded` and `run-failed` stay.
- API page: policy sentence from `API_POLICY`.
- CHANGELOG: the API description now has tags, security schemes, operation IDs, error responses and "needs" text for each route; SCIM `documentationUri` is gone.

## Siblings looked at

- `x-access` readers: `packages/docs/generators/api.mjs` `needs()` and `app.test.ts` (kept passing).
- Other callers of `access.custom`: all 62 changed; no other file built `{ kind: "custom" }`.
- Other places that build a workspace's docs: `docsOf` (given `product`), deploy (`bundles.ts`), the console editor (passes `product`).

## Found

- A run canceled because its flow was canceled had no event of any kind; now covered by `run-finished`.
- `GET /api/v1/auth/...` routes of the library: the 33 are still listed without summary (API-07, M9).
- `favicon.ico` and `site.webmanifest` were listed in the API description; hidden now.

## Screens to walk

Documentation screen: the notice about names, in light and dark, at 390, 768 and 1440; the Insert menu offers Glossary; the reader draws a `::glossary` page. No other screen changed. Not walked in a browser (no throwaway instance in this lane).

Polish gate for the notice: states: none while there are no issues; lifecycle: it goes when the page is renamed or deleted (read again on each load); keyboard: no control; copy: says which pages and what to do.
