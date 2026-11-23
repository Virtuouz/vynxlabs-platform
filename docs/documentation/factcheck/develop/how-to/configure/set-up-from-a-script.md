# Fact-check: develop/how-to/configure/set-up-from-a-script.md

Lines are current at commit `5ebf1c80` (branch phase-31-write-the-docs). Second check: not yet made.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| PUT connection-bindings body, credential 1 to 65,536, null removes, omitted keeps; 204. | `apps/control-plane/src/routes/execution.ts:2911-2960` | writer, 2026-11-23 | holds; run |
| A connection can be set up before its code is deployed. | `apps/control-plane/src/routes/execution.ts:2915-2916` | writer, 2026-11-23 | holds (description) |
| PUT secrets/<NAME>, POST refuses a taken name. | `apps/control-plane/src/routes/workspaces.ts:566-612,615-645` | writer, 2026-11-23 | holds; run |
| PUT variable-values body up to 65,536. | `apps/control-plane/src/routes/execution.ts:3328-3340` | writer, 2026-11-23 | holds; run |
| Permissions of the three calls. | `apps/control-plane/src/routes/execution.ts:2911,3328; routes/workspaces.ts:615` | writer, 2026-11-23 | holds; 403 "This needs the secret:write permission." seen |
| Config checked against the connector: 400 "The connection's configuration is not valid." | `apps/control-plane/src/routes/execution.ts:2926-2933` | writer, 2026-11-23 | holds; seen as Devi |
| 401 text. | `seen from the instance` | writer, 2026-11-23 | holds; seen |
| Credential dropped on another origin. | `apps/control-plane/src/kernel/execution/bindings.ts:95` | writer, 2026-11-23 | holds (code) |
| Group member PUT body. | `apps/control-plane/src/routes/execution.ts:2811-2830` | writer, 2026-11-23 | holds |
| Account page has API keys. | `apps/console/src/screens/Account.tsx:499-502; Account.test.tsx:46` | writer, 2026-11-23 | holds |
| Node 24 or later. | `package.json:7` | writer, 2026-11-23 | holds |
