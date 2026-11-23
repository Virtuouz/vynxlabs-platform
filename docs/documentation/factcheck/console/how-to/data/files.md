# Fact-check record: console/how-to/data/files.md

Lines are current at commit `be324f78` (branch phase-31-write-the-docs). Paths are under `apps/console/src` unless they start with `apps/control-plane` or `packages`. Written by the writer; "Checked by" is for the second agent.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Files screen title, description, Upload file, Find a file by name, empty states. | `screens/Files.tsx:176-233` | writer, run on the instance 2026-11-23; second agent pending | holds as run |
| Columns Name, Type, Size, Uploaded, Named by ("table, column (N row(s))"; "No row"), Delete. | `screens/Files.tsx:33-47,236-277`; run | writer, run on the instance 2026-11-23; second agent pending | holds as run |
| Upload: "X was uploaded."; over 25 MB and empty refusals; file goes first. | `screens/Files.tsx:14,108-126` | writer, run on the instance 2026-11-23; second agent pending | holds as run |
| Delete: confirm "Delete X?", text, "X was deleted."; grayed while a row names it, tooltip "A row still names this file. Change the row first." | `screens/Files.tsx:134-148,258-275`; run | writer, run on the instance 2026-11-23; second agent pending | holds as run |
| Show more files, 50 a page, newest first. | `screens/Files.tsx:16,280-288`; `apps/control-plane/src/routes/sources.ts:565-570` | writer, run on the instance 2026-11-23; second agent pending | holds as run |
| A file is at most 25 MB; name 1 to 255 characters; download is an attachment. | `apps/control-plane/src/kernel/data/files.ts:22`; `apps/control-plane/src/routes/sources.ts:607,692-697` | writer, run on the instance 2026-11-23; second agent pending | holds as run |
| Upload needs `file:write`; list needs `file:read` and `data_all:read`; delete needs `file:write` and `data_all:write`; a person with only file:read gets a file through a row they may read or because they uploaded it. | `apps/control-plane/src/routes/sources.ts:544-560,596,654-664,705-718`; `packages/manifest/src/permissions.ts:408-420` | writer, run on the instance 2026-11-23; second agent pending | holds as run |
| Delete refused with 409 while a row names the file ("A row still names this file. Change the row ..."); naming covers retired columns (`kernel/data/files.ts:98`, retired columns included in `namingOf`, 130). | `apps/control-plane/src/routes/sources.ts:718-727`; `apps/control-plane/src/kernel/data/files.ts:98` | writer, run on the instance 2026-11-23; second agent pending | holds as run |
| File column in Add row: Choose a file, No file chosen, Replace, Remove; uploaded when the row is saved. | `screens/Data.tsx:1539-1555`; run | writer, run on the instance 2026-11-23; second agent pending | holds as run |
| Inspector Replace and Remove each ask first; texts; "File replaced."/"File removed." | `screens/Data.tsx:1078-1112`; run | writer, run on the instance 2026-11-23; second agent pending | holds as run |
| A replaced or removed file, a deleted row's file and files of cascaded or purged rows are noted in row history and kept for the audit period (400 days default), then removed unless a row names them. | `apps/control-plane/src/kernel/data/files.ts:329-440,480-510,561-592`; `apps/control-plane/src/kernel/retention.ts:229-285`; `apps/control-plane/src/config.ts:323` | writer, run on the instance 2026-11-23; second agent pending | holds as run |
| Audit actions `file.uploaded`, `file.deleted`. | `apps/control-plane/src/routes/sources.ts:623,734` | writer, run on the instance 2026-11-23; second agent pending | holds as run |
| A file column has no Rules button and no unique or default. | `screens/Data.tsx:2605-2610`; `screens/ColumnControls.tsx:46` | writer, run on the instance 2026-11-23; second agent pending | holds as run |
| No screen shows a row's history or puts a file back. | absence; decisions Q5 | writer, run on the instance 2026-11-23; second agent pending | holds as run |
