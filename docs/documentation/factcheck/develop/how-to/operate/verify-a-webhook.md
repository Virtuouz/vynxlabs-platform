# Fact-check record: develop/how-to/operate/verify-a-webhook.md

Lines are current at commit `5ebf1c80` (branch phase-31-write-the-docs). Paths are under the repository root. Written by the writer; "Checked by" is for the second agent.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| verify fields, patterns and limits. | packages/manifest/src/kinds.ts:357-410; packages/sdk/src/index.ts:349-365 | writer, read from the code 2026-11-23; second agent: pending | holds as read |
| Order of checks and the texts. | apps/control-plane/src/kernel/execution/triggers.ts:204-240 | writer, run on the instance 2026-11-23 (401 'The signature does not match.' and 'The x-payfern-signature header is missing.'); second agent: pending | holds as run |
| Missing secret text on the trigger, generic text to the sender. | apps/control-plane/src/kernel/execution/triggers.ts:1346-1365 | writer, read from the code 2026-11-23; second agent: pending | holds as read |
| 503 codes, 400, 404, 202; 120 a minute; idempotency-key up to 200; headers not passed. | apps/control-plane/src/routes/execution.ts:3711-3790; kernel/execution/triggers.ts:196-197 | writer, read from the code 2026-11-23; second agent: pending | holds as read |
| openssl command computes the same signature as the server. | apps/control-plane/src/kernel/execution/triggers.ts:226-237 | writer, run on the instance 2026-11-23 (checked against node crypto); second agent: pending | holds as run |
| Address shown to those with trigger:write. | apps/control-plane/src/routes/execution.ts:1955,2058 | writer, run on the instance 2026-11-23; second agent: pending | holds as run |
