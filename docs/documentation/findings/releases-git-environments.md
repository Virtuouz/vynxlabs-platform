# Findings: releases, git, environments

Slice of [the inventory](../inventory/releases-git-environments.md), settled at `270e509`. Paths are under `apps/`: `CP/` = `control-plane/src/`, `CO/` = `console/src/`. Scratch tests ran in the pinned tree and were removed.

## Rows

### REL-01 A developer with only `resource:write` can create, change and delete resources in a production workspace
- **Outcome:** reproduced
- **Severity:** security
- **Where:** `CP/routes/workspaces.ts:593, 725`; `CP/kernel/resources.ts:51` (no workspace-type check). Drafts have one: `CP/kernel/authoring.ts:76`.
- **Evidence:** scratch test with the built-in developer role (which may not promote): `PUT …/<production>/resources/<path>` answered 201, again 200, `DELETE` 204. A code-managed resource that a promotion had put there was deleted by `DELETE` (204, then 404). The draft route refused the same member in production.
- **Fix:** refuse `PUT` and `DELETE …/resources/*` for a production workspace in one shared guard that the draft check also uses (`kernel/authoring.ts:69`), unless the caller holds `promotion:write` and the call is a deploy path. Siblings to check: any other route that writes the `resource` table directly (aliases delete is fine). Test first: developer `PUT` into production must be 409/403. Decision 0002 and master-spec :460 say production changes only by deploy or promotion.
- **Size:** S. **Milestone:** M1

### REL-02 Anyone with `deployment:read` is shown another person's promotion request, with their note
- **Outcome:** reproduced
- **Severity:** security
- **Where:** `CP/routes/execution.ts:841-855` (`request`); the list route filters correctly (`CP/routes/promotion-requests.ts:290-302`).
- **Evidence:** a developer asked with a private note; a second developer who may not decide saw it in `promotion-preview` (`canPromote` false), while `promotion-requests` showed them an empty list.
- **Fix:** give the preview the list's rule (mine, or may decide) in the shared `describeRequests` caller. Test first: the second developer's preview has `request: null`.
- **Size:** S. **Milestone:** M1

### REL-03 `Withdraw the request` shows on someone else's request, then answers 404
- **Outcome:** reproduced (API 404 for a non-requester) and confirmed by code (button)
- **Severity:** broken
- **Where:** `CO/screens/Promotion.tsx:67-80` (`mine` is in the response, unused); route `CP/routes/promotion-requests.ts:480`.
- **Evidence:** with REL-02 fixed this shows only to the requester, so fix both together. Today the button is offered when `status === "pending"` regardless of `mine`.
- **Fix:** `waiting && request.mine`; for someone else's pending request say who asked and let them ask again (which supersedes). Siblings: `RequestState` text.
- **Size:** S. **Milestone:** M8

### REL-04 A plain push after "Push with drafts" silently removes the drafted files from the branch while the drafts are still saved
- **Outcome:** reproduced
- **Severity:** data
- **Where:** `CP/kernel/git.ts` push; `CO/screens/GitSync.tsx:192-245`. `git.test.ts:521-548` asserts it for a discarded draft only.
- **Evidence:** copy of `git.test.ts` pushed with drafts, kept the draft, pushed plain: status `done`, file gone from the branch, `drafts` still listed it. Git history keeps it, but a developer who was to pick it up finds it gone.
- **Fix:** a plain push should list "will remove N drafted files" as `Removed here` before sending and need a choice, or leave files from an earlier drafts push alone while their drafts exist. Test first: the scenario above keeps the file.
- **Size:** M. **Milestone:** M2

### REL-05 Clone loses the key and title of a renamed console resource
- **Outcome:** reproduced
- **Severity:** data
- **Where:** `CP/kernel/tenancy/clone.ts:329-345` (selects no `key`, `title` or `meta`).
- **Evidence:** renamed `old/name` to `new/name` with a title; the clone's row has key `new/name`, title null (source: key `old/name`, title set). Dev-to-clone promotion or deploy then matches by key, so can raise `rename_suspected` or cut the clone off from what the old key holds (POLISH-013 class: same fault where `adoptBundle` carries meta, check it).
- **Fix:** select and pass `key`, `title`, `meta` in the clone. Test first: clone row equals source for all three.
- **Size:** S. **Milestone:** M2

### REL-06 "Try again from Git sync" points at nothing
- **Outcome:** confirmed by code
- **Severity:** broken
- **Where:** `CO/screens/Release.tsx:790`; API `POST …/git/release` (`CP/routes/git.ts:363`) has no caller in `CO/`. Master-spec :468 promises a way to retry.
- **Fix:** a `Commit to the release branch again` button on Git sync for a production workspace (shows last release state), and link the notice to it. Missing part, see below.
- **Size:** S. **Milestone:** M8

### REL-07 Release links for query, dashboard, doc, theme, role, binding and data source drafts reach "There is no editor here"
- **Outcome:** confirmed by code
- **Severity:** broken
- **Where:** `CO/kit/objects.tsx:41` (default branch) used by `CO/screens/Release.tsx:299`; `CO/screens/Tenant.tsx:705`.
- **Fix:** give each kind its real address in `objectHref` (the shared piece, so Used by, Audit and Operate also get it); the default should be the resources list, not a dead end. Test first: `objectHref` for every draftable kind never gives `resources/edit/<kind>` unless `isEditedKind`.
- **Size:** M. **Milestone:** M8

### REL-08 Production Git sync offers `Follow this branch`, which the API refuses
- **Outcome:** confirmed by code
- **Severity:** broken
- **Where:** `CO/screens/Git.tsx:194-231`, `CO/nav.ts:126`; refusal `CP/kernel/git.ts:667`.
- **Fix:** in production show what the release branch is and its last result instead of the form (shares REL-06's control).
- **Size:** S. **Milestone:** M8

### REL-09 No way to change or stop following a branch, and `no_branch` sends people to Workspace settings, which has nothing
- **Outcome:** confirmed by code
- **Severity:** wrong
- **Where:** `CP/kernel/git.ts:481-482`; `PUT …/git` re-points (`:664-690`) but the form is shown only while no branch is set; no route unfollows.
- **Fix:** correct the message now (to Git sync); show the branch with `Change` on Git sync. Unfollow needs an API first: owner's question 1.
- **Size:** S. **Milestone:** M8

### REL-10 Pull and `Activate this version` cannot allow deletes, so a `rename_suspected` refusal has no way forward in the console
- **Outcome:** confirmed by code
- **Severity:** broken
- **Where:** API takes `allowDelete`: `CP/routes/git.ts:509`, `CP/routes/execution.ts:652`; console sends it only for promotion (`CO/screens/PromotionConfirm.tsx`). Refusal text says "deploy again allowing each path by name" (`CP/kernel/execution/deploy.ts:357`).
- **Fix:** reuse `PromotionConfirm`'s "Delete them and look again" for pull and activation (missing part). Test first: activation refused, then allowed.
- **Size:** M. **Milestone:** M8

### REL-11 Settings `Review and promote` is a second, weaker path
- **Outcome:** confirmed by code
- **Severity:** wrong
- **Where:** `CO/screens/Environments.tsx:571-626, 660-690`.
- **Evidence:** shows to those who may not promote, who get a refusal after the dialog; no `allowDelete`; no request path; the server still enforces `promotion:write`, so no security hole.
- **Fix:** open the Releases `Promote` step instead (`?step=promote`) and delete the dialog.
- **Size:** S. **Milestone:** M8

### REL-12 `Go back` on access releases says it applied when it waits for approval
- **Outcome:** confirmed by code
- **Severity:** wrong
- **Where:** `CO/screens/AccessReleases.tsx:204`; the API answers 201 applied or 202 with `status` (`CP/routes/access-releases.ts:468-485`).
- **Fix:** read `status`; say "waits for a second person" when `awaiting_approval`. Sibling: other `releases` actions that toast.
- **Size:** S. **Milestone:** M8

### REL-13 Workspaces list shows "Promotes to" blank for dev to dev (every clone), and Create offers only production
- **Outcome:** confirmed by code
- **Severity:** wrong
- **Where:** `CO/screens/Tenant.tsx:293-320, 349-353`. A clone is linked to its source (`CP/routes/environments.ts:140`).
- **Fix:** look the target up in all workspaces; offer dev targets in Create as Settings does.
- **Size:** S. **Milestone:** M8

### REL-14 `?step=review` in production loads forever, `?step=promote` unlinked is blank
- **Outcome:** confirmed by code
- **Severity:** broken
- **Where:** `CO/screens/Release.tsx:133-141, 217-224` (drafts load only for dev; `ReviewStep` shows `Loading` when `drafts` is undefined, :276; promote renders `null`).
- **Fix:** clamp the step to those in `steps`; fall back to the first. Siblings: other `useUrlParam` steppers.
- **Size:** S. **Milestone:** M8

### REL-15 A draft for a renamed resource is described as new
- **Outcome:** confirmed by code
- **Severity:** wrong
- **Where:** `CP/routes/authoring.ts:326-346` looks up the deployed body by the new path.
- **Fix:** look up by key, as the `Renamed` tag does.
- **Size:** S. **Milestone:** M8

### REL-16 Access release status `superseded` is declared and styled but never set
- **Outcome:** confirmed by code
- **Severity:** rough
- **Where:** `CP/routes/access-releases.ts:43`; `CO/screens/AccessReleases.tsx:39`; `CP/kernel/tenant/releases.ts` (stale gives `release_stale`, the row stays waiting).
- **Fix:** mark a waiting release superseded when it goes stale, or drop the status from the type, table and docs.
- **Size:** S. **Milestone:** M8

### REL-17 "Turn on approval" counts approvers only by direct tenant binding
- **Outcome:** confirmed by code
- **Severity:** wrong
- **Where:** `CP/routes/access-releases.ts:187-201`. Two people holding access through a group give `approval_needs_two`.
- **Fix:** count with the permission check the approve route uses. Test first: two members of a group with `access:write`.
- **Size:** S. **Milestone:** M8

### REL-18 `tenant.console_code` is read but nothing sets it
- **Outcome:** owner decides
- **Severity:** rough
- **Where:** `CP/routes/authoring.ts:209-215`; column default true (`0020_authoring.sql:35`).
- **Fix:** see questions.
- **Size:** S. **Milestone:** M8

## Other items settled

- **E13 workspace lock:** owner decides (question 2). Nothing in `docs/phases/` plans one. Without REL-01 fixed, production is not even read-only in the API.
- **E8, E14, E16:** see REL-12, REL-16, REL-15.
- **C1 (dev to dev refuses unbound):** not a bug, matches master-spec :466 and tests.
- **C4 (drafts deploy with `allowDelete: "all"`):** not a bug; the drafts are the chosen deletes.
- **C9:** REL-04. **C10-C12:** not bugs, by design (Decision 0002 section 2).
- **C13 (release branch on by default):** not a bug; the default is in `0037_git_release.sql:11`.
- **C15:** REL-17. **C17 (clone gaps):** REL-05 adds key/title/meta; not copying drafts, alerts and zone is stated behaviour.
- **C19 (References miss queries, dashboard to query, sources, docs):** missing part, M (`CP/kernel/references.ts`).
- **D1:** true, `GitPanel` is used only on Git sync (`CO/screens/GitSync.tsx:340`). **D2-D5:** docs work; D4 follows REL-06.
- **A rename shows as two drift rows (C8), version numbers per workspace (C2), pre-key bundles (C7):** not bugs; documented behaviour, to be said in the pages.
- **Built-in roles and `promotion:write`:** in the scratch run the developer role could request but its preview said `canPromote: false`, so it does not hold it (migration 0035 not traced further).

## Missing parts

1. **Allow-delete on pull and activate** (REL-10): `routes/git.ts:509`, `routes/execution.ts:652`; Git sync and Releases versions list; `deployment:write`; M.
2. **Commit to the release branch again** (REL-06): `routes/git.ts:363`; Git sync in production; `promotion:write`; S.
3. **Repository fields**: `username`, `releaseBranch`, `tenantBranch`, the `check` route (`routes/git.ts:120-187, 465`); Repository form; `git:write`; M. Sibling: `credentialKind`, `verifiedAt` shown.
4. **Git operations history and branches overview** (`routes/git.ts:395, 546`): Git sync and tenant Repository; `git:read`; M.
5. **Workspace `concurrencyLimit`** (1 to 1000): Settings; `workspace:write`; S.
6. **Change branch** (REL-09): form after follow; `git:write`; S.
7. **Used by for queries, dashboards, sources, docs**: M.

Seven parts: S x3 (2, 5, 6), M x4 (1, 3, 4, 7).

## Owner decides

1. **Unfollowing a branch.** Should a dev workspace be able to stop following one? Options: add `DELETE …/git` and a button; or only re-point. Recommend: add it, since a mistaken branch cannot otherwise be undone.
2. **A workspace lock.** Should production (or any workspace) be lockable against deploys and promotions? Options: none; a per-workspace lock needing a permission. Recommend: none until REL-01 is fixed and asked for.
3. **`console_code`.** Control it from tenant settings, or remove the column? Recommend: remove, as nothing needs it.
