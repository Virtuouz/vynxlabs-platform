# Fact-check record: administer/how-to/sso/add-a-worker-pool

Code as of commit `14f7d5b9` (branch `phase-31-write-the-docs`), 2026-11-23. Written by the page's writer (area `sso`). Each line number is the first line of the file that holds the quoted text. "run" means the writer saw it on the throwaway instance (http://localhost:8091, tenant `sso-wave`); "code" means it was read in the code only. The second agent has not checked this page yet.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Add pool dialog | `apps/console/src/screens/Execution.tsx:1426` | writer, run, 2026-11-23 | holds |
| Name pattern | `apps/control-plane/src/routes/pools.ts:12` | writer, code only, 2026-11-23 | holds (not run) |
| Create credential | `apps/console/src/screens/Execution.tsx:1490` | writer, run, 2026-11-23 | holds |
| Command shown | `apps/console/src/screens/Execution.tsx:1527` | writer, run, 2026-11-23 | holds |
| 1 online | `apps/console/src/screens/Execution.tsx:1113` | writer, run, 2026-11-23 | holds |
| worker option | `packages/sdk/src/index.ts:269` | writer, code only, 2026-11-23 | holds (not run) |
| Remove refused | `apps/control-plane/src/routes/pools.ts:247` | writer, code only, 2026-11-23 | holds (not run) |
| Revoke confirm | `apps/console/src/screens/Execution.tsx:1542` | writer, code only, 2026-11-23 | holds (not run) |
| Not made tag | `apps/console/src/screens/Execution.tsx:1291` | writer, run, 2026-11-23 | holds |
| Switch about default pool | `apps/console/src/screens/Execution.tsx:1371` | writer, code only, 2026-11-23 | holds (not run) |
