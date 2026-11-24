# Fact-check record: develop/how-to/api/start-a-run-from-a-webhook.md

Lines are current at commit `5ebf1c80` (branch phase-31-write-the-docs), under `apps/control-plane/src/` unless a path says otherwise. Written by the writer 2026-11-23; "Checked by" and "Result" are for the second agent.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Address `POST /api/v1/hooks/<token>`, token `vxh_`; `url` in `GET …/triggers`, null for someone who may not manage it. | `routes/execution.ts:3715-3730`; `kernel/execution/triggers.ts:155`; `authoring.test.ts:1188`, `execution.test.ts:991-996` | second agent, 2026-11-23 | checked |
| `verify` fields: scheme hmac-sha256|hmac-sha1, header, secret, encoding hex|base64, prefix, signed (`{body}`, `{timestamp}`), timestampHeader, toleranceSeconds 1..86400 default 300. | `packages/manifest/src/kinds.ts:440-505` | second agent, 2026-11-23 | checked |
| The signature is over the raw bytes; comparison is timing safe; timestamp must be within tolerance of now. | `kernel/execution/triggers.ts:204-245` | second agent, 2026-11-23 | checked |
| Refusals: "The X-Signature header is missing.", "…header is missing or is not a time.", "The request's timestamp is too far from now.", "The signature does not match." as 401 `signature_invalid`. | `kernel/execution/triggers.ts:208-243`; `routes/execution.ts:3781-3790`; run (all but the missing-timestamp text) | second agent, 2026-11-23 | checked |
| `authorization`, `cookie`, `proxy-authorization` are not passed on. | `kernel/execution/triggers.ts:197` | second agent, 2026-11-23 | checked |
| Body is JSON, form or text. | `kernel/execution/triggers.ts:248-268` | second agent, 2026-11-23 | checked |
| 202 `{runId}`; the run's trigger is `{type: webhook, trigger: <path>}` and input is the body. | run | second agent, 2026-11-23 | checked |
| `respond: flow` holds up to 25 seconds, answers 202 otherwise, `x-flow-run`. | `routes/execution.ts:3729-3735,3800-3830` | second agent, 2026-11-23 | checked |
| 503 `trigger_paused`, 503 `workspace_paused`. | `routes/execution.ts:3762-3780`; run (trigger_paused after a batch pause) | second agent, 2026-11-23 | checked |
| 404 "The webhook was not found." for an unknown token. | run | second agent, 2026-11-23 | checked |
| Limit 120 a minute for each address; 429 `rate_limited`. | `routes/execution.ts:3718`; run | second agent, 2026-11-23 | checked |
| A dev workspace starts with triggers paused. | `routes/workspaces.ts:268-280` | second agent, 2026-11-23 | checked |
| A renamed webhook changes its address unless the trigger has a `key`. | inventory B, D33 (`fixed/flw.md`); see `develop/explanation/flows/webhook-address-and-key` | second agent, 2026-11-23 | not re-checked: backed by the inventory or the writer only |

## Second check (2026-11-23)

Checked by: second agent, 2026-11-23.

- Run on the instance (workspace `agent-ws` of `api-check2`, dev, triggers resumed): `respond: flow` (201 with the flow's header and `x-flow-run`; a flow that fails before answering gets 202 at once; a flow that answers after 27 seconds gets 202 at 25 s), a form body (`a=7`), a text body, `hmac-sha1` with base64, a missing timestamp header, a missing signature header, a stale timestamp, `workspace_paused`, 413 over 1 MiB (1,048,576 bytes pass, 1,049,000 refused), 120 a minute then 429 (117 + 3 accepted, 8 refused in a loop of 125).
- Corrected/added: the 202 of a failing flow, `x-flow-run` only on the flow's answer, an example of a respond flow, 413.
- 415: the webhook route takes any content type as text (`application/xml` answered 202), so 415 is not an answer of this route.
- fault fixed (fa): the token in `instance` is replaced by `:token` (`problem.ts` `publicPath`), confirmed in the code; the page never quoted the field

## Phase 34, A7 (YAML first), 2026-11-24

Commit `d619bfbd` plus the working tree. Written by the A7 writer; second agent's check pending. Run on the throwaway instance of lane a7 (http://localhost:8712, Fernhill seeded).

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| The flow YAML equals the TypeScript flow. | run: `volvel convert` of the TypeScript flow checks equal manifests; deployed to `walk6` | writer, 2026-11-24 | holds as run (the webhook was not called again) |
