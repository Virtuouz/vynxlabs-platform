# Fact-check record: console/reference/screens/configure/settings

Code as of commit `14f7d5b9` (branch `phase-31-write-the-docs`), 2026-11-24. Written by the page's writer. Checked by: second agent, 2026-11-23. Every quoted label, message and permission of the page was matched against the console and control-plane source at HEAD (`87000022`) by script and by hand, and what depends on the screen was run on the instance http://localhost:8091 (see `docs/documentation/runs/...`). Line numbers point at the block that holds the claim. `Git` = `apps/console/src/screens/Git.tsx`, `Env` = `apps/console/src/screens/Environments.tsx`, `CPgit` = `apps/control-plane/src/kernel/git.ts`, `CProu` = `apps/control-plane/src/routes/`, `Rel` = `apps/console/src/screens/Release.tsx`.

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

## Second check (2026-11-23)

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Without workspace:write the line reads "…, not change it." | `kit/Can.tsx:176-190`; run (Amara) | second agent, 2026-11-23 | corrected: the page said "not change them" |
| Without binding:write: Give access disabled, line "You can see who holds a role here, not change it. It needs binding:write." | `Environments.tsx:380-405`; run (Amara in Fernhill Rel dev) | second agent, 2026-11-23 | added to the page; checked, run |
| Without workspace:read: only the notice "This needs the workspace:read permission. …" with request ID | run (a Fernhill locum, no role) | second agent, 2026-11-23 | added to the page; checked, run |
| Run limit: an empty field keeps the limit, hint "Left empty, it stays at N." | `Environments.tsx` (HEAD, lines 233-245, 335-345) | second agent, 2026-11-23 | fault fixed (fb): an empty field keeps the limit, hint "Left empty, it stays at N." (Environments.tsx:344), confirmed in the code |
| Clone with data: "Copied 22 resources, 1 row in 1 table and 0 files."; Safety off: "Its connections, data sources, group members and secrets were copied…"; Safety on sentence "…until you set it up" at HEAD | `Environments.tsx:575-590` (HEAD); run | second agent, 2026-11-23 | fault fixed (fb): the sentence says "until you set it up" (Environments.tsx:586), confirmed in the code |
| Delete a production workspace: dialog text, button disabled until the slug is typed, refusal "This needs the workspace_production:write permission. …" | `Environments.tsx:150-165`; run | second agent, 2026-11-23 | checked, run |
| Not run: the queued clone state (a second clone waiting; copying is too fast to hold), clone failure, Try again | - | second agent, 2026-11-23 | not run, said here |
