# Fact-check record: console/reference/screens/operate/releases

Code as of commit `14f7d5b9` (branch `phase-31-write-the-docs`), 2026-11-24. Written by the page's writer. Line numbers point at the block that holds the claim. `Rel` = `apps/console/src/screens/Release.tsx`, `Exec` = `apps/console/src/screens/Execution.tsx`, `Prom` = `apps/console/src/screens/Promotion.tsx`, `PConf` = `apps/console/src/screens/PromotionConfirm.tsx`, `Drift` = `apps/console/src/screens/Drift.tsx`, `GS` = `apps/console/src/screens/GitSync.tsx`, `Git` = `apps/console/src/screens/Git.tsx`, `Env` = `apps/console/src/screens/Environments.tsx`, `CPgit` = `apps/control-plane/src/kernel/git.ts`, `CProu` = `apps/control-plane/src/routes/`. "Checked by" is for the second agent: nothing here has been checked by one yet.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Screen is Deploy in dev, Versions in production; steps Review draft (N changes), Deploy to dev, Promote (only when linked), production one step "What runs here" | `Rel:143-182`, `apps/console/src/nav.ts:113,136` | writer, run | holds |
| Unknown step opens the first one | `Rel:160-162` | writer, run (`?step=promote` before deploy) | holds |
| Review rows: grouping by kind, Apps for interface, Choose checkbox, tags New/Changed/Removed/Takes over from code/Renamed with "from" | `Rel:96-110,345-440` | writer, run | holds |
| Old-draft notice after 24 h with more than one draft and none chosen | `Rel:62,337-345` | writer | holds (not run) |
| Set aside confirm "Set aside the draft of path?", text; set aside chosen in 100s | `Rel:404-415`, `Rel:196-212`, `apps/console/src/kit/BatchResult.tsx:21` | writer | holds (not run) |
| Panel: summary text, refusal heading, Not bound here warning, What changed field, buttons, Choose none | `Rel:449-535` | writer, run | holds |
| What changed is at most 500 characters | `apps/control-plane/src/routes/authoring.ts:1127` | writer | holds |
| Deploy takes drafts atomically; deploying drafts never raises rename_suspected | `apps/control-plane/src/kernel/authoring.ts:695` (`allowDelete: "all"`) | writer | holds |
| Earlier sheet: title, description, Revision N, Set aside tag, Bring back; newest 30 kept | `Rel:546-610`, `apps/control-plane/src/kernel/authoring.ts:396` | writer | holds (sheet not opened) |
| Versions list: vN, message / Promoted / No message, author · time, Running in tags; empty state; Not yet run here; lists stop at 100 | `Rel:612-690`, `apps/control-plane/src/routes/execution.ts:549,644` | writer, run | holds |
| Deploy this version vs Roll back to this version; confirm texts; Deploy/Roll back in production; success message; rename_suspected asks again | `Exec:636-705`, `PConf:50-60` | writer, run (roll back in production) | holds |
| A rollback adds a row (v1 "No message" on top, v2 now has Deploy this version) | run | writer, run | holds |
| Promote step cards From / To, "Gets the same bundle, by its digest. Nothing is rebuilt." | `Rel:735-765` | writer, run | holds |
| What changes in: counts, per-resource tag/from/path/kind, table changes or "No table changes." | `Rel:915-975` | writer, run | holds |
| Before it goes: Tried here, Triggers there, three notices | `Rel:978-1000` | writer, run (not-run-here notice) | holds |
| Promote button label, confirm text, danger | `Rel:693-710,857-900` | writer, run | holds |
| Success "<target> now runs version N.", release branch notice, Try again from Git sync, Open <target>, Run the failed run again | `Rel:790-880` | writer, run (first sentence) | holds; release notices not run |
| Request section text, note field, Request promotion of vN, Withdraw (own pending only), states Waiting/Promoted/Declined | `Prom:60-190` | writer, run (viewer asked, saw Waiting, Declined with reason, Promoted) | holds; Withdraw not run |
| A new request supersedes pending requests for the same two workspaces | `apps/control-plane/src/routes/promotion-requests.ts:236-245` | writer | holds |
| Decide: Promotion requests section, Review sheet, notices, Decline… (reason required), Promote, texts | `Prom:195-402` | writer, run | holds |
| Note and comment at most 1000, list 200, statuses | `apps/control-plane/src/routes/promotion-requests.ts:218,316,377` | writer | holds (not re-read) |
| Drift: heading, chips, ?show=, row sentence, Made there, sheet, compare by path | `Drift:60-179` | writer, run | holds; sheet not opened |
| Editor Deploy menu: This change only, Review all drafts, "cannot be deployed alone" dialog, success message | `apps/console/src/kit/DeployMenu.tsx:42-120` | writer | holds (not run) |
| Remove / Discard / Keep texts | `apps/console/src/kit/RemoveDraftButton.tsx:22-33` | writer | holds (not run) |
| Palette group "This release", command Deploy N changes | `Rel:303-318` | writer | holds (not run) |
| Production: PUT/DELETE refused with production_workspace unless promotion:write and console-made; code-managed by deploy only | `apps/control-plane/src/kernel/authoring.ts:91-131` | writer | holds |
| Permissions table: see/versions/preview `deployment:read`; deploy drafts `deployment:write` or `interface:write`/`doc:write` alone; code:write; console_code_off; deploy version `deployment:write`; promote `promotion:write` in target; request needs read in both | `CProu/authoring.ts:582-592,1020-1030`, `CProu/execution.ts:614,756,853,978-1010`, `CProu/promotion-requests.ts:209,286-335,367,492` | writer | holds |
| Deployer holds promotion:write, Developer does not | `apps/control-plane/src/release.test.ts:161-195` | writer | holds (not re-read; note: Devi in Fernhill promotes because she also holds Deployer) |
