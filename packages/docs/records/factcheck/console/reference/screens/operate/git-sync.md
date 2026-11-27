# Fact-check record: console/reference/screens/operate/git-sync

Code as of commit `14f7d5b9` (branch `phase-31-write-the-docs`), 2026-11-24. Written by the page's writer. Checked by: second agent, 2026-11-23. Every quoted label, message and permission of the page was matched against the console and control-plane source at HEAD (`87000022`) by script and by hand, and what depends on the screen was run on the instance http://localhost:8091 (see `packages/docs/records/runs/...`).. Line numbers point at the block that holds the claim. `Rel` = `apps/console/src/screens/Release.tsx`, `Exec` = `apps/console/src/screens/Execution.tsx`, `Prom` = `apps/console/src/screens/Promotion.tsx`, `PConf` = `apps/console/src/screens/PromotionConfirm.tsx`, `Drift` = `apps/console/src/screens/Drift.tsx`, `GS` = `apps/console/src/screens/GitSync.tsx`, `Git` = `apps/console/src/screens/Git.tsx`, `Env` = `apps/console/src/screens/Environments.tsx`, `CPgit` = `apps/control-plane/src/kernel/git.ts`, `CProu` = `apps/control-plane/src/routes/`. "Checked by" is for the second agent: nothing here has been checked by one yet.

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

## Second check (2026-11-23)

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Follow a branch, default branch refused, first push creates branch from default | `kernel/git.ts:688,929`; run against a local git server | second agent, 2026-11-23 | checked, run |
| Push, commit authored by the member, "Deploy from the console"; History row; Last agreed at commit | `git.ts`; run | second agent, 2026-11-23 | checked, run |
| Pull deploys, version message "Pulled *commit* from *branch*" | `git.ts:1317`; run | second agent, 2026-11-23 | checked, run |
| Changed on both sides: Push and Push with drafts disabled; Pull disabled until a choice; Keep workspace / Take branch / Undo; Kept tag | `GitSync.tsx`; run | second agent, 2026-11-23 | checked, run |
| Push refused "Nothing was written: the branch changed. Pull first." only when a resource file changed on the branch (a README does not refuse) | `git.ts:996-1010`; run | second agent, 2026-11-23 | checked, run |
| Push with drafts: message; drafted files then "Removed here" and a plain push answers "Already the same: nothing to write." | `git.ts`; run | second agent, 2026-11-23 | fault fixed (fd): `draftedFiles`/`keepDrafted` are one rule for push, compare and pull, so a drafted file is not listed or counted, confirmed in the code and test; the page now says so |
| After a pull, a resource new here stays under New here but is not counted, and Push stays disabled | run (lab sixth) | second agent, 2026-11-23 | fault fixed (fd): a pull leaves a file that still differs as changed here, confirmed in the code and test; the page now says it is counted |
| A volvel.yaml that moves the resources folder after the last sync makes a file changed there show as changed on both sides | run (stack/greetings/new) | second agent, 2026-11-23 | fault fixed (fd): the last sync keeps its folder (`workspace_git.synced_folder`) and a moved file is read as moved, confirmed in the code and test; the page now says so |
| Change branch dialog and effect; Stop following dialog; follow again | `Git.tsx`; run | second agent, 2026-11-23 | checked, run |
| Production: release branch card, "Commit to the release branch again", failed commit notice, nothing-to-write messages, retry after the server was back | `GitSync.tsx:567-665`; run (server stopped, then started) | second agent, 2026-11-23 | checked, run |
| History lists a release commit as **Push** (kind is stored as push) | `git.ts:1666-1723`, `GitSync.tsx:476` | second agent, 2026-11-23 | fault fixed (fd): `GET .../git/operations` answers kind `release` and the console words it Release, confirmed in the code (routes/git.ts, GitSync.tsx:476); the page now says so |
| Branches state is the state the last push/pull/deploy left | `git.ts:1376` (markAhead), `git.ts` state writes; run | second agent, 2026-11-23 | checked, run |
| Not run: Sync is paused (only a tenant imported from another instance), **Delete them anyway** after a pull, the 2000 files / 8 MB limit | - | second agent, 2026-11-23 | not run, said here |
