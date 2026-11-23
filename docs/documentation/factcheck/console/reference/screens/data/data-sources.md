# Fact-check record: console/reference/screens/data/data-sources

Code as of commit `14f7d5b9` (branch `phase-31-write-the-docs`), 2026-11-23. Written by the page's writer. `Q` = `apps/console/src/screens/Queries.tsx`, `Data` = `apps/console/src/screens/Data.tsx`, `DB` = `apps/console/src/screens/Dashboards.tsx`, `RI` = `apps/console/src/screens/ResourceIdentity.tsx`, `RD` = `apps/console/src/kit/RemoveDraftButton.tsx`, `rq` = `apps/control-plane/src/routes/queries.ts`, `rs` = `apps/control-plane/src/routes/sources.ts`, `rd` = `apps/control-plane/src/routes/dashboards.ts`, `qry` = `apps/control-plane/src/kernel/data/query/`, `src` = `apps/control-plane/src/kernel/data/sources.ts`. The second agent's column is left for the second agent; "writer, run" means the writer saw it on the throwaway instance, "writer, code" that it was read from the code only.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Columns Source, For, Points to, Used by, Password, Health | Data:3600-3690 | writer, run | holds |
| Tag Arrives with the next promotion; pill Not set up here | Data:3622,3639; `apps/console/src/kit/status.tsx:109` | writer, code | holds |
| Health Not tested / Reached (ms, tested ago) / Failed with reason | `apps/console/src/kit/health.tsx:16-45` | writer, run | holds |
| Row actions Edit, Connect, Test (Testing…), Change, Remove from here | Data:3549-3590,3669-3745 | writer, run | holds |
| Remove confirm text | Data:3739-3745 | writer, run | holds |
| Declare source: opens resource editor New data source with Path, What it is for, Save draft, then Name and path, Discard draft, Deploy (This change only / Review all drafts) | Data:3607; `apps/console/src/screens/ResourceEditor.tsx:440-470`; `apps/console/src/kit/DeployMenu.tsx:40-80` | writer, run | holds |
| Connect/Change fields, Encrypt the connection starts at Yes, hint text | Data:3370-3400 | writer, run | holds |
| Config limits: host 255, port 1–65535, database 63, user 63, schema pattern 63, password 1,000 | src:22-34; rs:223-235 | writer, code | holds |
| Password dropped on host/port/user change or ssl Yes→No; message; API | Data:3426-3495; src:44-52,72-95 | writer, run | holds |
| Remove the stored password; not with a new one | Data:3477-3500 | writer, run | holds |
| Empty state, read-only line, No tables found, no primary key note | Data:3689,3795,3846; Can.tsx:176 | writer, run | holds (read-only not run) |
| Pool 4, connect 5 s, idle 30 s, statement 15 s, UTC, certificate verified | `packages/db/src/external.ts:42-56` | writer, code | holds |
| Base tables only; types mapped; others not writable | src:241-294 | writer, run | holds |
| Health about every 10 minutes, 5 s timeout, at most once a minute, ten sources | `apps/control-plane/src/kernel/data/health.ts:6-9,118-135`; `kernel/execution/background.ts:30-38` | writer, code | holds |
| Error messages (unreachable, refused, no database, not allowed, no password, slow) | src:200-236 | writer, run | holds (unreachable seen) |
| Egress refuses private/loopback unless EGRESS_ALLOW | `docs/self-hosting.md:340-350` | writer, code | holds |
| Permissions: read list/browse/test; write bind/change/remove/rows; resource:write declare | rs:100-130,170-200,240-260,330-400; Data:3585-3610 | writer, code | holds |
| Audit actions bound/rebound/unbound/checked; rows not audited | rs:80-95,205-290,429 | writer, code | holds |
| Password and config copied on workspace clone | `apps/control-plane/src/kernel/tenancy/clone.ts:125-148` | writer, code | holds |
| A page that puts a source's table on it needs data_source:read of whoever saves | `apps/control-plane/src/kernel/pages/standing.ts:1-14,100-120` | writer, code | holds |
