# Fact-check record: develop/how-to/api/handle-an-api-error.md

Lines are current at commit `5ebf1c80` (branch phase-31-write-the-docs), under `apps/control-plane/src/` unless a path says otherwise. Written by the writer 2026-11-23; "Checked by" and "Result" are for the second agent.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| The body fields `type` (about:blank), `title`, `status`, `code`, `instance`, `requestId`, and optional `detail` and `errors[{path,message}]`. | `problem.ts:10-26,44-77`; run | second agent, 2026-11-23 | checked |
| `x-error-codes` in openapi.json lists 61 codes with status and title. | run: `GET /api/v1/openapi.json`; `api-description.ts:130-140` | second agent, 2026-11-23 | checked |
| A bad filter operator: 400 `validation_failed`, `errors[0].path` `/filter`, message "there is no operator "like". Use eq, ne, gt, gte, lt, lte, in, has, contains, not_contains or is_null". | `kernel/data/rows.ts:616-619`; run | second agent, 2026-11-23 | checked |
| Sign-in failures pass on the library's code, lower case. | `routes/auth.ts:59`; `problem.ts:50-62` | second agent, 2026-11-23 | checked |
| SCIM routes answer SCIM error bodies. | `routes/scim.ts:410-433` | second agent, 2026-11-23 | checked |
| 400 for a body, query or `filter` that is not valid; "The filter must be JSON."; "The cursor is not valid." | `routes/data.ts:60-87`; run | second agent, 2026-11-23 | checked |
| 429: `retry-after`, `x-ratelimit-limit`, `x-ratelimit-remaining`, `x-ratelimit-reset` headers. | run (122 requests to `/hooks/<bad token>`) | second agent, 2026-11-23 | checked |
| `busy` 503 retry-after 2 (pool timeout) or 5 (statement timeout); `read_only` 503 retry-after 30, reading still works. | `kernel/errors.ts:52-66`; `problem.ts:97-110` | second agent, 2026-11-23 | checked |
| `workspace_paused` and `trigger_paused` 503 from a webhook. | `routes/execution.ts:3765-3780`; run (`trigger_paused`) | second agent, 2026-11-23 | checked |
| `not_found` 404 answers the same for "not there" and "may not see". | `packages/manifest/src/errors.ts` (not_found help); `kernel/http.ts:166-170` | second agent, 2026-11-23 | checked |
| A draft save names `revision` or says `create: true`; two saves without either: the second is 409 `draft_changed` "Someone else saved this draft after you opened it. Reload it, then make your change again."; saving with the revision read succeeds. | `kernel/authoring.ts:295-318`; `routes/authoring.ts:596-610`; run | second agent, 2026-11-23 | checked |
| `create: true` over a taken path: 409 `path_taken`. | `routes/authoring.ts:596-610`; run (`old/name is the path of a script`) | second agent, 2026-11-23 | checked |
| The API reference lists classes of answer per route (400, 401, 403, 404, 5XX), not codes per route. | `api-description.ts:118-133` | second agent, 2026-11-23 | checked |

## Second check (2026-11-23)

Checked by: second agent, 2026-11-23.

- Run (a private second control plane on another port and database, so that the shared instance was not touched): `read_only` (the database set read-only: a write answers 503 `read_only` with `retry-after: 30`, a read still 200, sign-in also 503), `busy` (table lock holding the pool: 5 seconds, then 503 `busy`, `retry-after: 2`). 413 on a webhook (see that page). 61 codes in `x-error-codes`.
- `busy` with `retry-after: 5` (statement timeout 57014) was read from `problem.ts:106`, not run: a data statement over its limit answers 422 `too_slow` and an aggregate over 5 s its own message, so the route that reaches 57014 was not found.
- 415: not an answer of the webhook route; not found elsewhere.
- Added: 413.
- fault: api (`validation_failed`'s help text says the details are under `issues`; the body uses `errors`) - the page says `errors`.
