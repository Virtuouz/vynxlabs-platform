# Fact-check record: console/reference/screens/data/data-sources

Checked by: second agent, 2026-11-23.

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

## Second check (2026-11-23, second agent)

Labels, quoted messages and limits of the page were swept against the console and control-plane source (every bold label and quoted refusal found; messages built from parts checked at their template).

- Confirmed on the instance (tenant qry31chk): list columns and row actions; **Encrypt the connection** starts at **Yes**; Change keeps the connection's current value (shows **No** for a source connected without SSL); Yes against a database without SSL: **Test** says Failed with "The server does not support SSL connections" (added to the page; `sourceFailure` does not map it, so it is the driver's own words); changing Yes to No dropped the stored password ("No password is set for the data source …"), as the page says.
- Corrected: for a member with `data_source:read` only (Vic) the list's **Declare source**, **Connect database**, **Test**, **Change** and **Remove from here** are disabled, but **Edit** (a link) is not, and on the source's own page **Test**, **Change** and **Remove from here** are enabled: **Test** reaches the database ("chk-loans: reached."), **Change** is refused with "needs the data_source:write permission.". Page now says this.
- fault fixed (fc): the source's page turns Test, Change and Remove from here off for a reader, with the reason (`useSourceWrite`), confirmed in the code; the page says so.
- fault fixed (fd): `sourceFailure` answers 502 `source_refused`, "does not accept encrypted connections. Turn Encrypt off for it, or turn SSL on at the server."; Test and the tables route say it, confirmed on the instance; the page quotes it.
- fault fixed (fc): the row's buttons stack in one column below sm (`max-sm:flex-col`); class test only, layout not measured here. The page did not describe the clip.
- Numbers confirmed in `packages/db/src/external.ts:50-53` (4 connections, 30 s idle, 5 s connect, 15 s statement, UTC) and `sources.ts:22-31` (field limits, schema pattern). Walked at 390 and dark: Change drawer reads in both; the source's page has no overflow.
