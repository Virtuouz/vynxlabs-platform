# Fact-check: administer/explanation/configure/how-secrets-are-kept.md

Lines are current at commit `5ebf1c80` (branch phase-31-write-the-docs). Second check: Checked by: second agent, 2026-11-23.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| AES-256-GCM, context bound as additional data. | `apps/control-plane/src/kernel/crypto.ts:12-45` | writer, 2026-11-23 | holds |
| Master key 32 bytes wraps a tenant key; secret bound to tenant, workspace, name. | `apps/control-plane/src/kernel/crypto.ts:82-160; kernel/secrets.ts:7-12` | writer, 2026-11-23 | holds |
| Row-ID sealing; old rows resealed. | `apps/control-plane/src/kernel/execution/sealed.ts:1-60,92-140` | writer, 2026-11-23 | holds |
| 422 `connection_unusable` text. | `apps/control-plane/src/kernel/execution/sealed.ts:73-80` | writer, 2026-11-23 | holds |
| Export wraps the tenant key with a passphrase; at least 12 characters. | `apps/control-plane/src/kernel/crypto.ts:143-165; apps/console/src/screens/Environments.tsx (TenantExport hint)` | writer, 2026-11-23 | holds |
| A run reads a declared secret only; else 403 message. | `apps/control-plane/src/routes/worker.ts:612-632` | writer, 2026-11-23 | holds |
| OAuth worker gets the access token, not the refresh token. | `apps/control-plane/src/kernel/execution/oauth.ts:442-470` | writer, 2026-11-23 | holds (code) |
| Webhook secret check and its refusal texts. | `apps/control-plane/src/kernel/execution/triggers.ts:1342-1365` | writer, 2026-11-23 | holds (code) |
| Clone with Safety off opens and seals again. | `apps/control-plane/src/kernel/tenancy/clone.ts:73-90` | writer, 2026-11-23 | holds |
| Masking: forms, `[redacted]`, 4-character rule, key names and schema marks; applied to the worker's log lines and error. | `apps/control-plane/src/kernel/execution/redact.ts:14-110; routes/worker.ts:434,594` | writer, 2026-11-23 | holds |
| WORKER_EGRESS_ALLOW and EGRESS_ALLOW. | `apps/control-plane/src/config-vars.ts:292-334` | writer, 2026-11-23 | holds |

## Second check, 2026-11-23

Checked by: second agent, 2026-11-23. Source commit `87000022`.

| Claim | Source | Checked by | Result |
| --- | --- | --- | --- |
| Master key 32 bytes base64 `MASTER_KEY`; AES-256-GCM; export passphrase at least 12 characters. | `config.ts:206-209`; `kernel/crypto.ts`; `routes/portability.ts:22` | second agent, 2026-11-23 | holds |
| Masking: `[redacted]`; URL-encoded, JSON-escaped and base64 forms; under 4 characters only as a whole word; keys and `writeOnly` / `format: password` / `x-secret`. | `kernel/execution/redact.ts:6-47,87` | second agent, 2026-11-23 | holds |
| The "cannot be read" 422, the signature text and the unset-secret record text. | `sealed.ts:77`; `triggers.ts:224,1360` | second agent, 2026-11-23 | holds |
