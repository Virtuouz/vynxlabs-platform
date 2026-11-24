---
title: Run a script or flow on the instance without deploying
description: Run the script or flow of your working copy in a dev workspace, follow it to its end, and read its logs and earlier runs.
subjects: [cli, scripts, runs]
---

## Run a script or flow on the instance without deploying

By the end your working copy has run on a worker in a dev workspace, with that workspace's tables, connections, secrets and variables, and nothing in the workspace was deployed.

## Before you start

- You are signed in (`volvel whoami` names you) and the repository builds.
- The workspace is a dev workspace. A production workspace is refused: `cli-live is a production workspace. A local build is tried in a dev workspace.`
- You hold, in that workspace, `bundle:write`, `run:write` and `code:write`; for a flow also `flow_run:write`. A workspace admin holds all of them. See the [permissions reference](../../../administer/reference/permissions).
- The tenant has **Code in the console** on. Without it the instance answers 403 `console_code_off`: "Writing code in the console is turned off for this tenant. Code is deployed from its repository. Someone who may change the tenant can turn it on under Repository." The switch is on the tenant's **Repository** page, under **Code in the console**. It covers a test run of a build you upload as well as code written in the console.
- Fernhill is set up: see [Set up the Fernhill example](../../../start/how-to/example/set-up-the-fernhill-example).

## Run it

:::steps
1. Run the script by its path, naming the tenant and the dev workspace:

   ```bash
   volvel run hello --remote --tenant fernhill --workspace cli-dev --input '{"name":"Ada"}'
   ```

   `--input` takes JSON or `@file`, as in a local run. Add `--script` or `--flow` when the path is both a script and a flow in this build; without it the command says `"x" is both a script and a flow here. Say which with --script or --flow.`
2. Read what it prints:

   ```text
   Test run 01a20a4a-b3f2-7424-86af-2d0d7f13a731 of hello in cli-dev, from this build (preview, version 1). Nothing was deployed.
   2026-11-23 21:23:18 info  Saying hello {"name":"Ada"}
   Succeeded in 210 ms.
   Output: {
     "greeting": "Hello, Ada"
   }
   ```

   The command built the repository, uploaded it as a bundle made only to try, started the run and followed it. For a flow it also follows each step as it goes.
3. Look at the workspace's recent runs:

   ```bash
   volvel runs --tenant fernhill --workspace cli-dev
   ```

   It lists up to 20 runs, with flow runs among them, newest first: the start time, the status, what started it, the script (a flow shows as `name (flow)`) and the run's ID. `--script <path>` lists the runs of one script, and leaves the flow runs out.
4. Read one run:

   ```bash
   volvel runs 01a20a4a-b3f2-7424-86af-2d0d7f13a731 --tenant fernhill --workspace cli-dev
   ```

   ```text
   hello: succeeded, attempt 1 of 1, bundle version 1
   Started by manual at 2026-11-23 21:23:17
   Input:  {"name":"Ada"}
   Output: {"greeting":"Hello, Ada"}
     2026-11-23 21:23:18 info  Saying hello {"name":"Ada"}
   ```

   A run still going ends with the line that follows it.
5. Follow a run, or read its log again:

   ```bash
   volvel logs 01a20a4a-b3f2-7424-86af-2d0d7f13a731 --tenant fernhill --workspace cli-dev -f
   ```

   Without `-f`, `logs` prints what the run has logged and stops, with exit code 0 even when the run has not ended. With `-f` it follows to the end. Press :kbd[Ctrl+C] to stop following: the run goes on, and the command says `Stopped following. The run goes on: volvel logs <id> -f to follow it again.`
:::

## Cancel a backlog

`volvel runs cancel --tenant fernhill --workspace cli-dev` cancels the workspace's queued runs. `--all` cancels those going too, and the workspace's flow runs. `--older-than <seconds>` limits it to runs older than that, a whole number of at least 1. `--queued` and `--all` together are refused. It prints `Canceled N queued runs.`; with `--all` it prints `Canceled N runs.` and then `Canceled N flow runs.`

## The result

The run is in the workspace's runs like any other, started by `manual`. Its bundle is not offered for deploying, and the instance removes it after 7 days, unless it was deployed or uploaded for deploying in the meantime.

The command's exit code is the run's: 0 when it succeeded, 1 when it failed, 3 when it was canceled.

## If it does not work

- **403 `console_code_off`.** See **Before you start**: the tenant's **Code in the console** is off.
- **`There is no script or flow "x" in this build. It has: hello (script).`** The path is not in the repository you are in, or the entry file does not export it. Only what `src/index.ts`, or the file `entry` names, exports counts.
- **`The API key was not accepted.`** The key was revoked or has expired. Make a new one and run `volvel login` again.
- **A refusal that names a permission.** Ask a workspace admin for the one named.

See [Run a script on your machine](run-a-script-locally) to try a script with no instance, and [the command reference](../../reference/cli) for `run`, `runs` and `logs`.
