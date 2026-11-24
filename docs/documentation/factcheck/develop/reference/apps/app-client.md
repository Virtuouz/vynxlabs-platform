# Fact-check record: develop/reference/apps/app-client.md

Lines are current at commit `14f7d5b9` (branch phase-31-write-the-docs). Paths are under `apps/console/src` or `apps/control-plane/src` or `packages` as written. Written by the writer; "Checked by" is for the second agent.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Every export in the tables. | `packages/app/src/index.ts:1-47` | writer, read in code, not run; second agent, 2026-11-23 | holds |
| appContext fields and the throw text. | `client.ts:6-70` | writer, run on the instance 2026-11-23; second agent, 2026-11-23 | holds as run |
| api retry on 503 with Retry-After, twice, max 5 s. | `client.ts:88-104` | writer, read in code, not run; second agent, 2026-11-23 | holds |
| ApiError fields. | `client.ts:44-66` | writer, run on the instance 2026-11-23; second agent, 2026-11-23 | holds as run (403 message shown) |
| table methods, limits (1,000 insertMany, find limit 50, 1,000 max), filter ops list, 50 conditions. | `client.ts:150-330`; `kernel/data/rows.ts:508,642` | writer, run on the instance 2026-11-23; second agent, 2026-11-23 | find, insert via script run; others read |
| aggregate group up to 3, measures up to 5, limit 200 default 1,000 max, 5 s, truncated. | `rows.ts:773-776,825-829,911,935-951` | writer, read in code, not run; second agent, 2026-11-23 | holds |
| too_slow 422. | `rows.ts:256-260` | writer, read in code, not run; second agent, 2026-11-23 | holds |
| runScript, scriptRun, RunError, startFlow, flowRun, runFlow, FlowRunError. | `client.ts:333-460` | writer, run on the instance 2026-11-23; second agent, 2026-11-23 | holds as run |
| Guest 403 text. | `kernel/errors.ts:43` | writer, read in code, not run; second agent, 2026-11-23 | holds |
| useRun, useFlowRun, runStream, changeOf. | `hooks.ts:88-160`; `stream.ts` | writer, run on the instance 2026-11-23; second agent, 2026-11-23 | holds as run |
| Stream limits and who is sent what. | `routes/stream.ts:28-45`; `kernel/stream.ts:67-69` | writer, read in code, not run; second agent, 2026-11-23 | holds |
| session, useSession, signInUrl, staffSignInUrl, signOut, logoUrl. | `client.ts:480-569`; `hooks.ts:50-75` | writer, read in code, not run; second agent, 2026-11-23 | holds |
| useQuery behavior. | `hooks.ts:15-48` | writer, run on the instance 2026-11-23; second agent, 2026-11-23 | holds as run |
| terms, helpUrl, useHelp, HelpPanel behavior and labels. | `client.ts:420-478`; `help.tsx` | writer, read in code, not run; second agent, 2026-11-23 | holds; not run (no docs topic in the scratch workspace) |

## Second check, 2026-11-23 (Checked by: second agent, 2026-11-23)

Each export against `packages/app/src` (index.ts lists the exports; they match the page).
- Missing-context message: `client.ts:74`. 503 retry twice, at most 5 s: `client.ts:86-107`. `ApiError` fields: `client.ts:40-60`. `runScript`/`runFlow` timeout 60,000 ms: `client.ts:374,446`. Poll 2 s: `hooks.ts:86`. Stream closes 5 s after the last listener: `stream.ts:104`.
- Server limits: rows limit 1,000 default 50 (`routes/data.ts:52`), insertMany 1,000 (`routes/data.ts:1102`), aggregate limit 1,000 default 200 (`routes/data.ts:855`), at most 50 conditions (`kernel/data/rows.ts:508`), aggregate 5 s and `too_slow` (`rows.ts:776,935`), groups up to 3, measures up to 5 (`routes/data.ts:841-846`), streams 5 and 2 with `too_many_streams` (`kernel/stream.ts:67-69`, `routes/stream.ts:102`).
- The context fields: `AppContext` in `client.ts:4-24`.
- Not run: `useRun`, `runFlow`, `HelpPanel`, `terms`, `helpUrl`; read in code only.
