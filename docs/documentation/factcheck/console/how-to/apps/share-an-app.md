# Fact-check record: console/how-to/apps/share-an-app.md

Lines are current at commit `14f7d5b9` (branch phase-31-write-the-docs). Paths are under `apps/console/src` or `apps/control-plane/src` or `packages` as written. Written by the writer; "Checked by" is for the second agent.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Sharing steps and labels. | `Apps.tsx:109-454` | writer, run on the instance 2026-11-23; second agent pending | holds as run |
| Before sharing: Open to reads "Staff whose role lets them read this workspace". | `Apps.tsx:732-736` | writer, run on the instance 2026-11-23; second agent pending | holds as run |
| After sharing the list row reads "Front desk may read and change" and Open to "Front desk". | `Apps.tsx:215-262` | writer, run on the instance 2026-11-23; second agent pending | holds as run |
| A person shared with opens the app; one not shared sees "Not for this account" and "This account may not open this app. If you think it should, ask the person who gave you the account." | `kernel/apps/front.ts:957-975`; run as an end user (Board, builder app) | writer, run on the instance 2026-11-23; second agent pending | holds as run (Jess Morgan before, after, and after stopping) |
| Stop sharing dialog text. | `Apps.tsx:296-300` | writer, run on the instance 2026-11-23; second agent pending | holds as run |
| Sharing makes bindings at the app and its tables, not scripts or flows. | `Apps.tsx:310-326` | writer, read in code, not run; second agent pending | holds |
| Permissions needed. | `Apps.tsx:477`; `routes/permissions.ts` | writer, read in code, not run; second agent pending | holds |
| The list of audiences: up to 200 groups of each, no single people, service accounts or custom roles. | `Apps.tsx:122-126,175-186` | writer, read in code, not run; second agent pending | holds |
| A binding made by the repository is tagged From repository and has no button. | `Apps.tsx:243-246` | writer, read in code, not run; second agent pending | holds (not run) |
| Sentence "Its code declares no tables. Ask its developer to list them with `reads` in defineApp." | `Apps.tsx:388-394` | writer, read in code, not run; second agent pending | holds |
