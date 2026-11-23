# Fact-check record: develop/how-to/operate/verify-a-webhook.md

Lines are current at commit `5ebf1c80` (branch phase-31-write-the-docs). Paths are under the repository root. Written by the writer; "Checked by" is for the second agent.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| verify fields, patterns and limits. | packages/manifest/src/kinds.ts:357-410; packages/sdk/src/index.ts:349-365 | writer, read from the code 2026-11-23; second agent, 2026-11-23 (see the second check below) | holds as read |
| Order of checks and the texts. | apps/control-plane/src/kernel/execution/triggers.ts:204-240 | writer, run on the instance 2026-11-23 (401 'The signature does not match.' and 'The x-payfern-signature header is missing.'); second agent, 2026-11-23 (see the second check below) | holds as run |
| Missing secret text on the trigger, generic text to the sender. | apps/control-plane/src/kernel/execution/triggers.ts:1346-1365 | writer, read from the code 2026-11-23; second agent, 2026-11-23 (see the second check below) | holds as read |
| 503 codes, 400, 404, 202; 120 a minute; idempotency-key up to 200; headers not passed. | apps/control-plane/src/routes/execution.ts:3711-3790; kernel/execution/triggers.ts:196-197 | writer, read from the code 2026-11-23; second agent, 2026-11-23 (see the second check below) | holds as read |
| openssl command computes the same signature as the server. | apps/control-plane/src/kernel/execution/triggers.ts:226-237 | writer, run on the instance 2026-11-23 (checked against node crypto); second agent, 2026-11-23 (see the second check below) | holds as run |
| Address shown to those with trigger:write. | apps/control-plane/src/routes/execution.ts:1955,2058 | writer, run on the instance 2026-11-23; second agent, 2026-11-23 (see the second check below) | holds as run |

## Second check (2026-11-23)

Checked by: second agent, 2026-11-23. signatureProblem (triggers.ts:200-245) read against the order of checks; field limits (kinds.ts:430-480), 120 requests a minute (execution.ts:3719), the headers not passed on (triggers.ts:197), the "secret is not set" refusal (triggers.ts:1352-1363) read; run on the instance (run log).

| Claim | Source | Result |
| --- | --- | --- |
| A request with a good signature answers 202 {"runId": "…"}; the same idempotency-key twice answers the same runId. | execution.ts:3740-3800; run | holds as run |
| The Slack form: body signed as v0:{timestamp}:{body} with the timestamp header answers 202; a timestamp 4,000 seconds old answers 401 "The request's timestamp is too far from now."; no timestamp header answers 401 "The x-slack-request-timestamp header is missing or is not a time." | triggers.ts:205-225; run | holds as run |
| A paused trigger answers 503 trigger_paused, a paused workspace 503 workspace_paused. | execution.ts:3757-3778; run | holds as run |
| The 401's body repeats the request's path in `instance`, and the path holds the webhook's secret token. The page does not say so. | execution.ts error body | fault: api, "a webhook's 401 signature_invalid body echoes the request path" (p31-faults.md) |
