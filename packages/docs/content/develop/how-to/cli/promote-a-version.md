---
title: Promote a version to production
description: Send the version a dev workspace runs to the workspace it promotes to, preview what changes first, and read the refusals and the exit code of the preview.
subjects: [cli, deploy]
---

## Promote a version to production

By the end the bundle that runs in a dev workspace is the active one in the workspace it is linked to. Nothing is built again: the same bundle, identified by its digest, is deployed there.

## Before you start

- The dev workspace is linked to the workspace it promotes to. The link is the **Promotes to** setting of the dev workspace, chosen when it was made. A workspace with no link answers `Could not promote cli-start-live. This workspace is not linked to another one. Link it to the workspace it promotes to first.`
- You hold `promotion:write` in the workspace you promote **to**, and `deployment:read` in the one you promote from. The built-in `deployer` role holds both. See the [permissions reference](../../../administer/reference/permissions).
- A version is active in the dev workspace: [deploy first](deploy-a-repository). `promote` acts on that active bundle, not on the files in your folder.

## Promote

:::steps
1. Preview the promotion. The instance carries it out and takes it back, so the preview is what a promotion does:

   ```bash
   volvel promote --tenant fernhill --workspace cli-start-dev --preview
   ```

   ```text
   Bundle 1440360d7a23, version 2 here, to cli-start-live (production).
   Promoting would leave cli-start-live (production) with: 3 created, 0 updated, 0 deleted, 0 unchanged.
     created  variable   greeting
     created  script     hello
     created  schedule   hello-every-morning
   Nothing was changed. Run it again without --preview to promote.
   ```

   The first line gives the first 12 characters of the bundle's digest and the version it has in the dev workspace.
2. Read any line that starts `Breaking:`. It names a change that something outside Volvel calls: a tool an agent calls that is renamed or removed, a webhook or form address that stops answering, or a path that a resource renamed away from and that now answers as another resource.
3. If there are breaking lines and the target is a production workspace, the preview ends differently:

   ```text
   Promoting would be refused: it changes a name that something outside calls. Nothing was changed. Run it again without --preview and with --confirm-breaking to promote.
   ```

   That line is on standard error and the exit code is 4. With `--confirm-breaking` the preview exits 0.
4. Promote:

   ```bash
   volvel promote --tenant fernhill --workspace cli-start-dev --message "Greeting to live"
   ```

   ```text
   Bundle 1440360d7a23, version 2 here, to cli-start-live (production).
   Promoted to cli-start-live (production) as version 1: 3 created, 0 updated, 0 deleted, 0 unchanged.
     created  variable   greeting
     created  script     hello
     created  schedule   hello-every-morning
   ```

   Add `--confirm-breaking` once you have read the breaking lines. Add `--allow-delete <path>`, once for each path, for resources the promotion would delete that look like a rename done by deleting and creating. The note is kept with the version in the target; `--message` and its default in CI are the same as for [a deploy](deploy-a-repository). `--dir` says where to find the git repository for that default.
5. When the production workspace follows a Git branch for its releases, the promotion is committed to the release branch afterwards. The command says `Committed to the release branch <branch>.` If that commit fails, the promotion stands, the command prints a warning on standard error and exits 0: `Warning: the promotion is done, but Git sync did not get the release (<branch>): <reason>. Commit it again from Git sync in the console.`
:::

## The result

The target workspace's active version is the new one, with the number the command printed. The `--json` form prints `{"target":{...},"version":2,"summary":{...},"release":{"status":"off","branch":null},"message":"..."}`, and with `--preview` prints `{"preview":true,"target":{...},"summary":{...}}`, plus `"refused":true` when it exits 4.

## If it does not work

- **`Promoting this to <workspace> changes a name that something outside calls:`** followed by each change, then `Nothing was changed. Run it again with --confirm-breaking to promote.` The promotion was started without the flag. Read each line first.
- **The instance refuses the promotion.** The usual cause is a connection or secret the bundle needs that the target workspace has not set up: every promotion refuses that, where a deploy to a dev workspace only warns (`bindings_missing`). Set each one up in the target workspace, then promote again. A binding that does not fit the connector the bundle gives it is refused too (`bindings_invalid`).
- **`This workspace is not linked to another one.`** See **Before you start**. The link is chosen when the dev workspace is made.
- **A refusal naming `promotion:write`.** You lack it in the workspace you promote to. Ask a workspace admin of that workspace.

The console's **Promote** step on the dev workspace's **Deploy** screen does the same promotion.
