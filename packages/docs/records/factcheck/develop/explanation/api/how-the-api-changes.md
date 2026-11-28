# Fact-check record: develop/explanation/api/how-the-api-changes.md

Lines are current at commit `5ebf1c80` (branch phase-31-write-the-docs), under `apps/control-plane/src/` unless a path says otherwise. Written by the writer 2026-11-23; "Checked by" and "Result" are for the second agent.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| `/api/v1` prefix; the policy sentence. | `app.ts:92`; `api-description.ts:83-90` | second agent, 2026-11-23 | checked |
| Nothing is marked `deprecated` in this version. | run: 0 operations with `deprecated` in openapi.json (335 paths) | second agent, 2026-11-23 | checked |
| `openapi.json` is public; has tags, `bearerAuth`/`cookieAuth`, `operationId`, `x-access`, `x-error-codes` (61). | `api-description.ts:94-140`; run | second agent, 2026-11-23 | checked |
| `x-request-id` kept if 1 to 128 of `[A-Za-z0-9._-]`; `x-trace-id`, `traceparent`. | `app.ts:95,125-128,162-170`; run (`my-trace-1` echoed) | second agent, 2026-11-23 | checked |
| IDs are UUIDs; API takes IDs, CLI takes slugs. | inventory B; not re-checked | second agent, 2026-11-23 | not re-checked: backed by the inventory or the writer only |
| A renamed resource keeps history; old path answers 90 days with `deprecation`, `sunset`, `volvel-resource-moved`, `warning` headers. | `kernel/resolve.ts:4,184-192`; run (old/name to new/name, 201, headers seen) | second agent, 2026-11-23 | checked |
| An idempotency key survives a rename. | `kernel/execution/runs.ts:314-318` | second agent, 2026-11-23 | checked |
| An agent tool keeps its old name to the date. | `routes/mcp.ts:425` | second agent, 2026-11-23 | checked |
| After the date the old path is not found. | `kernel/resolve.ts:195-200` (aliases removed); not run | second agent, 2026-11-23 | checked |
| A renamed webhook changes address unless it has a `key`. | inventory B (D33, `fixed/flw.md`) | second agent, 2026-11-23 | not re-checked: backed by the inventory or the writer only |
| No ETag/If-Match; drafts use `revision`; 409 `draft_changed`, `path_taken`. | `kernel/authoring.ts:295-318`; `routes/authoring.ts:596-610`; run | second agent, 2026-11-23 | checked |
| No CORS; no outbound webhooks. | inventory B; not re-run | second agent, 2026-11-23 | checked |

## Second check (2026-11-23)

Checked by: second agent, 2026-11-23.

- Run: `x-request-id` kept (`abc.def_1-2`) and replaced (`bad id!`), `traceparent` gives `x-trace-id`, `openapi.json` has `bearerAuth` and `cookieAuth`, no `deprecated: true`, 61 error codes.
- Not re-run: the rename headers (the writer ran them), after-date 404.

## Changed on 2026-11-28: the versioning policy (issue #27)

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Before 1.0 a minor may change `v1`, with release notes; a patch only adds and fixes; from 1.0 `v1` only grows and removal is first marked `deprecated` in an earlier release (replaces the claim of 90 days of deprecation). | the owner's decisions on issue #27; `API_POLICY`, `apps/control-plane/src/api-description.ts`; `app.test.ts` "it says how the API changes" | writer, 2026-11-28 | holds |
