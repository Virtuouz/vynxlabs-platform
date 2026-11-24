# Fact-check record: develop/explanation/extensions/what-an-extension-is

Lines are current at commit `5ebf1c80` (branch phase-31-write-the-docs), 2026-11-23. Paths are under `apps/console/src` unless they start with `apps/control-plane` or `packages`. `Au` = `screens/Authoring.tsx`, `CS` = `screens/CodeSettings.tsx`. Written by the writer; "Checked by" is for the second agent. `SDK` = `packages/sdk/src/index.ts`.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Two kinds listed on Extensions: connector and trigger source. | `Au:1316-1334` | writer | holds |
| defineConnector takes a JSON Schema, create, optional test; a connection names the connector. | `SDK:560-640` | writer | holds |
| Settings and secret are set per workspace on Connections. | `SDK:643-650` (defineConnection comment); `screens/ConnectionWizard.tsx` | writer | holds |
| A webhook source is handed method, headers, query, body, rawBody; answers accept false, input or inputs (up to a hundred). | `SDK:366-400` | writer | holds |
| A poll source gets cursor and scheduledFor, returns items and cursor. | `SDK:402-420` | writer | holds |
| A trigger source lists connections, secrets, variables only; timeout default 30, max 300; runs like a script on a worker. | `SDK:422-470` | writer | holds |
| Nobody starts one by hand. | `Au:756-760` | writer | holds |
| 100 limit; whole-or-nothing; refused alone; idempotent key. | `apps/control-plane/src/kernel/execution/triggers.ts:711, 730-760, 801-803` | writer | holds |
| Built-in connectors http, smtp (tls, starttls, none), oauth2; oauth2 cannot be in a group. | `packages/sdk/src/{http,smtp,oauth2}.ts`; `packages/manifest/src/bundle-check.ts:316` | writer | holds (smtp security values from the inventory; not re-read) |
| Webhook signature check HMAC SHA-256/SHA-1; failing request answered 401. | `SDK:345-356, 392-396`; `packages/manifest/src/kinds.ts:446-447` | writer | holds |
| Console code imports @volvel/sdk and node: only; 256 KiB. | `packages/compose/src/index.ts:191-205`; `packages/manifest/src/kinds.ts:132` | writer | holds |
| Repository extension is read-only in the console; a console one at the same path replaces it on deploy. | `Au:975-985` | writer | holds |
| Developer widgets not built. | `packages/widgets-labs/src/index.ts`; `apps/console/src/screens/builder/registry.ts:8-20` | writer | holds |

Checked by: second agent, 2026-11-23. Run on `ext31-dev`: a webhook source that refuses and lets through, a poll source from a schedule, "refused alone" for an input that does not fit (the run's output holds `refused`). In code: up to 100 inputs (`triggers.ts:711, 801-803`), 256 KiB (`packages/manifest/src/kinds.ts:132`), an OAuth 2.0 connector refused in a connection group (`bundle-check.ts:334`), the source reads only the connections, secrets and variables it lists (`packages/sdk/src/index.ts:455-470`).
