---
title: Deploy your first script from a repository
description: Start a repository with volvel init, run its script on your machine, deploy it to a dev workspace, run it there, and promote it to production.
subjects: [cli, deploy, scripts]
---

You will have a repository on your machine with one script, one table, one schedule and one variable in it, the same script running in a dev workspace and in the production workspace it promotes to, and two runs you started from the command line. It takes about 20 minutes.

## Before you start

- The `volvel` command is installed. See [Install the command line](../../how-to/cli/install-the-cli). From 0.6.0 it is `npm install --global @volvel/cli`.
- Node 24 or later.
- You can sign in to the console as Maya Brooks, `maya.brooks@fernhill.example`, the tenant admin of Fernhill, on an instance where Fernhill is set up. The instance's address is written `<instance>` below; the examples use `http://localhost:8091`. A tenant admin may do everything in this tutorial. See the [permissions reference](../../../administer/reference/permissions) for what each step needs. See [Set up the Fernhill example](../../../start/how-to/example/set-up-the-fernhill-example).
- The instance has a worker that runs scripts. If it has none, a run waits and never starts.
- A terminal and a browser.

:::steps
1. **Make a production workspace and a dev workspace that promotes to it.** In the console, open the tenant's **Workspaces** and press **Create workspace**. Make the production one first: **Name** `CLI start live`, **Slug** `cli-start-live`, **Type** **Production**, **Promotes to** **Nothing**. Press **Create workspace** again for the dev one: **Name** `CLI start dev`, **Slug** `cli-start-dev`, **Type** **Dev**, **Promotes to** **CLI start live (production)**. Both are listed, and the dev one shows `CLI start live` under **Promotes to**.

2. **Make an API key.** Open **Account**. Under **API keys**, press **Create API key**, type `My laptop` in **Name**, leave **Expires** at **Never** or choose a time, and press **Create API key**. The console shows the key once. Copy it: it begins `vxk_`. The key acts as you, with your permissions.

3. **Start a repository.** In a terminal, in a folder you keep code in:

   ```bash
   volvel init fernhill-cli
   ```

   ```text
   Created a tenant repository in /home/you/code/fernhill-cli
   Next:
     1. In that folder, install the repository's dependencies: npm install
     2. If the volvel command is not on this machine yet, install the CLI: npm install --global @volvel/cli
     3. Sign in: volvel login --url <your instance> --token <api key>. Create the key in the console under your account menu.
     4. Try the script on this machine: volvel run hello. Check the build: volvel build.
     5. Send it to a dev workspace: volvel deploy --tenant <slug> --workspace <slug>
   ```

   The folder holds `package.json`, `tsconfig.json`, `.gitignore`, `volvel.yaml`, `scripts/hello.ts`, and two YAML files in `resources/`: `greetings.table.yaml` and `hello-every-morning.schedule.yaml`. It also holds `.vscode/settings.json` and `.platform/schemas/`, which make a YAML-aware editor complete and check the files as you type. The table and the schedule are files because they are only data. The script is TypeScript because it is code. It must be empty, or hold only `.git`; the command refuses any other folder.

   ```yaml title=resources/greetings.table.yaml
   schemaVersion: 1
   body:
     description: Who the starter script has said hello to.
     columns:
       name: { type: text, required: true }
   ```

   ```yaml title=resources/hello-every-morning.schedule.yaml
   schemaVersion: 1
   body:
     script: hello
     cron: "0 8 * * 1-5"
   ```

4. **Install its dependencies.** The repository asks for `@volvel/sdk`:

   ```bash
   cd fernhill-cli
   npm install
   ```

   Before a release exists, the registry has no `@volvel/sdk`. Install the two tarballs instead, as [Install the command line](../../how-to/cli/install-the-cli) shows: `npm install <folder>/volvel-sdk-0.5.0.tgz <folder>/volvel-widgets-0.5.0.tgz`.

5. **Sign in.**

   ```bash
   volvel login --url <instance> --token <the key from step 2>
   ```

   ```text
   Signed in to http://localhost:8091 as maya.brooks@fernhill.example.
   ```

   The command asks the instance who the key is before it saves anything, so a wrong key is refused here. It saves the address and the key in `~/.config/volvel/config.json`, readable by you only.

6. **Run the script on your machine.**

   ```bash
   volvel run hello --input '{"name":"Ada"}'
   ```

   ```text
   info  Saying hello {"name":"Ada"}
   Output: {"greeting":"Hello, Ada"}
   ```

   Nothing was sent to the instance. Leave `--input` out and the name is `world`.

7. **Check the build.**

   ```bash
   volvel build
   ```

   ```text
   Bundle d8c3979af93a, 757 KB of code, SDK 0.5.0
     table      greetings
     script     hello
     schedule   hello-every-morning
   Written to /home/you/code/fernhill-cli/.platform/bundle.json
   ```

   The build lists every resource of the repository: the table and the schedule from the files in `resources/`, and the script that `scripts/hello.ts` exports. It also writes `.platform/volvel-env.d.ts`, which types `ctx.table("greetings")` in the script: see [Generated types](../../reference/command-line/generated-types). The digest and the size are the build's own and may differ on your machine.

8. **See what a deploy would do.**

   ```bash
   volvel deploy --tenant fernhill --workspace cli-start-dev --preview
   ```

   ```text
   Deploying would leave cli-start-dev (dev) with: 3 created, 0 updated, 0 deleted, 0 unchanged.
     created  table      greetings
     created  script     hello
     created  schedule   hello-every-morning
     Table greetings created.
   Nothing was changed. Run it again without --preview to deploy.
   ```

   The first lines are the same list as step 7. `--preview` changes nothing in the workspace.

9. **Deploy.**

   ```bash
   volvel deploy --tenant fernhill --workspace cli-start-dev
   ```

   The last lines say `Deployed version 1 to cli-start-dev (dev): 3 created, 0 updated, 0 deleted, 0 unchanged.` The schedule is paused: a new dev workspace starts with its triggers paused, so `hello-every-morning` does not fire there.

10. **Run it in the dev workspace.**

    ```bash
    volvel run hello --remote --tenant fernhill --workspace cli-start-dev --input '{"name":"Ada"}'
    ```

    ```text
    Test run 01a20fd2-4a49-7104-981d-6cdc8e2bcb38 of hello in cli-start-dev, from this build (preview, version 1). Nothing was deployed.
    2026-11-24 23:09:30 info  Saying hello {"name":"Ada"}
    Succeeded in 254 ms.
    Output: {
      "greeting": "Hello, Ada"
    }
    ```

    The command uploaded your build as a bundle made only to try, started one run on the worker, and followed it to its end. The script kept a row `Ada` in the workspace's table `greetings`: a run on your machine has no workspace, so it keeps none. Your run ID and times differ.

11. **Add a variable, and let the script read it.** A variable is only data, so it is a file. Make `resources/greeting.variable.yaml`:

    ```yaml title=resources/greeting.variable.yaml
    schemaVersion: 1
    body:
      description: The word that opens the greeting.
      default: Hello
    ```

    Then open `scripts/hello.ts` and let the script read it:

    ```diff-ts
       tables: ["greetings"],
    +  variables: ["greeting"],
       async run(input, ctx) {
    +    const opening = await ctx.variable("greeting");
         ctx.log.info("Saying hello", { name: input.name });
         // A run on your machine has no workspace, so no tables; a run in one keeps the note.
         if (ctx.run.trigger.type !== "local") await ctx.table("greetings").insert({ name: input.name });
    -    return { greeting: `Hello, ${input.name}` };
    +    return { greeting: `${opening}, ${input.name}` };
       },
    ```

    Run it on your machine first. A local run has no workspace to read the variable from, so it falls back to the default `Hello`. To give it another value, make `.platform/local.json` with `{"variables": {"greeting": "Good morning"}}` and run it again: the output reads `Good morning, Ada`. Remove the file before the next step.

12. **Deploy the change, with a note.**

    ```bash
    volvel deploy --tenant fernhill --workspace cli-start-dev --message "Open with a variable"
    ```

    The last lines say `Deployed version 2 to cli-start-dev (dev): 1 created, 1 updated, 0 deleted, 2 unchanged.`, then `created  variable   greeting` and `updated  script     hello`. Run the script there again with step 10's command: the output is `Hello, Ada`, the variable's default, because the workspace has no value for it.

13. **See what promoting would do.**

    ```bash
    volvel promote --tenant fernhill --workspace cli-start-dev --preview
    ```

    ```text
    Bundle 3960951524fe, version 2 here, to cli-start-live (production).
    Promoting would leave cli-start-live (production) with: 4 created, 0 updated, 0 deleted, 0 unchanged.
      created  variable   greeting
      created  table      greetings
      created  script     hello
      created  schedule   hello-every-morning
      Table greetings created.
    Nothing was changed. Run it again without --preview to promote.
    ```

    Production holds nothing yet, so all four are new there.

14. **Promote.**

    ```bash
    volvel promote --tenant fernhill --workspace cli-start-dev --message "Greeting to live"
    ```

    ```text
    Promoted to cli-start-live (production) as version 1: 4 created, 0 updated, 0 deleted, 0 unchanged.
      created  variable   greeting
      created  table      greetings
      created  script     hello
      created  schedule   hello-every-morning
      Table greetings created.
    ```

    The same bundle that runs in dev is now active in production. Nothing was built again. In production the schedule is not paused: `hello-every-morning` fires each weekday at 08:00 UTC, the time zone a schedule has unless its definition says another.

15. **Look at the runs.**

    ```bash
    volvel runs --tenant fernhill --workspace cli-start-dev
    ```

    ```text
    2026-11-24 23:09:38  succeeded  manual    hello  01a20fd2-6ef7-7713-9a06-fec68b1529cc
    2026-11-24 23:09:30  succeeded  manual    hello  01a20fd2-4a49-7104-981d-6cdc8e2bcb38
    ```

    Each line holds the start time, the status, what started it, the script and the run's ID. `volvel runs <run id> --tenant fernhill --workspace cli-start-dev` shows one run with its input, output and log lines.
:::

## What you built

A repository with a script in `scripts/hello.ts`, and a table, a schedule and a variable as files in `resources/`. Version 2 of it runs in the dev workspace and version 1 of the production workspace, and the two runs you started are in the dev workspace's runs. Nothing in the repository says which workspace it goes to: each command named one.

Go on with:

- [Deploy a repository](../../how-to/cli/deploy-a-repository), for what a deploy refuses and how it treats resources made in the console.
- [Roll back a version](../../how-to/cli/roll-back-a-version), to put an earlier version back.
- [Why code or files](../../explanation/cli/code-or-files) and [Definitions in code](../../explanation/cli/definitions-in-code), for when a resource is worth writing in TypeScript.
