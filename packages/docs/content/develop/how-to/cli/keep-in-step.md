---
title: Keep the console and the repository in step
description: Read a deploy that the console's changes refuse, bring them into the repository with volvel pull, overwrite them on purpose with --force, and know how Git sync and a rollback in the console meet the same check.
subjects: [cli, repository, deploy, ownership]
---

## Keep the console and the repository in step

By the end a deploy of the repository does not overwrite a change someone made in the console, and you know the three ways out when it would.

## Before you start

- A dev workspace that follows a repository: you deployed it with `volvel deploy` at least once, and it holds resources owned as **Files**. A resource of **Code** is changed only by a deploy, so the console cannot have changed it. See [Definitions in code](../../explanation/cli/definitions-in-code).
- `deployment:write` and `bundle:write` to deploy, and `resource:read` on the whole workspace to pull. A workspace admin holds them. See the [permissions reference](../../../administer/reference/permissions).
- A repository you can commit to. The commands run in its folder.

## What is compared

Each resource owned as **Files** remembers the version the repository last had: the one the last repository deploy wrote, or the one a `volvel pull` or a Git push or pull took. That is its **basis**. A deploy of the repository is refused when a file it would replace, or a resource it would remove, is not what that basis says.

- **Changed:** the console edited a resource that the repository's files also change. The deploy would replace what the console wrote.
- **Made:** a resource was made in the console, so the repository has never had it, and the deploy would remove it.

A workspace with no basis at all (one made only in the console, or the first deploy of a repository) is never refused.

## Read the refusal

:::steps
1. Change a file in the repository and deploy:

   ```bash
   volvel deploy --tenant fernhill --workspace cli-dev
   ```

   When someone changed the variable `greeting` in the console since, the deploy builds, uploads and stops:

   ```text
   Could not deploy to cli-dev. The console changed or made resources that this deploy would overwrite or remove. Run `volvel pull`, review, commit, and deploy again.
     - greeting: changed in the console since the repository last had it, and this deploy would replace it
   To overwrite them on purpose, deploy again with --force. That is written to the audit log.
   ```

   The exit code is 1. Each line under the first names one path. `volvel deploy --preview` says the same, and ends `It cannot be deployed.`
2. Commit what you have, so nothing of yours is lost when the next step overwrites a file.
3. Bring the console's version in:

   ```bash
   volvel pull --tenant fernhill --workspace cli-dev
   ```

   ```text
     updated  platform/greeting.variable.yaml
   Pulled 7 files from cli-dev (version 6 and 0 drafts): 0 new, 1 updated, 0 removed, 6 unchanged.
   platform/ holds the workspace's whole set of console resources: a deploy of this repository replaces the set with it.
   ```

   A file you changed since the last pull is kept, not overwritten. The pull exits 1 and lists it, and the deploy is still refused for it. Run `volvel pull --force` to take the console's version of that file, use `git diff` to see what changed, and put your own change on top.
4. Review the files, commit them, and deploy again. The pull told the workspace what it took, so the deploy that follows is the repository's and passes.
:::

## Overwrite on purpose

The console's change is not wanted. Deploy with `--force`:

```bash
volvel deploy --tenant fernhill --workspace cli-dev --force
```

```text
Deployed version 4 to cli-dev (dev): 0 created, 1 updated, 0 deleted, 7 unchanged.
  updated  variable   greeting
```

The change the console made is lost. The deploy writes an audit entry, `deployment.forced`, with the path and the kind of each change it overrode (`changed` or `made`), and the bundle. It is in the tenant's audit log. `--force` needs no permission beyond the deploy's own, and `--preview --force` shows what a forced deploy would do.

## Git sync

A workspace that follows a branch (see [Sync a workspace with Git](../../../console/how-to/releases/sync-a-workspace-with-git)) is in step with the branch after a **Push** and after a **Pull**: each sets the basis. A pull leaves a resource out when its file in the workspace still differs from the branch, and the **Files that differ** list says so. **Push with drafts** does not set the basis.

## Roll back in the console

The console's **Deploy this version** and **Roll back to this version** are repository deploys too, and the same check applies. When the version it puts back would replace or remove what was changed or made in the console since, it asks first: "Roll back *workspace* anyway?" (or "Deploy *workspace* anyway?"), and lists the paths under "Changed here since the repository last had it, and replaced by version N" and "Made here since the repository last had it, and removed by version N". It ends "Those changes are lost. Doing it anyway is written to the audit log." The button is **Roll back anyway** (**Deploy anyway** for a deploy), and sends the same `force`.

A promotion to a production workspace is not refused by this check.

## The result

The workspace and the repository agree, or you chose which wins and the audit log says so.

## If it does not work

- **`1 file was not overwritten` and exit 1 on a pull.** A file of yours differs from the last one a pull wrote. The deploy is still refused for it. Commit, run `volvel pull --force`, and re-apply your change.
- **The deploy is refused after a take-over.** A table or another resource taken over from code has the basis it had when you took it over. A change after that is the console's, and `volvel pull` brings no file in for a table: copy the change into the definition, or deploy with `--force`. See [Definitions in code](../../explanation/cli/definitions-in-code).
- **`Warning: the instance did not take what this pull brought in, so the next deploy may be refused as console_changed. Run pull again.`** The pull wrote its files, and the instance did not record them. Run `volvel pull` again.

## Related

- [Bring console changes into the repository](pull-console-changes)
- [Preview and deploy a repository](deploy-a-repository)
- [Roll back to an earlier version](roll-back-a-version)
- [Code or files](../../explanation/cli/code-or-files)
