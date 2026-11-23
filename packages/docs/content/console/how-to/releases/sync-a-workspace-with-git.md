---
title: Sync a workspace with Git
description: "Make a dev workspace follow a branch, push what is deployed, pull what changed, settle files changed on both sides, change or stop following, and recommit a production workspace's release branch."
subjects: [git-sync]
---

## Sync a workspace with Git

By the end a dev workspace and a branch of the tenant's repository hold the same resource files, and you know which way each change went.

## Before you start

- The tenant's repository is connected. See [Connect the tenant's repository](../../../administer/how-to/releases/connect-the-repository).
- To follow, change or stop following a branch, and to push: `git:write`. To pull: `deployment:write` and `code:write`. To recommit a release branch: `promotion:write`. See the [permissions reference](../../../administer/reference/permissions).
- The workspace is a dev workspace. A production workspace follows no branch.

## Follow a branch

:::steps
1. Open **Operate**, then **Git sync**. A workspace with no branch says "This workspace follows no branch yet".
2. In **Branch**, type a branch name, for example `console/dev`. It cannot be the repository's default branch.
3. Press **Follow this branch**. The console says "This workspace now syncs with *branch*."
:::

The first push creates the branch from the default branch.

## Push what is deployed

:::steps
1. On **Git sync**, read the cards. **This workspace** says how many files changed here. The branch's card says how many changed there.
2. Edit **Commit message** if you want. It starts as "Deploy from the console".
3. Press **Push N changes**.
:::

The console says "Committed what is deployed here to the branch." A push commits only what is deployed. To send drafts too, press **Push with drafts**; a plain push afterwards leaves those files on the branch while their drafts are saved.

## Pull what changed

:::steps
1. If the branch changed, the card says "N changed there". **Files that differ** lists each file with a tag such as **Changed there** or **New there**.
2. Press **Pull N changes**.
:::

The console says "Deployed what changed on the branch." A pull deploys, so it can be refused as a deploy is.

## Settle a file changed on both sides

When a resource changed on both sides, **Changed on both sides: choose for each** shows both versions. Push and **Push with drafts** are disabled.

:::steps
1. For each resource, press **Keep workspace** or **Take branch**. The chosen side is tagged **Kept**. **Undo** takes the choice back.
2. Press **Pull N changes**. It is enabled once every resource has a choice.
:::

**Keep workspace** writes nothing to Git until the next push.

## Change or stop following

- **Change branch** asks "Follow another branch?" and compares against the branch you name as if the workspace had never synced. Nothing on either branch changes.
- **Stop following** asks, and the workspace follows no branch. The branch and its files stay, and the workspace can follow it again.

## A production workspace

A production workspace has no branch to follow. Its **Git sync** shows the release branch, `<release branch>/<workspace slug>`, with the last result. After a failed commit, press **Commit to the release branch again**.

## The result

**History** lists the push or pull with its outcome (`done`, `nothing`, `refused`, `failed`), its commit and its message. **Branches** lists every workspace's branch and state.

## If it does not work

- **"Nothing was written: the branch changed. Pull first."** A file changed on the branch since the last sync. Pull, then push.
- **"Another push or pull of this workspace is in progress. Try again in a moment."** A push or pull holds the workspace for up to 120 seconds.
- **"Sync is paused for this tenant."** Save the repository's settings to turn it on.
- **A button "Delete them anyway" after a pull.** The pull would delete something that holds runs, rows or access, and create something of the same kind. If it was renamed, give the new file the old one's key as its first line, `key: <the old key>`. If not, press the button and confirm.
- **"The branch holds more than a pull takes in."** A pull takes at most 2000 files or 8 MB. Leave out what is not the workspace's with `ignore:` in `volvel.yaml`.
- **"A workspace cannot follow the default branch."** Choose another branch.
