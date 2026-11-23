# Fact-check record: develop/explanation/api/how-the-api-changes.md

Lines are current at commit `5ebf1c80` (branch phase-31-write-the-docs), under `apps/control-plane/src/` unless a path says otherwise. Written by the writer 2026-11-23; "Checked by" and "Result" are for the second agent.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| `/api/v1` prefix; the policy sentence. | `app.ts:92`; `api-description.ts:83-90` | pending | pending |
| Nothing is marked `deprecated` in this version. | run: 0 operations with `deprecated` in openapi.json (335 paths) | pending | pending |
| `openapi.json` is public; has tags, `bearerAuth`/`cookieAuth`, `operationId`, `x-access`, `x-error-codes` (61). | `api-description.ts:94-140`; run | pending | pending |
| `x-request-id` kept if 1 to 128 of `[A-Za-z0-9._-]`; `x-trace-id`, `traceparent`. | `app.ts:95,125-128,162-170`; run (`my-trace-1` echoed) | pending | pending |
| IDs are UUIDs; API takes IDs, CLI takes slugs. | inventory B; not re-checked | pending | pending |
| A renamed resource keeps history; old path answers 90 days with `deprecation`, `sunset`, `volvel-resource-moved`, `warning` headers. | `kernel/resolve.ts:4,184-192`; run (old/name to new/name, 201, headers seen) | pending | pending |
| An idempotency key survives a rename. | `kernel/execution/runs.ts:314-318` | pending | pending |
| An agent tool keeps its old name to the date. | `routes/mcp.ts:425` | pending | pending |
| After the date the old path is not found. | `kernel/resolve.ts:195-200` (aliases removed); not run | pending | pending |
| A renamed webhook changes address unless it has a `key`. | inventory B (D33, `fixed/flw.md`) | pending | pending |
| No ETag/If-Match; drafts use `revision`; 409 `draft_changed`, `path_taken`. | `kernel/authoring.ts:295-318`; `routes/authoring.ts:596-610`; run | pending | pending |
| No CORS; no outbound webhooks. | inventory B; not re-run | pending | pending |
