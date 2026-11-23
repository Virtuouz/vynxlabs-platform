# Fact-check record: console/how-to/apps/share-an-app.md

Lines are current at commit `14f7d5b9` (branch phase-31-write-the-docs). Paths are under `apps/console/src` or `apps/control-plane/src` or `packages` as written. Written by the writer; "Checked by" is for the second agent.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Sharing steps and labels. | `Apps.tsx:109-454` | writer, run on the instance 2026-11-23; second agent, 2026-11-23 | holds as run |
| Before sharing: Open to reads "Staff whose role lets them read this workspace". | `Apps.tsx:732-736` | writer, run on the instance 2026-11-23; second agent, 2026-11-23 | holds as run |
| After sharing the list row reads "Front desk may read and change" and Open to "Front desk". | `Apps.tsx:215-262` | writer, run on the instance 2026-11-23; second agent, 2026-11-23 | holds as run |
| A person shared with opens the app; one not shared sees "Not for this account" and "This account may not open this app. If you think it should, ask the person who gave you the account." | `kernel/apps/front.ts:957-975`; run as an end user (Board, builder app) | writer, run on the instance 2026-11-23; second agent, 2026-11-23 | holds as run (Jess Morgan before, after, and after stopping) |
| Stop sharing dialog text. | `Apps.tsx:296-300` | writer, run on the instance 2026-11-23; second agent, 2026-11-23 | holds as run |
| Sharing makes bindings at the app and its tables, not scripts or flows. | `Apps.tsx:310-326` | writer, read in code, not run; second agent, 2026-11-23 | holds |
| Permissions needed. | `Apps.tsx:477`; `routes/permissions.ts` | writer, read in code, not run; second agent, 2026-11-23 | holds |
| The list of audiences: up to 200 groups of each, no single people, service accounts or custom roles. | `Apps.tsx:122-126,175-186` | writer, read in code, not run; second agent, 2026-11-23 | holds |
| A binding made by the repository is tagged From repository and has no button. | `Apps.tsx:243-246` | writer, read in code, not run; second agent, 2026-11-23 | holds (not run) |
| Sentence "Its code declares no tables. Ask its developer to list them with `reads` in defineApp." | `Apps.tsx:388-394` | writer, read in code, not run; second agent, 2026-11-23 | holds |

## Second check, 2026-11-23 (Checked by: second agent, 2026-11-23)

Every step, state and refusal read against `apps/console/src/screens/Apps.tsx` and run on the instance (run log).
- Step labels, Share-with options, They may, the line under the choices, the anonymous warning, **Stop sharing** text and the kept-table sentence: holds (`Apps.tsx:175-186,215-382`); the kept-table sentence run with Desk and Board (shown as "They lose the app. 1 table stays, for 1 other app that uses it: Board.", also the all-kept case in code), corrected on the reference page.
- Permissions list and grayed **Share** with tooltip: `Apps.tsx:477`, `kit/Can.tsx`. Groups up to 200: `Apps.tsx:122-126`. From repository tag without Stop sharing: `Apps.tsx:238-246`. Repeat-share skips held bindings: `Apps.tsx:312-326`.
- "Not for this account" page and its text: `kernel/apps/front.ts:1593`, run as an end user without access.
- Sign-in redirect for someone not signed in: read in code, not run (needs a session-less browser on an app that needs sign-in at a non-guest address).
- The sheet at 390 px and in dark, by keyboard: run; no overflow.
