# Fact-check record: console/reference/screens/configure/settings

Code as of commit `14f7d5b9` (branch `phase-31-write-the-docs`), 2026-11-24. Written by the page's writer; nothing here has been checked by a second agent yet. Line numbers point at the block that holds the claim. `Git` = `apps/console/src/screens/Git.tsx`, `Env` = `apps/console/src/screens/Environments.tsx`, `CPgit` = `apps/control-plane/src/kernel/git.ts`, `CProu` = `apps/control-plane/src/routes/`, `Rel` = `apps/console/src/screens/Release.tsx`.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Page description; the bar "Unsaved changes to …" with Discard and Save | `Env:331-337`, `apps/console/src/kit/SaveBar.tsx:60-85` | writer, run | holds |
| Workspace name hint, 200, empty error | `Env:290-300` | writer, run | holds |
| Promotion section and Promotes to options; not for production | `Env:722-760`, `Env:175-189` | writer, run | holds |
| Unsaved-target sentences, Review and promote opens the Promote step | `Env:745-770` | writer | holds (not run) |
| Time zone text; UTC default | `Env:505-535` | writer, run | holds |
| Run limit 1 to 1000, texts, empty cannot be saved | `Env:210-225,320-347`, `CProu/workspaces.ts:410-415` | writer, run (0 gave the error; 20 saved and reloaded) | holds |
| Saving message "The settings of X are saved." | `Env:262` | writer | holds (toast not caught) |
| Pause/Resume rows, pausedByInstance sentences, effects | `Env:78-120`, `CProu/workspaces.ts:400-410` | writer, run (paused state read) | holds; resume not run |
| Clone sheet: title, description, fields, defaults, Safety hints | `Env:570-715` | writer, run | holds |
| Clone progress, queued/running/failed/success texts, Open the copy, Try again after 3 misses | `Env:540-640` | writer, run (success text, no-connection sentence) | holds; the others not run |
| Clone permissions | `CProu/environments.ts:79-116` | writer | holds |
| Clone gets resources with key/title/meta, variable values; Safety off adds connections, group members, data sources, secrets | `apps/control-plane/src/kernel/tenancy/clone.ts:41-70,350-372` | writer | holds |
| Queued clone gives up after an hour | `clone.ts:187,424` | writer | holds |
| Copy promotes to the source | run (list shows Rel clone → Rel dev two) | writer, run | holds |
| Delete: type slug, texts, Delete production workspace; button disabled until typed | `Env:123-160`, run | writer, run | holds |
| Delete refused while clone running / runs in progress | `CProu/workspaces.ts:575-590`, `apps/control-plane/src/kernel/tenancy/remove.ts:18-29` | writer | holds (not run) |
| Access section | `Env:362-460` | writer, run | holds |
| Without workspace:write: line and disabled fields | `Env:277`, `Can.tsx:176-212` | writer | holds (not run) |
