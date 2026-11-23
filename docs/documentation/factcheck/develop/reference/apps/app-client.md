# Fact-check record: develop/reference/apps/app-client.md

Lines are current at commit `14f7d5b9` (branch phase-31-write-the-docs). Paths are under `apps/console/src` or `apps/control-plane/src` or `packages` as written. Written by the writer; "Checked by" is for the second agent.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Every export in the tables. | `packages/app/src/index.ts:1-47` | writer, read in code, not run; second agent pending | holds |
| appContext fields and the throw text. | `client.ts:6-70` | writer, run on the instance 2026-11-23; second agent pending | holds as run |
| api retry on 503 with Retry-After, twice, max 5 s. | `client.ts:88-104` | writer, read in code, not run; second agent pending | holds |
| ApiError fields. | `client.ts:44-66` | writer, run on the instance 2026-11-23; second agent pending | holds as run (403 message shown) |
| table methods, limits (1,000 insertMany, find limit 50, 1,000 max), filter ops list, 50 conditions. | `client.ts:150-330`; `kernel/data/rows.ts:508,642` | writer, run on the instance 2026-11-23; second agent pending | find, insert via script run; others read |
| aggregate group up to 3, measures up to 5, limit 200 default 1,000 max, 5 s, truncated. | `rows.ts:773-776,825-829,911,935-951` | writer, read in code, not run; second agent pending | holds |
| too_slow 422. | `rows.ts:256-260` | writer, read in code, not run; second agent pending | holds |
| runScript, scriptRun, RunError, startFlow, flowRun, runFlow, FlowRunError. | `client.ts:333-460` | writer, run on the instance 2026-11-23; second agent pending | holds as run |
| Guest 403 text. | `kernel/errors.ts:43` | writer, read in code, not run; second agent pending | holds |
| useRun, useFlowRun, runStream, changeOf. | `hooks.ts:88-160`; `stream.ts` | writer, run on the instance 2026-11-23; second agent pending | holds as run |
| Stream limits and who is sent what. | `routes/stream.ts:28-45`; `kernel/stream.ts:67-69` | writer, read in code, not run; second agent pending | holds |
| session, useSession, signInUrl, staffSignInUrl, signOut, logoUrl. | `client.ts:480-569`; `hooks.ts:50-75` | writer, read in code, not run; second agent pending | holds |
| useQuery behavior. | `hooks.ts:15-48` | writer, run on the instance 2026-11-23; second agent pending | holds as run |
| terms, helpUrl, useHelp, HelpPanel behavior and labels. | `client.ts:420-478`; `help.tsx` | writer, read in code, not run; second agent pending | holds; not run (no docs topic in the scratch workspace) |
