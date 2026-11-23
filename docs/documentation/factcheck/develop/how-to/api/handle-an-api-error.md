# Fact-check record: develop/how-to/api/handle-an-api-error.md

Lines are current at commit `5ebf1c80` (branch phase-31-write-the-docs), under `apps/control-plane/src/` unless a path says otherwise. Written by the writer 2026-11-23; "Checked by" and "Result" are for the second agent.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| The body fields `type` (about:blank), `title`, `status`, `code`, `instance`, `requestId`, and optional `detail` and `errors[{path,message}]`. | `problem.ts:10-26,44-77`; run | pending | pending |
| `x-error-codes` in openapi.json lists 61 codes with status and title. | run: `GET /api/v1/openapi.json`; `api-description.ts:130-140` | pending | pending |
| A bad filter operator: 400 `validation_failed`, `errors[0].path` `/filter`, message "there is no operator "like". Use eq, ne, gt, gte, lt, lte, in, has, contains, not_contains or is_null". | `kernel/data/rows.ts:616-619`; run | pending | pending |
| Sign-in failures pass on the library's code, lower case. | `routes/auth.ts:59`; `problem.ts:50-62` | pending | pending |
| SCIM routes answer SCIM error bodies. | `routes/scim.ts:410-433` | pending | pending |
| 400 for a body, query or `filter` that is not valid; "The filter must be JSON."; "The cursor is not valid." | `routes/data.ts:60-87`; run | pending | pending |
| 429: `retry-after`, `x-ratelimit-limit`, `x-ratelimit-remaining`, `x-ratelimit-reset` headers. | run (122 requests to `/hooks/<bad token>`) | pending | pending |
| `busy` 503 retry-after 2 (pool timeout) or 5 (statement timeout); `read_only` 503 retry-after 30, reading still works. | `kernel/errors.ts:52-66`; `problem.ts:97-110` | pending | pending |
| `workspace_paused` and `trigger_paused` 503 from a webhook. | `routes/execution.ts:3765-3780`; run (`trigger_paused`) | pending | pending |
| `not_found` 404 answers the same for "not there" and "may not see". | `packages/manifest/src/errors.ts` (not_found help); `kernel/http.ts:166-170` | pending | pending |
| A draft save names `revision` or says `create: true`; two saves without either: the second is 409 `draft_changed` "Someone else saved this draft after you opened it. Reload it, then make your change again."; saving with the revision read succeeds. | `kernel/authoring.ts:295-318`; `routes/authoring.ts:596-610`; run | pending | pending |
| `create: true` over a taken path: 409 `path_taken`. | `routes/authoring.ts:596-610`; run (`old/name is the path of a script`) | pending | pending |
| The API reference lists classes of answer per route (400, 401, 403, 404, 5XX), not codes per route. | `api-description.ts:118-133` | pending | pending |
