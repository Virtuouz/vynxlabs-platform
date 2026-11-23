---
title: Preview and deploy a repository
description: See what a deploy would change, deploy the repository to a dev workspace with a note, and read the refusals a deploy gives.
subjects: [cli, deploy]
---

## Preview and deploy a repository

By the end the repository's resources are in a dev workspace as a new version, and you know beforehand what the deploy changes.

## Before you start

- You are signed in and the repository builds: `volvel build` lists what it holds.
- You hold `bundle:write` and `deployment:write` in the workspace, and `bundle:read`, `deployment:read` and `resource:read` to read what is there. The built-in `deployer` role holds `*:read`, `bundle:*` and `deployment:*`, which is all of that. See the [permissions reference](../../../administer/reference/permissions).
- Deploying to a production workspace goes through the same command, with the stricter refusals under **If it does not work**. To move a version from dev to production, [promote it](promote-a-version).

## Deploy

:::steps
1. Preview the deploy. Nothing in the workspace changes:

   ```bash
   volvel deploy --tenant fernhill --workspace cli-dev --preview
   ```

   ```text
   Bundle 1440360d7a23, 753 KB of code, SDK 0.5.0
     variable   greeting
     script     hello
     schedule   hello-every-morning
   Deploying would leave cli-dev (dev) with: 1 created, 1 updated, 0 deleted, 1 unchanged.
     created  variable   greeting
     updated  script     hello
   Nothing was changed. Run it again without --preview to deploy.
   ```

   The first lines are what `volvel build` lists. The counts are of resources and tables. The list names resources whose definitions change. A script whose `run` changed, with nothing else in its definition, is counted `updated`. A change only in a helper shared by several scripts, outside the script's own statement, is not seen, and the script stays `unchanged`. A preview that the instance would refuse ends with `It cannot be deployed.` and the reasons, and the exit code is 1. `--preview` uploads the app files of the repository and stores the bundle as one made only to try, which the instance removes after 7 days; it changes no resource.
2. Deploy, with a note kept beside the version:

   ```bash
   volvel deploy --tenant fernhill --workspace cli-dev --message "Open with a variable"
   ```

   ```text
   Deployed version 2 to cli-dev (dev): 1 created, 1 updated, 0 deleted, 1 unchanged.
     created  variable   greeting
     updated  script     hello
   ```

   A note is up to 500 characters; a longer one is cut to 497 and `...`. If you give no `--message` and the environment variable `CI` is set (not `false` or `0`), the note is the subject of the last git commit in the repository.
3. For a machine reader, add `--json`. The one answer is a JSON document on standard output and nothing else is printed there; warnings stay on standard error:

   ```bash
   volvel deploy --tenant fernhill --workspace cli-dev --json
   ```

   ```json
   {"workspace":"cli-dev","type":"dev","version":3,"summary":{"created":0,"updated":0,"unchanged":3,"deleted":0,"renamed":0,"warnings":[],"data":[],"aliasesRemoved":[],"breaking":[],"changes":[]},"draftsSettled":[],"message":"Warm up the greeting"}
   ```
:::

## What a deploy does with what is already there

- **A deploy is one change.** The workspace ends entirely on the new version, or nothing changed.
- **Resources made in the console.** The first console resource file in the repository (a file under `platform/`) makes the version speak for all of the workspace's console resources, so ones the repository has no file for would be deleted. The command stops before it uploads anything and names up to 10:

  ```text
  This deploy would delete 1 resource made in the console, because this repository has no file for it:
    - cli-extra
  Run `volvel pull` to bring them into platform/, or deploy again with --allow-delete <path> for each one that should go.
  ```

  Run [`volvel pull`](pull-console-changes), or repeat the deploy with `--allow-delete cli-extra`, once for each path. The preview takes the same flag. A resource that was deleted in the console and then pulled is allowed without it. A deploy of a repository with no console file at all leaves the workspace's console resources as they are.
- **Drafts.** Drafts that the last `volvel pull` carried into the repository are deployed with it, and the console lets them go: `1 console draft it carried is cleared: cli-ideas.`
- **Triggers.** A dev workspace starts with its triggers paused, so a schedule you deploy there does not fire until you resume it.
- **Limits.** A bundle is at most 20 MB. A bundle carries at most 4,194,304 characters (4 MiB) of the repository's TypeScript source beside the built code; beyond that the sources are left out. A bundle lists at most 5,000 files.

## The result

`volvel runs` shows the new version on the next run, as `bundle version N`. In production the same version is reached only by [promoting it](promote-a-version), and an earlier one is put back with [a rollback](roll-back-a-version).

## If it does not work

- **`The workspace is missing something this bundle needs. Set up each one, then deploy again.`** Followed by lines like `the connection "shop" is not set up in this workspace` and `the secret "SHOP_NOTE" is not set in this workspace`. The command never asks for the missing values. A **dev** workspace takes the deploy and says the same things as `Note:` lines: a run that reaches the connection that is not set up fails. A **production** workspace refuses it, as does any promotion. Set each one up in the workspace's **Connections** and **Secrets**, then deploy again.
- **`Something set up in this workspace does not fit the connector this bundle gives it. Set it up again, then deploy again.`** A connection was set up for another connector or another shape of settings. Set it up again. Dev refuses this too.
- **`This deploy would delete something that holds history or data, and create something of the same kind.`** The deploy looks like a rename done by deleting one resource and creating another, which would cut the new one off from the old one's rows and history. Give the new definition the old one's `key`, or allow the deletion by name with `--allow-delete <path>`. See [Names and moves](../../explanation/cli/code-or-files).
- **`... cannot be deployed: that is the path of the ... with the key ...`.** Two resources want one path. Paths are one namespace across every kind.
- **`A resource cannot change kind: give this one a key of its own.`** A resource with the same key was another kind.
- **`This bundle needs a core from 0.5.0 up to, not including, 0.6.0.`** The instance runs another version than the SDK in the repository was built for. See [Versions](../../reference/command-line/versions).
- **`Some files of the bundle's apps have not been uploaded.`** An interrupted upload. Run the command again: files already sent are kept.
- **`The build failed:` and a list.** The repository did not build, so nothing was sent. Each problem is on its own line and names the resource or file.
- **`The API key was not accepted.`** Make a key and run `volvel login` again.
