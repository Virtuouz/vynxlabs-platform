---
title: Roll back to an earlier version
description: Put an earlier version of a workspace's code back with volvel rollback, and know what stays as it is.
subjects: [cli, deploy, versions]
---

## Roll back to an earlier version

By the end the workspace runs an earlier version of its code. A rollback is a deploy of that version: nothing is rebuilt, and runs that are going finish on the version they started with.

## Before you start

- You hold `deployment:write` and `bundle:read` in the workspace. The built-in `deployer` role holds both. See the [permissions reference](../../../administer/reference/permissions).
- You know the number of the version to go back to. The console lists the versions of a workspace as **Versions** in a production workspace; `volvel runs <run id>` prints `bundle version N` for a run. A wrong number is answered with the numbers there are.

## Roll back

:::steps
1. Say which version to go back to:

   ```bash
   volvel rollback 1 --tenant fernhill --workspace cli-dev
   ```

   ```text
   cli-dev (dev) runs version 1 again: 0 created, 0 updated, 0 deleted, 2 unchanged.
   ```

   The version is a whole number. The note kept with the deploy is `Went back to version 1`, unless you give `--message "..."`, or `CI` is set and the repository in the folder you run it from has a git commit: then the note is that commit's subject, as for a deploy.
2. For a machine reader, add `--json`:

   ```bash
   volvel rollback 1 --tenant fernhill --workspace cli-dev --json
   ```

   ```json
   {"workspace":"cli-dev","type":"dev","version":1,"restoredFrom":1,"summary":{"created":0,"updated":0,"unchanged":2,"deleted":0,"renamed":0,"warnings":[],"data":[],"aliasesRemoved":[],"breaking":[],"changes":[]},"message":"Went back to version 1"}
   ```
:::

## What stays as it is

- **Resources made in the console.** A rollback puts code back. Tables, flows and other resources made in the console keep their current state. To make the instance hold the console's resources as they are, it makes a new version that holds the earlier code with them. The command then names that new number: `runs what version 3 had, as version 5`. When no console resource differs, it says `runs version 3 again`.
- **Data.** Rows, runs and history are not touched.
- **What differs between the versions.** A resource the earlier version had and the current one dropped is created again, and one only the current version has is deleted. The command lists them as a deploy does: going back from a version that added a variable shows `deleted  variable   greeting`. A table the earlier version lacks is retired, and the command says `Table notes retired. Its rows are kept.` The command has no `--allow-delete`.
- **How far back.** The instance lists the newest 100 versions of a workspace. An older one cannot be named: the command says `has no version N among its newest 100` and lists the ten newest numbers, ending `and older ones`.

## The result

`volvel runs` shows `bundle version N` for the next runs, and the command's summary says what it changed. The rollback is itself in the workspace's list of deployments, with its note.

## If it does not work

- **`Version 1 is the one cli-dev runs now. Nothing was changed.`** The version is the active one. The exit code is 1.
- **`cli-dev has no version 9 among its newest 2. It has 2, 1.`** There is no such version, or it is older than the newest 100. The message lists up to the 10 newest numbers.
- **`Say which version to go back to: volvel rollback <version> --tenant <slug> --workspace <slug>.`** The version was left out or is not a whole number.
- **A bundle of a core this instance no longer runs.** The instance runs an upgraded core and the version was built for one it does not support: see [Versions](../../reference/command-line/versions).
- **A refusal about bindings, in a production workspace.** The earlier version needs a connection or secret that is not set up there now. Set it up, then roll back again. A dev workspace takes the rollback and warns.
