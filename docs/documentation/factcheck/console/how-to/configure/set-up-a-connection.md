# Fact-check: console/how-to/configure/set-up-a-connection.md

Lines are current at commit `5ebf1c80` (branch phase-31-write-the-docs). Second check: Checked by: second agent, 2026-11-23.

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

## Second check, 2026-11-23

Checked by: second agent, 2026-11-23. Source commit `87000022`.

| Claim | Source | Checked by | Result |
| --- | --- | --- | --- |
| Steps 1 to 8 and every label in them. | `ConnectionWizard.tsx`, `Execution.tsx`; run log | second agent, 2026-11-23 | holds |
| Mail settings Mail server, Port (587), Security (starttls, tls, none), Sent from, User name; port 465 expects tls; Test signs in and sends no mail. | `packages/sdk/src/smtp.ts:42-90`; `packages/worker/src/smtp.ts` | second agent, 2026-11-23 | holds; run against a stand-in SMTP server |
| A new undeployed mail connection fails its test with "Cannot read properties of undefined (reading 'endsWith')"; after the deploy the test reaches. | `apps/control-plane/src/routes/worker.ts:168-170` | second agent, 2026-11-23 | fault fixed (fa): `boundConnection` uses the binding's own connector, so a new undeployed mail connection tests, confirmed in the code (routes/worker.ts); the workaround is removed from the page |
| OAuth: Connect, back from the provider, tested, Connected; a refusal "The provider said no: access_denied." | `oauth.ts:252` | second agent, 2026-11-23 | run; added to the page |
| "Something already exists at this path. Choose another, or open that one." | `apps/console/src/ask.tsx:116` | second agent, 2026-11-23 | holds (code) |
| The 404 item under "If it does not work". | `packages/sdk/src/http.ts:244-262` | second agent, 2026-11-23 | fault fixed (fa): any HTTP answer is Reached; only 401, 403 and 407 fail (sdk/http.ts:244-262), confirmed in the code; the page's item is now "Reached (404)" |
| The test passes 200 to 299 (`response.ok`); the comment in the SDK says "below 400" and is wrong. | `packages/sdk/src/http.ts:243,251` | second agent, 2026-11-23 | holds |
