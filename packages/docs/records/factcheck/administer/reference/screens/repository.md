# Fact-check record: administer/reference/screens/repository

Code as of commit `14f7d5b9` (branch `phase-31-write-the-docs`), 2026-11-24. Written by the page's writer. Checked by: second agent, 2026-11-23. Every quoted label, message and permission of the page was matched against the console and control-plane source at HEAD (`87000022`) by script and by hand, and what depends on the screen was run on the instance http://localhost:8091 (see `packages/docs/records/runs/...`). Line numbers point at the block that holds the claim. `Git` = `apps/console/src/screens/Git.tsx`, `Env` = `apps/console/src/screens/Environments.tsx`, `CPgit` = `apps/control-plane/src/kernel/git.ts`, `CProu` = `apps/control-plane/src/routes/`, `Rel` = `apps/console/src/screens/Release.tsx`.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Fields, hints, placeholders: Address, Default branch, Folder, User name, Release branch, Access branch, Access token | `Git:150-270` | writer, run (page read) | holds |
| Address must be https with no user name or token (or http on 127.0.0.1/localhost) | `CPgit:529-537` | writer, run (http://example.com refused) | holds |
| Defaults: default branch main, folder platform, username x-access-token | `CPgit:560-575`, `Git:49-52` | writer | holds |
| Release branch is `release` for a new connection; empty is off | `packages/db/migrations/0037_git_release.sql:11`, `CPgit:659,1654-1658`, `Git:105-111` | writer | holds (not run: no remote) |
| Branch name pattern, 200 characters, release and access 150 | `CPgit:118-119`, `CProu/git.ts:185-190` | writer | holds |
| Folder pattern, `..` refused, 200 characters | `CPgit:118,550-557` | writer | holds |
| Folder read only when volvel.yaml names resources; three hints | `Git:140-170` | writer | holds (not run: needs a remote) |
| Folder in force is used by push, pull, compare, release mirror, docs roots; file read on check, push, pull; forgotten when address or default branch changes | `CPgit:276-331,1429-1450,656-658` | writer | holds |
| resources outside the repository stops pull and push, message | `CPgit:294-300` | writer | holds |
| volvel.yaml keys and descriptions; other keys an error | `packages/manifest/src/files.ts:669-725` | writer | holds |
| Pull limits 2000 files / 8 MB and the message | `CPgit:254,316` | writer | holds |
| Connect/Save, busy label, success notice, Check the connection, Disconnect confirm | `Git:216-270` | writer, run (Connect refused twice) | holds |
| "The stored token last reached the repository … ago" | `Git:230-240` | writer | holds (not run) |
| Refusal texts (https, token needed, other host, folder, branch names) | `CPgit:529-615` | writer, run (https text, "could not be reached: fetch failed") | holds |
| Remote problem texts 401/403/404, empty, no branch, other | `CPgit:163-190` | writer | holds (not run) |
| Paused notice | `Git:79-86` | writer | holds (not run) |
| Without git:write: line and disabled fields | `apps/console/src/kit/Can.tsx:176-212` | writer | holds |
| Code in the console section texts, button labels, confirm texts, result messages | `Git:271-330`, `Env:1621-1666` | writer, run (section and button read; not pressed) | holds |
| console_code_off refusal; `PATCH /tenants/:t { consoleCode }`, needs tenant:write; audited | `CProu/authoring.ts:211-225`, `CProu/tenants.ts:402-445` | writer | holds |
| git:read for the repository, git:write for connect, save, check, disconnect | `CProu/git.ts:138,171,207,510` | writer | holds |
| No CLI switch for code in the console | `packages/cli/src/commands.ts` (no command) | writer | holds (absence) |

## Second check (2026-11-23)

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Address accepts https, and http only at 127.0.0.1 or localhost | `git.ts:561-575`; run | second agent, 2026-11-23 | checked, run (corrected: the page said https only) |
| Connect with a bad token, a forbidden token, a missing repository, an empty repository, a missing default branch: each message | `git.ts:165-190`; run against the local git server | second agent, 2026-11-23 | checked, run |
| Connected message, Check the connection, "Stored · set … by …" with Replace, host-change hint and refusal, Disconnect dialog and its effect on Git sync | `Git.tsx`; run | second agent, 2026-11-23 | checked, run |
| volvel.yaml (D65): Folder read only and showing the folder in force after a pull of a branch that has it; each operation reads the file from its own branch (check: default branch) | `git.ts:334,959,1211,1436`; run | second agent, 2026-11-23 | checked, run (corrected: the page said every operation uses the folder in force without saying where the file is read; the release branch used the Folder field because neither the release branch nor the default branch had a volvel.yaml) |
| Without git:write: the line, fields disabled, Connect disabled | `Can.tsx`; run (Amara) | second agent, 2026-11-23 | checked, run |
| Code in the console toggle: both dialogs (action buttons Turn off / Turn on), messages, `console_code_off` 403 on a script draft | `Git.tsx:280-330`, `authoring.ts`; run | second agent, 2026-11-23 | checked, run |
