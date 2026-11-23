# Inventory: releases git environments

Read from the code at `270e509` on 2026-11-22. Refreshed 2026-11-23 against the code after phase 29 (branch `phase-30-docs-system`). A report, not checked prose: what it calls a bug is settled in [the findings](../findings/README.md), and what phase 29 did about it is in [fixed/](../fixed/) (cited as `fixed/<lane>.md`).

**Refreshed 2026-11-23.**
- **Changed:** the screen is "Deploy" in dev and "Versions" in production (D54, `fixed/voc-state.md`); "Activate this version" is "Deploy this version" or "Roll back to this version"; "access releases" are "access changes" (`fixed/voc-access.md`); "Published apps" is "Apps".
- **Built since:** unfollow and change a branch, production's release branch with a retry, history and branches lists, repository fields, the `volvel.yaml` folder in force (D65), the run limit field, "Used by" for queries and data sources, Data source in the New menu, the code-in-console switch (D17), the allow-delete choice on pull and on deploying a version, and guards that production resources change by deploy or promotion only.
- **Gone:** the second promotion dialog in settings, the "Follow this branch" form in production, and every old bug list in section E (each is settled there, with its outcome).
- **Not verified:** nothing was run, as before. Webhook 503 while paused (gotcha 18), the rename carry-along list (`N/rename.ts`), the response headers of an old path, the CLI exit codes beyond `commands.ts`, and which built-in roles hold `promotion:write` beyond `release.test.ts:189-195` (deployer yes, developer no). Line numbers are from today; the screens moved by up to 15 lines since the first reading.

**Paths.** Root: ``. `S/` = `apps/console/src/screens/`, `K/` = `apps/console/src/kit/`, `R/` = `apps/control-plane/src/routes/`, `N/` = `apps/control-plane/src/kernel/`, `C/` = `packages/docs/content/` (the old pages, which phase 30 M5 moves). The new pages live in the five collections of `/docs`: Get started, Console, Develop, Administer, Self-host. From code reading; nothing was run.

**Words to use.** Flow (not Workflow). Deploy (dev) and Versions (production). "Deploy this version", "Roll back to this version". "Access changes" for a tenant's access; "release" stays only in the Release branch (a Git branch), `release` in API fields, and route paths (`/releases`, `?release=<id>`). Apps (not Published apps). Canceled. American spelling. A draft is "set aside", never "discarded", in the review list (the editors' button is `Discard draft`).

## A. Pages

Collection and Diátaxis type are the new homes (`docs-platform-design.md:132`: screens go to `console/reference/screens`, tenant pages to `administer`). "Old" is the file in `C/` it replaces.

| Page | Collection | Type | Purpose | Sources |
|---|---|---|---|---|
| Make a change and take it to production | Get started | tutorial | Draft in a dev workspace, deploy, promote to production, see it under Versions. Fernhill. | `S/Release.tsx:143-215`, `e2e/release.spec.ts` |
| Dev and production workspaces | Get started | explanation | What each is, what travels (a version, by digest), what does not (data, secrets, bindings, variables), why production is read-only in editors. Old `C/start/environments.md` (new). | `R/workspaces.ts` (`production_workspace`), `N/authoring.ts:91`, `fixed/rel.md` REL-01 |
| Deploy: review drafts and deploy to dev | Console | how-to | Choose drafts, set aside, deploy, read the refusal, the unbound warning. | `S/Release.tsx:221-520` |
| Deploy and Versions screen | Console | reference | Every control: steps, tags, panel, Earlier sheet, palette group, address `?step=`. | `S/Release.tsx:98-215, 560-700`, `K/DeployMenu.tsx:105-120`, `K/RemoveDraftButton.tsx:22-33` |
| Roll back, or deploy an earlier or unrun version | Console | how-to | Versions list, "Deploy this version" / "Roll back to this version", the allow-delete question. | `S/Execution.tsx:636-705`, `S/Release.tsx:625-690` |
| Promote to production, or to another dev workspace | Console | how-to | Preview, breaking names, bindings refusal, the failed-run link, release branch notice. | `S/Release.tsx:719-1000`, `S/PromotionConfirm.tsx` |
| Ask for a promotion, and decide one | Console | how-to | Request with a note, withdraw (your own only), decline with a reason, promote from the request. | `S/Promotion.tsx:37-320`, `R/promotion-requests.ts` |
| Why a deploy or promotion is refused | Develop | reference | One entry per code with the words and the fix: `incompatible_bundle`, `kind_changed`, `rename_suspected`, `path_taken`, `breaking_changes`, `bindings_missing`, `bindings_invalid`, `production_workspace`, `draft_changed`, `git_busy`, `no_branch`. | `N/execution/deploy.ts:280-664`, `K/RefusalList.tsx`, `fixed/rel.md` |
| How a workspace differs from where it promotes to | Console | how-to | Read Drift: chips, sheet, "Made there". Old `C/operate/drift.md` (new). | `S/Drift.tsx:43-130`, `R/drift.ts:90` |
| Sync a workspace with Git | Console | how-to | Follow a branch, push, pull, conflicts, push with drafts, change or stop following, production's release branch and its retry. Old `C/operate/git-sync.md`. | `S/GitSync.tsx`, `S/Git.tsx:350-392`, `R/git.ts` |
| Git sync screen | Console | reference | Cards, buttons, tags, States, History and Branches lists. | `S/GitSync.tsx:130-690` |
| Connect the tenant's repository | Administer | how-to | Address, token, branches, check, disconnect; internal hosts. Old `C/tenant/repository.md`. | `S/Git.tsx:28-270`, `N/git.ts:529-660`, `docs/self-hosting.md:342-350` |
| Repository layout and `volvel.yaml` | Develop | reference | Files and folders, the five keys (`roots`, `ignore`, `docs`, `entry`, `resources`), which wins (D65), `key:` first line of a moved file. Old `C/build/repository-layout.md` (new). | `packages/manifest/src/files.ts:669-725`, `fixed/yaml-folder.md`, `fixed/t3-cli-docs.md:17` |
| What Git moves, and what stays in code | Develop | explanation | Console-made resources move; code never does; ownership and Take over; why pull and deploy differ. | `N/git.ts`, `S/Release.tsx:420-430`, gotchas 4, 10, 11 |
| Create, link, clone and delete a workspace | Administer | how-to | Create (any link target), settings, run limit, pause, clone with Safety, delete. Old `C/tenant/workspaces.md`, `C/configure/settings.md`. | `S/Tenant.tsx:391-445`, `S/Environments.tsx:49-340, 495-680` |
| Workspace settings | Console | reference | Fields and actions; what saves from the bar and what acts at once. | `S/Environments.tsx:286-345, 683-760` |
| Resources list and editor | Console | reference | Columns, New menu (seven kinds), states, autosave, Move to a file, production notice. Old `C/build/resources.md`, `resource-editor.md`. | `S/Tenant.tsx:813-900`, `S/ResourceEditor.tsx`, `K/objects.tsx:10-19` |
| Rename a resource, and what answers at the old path | Console | how-to | Name and path dialog, review and deploy, Old paths, End now. Old `C/build/names-and-paths.md` (new). | `S/ResourceIdentity.tsx:104-330`, `S/OldPaths.tsx`, `N/resolve.ts:4` |
| Keys, paths and titles | Develop | explanation | Why a key outlives a path; 90 days; what a rename carries; the breaking-name notice. | `N/rename.ts`, `N/resolve.ts:4,137` |
| See what uses a resource | Console | how-to | "Used by" on connection, variable, secret, event, script, flow, query, data source. Old `C/build/references.md` (new). | `K/references.tsx`, `N/references.ts`, `fixed/t3-config.md` REL-MP7 |
| Access changes | Administer | how-to | Read the list, approve, decline, withdraw, go back, ask for a second person. Old `C/tenant/access-releases.md` (new). | `S/AccessReleases.tsx`, `R/access-releases.ts` |
| Access changes: statuses, errors, `tenant/` files | Administer | reference | Statuses, origins, `access:read/write`, errors, the `tenant/` folder, the access branch, `volvel tenant` commands. | `S/AccessReleases.tsx:44-54`, `R/access-releases.ts`, `packages/cli/src/commands.ts:125-155` |
| Why access changes wait for a second person | Administer | explanation | What waits (groups, service accounts, roles, what they are given), what does not (D63), superseded, stale. | `N/tenant/releases.ts`, `S/GiveAccess.tsx:44`, `fixed/rel.md` REL-16 |
| Code in the console: turn it on or off | Administer | how-to | The tenant switch (D17), who may, what stays running. | `S/Git.tsx:278-330`, `S/Environments.tsx:1621-1670`, `R/tenants.ts`, `fixed/sweep-server.md` |
| Bundles and versions | Develop | reference | Formats 1 to 4, the oldest core still run, 20 MiB, draft-test bundles last 7 days, version numbers per workspace. Old `C/operate/bundles.md` (new). | `docs/contracts/bundle.md`, `N/execution/deploy.ts:161`, `N/execution/bundles.ts:21,194` |
| Deploy, promote and roll back from the command line | Develop | how-to | `deploy --preview --allow-delete --message`, `promote --preview --confirm-breaking` (exit 4), `rollback <version>`, `pull`, CI. Owned by the CLI inventory; link, do not repeat. | `packages/cli/src/commands.ts:104-120`, `fixed/clirel.md` |

Not built, so a page says it is not there (one sentence in the page it belongs to, not a page of its own):
- No workspace lock. Production is read-only in the editors, and its resources change only by deploy, promotion, or someone who holds `promotion:write` (`N/authoring.ts:91`).
- No webhooks and no scheduled sync from Git: push, pull and the release commit run on request or after a promotion.
- No "Used by" for dashboards or docs: nothing in a manifest names one (`fixed/t3-config.md`).
- No command-line switch for code in the console: the API and the console have it.
- No button to unpublish an app made in the console (`fixed/t3-config.md`).

A new page must be linked from another page or asked for as a topic, or `docs:check` fails (`packages/docs/check.mjs`). The Access changes tab of Members & access shows tenant-members help today; its slug is still `releases` (`S/Members.tsx:25`).

## B. Per page

### Deploy and Versions (`S/Release.tsx`)
- **Addresses:** `release`, `changes`, `deployments`; `?step=review|deploy|promote`. A step the workspace does not have opens the first one (REL-14): `?step=review` in production shows Versions, `?step=promote` with nothing to promote to shows Review (`:160-162`).
- **Title:** `Deploy` in a dev workspace, `Versions` in production (`:167-168`, `S/nav.ts` `sectionLabel`: side panel, tab title, palette). The numbered stepper has three dev steps: `Review draft` (N changes), `Deploy to dev`, `Promote` (only when linked), `:144-157`. Production has one step, "What runs here", and no stepper.
- **Review rows:**
  - Grouped by kind (interface shows as "Apps"). Checkbox `Choose <path>`.
  - Tags `New`/`Changed`/`Removed`/`Takes over from code`/`Renamed` ("from …"), `:98-102`.
  - "saved … ago", `Earlier`, `Set aside`, plain-language lines (`about`). A renamed resource is described against what runs, not as "A new <kind>" (REL-15).
  - Notice when a draft is over 24 h old, nothing is chosen and there is more than one draft, `:62, 296, 337-345`.
  - A link to each draft opens its editor; kinds without an editor open their own screen or the resources list, never "There is no editor here" (REL-07, `K/objects.tsx`).
- **Panel `Deploy to this dev workspace`:**
  - Refusal "These changes cannot be deployed yet." (now one shared list with a "Set up" link into production, `K/RefusalList.tsx`); unbound warning "Not bound here, and the deploy still works".
  - Field `What changed`. Buttons `Deploy N changes`/`Deploy the N chosen`, `Set aside the N chosen`, `Choose none`.
  - Command palette group "This release" (`:303`, a heading left as it was; it names the deploy step). No keyboard shortcut.
  - Empty state: "Nothing waiting to be deployed". Success toast "Deployed as version N: …" with `Promote to <name>` when linked.
- **`Earlier` sheet:** title `Earlier versions of <path>`; `Revision N`, `Set aside` tag, `Bring back`. The newest 30 are kept per resource key (`N/authoring.ts:396`).
- **Versions list (the Deploy step; the one step in production):** `Versions of <ws>`: `vN`, message (or "Promoted"/"No message"), author · time, `Running in <ws>` tags matched by digest. Then `Not yet run here` ("Uploaded … ago, never run here"). Empty: "Nothing deployed here yet". Lists stop at 100 (`R/execution.ts:549, 644`).
- **Deploy or roll back a version (`S/Execution.tsx:636-705`):** button `Deploy this version`, or `Roll back to this version` when the version is earlier than the one running (`versionMove`). Confirm "Deploy version N to <ws>?" or "Roll back <ws> to version N?"; action `Deploy`/`Roll back`, plus ` in production`, as a danger. A `rename_suspected` refusal asks "Delete them anyway" and posts again with `allowDelete` (REL-10).
- **Editors:** `Deploy` menu: `This change only`, `Review all drafts` (`K/DeployMenu.tsx:115-117`). `Discard draft`/`Remove`/`Keep this <noun>` (`K/RemoveDraftButton.tsx:22-33`).
- **API:** `drafts`, `drafts/batch` (500, all or nothing, `R/authoring.ts:691,728`), `drafts/batch-discard` (100, `R/batch.ts:215`), `draft-history`, `changes/preview`, `changes/deploy`, `test-runs`, `bundles` (20 MiB, `N/execution/bundles.ts:21`), `deployments`. A draft `revision` mismatch gives 409 `draft_changed`; `create` gives `path_taken`.
- **Permissions:** `resource:read/write`, `deployment:read/write`, `code:write`. `interface:write`/`doc:write` alone may draft and deploy only their own kinds, and must name paths (`R/authoring.ts:582-592, 1021-1030`). A script, connector or trigger source also needs the tenant's code-in-console switch on (`console_code_off`, `R/authoring.ts:211-225`).
- **Production:** `PUT` and `DELETE …/resources/*` answer 409 `production_workspace` unless the caller holds `promotion:write`; a code-managed resource there changes only by a deploy, for everyone (REL-01, `N/authoring.ts:91`). Drafts are refused in production.

### Promotion (`S/Release.tsx:719`, `S/Promotion.tsx`, `S/PromotionConfirm.tsx`)
- `From`/`To` cards. `What changes in <target>` (created/updated/renamed/deleted, table changes). `Before it goes`: `Tried here`, `Triggers there`.
- Button `Promote to production`, or `Promote to <name>` (`:701`). `Change where this promotes to` opens settings. Settings' `Review and promote` now opens this step; the old second dialog is gone (REL-11).
- Success: "<target> now runs version N." Toast: `Open <target>`, or `Run the failed run again on vN` with `?fromRun=`. If the release branch push failed: "The release branch was not updated: …" with `Try again from Git sync`, which is a link to the production workspace's Git sync, where a button does it (`:795-806`).
- `Delete them anyway` → `Delete them and look again` (for `rename_suspected`, one shared function `askToDelete`, `S/PromotionConfirm.tsx`). Breaking-name notice, production only.
- **Missing bindings:** a promotion, and a deploy to production, refuse with `bindings_missing` or `bindings_invalid`. In production the refusal's "Set up" link opens the setup, and a connection or variable the next promotion brings is listed as "Arrives with the next promotion" (D23, `fixed/cfg.md` CFG-04).
- **Request:** shown when the caller may not promote. `A note for whoever decides (optional)`, `Request promotion of vN`, `Withdraw the request` (shown only on your own pending request, REL-03; someone else's is not visible to a caller without promotion rights, REL-02).
- **Decide:** tenant overview `Promotion requests` → `Review` sheet: `Promote`, `Decline…` (reason required). Decline title "Decline the request?".
- Statuses: pending, promoted, declined, withdrawn, superseded. Note and comment ≤1000 chars; list ≤200 (`R/promotion-requests.ts:218,316,377`).
- **Permissions:** `promotion:write` on the target (`:367`). Requesting needs `deployment:read` on both workspaces. The built-in `deployer` role holds it; `developer` does not (`release.test.ts:161-195`).
- **Refusals (`N/execution/deploy.ts`):** `incompatible_bundle`, `kind_changed`, `rename_suspected`, `path_taken`, `breaking_changes`, `bindings_missing`, `bindings_invalid`. CLI: `--preview --allow-delete --confirm-breaking`; `promote --preview` exits 4 when production would refuse for breaking changes (D49, `fixed/clirel.md` CLI-10).

### Drift (`S/Drift.tsx`)
Heading `How <here> differs from <there>`, at the foot of Promote. Chips `All that differ`, `Changed in <here>`, `Only in …` (×2), `In sync` (`?show=`). Row opens sheet with sentences and diff. "Made there: a promotion leaves it." Compares by path: a rename shows as two rows (by design). Route `R/drift.ts:90`.

### Git sync (`S/GitSync.tsx`)
- Cards `This workspace` (N changed here; Last agreed … at <sha>) and the branch (N changed there, head commit).
- `Commit message` (≤500), `Push N changes`, `Pull N changes`, `Push with drafts`. After `Push with drafts` the message ends "A plain push leaves these files on the branch while their drafts are saved." (REL-04.)
- Conflicts `Changed on both sides: choose for each`: `Keep workspace`/`Take branch`/`Undo`.
- `Files that differ` tags: New/Removed/Changed here/there.
- A pull stopped at a suspected rename shows `Delete them anyway`, which asks, then pulls again with `allowDelete` (REL-10).
- **Following:** a followed branch shows `Follows <branch>` with `Change branch` (asks, resets the comparison) and `Stop following` (asks; the branch and its files stay; `DELETE …/git`, `git:write`). Setup panel: `Branch`, `Follow this branch` (`S/Git.tsx:350-392`) (REL-09, D48).
- **Lists:** `History` (last 50 pushes and pulls: kind, status, commit, message, when) and `Branches` (every workspace's branch, "Follows" or "Release", state, error), `:480-550` (REL-MP4).
- **Production:** no "Follow this branch". It shows its release branch `<releaseBranch>/<workspace slug>`, the last result, a notice when the last commit failed, and `Commit to the release branch again` (`POST …/git/release`, `promotion:write`; says done, nothing to write, failed with the reason, or off when paused or no release branch). With no repository it links to Repository (`:565-690`; REL-06, REL-08).
- API states: never, synced, ahead, behind, conflict, error. Outcomes: done, nothing, refused, failed. `git/operations` (50, `R/git.ts:635`), `git-branches`.
- Limits: pull 2000 files/8 MB (`N/git.ts:254`); lease 120 s (`git_busy`, `:88`). Push/follow/unfollow `git:write`; pull `deployment:write` + `code:write` (`R/git.ts:538-586`).

### Repository (`S/Git.tsx:28`, `N/git.ts:529`)
- Fields: `Address` (HTTPS, no credentials), `Default branch` (main; "Never written to"), `Folder` (platform), `User name` (write-only; the API does not return it; kept when left empty), `Release branch`, `Access branch`, `Access token`; `Connect`/`Save`, `Check the connection` (`POST …/check`), `Disconnect`; "The stored token last reached the repository … ago" (`verifiedAt`). Reached before saving. (REL-MP3, `fixed/t3-config.md`.)
- **Folder and `volvel.yaml` (D65):** when the file on the branch names `resources`, the Folder field is read-only ("Set in volvel.yaml (resources). Change it there. Sync never builds code, so entry in that file is for the command line only."); before the first read the hint says the file has not been read yet. Push, pull, compare, the release mirror and docs roots all use the folder in force. A `resources` that is not a folder inside the repository stops pull and push with a message. API: `folderInForce`, `folderFrom` (`setting` or `volvel.yaml`), `fileReadAt` (`fixed/yaml-folder.md`). Not done: the CLI does not refuse a `..` in `resources` the same way.
- API only: `tenantBranch` is now the form's `Access branch`; `credentialKind`.
- Defaults: `releaseBranch` is `release` in the database (`0037_git_release.sql`); an empty field turns it off. `username` defaults to `x-access-token` (`N/git.ts:630`).
- No webhooks or scheduled sync: operations run on request. Internal hosts need `EGRESS_ALLOW` (`docs/self-hosting.md:342-350`); a script's reach is `WORKER_EGRESS_ALLOW`, a different list (D20).
- `volvel.yaml`: `roots`, `ignore`, `docs`, `entry`, `resources` (`packages/manifest/src/files.ts:669-721`; any other key is an error). Git sync reads `roots`, `ignore`, `docs` and `resources`; `entry` is for the CLI and CI, the instance never builds code. CLI flags `--entry` and `--resources` win over the file.
- **Code in the console** (section under the form): "Writing code in the console is on/off", button `Turn on/off code in the console`; needs permission to change the tenant (`S/Git.tsx:278-330`). The same button is on the tenant overview and the Tenants inspector.

### Workspaces and settings
- **List (`S/Tenant.tsx:391-445`):** Name, Slug, Type, Promotes to (any workspace, including a dev one, REL-13). `Create workspace`: Name, Slug, Type (picked; "The type cannot be changed afterwards."), Promotes to (every workspace as `name (type)`). `workspace:write`.
- **Settings (`S/Environments.tsx`):** `Workspace name` (≤200), `Pause/Resume triggers` (and "paused by the instance"), `Clone workspace`, `Delete workspace`, `Promotion target` (`Promotes to`, `Review and promote`), `Run limit` with `Runs at once` (1 to 1000; REL-MP5), `Zone`. Name, target, run limit and zone save from the bar; the rest act at once.
- **Clone:** Name, Slug, Rows and files, Safety (default On). Data also needs `data_all:read` + `file:read`; Safety off `secret:write` + `connection:write` (`R/environments.ts:80-115`). A clone keeps each resource's key, title and meta (REL-05). With Safety off it also copies connections, connection group members, data sources and secrets (`N/tenancy/clone.ts`).
- **Delete:** type the slug. Refused while a clone of it is being made (`R/environments.ts:262`) and while runs are in progress (`N/tenancy/remove.ts:81`). Production needs `workspace_production:write`, which no wildcard grants; the action reads `Delete production workspace`.
- API only: `failureAlert` belongs to Alerts.

### Resources (`S/Tenant.tsx:813`; page title "Resources")
- Columns: Path (a link where the kind has a screen, with its title), Kind, Key (only if it differs), Defined in (Console / Repository / Repository, <file>), Version, Changed. `New` menu, dev only: Connection, Connection group, Variable, Event, Schedule, Trigger, Data source (`K/objects.tsx:10-18`). Row action `Rename`.
- `Old paths` (hidden when none): Old path, Now at, Kind, Last called ("Never"), Answers until, `End now` (`S/OldPaths.tsx`).

### Resource editor (`S/ResourceEditor.tsx`)
- States: new, draft, deployed, repository, unsaved. `Save draft`, `Name and path`, Remove/Discard, Deploy. Seven kinds, with Data source among them.
- Autosaves 3 s after a change once saved once (`:294`); a new one keeps a browser copy (`Restore it`/`Discard`). `Move to a file` takes over a repository resource. A draft clash opens `DraftClash`, which has no "Copy what I wrote" (`remaining.md`).
- Production notice: "Edit it in <dev>" (`K/objects.tsx:166`).

### Names and paths (`S/ResourceIdentity.tsx`, `N/rename.ts`, `N/resolve.ts`)
- Dialog `Name and path of …`: Key, Path (≤255), Title (≤200; apps and interfaces are titled in their editor), `Save as a draft`, toast `Review and deploy`. A repository-defined resource cannot be renamed here: the dialog says to give it `key:` in the code (`:27-36`). Renaming a query lists the dashboards it drafts (the repository's are listed, not drafted).
- 90 days (`ALIAS_DAYS`, `N/resolve.ts:4`); response headers `Deprecation`, `Sunset`, `Volvel-Resource-Moved`, `Warning` (not re-checked). Last called is hourly.
- Carried along: bindings, values, group members, trigger pauses, domains, recents, drafts (`N/rename.ts:30`); a stored credential is read under any path its resource had, and sealed again under its row (CFG-01, `fixed/cfg.md`).
- **Delete for good** is for retired tables and columns only (`S/Data.tsx:1914`, `POST table-purges`, type the name, `table:write`). Deleting a resource is a draft then a deploy.

### Used by (`K/references.tsx`, `N/references.ts`)
Tabs on connection, variable, secret, event ("Who listens and who sends"), script, flow; a sidebar "Used by" on a query (dashboards and interfaces that show it); a "Used by" column on data sources (scripts that read them). Worked out on each request; drafts marked "in a draft". Empty: "Nothing uses it, deployed or in a draft." Dashboards and docs are never listed as users (nothing in a manifest names one).

### Access changes (`S/AccessReleases.tsx`, `R/access-releases.ts`)
- Screen title and Members & access tab: `Access changes` (slug `releases`). Columns #, What, Status, By, When. Statuses Applied, Waits for approval, Declined, Withdrawn, Superseded (`:44-48`). Origins: From the repository, Through the API, In the console, Going back.
- `Approve`, `Decline` (reason), `Withdraw`, `Go back to this`, `Ask for/Stop asking for a second person`. `access:read/write`. Lists 200 (`R/access-releases.ts:105`). Empty: "No access changes yet".
- With a second person asked for, `Go back` toasts "… waits for a second person. Nothing has changed yet." (REL-12). A waiting change that another change moved under is `Superseded`, finished, with no buttons; approving or withdrawing it answers 409 (REL-16).
- A role given straight to a member or to every end user applies at once even with approval on, and the screen says so (D63, `S/GiveAccess.tsx:44`). Access changes cover groups, service accounts, roles and what they are given.
- Errors: `delete_not_allowed`, `release_stale`, `own_release`, `approval_needs_two`, `principal_in_use` (codes kept; texts say "access change", `packages/manifest/src/errors.ts`). `approval_needs_two` counts members who hold `access:write` through a group too (REL-17). A service account may not approve (D9). CLI: `volvel tenant plan|release|pull|releases|approve|decline|withdraw|rollback` (names kept; output says "access change", `commands.ts:125-155`).

### Bundles
Formats 1–4 (`docs/contracts/bundle.md`); oldest core still run is `0.2.0` (`N/execution/deploy.ts:161`). Draft-test bundles last 7 days (`PREVIEW_DAYS`, `N/execution/bundles.ts:194`).

## C. Gotchas
1. Dev deploys warn on missing bindings; production and any promotion refuse, even dev→dev (`deploy.ts:630-645`). A clone's own deploy skips the check.
2. Version numbers are per workspace; the digest is what is shared. Production's v4 may be dev's v9.
3. A request pins its bundle; asking again supersedes anyone's pending request from that source to that target.
4. Deploying drafts sets `allowDelete: "all"`, so it never raises `rename_suspected` (`N/authoring.ts:695`); pulls, deploying a version, promotions and the CLI do, and each now offers "Delete them anyway" (CLI: `--allow-delete`).
5. Console-made resources no bundle carried survive every deploy. The CLI stops before uploading when a deploy would delete some, unless `--allow-delete <path>` names each (CLI-13).
6. Rollback keeps current console resources when the old bundle carries none; it composes a new bundle.
7. A pre-key bundle renames resources back.
8. Drift matches by path: a rename shows as two rows.
9. After `Push with drafts`, a plain Push leaves the drafted files on the branch while their drafts are saved; set the draft aside and the next plain push takes it off (REL-04, `git.test.ts`).
10. Git moves console-owned resources only, never code.
11. First push to a new branch leaves files outside the folder for a pull (state `behind`).
12. `Keep workspace` writes nothing to git until the next push.
13. The release branch is **on by default** (`release`, so `release/<slug>`, a mirror); an empty Release branch field turns it off.
14. Any access change that applies makes each waiting change asked against another state of access `superseded`, not stale (REL-16).
15. Approval counts members who hold `access:write` directly or through a group (REL-17).
16. Who is in a group is never in an access change.
17. Clone copies variables always. With Safety off it also copies connections, group members, data sources and secrets; it does not copy drafts, time zone or alerts (nothing in `clone.ts` does; not run). One data clone copies at a time; a queued one gives up after an hour (`clone.ts:187, 424`).
18. Pausing: webhooks answer 503; a due schedule fires once on resume. Not re-checked.
19. "Used by" misses dashboards and docs as users (a manifest never names them).
20. `volvel.yaml` `resources` wins over the Repository page's Folder; a bad value stops pull and push, with no fallback (D65).
21. A stored credential on a connection does not survive a change of the address's origin unless given again (D10); a redirect to another origin is refused (D11). Say so on the rename and promote pages where credentials are mentioned.

## D. Docs wrong or missing
The old pages are replaced in phase 31, not edited. What they got wrong, so the new pages do not:
- `C/operate/git-sync.md`: describes a panel "beside other screens"; only Git sync has it. It also lacks change/stop following, history, branches, the release branch.
- `C/configure/settings.md` and index: "its limits" now has a UI: `Runs at once`.
- `C/start/concepts.md`: omits that production can also be rolled back by deploying an earlier version under Versions.
- `docs/master-spec.md`: failed release push is "shown with a way to retry": there is now a button in production's Git sync.
- `C/operate/releases.md` and `operate/index.md`: call the screen "Releases" and the button "Activate"; both are "Deploy"/"Versions" and "Deploy this version"/"Roll back to this version". Also lacks drafts, history, requests, drift.
- `C/tenant/members.md:13-15`: "Going back to an access release" is "access change".
- `C/build/index.md:30`, `build/published-apps.md`, `build/app-builder.md:9`: "Published apps" is "Apps".
- Left in the console and not yet "Deploy": `ScheduleForm.tsx:399, 453` and `Overview.tsx:217` say "Releases" for the deploy screen; the palette group "This release". Quote the screen's own word where a page names them, and expect a fix.

## E. Findings, settled
All sixteen "likely bugs" of the first reading are settled by phase 29. Each line: the old question, then the outcome.
1. "Try again from Git sync" with no button: fixed. Production's Git sync has `Commit to the release branch again` (REL-06, `fixed/clirel.md`).
2. "There is no editor here" from release links: fixed (REL-07). The notice stays only for a typed address.
3. `Withdraw the request` on someone else's request: fixed (REL-02, REL-03, `fixed/rel.md`).
4. Production offered `Follow this branch`: fixed; production shows its release branch (REL-06, REL-08).
5. No way to change or unfollow a branch; `no_branch` pointed to Workspace settings: fixed. `Change branch`, `Stop following`, and the error says "Choose one under Git sync." (REL-09, D48).
6. No allow-delete on pull and on deploying a version: fixed (REL-10).
7. Settings `Review and promote` as a weaker second path: fixed; it opens the Promote step (REL-11).
8. `Go back` toast with approval on: fixed (REL-12).
9. Workspaces "Promotes to" blank for dev→dev, Create offering only production: fixed (REL-13).
10. `?step=review` in production loads forever; `?step=promote` unlinked is blank: fixed (REL-14).
11. `PUT`/`DELETE …/resources/*` with no dev check: fixed (REL-01).
12. `tenant.console_code` set by nothing: fixed. A switch for an operator and a tenant admin, audited, `PATCH /tenants/:t { consoleCode }` (REL-18, D17, `fixed/sweep-server.md`). Not built: a CLI command.
13. No workspace lock: not built and not asked for. Production changes by deploy or promotion; say so in one sentence. No decision names a lock.
14. Access change `superseded` never set: fixed (REL-16).
15. Clone passed no `key`: fixed (REL-05, `fixed/cfg.md`).
16. `about` of a renamed draft read as new: fixed (REL-15).
Also settled: the plain push that removed drafted files (REL-04); the approval count by group (REL-17); Git sync ignoring `volvel.yaml` `resources` (D65, `fixed/yaml-folder.md`); the CLI's promote and release warnings (D49, `fixed/clirel.md`).

Built-in roles were not fully traced. `0035_promotion.sql` gave `promotion:write` to every built-in role that held `deployment:write` then; `release.test.ts:161-195` says deployer holds it and developer does not.

## F. Screenshots and examples
- **Screenshots:** Review step with mixed tags; unbound warning; Versions in production with Deploy this version; Promote with breaking notice; request sheet; Drift diff; Git conflict; production Git sync with the release branch and the retry; Repository form with a read-only Folder; Clone sheet; rename dialog with dashboards; Old paths; a waiting access change; code-in-console switch.
- **Examples:** dev→QA→production; `volvel.yaml` with `resources` and `entry`; a file after rename (`key: moves/one` first line, `git.test.ts:611`); `tenant/groups/tech-desk.group.yaml`; `PUT git-repository` setting `releaseBranch`/`tenantBranch`; CI deploy with `--allow-delete`; `promote --preview` exit 4; headers from an old path. Reusable flows: `e2e/release.spec.ts`, `e2e/rename.spec.ts`.
- **Walk of the changed screens:** phase 29 recorded "walk not run" for most of REL-01 to REL-18 (`fixed/rel.md`, `fixed/clirel.md`). A writer's screenshots are the first browser look at: production Git sync, Change branch and Stop following, the read-only Folder, Superseded access changes.
