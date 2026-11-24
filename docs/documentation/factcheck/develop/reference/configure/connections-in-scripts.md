# Fact-check: develop/reference/configure/connections-in-scripts.md

Lines are current at commit `5ebf1c80` (branch phase-31-write-the-docs). Second check: Checked by: second agent, 2026-11-23.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Option names and defaults of defineConnection, defineConnectionGroup, defineVariable, defineConnector. | `packages/sdk/src/index.ts:580-660` | writer, 2026-11-23 | holds |
| A group cannot hold oauth2; message. | `packages/manifest/src/bundle-check.ts:326-336` | writer, 2026-11-23 | holds |
| No defineSecret; secrets listed by name. | `packages/sdk/src/index.ts:184-185` | writer, 2026-11-23 | holds |
| YAML names `<path>.<kind>.yaml`; variable example. | `packages/manifest/src/files.ts:200-204; examples/higher-ed-devices/platform/loans/days.variable.yaml` | writer, 2026-11-23 | holds |
| Script options connections, connectionGroups, secrets, variables; trigger source options; `uses` keys. | `packages/sdk/src/index.ts:175-190,426-440; packages/manifest/src/kinds.ts:258-300` | writer, 2026-11-23 | holds |
| Refusals for an undeclared use. | `apps/control-plane/src/routes/worker.ts:621,651,700,719` | writer, 2026-11-23 | holds |
| Flow steps hand connections, tables, events with `with`. | `packages/sdk/src/index.ts:859-870` | writer, 2026-11-23 | holds |
| onFailure notify refused when not HTTP. | `packages/manifest/src/bundle-check.ts:303-312` | writer, 2026-11-23 | holds |
| ctx.connection, ctx.connections().get/keys, ctx.secret, ctx.variable. | `packages/sdk/src/context.ts:36-56` | writer, 2026-11-23 | holds |
| Failures: member not found, secret not set, variable with neither. | `apps/control-plane/src/routes/worker.ts:628,670,801` | writer, 2026-11-23 | holds; secret and connection 404s seen on a run |
| HttpClient methods, options, errors, origin check, empty path, redirects (5), header precedence, auth kinds. | `packages/sdk/src/http.ts:1-200` | writer, 2026-11-23 | holds |
| SmtpClient send fields; runs on a worker. | `packages/sdk/src/smtp.ts:19-31; packages/cli/src/local.ts:126` | writer, 2026-11-23 | holds |
| .platform/local.json shape; defaults used; smtp not local; error texts. | `packages/cli/src/local.ts:11-17,72-105,124-126` | writer, 2026-11-23 | holds |
| `volvel run --remote` runs in a workspace. | `packages/cli/src/commands.ts:86-90` | writer, 2026-11-23 | holds; run |
| The CLI has no bind or secret command. | `packages/cli/src/commands.ts (list of commands)` | writer, 2026-11-23 | holds (absence) |

## Second check, 2026-11-23

Checked by: second agent, 2026-11-23. Source commit `87000022`.

| Claim | Source | Checked by | Result |
| --- | --- | --- | --- |
| Refusal texts: group with oauth2; onFailure.notify; undeclared use; own base URL; local value; "Mail connections live in a workspace…". | `bundle-check.ts:334`; `routes/workspaces.ts:471`; `routes/worker.ts:621`; `sdk/src/http.ts:166`; `cli/src/local.ts:20-24,95,126` | second agent, 2026-11-23 | holds |
| Up to 5 redirects, same origin only; 301/302 POST and 303 become GET. | `packages/sdk/src/http.ts:71,195-225` | second agent, 2026-11-23 | holds |
| `.platform/local.json` shape (connections, groups, secrets, variables). | `packages/cli/src/local.ts:12-14,72` | second agent, 2026-11-23 | holds |
| "To run in a workspace, use `volvel run … --remote`" runs this build as a test run, nothing deployed. | `packages/cli/src/cli.ts:1112-1170`, `commands.ts:89` | second agent, 2026-11-23 | holds as a command; the page now says what it runs. not a fault: `volvel run --remote` is meant to run this build as a test run, nothing deployed (fa); the help line now says "not the deployed version"; the page already says it |
