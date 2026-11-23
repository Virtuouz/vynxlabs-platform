---
title: Bring console changes into the repository
description: Pull the resources and drafts made in the console into the repository as files, keep your own edits, and deploy them back.
subjects: [cli, repository, deploy]
---

## Bring console changes into the repository

By the end the tables, flows and other resources someone made in the console are files in your repository, and a deploy of the repository will not delete them.

## Before you start

- You are signed in and the repository is a git repository you can commit to.
- You hold `resource:read` in the workspace, on the whole workspace. The instance refuses `volvel pull` to someone who holds it for only some kinds. A workspace admin holds it. See the [permissions reference](../../../administer/reference/permissions).
- Why it matters: the first resource file in a repository makes a deploy speak for all of a workspace's console resources, so the ones it has no file for are deleted. See [Preview and deploy a repository](deploy-a-repository).

## Pull

:::steps
1. Run the command, naming the tenant and the workspace:

   ```bash
   volvel pull --tenant fernhill --workspace cli-dev
   ```

   ```text
     new      platform/cli-ideas.table.yaml
   Pulled 1 file from cli-dev (version 3 and 1 draft): 1 new, 0 updated, 0 removed, 0 unchanged.
   platform/ holds the workspace's whole set of console resources: a deploy of this repository replaces the set with it.
   ```

   Each resource made in the console is written as `platform/<path>.<kind>.yaml`. A script, connector or trigger source also gets a `<path>.<kind>.ts` with its code. A page of documentation is written as `platform/docs/<path>.md`. The folder is `platform`, unless `resources` in `volvel.yaml` or `--resources <folder>` says another. The files hold the console's drafts laid over what is deployed. With `--deployed`, they hold what is deployed only, and the line says `version 3` without a count of drafts.
2. Read the file. Its keys are `schemaVersion` and `body`, and the name says the path and the kind:

   ```yaml title="platform/cli-ideas.table.yaml"
   schemaVersion: 1
   body:
     description: Ideas written in the console.
     columns:
       idea:
         type: text
         required: true
   ```
3. Edit it, and pull again later. A file you changed since the last pull is kept, not overwritten, and the command exits 1:

   ```text
   1 file was not overwritten:
     platform/cli-ideas.table.yaml: changed here since it was pulled
   Keep your change, or run pull again with --force to take the console's.
   ```

   Comments and the order of keys in a file you wrote are kept when a pull changes it. With `--force` the console's version replaces yours.
4. Commit the files. [Deploy the repository](deploy-a-repository) to put them back: the deploy clears the drafts the pull carried, and says `1 console draft it carried is cleared: cli-ideas.` A draft whose file the pull kept is left in the console.
:::

## What a pull removes

A resource that has gone from the console is removed from `platform/` only if a pull wrote its file and you have not changed it since. A file you wrote yourself is never removed, with or without `--force`; the command lists it: `not in the console: a deploy of this folder would add it`. A file removed in the console and changed here is kept too.

## Resources the repository keeps elsewhere

A repository may keep resource files outside `platform/` (the `roots` and `docs` folders of `volvel.yaml`: see [the repository layout](../../reference/command-line/repository-layout)). A pull writes a resource to the file the repository already keeps it in, and lists it as `/<path>`. Only a file a pull wrote is ever removed there.

## The result

`.platform/pulled.json` records what the last pull wrote, by checksum, for the workspace it pulled from, and which drafts it took. It stays out of git. If it is damaged, the command says `... is not valid JSON, so the files the last pull wrote are not known. Delete it and run pull again: files that differ will be kept, and pull --force takes the console's.` A pull reads `volvel.yaml` first and refuses the same errors a build does.

## If it does not work

- **Exit 1 and `N files were not overwritten`.** Not an error of the pull: some files were kept. Decide for each: keep your change, or run `volvel pull --force`.
- **`Could not read the workspace's console resources.`** Followed by the instance's reason: usually a missing `resource:read` on the whole workspace.
- **Nothing was written and `Pulled 0 files`.** The workspace has no resource made in the console and no draft. Resources defined in code are not pulled: the repository is where they live.
