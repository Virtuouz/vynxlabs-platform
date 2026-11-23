# Fact-check: console/reference/screens/configure/secrets.md

Lines are current at commit `5ebf1c80` (branch phase-31-write-the-docs). Second check: not yet made.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| List description, columns Name, Used by, Last set, New secret, Delete. | `apps/console/src/screens/Tenant.tsx:903-975` | writer, 2026-11-23 | holds; seen |
| Dialog text, Name hint and placeholder, Value password; toast with Open X. | `apps/console/src/screens/Tenant.tsx:940-965` | writer, 2026-11-23 | holds; seen (toast read from the page) |
| Name pattern `^[A-Za-z_][A-Za-z0-9_]*$`, up to 127; value 1 to 65,536. | `apps/control-plane/src/routes/workspaces.ts:102,575-580` | writer, 2026-11-23 | holds |
| Taken name: "A secret named X is already here. Replace its value from its page." | `apps/control-plane/src/routes/workspaces.ts:588-593` | writer, 2026-11-23 | holds (code) |
| Delete confirm and affected list. | `apps/console/src/screens/Tenant.tsx:966-975` | writer, 2026-11-23 | holds (confirm text of other lists seen) |
| Delete does not check what uses it. | `apps/control-plane/src/routes/workspaces.ts:649-690` | writer, 2026-11-23 | holds |
| Page: Value and Last set meta; tabs Value, Used by; Replace flow, toast text; no-permission text. | `apps/console/src/screens/ObjectPages.tsx:273-380` | writer, 2026-11-23 | holds; seen |
| Stored line, Replace, New value, Keep the stored one. | `apps/console/src/kit/SecretField.tsx:87-175` | writer, 2026-11-23 | holds; seen |
| No value is returned by any route. | `apps/control-plane/src/routes/workspaces.ts:524-531` | writer, 2026-11-23 | holds |
| No versions, history, rollback, expiry or rename; no `defineSecret`. | `packages/sdk/src/index.ts (no such function); migrations` | writer, 2026-11-23 | holds (absence) |
| Audit actions secret.created, secret.updated, secret.deleted; no value in details. | `apps/control-plane/src/routes/workspaces.ts:596-607,630-641,672-682` | writer, 2026-11-23 | holds |
| Read `secret:read`; write `secret:write`. | `apps/control-plane/src/routes/workspaces.ts:524,566,615,649` | writer, 2026-11-23 | holds |
| Clone with Safety off copies secrets. | `apps/control-plane/src/kernel/tenancy/clone.ts:73-90` | writer, 2026-11-23 | holds |
