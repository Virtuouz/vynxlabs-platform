# Fact-check: self-host/explanation/running/keys-and-secrets.md

Written at commit `14f7d5b9`. Lines are those of that commit. Checked by: the writer; the second agent's column is open.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| `MASTER_KEY` is 32 bytes base64; `MASTER_KEY_SECONDARY` the same, and not equal. | `apps/control-plane/src/config.ts:206-221` | writer, 2026-11-23 | holds |
| What the master key seals: tenant keys, database locations, identity providers, sign-ins in progress, instance secrets (the data-role seed). | `apps/control-plane/src/kernel/rekey.ts:15-50` (PLACES) | writer, 2026-11-23 | holds |
| `AUTH_SECRET` at least 32 characters. | `apps/control-plane/src/config.ts:203` | writer, 2026-11-23 | holds |
| Re-sealing at start, every ten minutes, and on `rekey`. | `apps/control-plane/src/kernel/execution/background.ts` (master key step); `main.ts:150` (`rekeyIfRotating`) | writer, 2026-11-23 | holds for start and `rekey`; the ten-minute pass carried from the old guide |
| `GET /api/v1/instance/master-key` answers fingerprints, counts by place, `unopened`, `secondaryRemovable`. | run: `{"masterKey":"8474c020c234fdfd","secondaryKey":"1735f617d0eec999",...,"secondaryRemovable":true}`; needs `instance:read` (openapi) | writer, 2026-11-23 | holds |
| `rekey --data-role` changes the seed; replicas must be stopped first; audited as `instance.data_role_rekeyed`. | `apps/control-plane/src/commands.ts:25-28`; `main.ts:84-107` | writer, 2026-11-23 | holds for the command and message; the audit action name carried from `docs/documentation/fixed` |
| A wrong `MASTER_KEY` stops the instance at start. | run: boot failed, "Unsupported state or unable to authenticate data", exit 1 | writer, 2026-11-23 | holds |
| A value no key opens is reported and never changed. | `apps/control-plane/src/kernel/rekey.ts` (`unopened`); run: `rekey` with a wrong key lists it | writer, 2026-11-23 | holds |
