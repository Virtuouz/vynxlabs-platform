---
title: Run a script on your machine
description: Run one script of a repository in your own process, with stand-in connections, secrets and variables kept in .platform/local.json.
subjects: [cli, scripts]
---

## Run a script on your machine

By the end a script has run in your terminal, with the connection, secret and variable it asks for taken from a file on your machine. Nothing was sent to an instance.

## Before you start

- The repository's dependencies are installed, so that `@volvel/sdk` resolves. `volvel run` loads the SDK from the repository.
- You do not need to be signed in. A local run, like `volvel build`, makes no request.

## Run it

:::steps
1. Run the script by its path, from the repository:

   ```bash
   volvel run orders/count
   ```

   The path is the one in `defineScript({ path: ... })`. With a path the repository does not have, the command lists the paths it has: `There is no script "nothing". This repository has: hello`. A script of the platform's own, under `core/`, is not listed.
2. Give it input. `--input` takes JSON on the command line, or `@` and the name of a file of JSON:

   ```bash
   volvel run hello --input '{"name":"Ada"}'
   volvel run hello --input @input.json
   ```

   The input is checked against the script's `input` schema, and the output against its `output` schema.
3. If the script uses a connection, secret or variable, it stops and names what is missing:

   ```text
   The script failed: The connection "shop" has no local value. Add it to /home/you/code/shop/.platform/local.json.
   ```

   Make `.platform/local.json` and give the values. The file is JSON with up to four sections, all optional:

   ```json
   {
     "connections": {
       "shop": { "config": { "baseUrl": "http://localhost:8765" }, "credential": "a-test-key" }
     },
     "groups": {
       "shops": { "north": { "config": { "baseUrl": "http://localhost:8766" }, "label": "North" } }
     },
     "secrets": { "SHOP_NOTE": "demo" },
     "variables": { "greeting": "Good morning" }
   }
   ```

   - `connections`: by the connection's path. `config` is what the connection's connector takes; `credential` is its secret. The `http` and `oauth2` connectors of the SDK are used as they are, and a connector the repository declares is used from its own code.
   - `groups`: for a script that calls `ctx.connections(group)`: the group's path, then each member's key, with `config`, `credential` and `label`. A member the file does not list is refused with `The group "shops" has no member "south" locally. Add it under groups in ...`.
   - `secrets`: by name.
   - `variables`: by path. A variable the file does not list takes the `default` its definition has; one with neither is reported missing.
4. Run it again. The script's log lines print first, as `info  Counted {"open":3,"note":"demo"}`, then the output, as `Output: {"open":3}`.
:::

Keep `.platform/` out of git: `volvel init` writes a `.gitignore` that lists it, and a key or password in `local.json` stays on your machine.

## The result

The script ran in your process with the values you gave, and printed its output. The exit code is 0, or 1 if the script threw (`The script failed: ...`).

## What a local run does not do

A local run has no workspace behind it, so:

- **Tables, data sources and files** are not there. A script that calls `ctx.table(...)`, `ctx.source(...)` or `ctx.files` stops with a message that ends "Deploy to a dev workspace to try this script." Run it in a dev workspace: [Run a script on the instance](run-a-script-on-the-instance).
- **Mail connections** (`smtp`) are not there. The message is "Mail connections live in a workspace, so they are not available to a local run. Deploy to a dev workspace to try this script."
- **Events and tags** are printed, not delivered: `event orders/received {...} (not delivered: this is a local run)`.
- **`console.log`** is not collected. Use `ctx.log`, which prints.
- **Triggers do not fire.** A schedule, webhook or form does not start the script; you start it.

To test a script without any of these, with fakes for tables and connections, see [Test a script](test-a-script).

## If it does not work

- **`.platform/local.json is not valid JSON.`** The file has a syntax error. The message names the file.
- **`The script did not declare the secret "X". Add it to the script's definition.`** The script asked for something its `defineScript` does not list under `connections`, `secrets` or `variables`. The platform holds a deployed script to the same list.
- **`The build failed: ... must match pattern ...`.** A secret's name is letters, digits and `_`, and does not start with a digit.
- **`Say which script to run: volvel run <script path>`.** The command was given no path.
