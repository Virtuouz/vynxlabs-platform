# Fact-check record: develop/how-to/api/start-a-run-from-a-webhook.md

Lines are current at commit `5ebf1c80` (branch phase-31-write-the-docs), under `apps/control-plane/src/` unless a path says otherwise. Written by the writer 2026-11-23; "Checked by" and "Result" are for the second agent.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Address `POST /api/v1/hooks/<token>`, token `vxh_`; `url` in `GET …/triggers`, null for someone who may not manage it. | `routes/execution.ts:3715-3730`; `kernel/execution/triggers.ts:155`; `authoring.test.ts:1188`, `execution.test.ts:991-996` | pending | pending |
| `verify` fields: scheme hmac-sha256|hmac-sha1, header, secret, encoding hex|base64, prefix, signed (`{body}`, `{timestamp}`), timestampHeader, toleranceSeconds 1..86400 default 300. | `packages/manifest/src/kinds.ts:440-505` | pending | pending |
| The signature is over the raw bytes; comparison is timing safe; timestamp must be within tolerance of now. | `kernel/execution/triggers.ts:204-245` | pending | pending |
| Refusals: "The X-Signature header is missing.", "…header is missing or is not a time.", "The request's timestamp is too far from now.", "The signature does not match." as 401 `signature_invalid`. | `kernel/execution/triggers.ts:208-243`; `routes/execution.ts:3781-3790`; run (all but the missing-timestamp text) | pending | pending |
| `authorization`, `cookie`, `proxy-authorization` are not passed on. | `kernel/execution/triggers.ts:197` | pending | pending |
| Body is JSON, form or text. | `kernel/execution/triggers.ts:248-268` | pending | pending |
| 202 `{runId}`; the run's trigger is `{type: webhook, trigger: <path>}` and input is the body. | run | pending | pending |
| `respond: flow` holds up to 25 seconds, answers 202 otherwise, `x-flow-run`. | `routes/execution.ts:3729-3735,3800-3830` | pending | pending |
| 503 `trigger_paused`, 503 `workspace_paused`. | `routes/execution.ts:3762-3780`; run (trigger_paused after a batch pause) | pending | pending |
| 404 "The webhook was not found." for an unknown token. | run | pending | pending |
| Limit 120 a minute for each address; 429 `rate_limited`. | `routes/execution.ts:3718`; run | pending | pending |
| A dev workspace starts with triggers paused. | `routes/workspaces.ts:268-280` | pending | pending |
| A renamed webhook changes its address unless the trigger has a `key`. | inventory B, D33 (`fixed/flw.md`); see `develop/explanation/flows/webhook-address-and-key` | pending | pending |
