# Fact-check: console/explanation/configure/how-a-connection-gets-set-up.md

Lines are current at commit `5ebf1c80` (branch phase-31-write-the-docs). Second check: not yet made.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Dev deploy warns, production and promotion refuse with `bindings_missing` and that message. | `apps/control-plane/src/kernel/execution/deploy.ts:628-646` | writer, 2026-11-23 | holds; the dev notes seen from `volvel deploy` |
| What is checked: scripts' connections, secrets, variables, sources; onFailure.notify; trigger sources; webhook verify secret; flow step connection grants. | `apps/control-plane/src/kernel/execution/deploy.ts:32-150` | writer, 2026-11-23 | holds |
| A variable with a default needs no value; groups need nothing. | `apps/control-plane/src/kernel/execution/deploy.ts:122-130; packages/manifest/src/kinds.ts:269` | writer, 2026-11-23 | holds |
| `bindings_invalid` for all workspaces. | `apps/control-plane/src/kernel/execution/deploy.ts:648-670` | writer, 2026-11-23 | holds |
| Arrives with the next promotion; new connection not started in production. | `apps/console/src/screens/Execution.tsx:824-832,859` | writer, 2026-11-23 | holds |
| Reads are live and `uses` is pinned to the bundle. | `apps/control-plane/src/routes/worker.ts:640-672,690-712` | writer, 2026-11-23 | holds |
| A worker reaches the address; WORKER_EGRESS_ALLOW and EGRESS_ALLOW. | `apps/control-plane/src/config-vars.ts:292-334` | writer, 2026-11-23 | holds |
| A test goes to a worker of the pool that uses the connection; waits 2 minutes. | `apps/control-plane/src/kernel/execution/tasks.ts:19-23,86-110` | writer, 2026-11-23 | holds |
| OAuth: one redirect address, PKCE S256, 10 minutes, the same member, refresh 2 minutes ahead under a lock, workers get the access token, changing identity fields drops tokens. | `apps/control-plane/src/kernel/execution/oauth.ts:23-50,175,206-230,434-460` | writer, 2026-11-23 | holds (code) |
| A credential does not follow another origin. | `apps/console/src/screens/ConnectionWizard.tsx:117-132; apps/control-plane/src/kernel/execution/bindings.ts:95` | writer, 2026-11-23 | holds |
| Rename keeps bindings and the default alert; credentials sealed under the row. | `apps/control-plane/src/kernel/rename.ts:146-160; kernel/execution/sealed.ts:1-60` | writer, 2026-11-23 | holds (rename partly by code) |
| Clone: variables always; Safety off copies; OAuth tokens not. | `apps/control-plane/src/kernel/tenancy/clone.ts:39-130; apps/console/src/screens/Environments.tsx:565-575` | writer, 2026-11-23 | holds |
