# Fact-check record: console/reference/screens/operate/git-sync

Code as of commit `14f7d5b9` (branch `phase-31-write-the-docs`), 2026-11-24. Written by the page's writer. Line numbers point at the block that holds the claim. `Rel` = `apps/console/src/screens/Release.tsx`, `Exec` = `apps/console/src/screens/Execution.tsx`, `Prom` = `apps/console/src/screens/Promotion.tsx`, `PConf` = `apps/console/src/screens/PromotionConfirm.tsx`, `Drift` = `apps/console/src/screens/Drift.tsx`, `GS` = `apps/console/src/screens/GitSync.tsx`, `Git` = `apps/console/src/screens/Git.tsx`, `Env` = `apps/console/src/screens/Environments.tsx`, `CPgit` = `apps/control-plane/src/kernel/git.ts`, `CProu` = `apps/control-plane/src/routes/`. "Checked by" is for the second agent: nothing here has been checked by one yet.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| States: no repository, repository and no branch, following, paused notice | `GS:149-175,214` | writer, run (no repository state) | holds; the others not run: no remote git |
| Follow this branch panel text and field | `Git:319-392` | writer | holds (not run) |
| Default branch cannot be followed | `CPgit:718-722` | writer | holds |
| Change branch prompt and text; Stop following confirm text | `GS:409-478` | writer | holds (not run) |
| Cards: N changed here, Last agreed, N changed there, head commit, "The branch does not exist yet…" | `GS:176-212` | writer | holds (not run) |
| Commit message 500; default text; Push, Pull, Push with drafts enabled rules; default drafts message; drafts note | `GS:60,216-290` | writer | holds (not run) |
| Outcome messages | `GS:90-125,285-296` | writer | holds (not run) |
| Delete them anyway after a pull; askToDelete text | `GS:292-306`, `PConf:25-35` | writer | holds (not run) |
| Conflicts: Keep workspace, Take branch, Undo, Kept, (removed), In this workspace / On the branch | `GS:307-366` | writer | holds (not run) |
| Files that differ labels and New here explanation | `GS:50-65,368-395` | writer | holds (not run) |
| History: last 50, kinds Push/Pull/Release, empty text | `GS:480-512`, `CProu/git.ts:635` | writer | holds (not run) |
| Branches list: Follows/Release, Follows none, No release branch, state, last error | `GS:514-565` | writer | holds (not run) |
| States never/synced/ahead/behind/conflict/error | `Git:20`, `CPgit:732,994,1030,1256,1379,1128` | writer | holds |
| Outcomes done/nothing/refused/failed | `CProu/git.ts:285-295` | writer | holds |
| Pull limit 2000 files, 8 MB | `CPgit:254`, `CPgit:316` | writer | holds |
| Lease 120 s, git_busy | `CPgit:88,481-492` | writer | holds |
| Production: release branch card `branch/slug`, last result, notices, Commit to the release branch again, outcome texts | `GS:567-690`, `CPgit:1654-1658` | writer | holds (not run) |
| Release commit route needs promotion:write | `CProu/git.ts:410` | writer | holds |
| Permissions: read git:read; follow/unfollow/push git:write; pull deployment:write + code:write | `CProu/git.ts:138-300,340,535-590` | writer | holds |
| Sync never builds code; no webhooks or schedule | `Git:228`, `CPgit:71-79` | writer | holds |
