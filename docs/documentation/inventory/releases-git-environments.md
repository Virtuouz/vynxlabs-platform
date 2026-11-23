# Inventory: releases git environments

Read from the code at `270e509` on 2026-11-22. A report, not checked prose: what it calls a bug is settled in [the findings](../findings.md).

**Paths.** Root: ``. `S/` = `apps/console/src/screens/`, `K/` = `apps/console/src/kit/`, `R/` = `apps/control-plane/src/routes/`, `N/` = `apps/control-plane/src/kernel/`, `C/` = `packages/docs/content/`. From code reading; nothing was run.

## A. Pages

| Page | State | Topic | Purpose |
|---|---|---|---|
| `C/operate/releases.md` | expand | operate-release | Review, deploy, activate |
| `C/operate/promotion.md` | new | – | Promote, request, decide, refusals |
| `C/operate/drift.md` | new (or section of promotion) | – | Dev vs target |
| `C/operate/git-sync.md` | expand | operate-git | Push, pull, conflicts |
| `C/tenant/repository.md` | stub | tenant-repository | Connect, tokens, branches |
| `C/build/repository-layout.md` | new | – | Files, `volvel.yaml`, pull/deploy, ownership |
| `C/tenant/workspaces.md` | expand | tenant-workspaces | Create, link |
| `C/configure/settings.md` | stub | configure-settings | Name, pause, clone, delete, target, zone |
| `C/start/environments.md` | new | – | Dev, production, what travels |
| `C/build/resources.md` | stub | build-resources | List, Old paths |
| `C/build/resource-editor.md` | stub | build-resources-editor | Six-kind editor |
| `C/build/names-and-paths.md` | new | – | Key, path, title, rename, 90 days |
| `C/build/references.md` | new (or section) | – | Used by |
| `C/tenant/access-releases.md` | new | – | `tenant/` as code, approval |
| `C/operate/bundles.md` | new | – | Versions, formats, compatibility |

A new page must be linked from another page or asked for as a topic, or `docs:check` fails (`packages/docs/check.mjs`). The Releases tab of Members & access shows tenant-members help today.

## B. Per page

### Releases (`S/Release.tsx`)
- **Addresses:** `release`, `changes`, `deployments`; `?step=review|deploy|promote`. The stepper is numbered.
- **Dev steps:** `Review draft` (N changes), `Deploy to dev`, `Promote` (only when linked), :144-157. **Production:** title `Versions`, no stepper.
- **Review rows:**
  - Grouped by kind (interface shows as "Apps"). Checkbox `Choose <path>`.
  - Tags `New`/`Changed`/`Removed`/`Takes over from code`/`Renamed` ("from …"), :95.
  - "saved … ago", `Earlier`, `Set aside`, plain-language lines (`about`).
  - Notice when a draft is over 24 h old, nothing is chosen and there is more than one draft, :289.
- **Panel `Deploy to this dev workspace`:**
  - Refusal "These changes cannot be deployed yet."; unbound warning "Not bound here, and the deploy still works".
  - Field `What changed`. Buttons `Deploy N changes`/`Deploy the N chosen`, `Set aside the N chosen`, `Choose none`.
  - Command palette group "This release" (:303). No keyboard shortcut.
  - Empty state: "Nothing waiting to be deployed".
- **`Earlier` sheet:** `Revision N`, `Set aside` tag, `Bring back`. The newest 30 are kept per resource key (`N/authoring.ts:321`).
- **Deploy step:** `Versions of <ws>`: `vN`, message (or "Promoted"/"No message"), author · time, `Running in <ws>` tags matched by digest, `Activate this version`. Then `Not yet run here`. Lists stop at 100 (`R/execution.ts:489-560`). Confirm action is `Activate` or `Activate in production` (`S/Execution.tsx:571`).
- **Editors:** `Deploy` menu: `This change only`, `Review all drafts` (`K/DeployMenu.tsx:105`). `Discard draft`/`Remove`/`Keep this <noun>` (`K/RemoveDraftButton.tsx:131`).
- **API:** `drafts`, `drafts/batch` (500, all or nothing), `drafts/batch-discard` (100), `draft-history`, `changes/preview`, `changes/deploy`, `test-runs`, `bundles` (20 MiB), `deployments`. A draft `revision` mismatch gives 409 `draft_changed`; `create` gives `path_taken`.
- **Permissions:** `resource:read/write`, `deployment:read/write`, `code:write`. `interface:write`/`doc:write` alone may draft and deploy only their own kinds, and must name paths (`R/authoring.ts:226-265, 1032`).

### Promotion (`S/Release.tsx:712`, `S/Promotion.tsx`, `S/PromotionConfirm.tsx`)
- `From`/`To` cards. `What changes in <target>` (created/updated/renamed/deleted, table changes). `Before it goes`: `Tried here`, `Triggers there`.
- Button `Promote to production`, or `Promote to <name>`. `Change where this promotes to` opens settings.
- Success toast: `Open <target>`, or `Run the failed run again on vN` with `?fromRun=`.
- `Delete them anyway` → `Delete them and look again` (for `rename_suspected`). Breaking-name notice, production only.
- **Request:** `A note for whoever decides (optional)`, `Request promotion of vN`, `Withdraw the request`.
- **Decide:** tenant overview `Promotion requests` → `Review` sheet: `Promote`, `Decline…` (reason required).
- Statuses: pending, promoted, declined, withdrawn, superseded. Note and comment ≤1000 chars; list ≤200 (`R/promotion-requests.ts`).
- **Permissions:** `promotion:write` on the target. Requesting needs `deployment:read` on both workspaces.
- **Refusals (`N/execution/deploy.ts`):** `incompatible_bundle`, `kind_changed`, `rename_suspected`, `path_taken`, `breaking_changes`, `bindings_missing`, `bindings_invalid`. CLI: `--preview --allow-delete --confirm-breaking`.

### Drift (`S/Drift.tsx`)
Heading `How <here> differs from <there>`, at the foot of Promote. Chips `All that differ`, `Changed in <here>`, `Only in …` (×2), `In sync` (`?show=`). Row opens sheet with sentences and diff. "Made there: a promotion leaves it."

### Git sync (`S/GitSync.tsx`)
- Cards `This workspace` (N changed here; Last agreed … at <sha>) and the branch (N changed there, head commit).
- `Commit message` (≤500), `Push N changes`, `Pull N changes`, `Push with drafts`.
- Conflicts `Changed on both sides: choose for each`: `Keep workspace`/`Take branch`/`Undo`.
- `Files that differ` tags: New/Removed/Changed here/there.
- Setup panel: `Branch`, `Follow this branch` (`S/Git.tsx:161`).
- API states: never, synced, ahead, behind, conflict, error. Outcomes: done, nothing, refused, failed. `git/operations` (50), `git-branches`, `git/release`: no UI.
- Limits: pull 2000 files/8 MB; lease 120 s (`git_busy`). Push/follow `git:write`; pull `deployment:write` + `code:write`.

### Repository (`S/Git.tsx:28`, `N/git.ts:529`)
- `Address` (HTTPS, no credentials), `Default branch` (main), `Folder` (platform), `Access token`, `Connect`/`Save`, `Disconnect`. Reached before saving.
- API only: `username` (default `x-access-token`), `releaseBranch` (default `release`), `tenantBranch`, `POST …/check`, `credentialKind`, `verifiedAt`.
- No webhooks or scheduled sync: operations run on request. Internal hosts need `EGRESS_ALLOW` (`docs/self-hosting.md:299`).
- `volvel.yaml`: `roots`, `ignore`, `docs` (`packages/manifest/src/files.ts:653`).

### Workspaces and settings
- **List (`S/Tenant.tsx:291`):** Name, Slug, Type, Promotes to. `Create workspace`: Name, Slug, Type (fixed), Promotes to. `workspace:write`.
- **Settings (`S/Environments.tsx`):** `Workspace name` (≤200), `Pause/Resume triggers`, `Clone workspace`, `Delete workspace`, `Promotion target` (`Promotes to`, `Review and promote`), `Zone`. Name, target and zone save from the bar; the rest act at once.
- **Clone:** Name, Slug, Rows and files, Safety (default On). Data also needs `data_all:read` + `file:read`; Safety off `secret:write` + `connection:write`.
- **Delete:** type the slug. Refused while runs are going. Production needs `workspace_production:write`, which no wildcard grants.
- API only: `concurrencyLimit` (1–1000); `failureAlert` belongs to Alerts.

### All resources (`S/Tenant.tsx:708`; page title "Resources")
- Columns: Path, Kind, Key (only if it differs), Defined in (Console / Repository / Repository, <file>), Version, Changed. `New` menu, dev only: Connection, Connection group, Variable, Event, Schedule, Trigger. Row action `Rename`.
- `Old paths` (hidden when none): Old path, Now at, Kind, Last called, Answers until, `End now` (`S/OldPaths.tsx`).

### Resource editor (`S/ResourceEditor.tsx`)
- States: new, draft, deployed, repository, unsaved. `Save draft`, `Name and path`, Remove/Discard, Deploy.
- Autosaves 3 s after a change once saved once; a new one keeps a browser copy (`Restore it`/`Discard`). `Move to a file` takes over a repository resource. Fields per kind: :510-675.
- Production notice: "Edit it in <dev>" (`K/objects.tsx:116`).

### Names and paths (`S/ResourceIdentity.tsx`, `N/rename.ts`, `N/resolve.ts`)
- Dialog `Name and path of …`: Key, Path (≤255), Title (≤200; apps and interfaces are titled in their editor), `Save as a draft`, toast `Review and deploy`. Renaming a query lists the dashboards it drafts.
- 90 days; response headers `Deprecation`, `Sunset`, `Volvel-Resource-Moved`, `Warning`. Last called is hourly.
- Carried along: bindings, values, group members, trigger pauses, domains, recents, drafts (`N/rename.ts:30`).
- **Delete for good** is for retired tables and columns only (`S/Data.tsx:1387`, `POST table-purges`, type the name, `table:write`). Deleting a resource is a draft then a deploy.

### Used by (`K/references.tsx`, `N/references.ts`)
Tabs on connection, variable, secret, event ("Who listens and who sends"), script, flow. Worked out on each request; drafts marked "in a draft".

### Access releases (`S/AccessReleases.tsx`, `R/access-releases.ts`)
- Columns #, What, Status, By, When. Statuses Applied, Waits for approval, Declined, Withdrawn, Superseded. Origins: From the repository, Through the API, In the console, Going back.
- `Approve`, `Decline`, `Withdraw`, `Go back to this`, `Ask for/Stop asking for a second person`. `access:read/write`. Lists 200.
- Errors: `delete_not_allowed`, `release_stale`, `own_release`, `approval_needs_two`, `principal_in_use`. CLI: `volvel tenant plan|release|pull|releases|approve|decline|withdraw|rollback`.

### Bundles
Formats 1–4 (`docs/contracts/bundle.md`); oldest core still run is `0.2.0` (`deploy.ts:151`). Draft-test bundles last 7 days.

## C. Gotchas
1. Dev deploys warn on missing bindings; production and any promotion refuse, even dev→dev (`deploy.ts:575`).
2. Version numbers are per workspace; the digest is what is shared. Production's v4 may be dev's v9.
3. A request pins its bundle; asking again supersedes anyone's pending request from that source to that target.
4. Deploying drafts sets `allowDelete: "all"`, so it never raises `rename_suspected`; pulls, activations and promotions do.
5. Console-made resources no bundle carried survive every deploy.
6. Rollback keeps current console resources when the old bundle carries none; it composes a new bundle (`N/authoring.ts:588`).
7. A pre-key bundle renames resources back.
8. Drift matches by path: a rename shows as two rows.
9. After `Push with drafts`, a plain Push removes the drafted files again (`git.test.ts:521-548`).
10. Git moves console-owned resources only, never code.
11. First push to a new branch leaves files outside the folder for a pull (state `behind`).
12. `Keep workspace` writes nothing to git until the next push.
13. Release branch is **on by default**: `release/<slug>`, a mirror.
14. Any access change makes every waiting release stale.
15. Approval counts only members bound directly at tenant scope, not via groups (`R/access-releases.ts:187`).
16. Who is in a group is never released.
17. Clone copies variables always. It does not copy drafts, time zone, alerts, or connection group members even with Safety off. One data clone copies at a time; a queued one gives up after an hour.
18. Pausing: webhooks answer 503; a due schedule fires once on resume.
19. References miss queries, dashboard→query, data sources, docs.

## D. Docs wrong or missing
- `C/operate/git-sync.md`: describes a panel "beside other screens"; only Git sync has it.
- `C/configure/settings.md` and index: "its limits" has no UI.
- `C/start/concepts.md`: omits that production can also be rolled back by activating a version.
- `docs/master-spec.md`: failed release push is "shown with a way to retry": none in the UI.
- `C/operate/releases.md`: lacks drafts, history, requests, drift.

## E. Likely bugs / questions
1. "Try again from Git sync" (`S/Release.tsx:790`) has no button; `git/release` is API only.
2. Release links for query, dashboard, doc, theme, role, binding and data source drafts reach "There is no editor here" (`K/objects.tsx:41`).
3. `Withdraw the request` shows on someone else's request, then 404s (`mine` unused, `S/Promotion.tsx:77`).
4. Production Git sync offers `Follow this branch`, which the API refuses.
5. No UI to change or unfollow a branch; the `no_branch` error wrongly sends people to Workspace settings (`N/git.ts:482`).
6. Pull has no allow-delete UI, and neither does `Activate this version`.
7. Settings `Review and promote` ignores `canPromote` and has no delete override: a second, weaker promotion path.
8. `Go back` with approval on toasts as applied although it waits (`S/AccessReleases.tsx:204`).
9. Workspaces "Promotes to" is blank for dev→dev, and Create offers only production.
10. `?step=review` in production loads forever; `?step=promote` unlinked is blank.
11. `PUT`/`DELETE …/resources/*` has no dev check in the route: can it change production with `resource:write`?
12. `tenant.console_code` is read but no route or screen sets it.
13. No workspace lock found: production is read-only in editors only. Is a lock planned?
14. Access-release status `superseded` is never set in `N/tenant/releases.ts`.
15. Clone's console-resource copy passes no `key`; check renamed resources.
16. `about` for a renamed draft compares by the new path, so reads as new (`R/authoring.ts:340`).

Built-in roles were not fully traced. `0035_promotion.sql` gave `promotion:write` to every built-in role that held `deployment:write`; `release.test.ts:128` says developer does not hold it.

## F. Screenshots and examples
- **Screenshots:** Review step with mixed tags; unbound warning; Promote with breaking notice; request sheet; Drift diff; Git conflict; Repository form; Clone sheet; rename dialog with dashboards; Old paths; a waiting access release.
- **Examples:** dev→QA→production; `volvel.yaml`; a file after rename (`key: moves/one` first line, `git.test.ts:611`); `tenant/groups/tech-desk.group.yaml`; `PUT git-repository` setting `releaseBranch`/`tenantBranch`; CI deploy with `--allow-delete`; headers from an old path. Reusable flows: `e2e/release.spec.ts`, `e2e/rename.spec.ts`.
