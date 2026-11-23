# Fact-check: console/how-to/configure/set-up-a-connection.md

Lines are current at commit `5ebf1c80` (branch phase-31-write-the-docs). Second check: not yet made.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Steps 1 to 7 and the labels in them. | `apps/console/src/screens/ConnectionWizard.tsx:354-597` | writer, 2026-11-23 | holds; run (see the run log) |
| `connection:write` and `resource:write` to declare a connection. | `apps/console/src/screens/Execution.tsx:789-791` | writer, 2026-11-23 | holds |
| Stand-in address and token. | `examples/fernhill/stand-ins/server.mjs:12-15` | writer, 2026-11-23 | holds; seen Reached (200) |
| Step 8: Operate, Deploy, **Deploy 1 change**; the connection then is deployed. | `apps/console/src/nav.ts:136; walk of /release` | writer, 2026-11-23 | holds; run |
| Mail settings and defaults (587, starttls, tls, none, port 465 expects tls); Test connects and signs in, sends nothing. | `packages/sdk/src/smtp.ts:42-85; packages/worker/src/smtp.ts` | writer, 2026-11-23 | holds for the settings; "sends nothing" from the inventory (not re-run) |
| OAuth steps: Provider, Redirect address with Copy, Client ID, Client secret, Connect. | `apps/console/src/screens/ConnectionWizard.tsx:443-481,551-560` | writer, 2026-11-23 | holds (code); not run against a provider |
| The address-changed notice text. | `apps/console/src/screens/ConnectionWizard.tsx:500-505` | writer, 2026-11-23 | holds (code) |
| Test asks for the address and expects 2xx. | `packages/sdk/src/http.ts:208-220` | writer, 2026-11-23 | holds; 404 at /vetsupply seen |
| Failure texts: no worker; name; taken path. | `apps/control-plane/src/kernel/execution/tasks.ts:230-236; apps/console/src/ask.tsx:114-118; ConnectionWizard.tsx:293` | writer, 2026-11-23 | holds (code) |
| Production: Set up row and Set up a connection open the sheet with the waiting connection chosen; refusal lists Set up. | `apps/console/src/screens/Execution.tsx:822-838; ConnectionWizard.tsx:382-409; apps/control-plane/src/kernel/execution/deploy.ts:628-646` | writer, 2026-11-23 | holds; sheets seen on Clinics |
