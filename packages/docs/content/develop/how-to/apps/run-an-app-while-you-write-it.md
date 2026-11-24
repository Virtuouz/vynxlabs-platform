---
title: Run an app while you write it
description: Serve an app of files, an interface or a docs site from your repository with volvel dev, against a workspace's data, and know what differs from the deployed app.
subjects: [apps, cli]
---

## Run an app while you write it

By the end you will have each kind of app of a repository open in your browser on your own computer, reloading as you change its files, and reading and writing a dev workspace's data as you.

## Before you start

- A tenant repository with an app defined in it, and the CLI signed in to the instance (`volvel login`). The key you signed in with acts as you: the app sees what you may see.
- A workspace to read and write: `--tenant` and `--workspace` name it. A dev workspace is the safe one. The command also works against a production workspace, and then the app changes its real data.
- The repository's dependencies installed. An app of files is built with the repository's own Vite.
- For an interface or a docs app, the tables and pages it names. For an interface, the tables have to be deployed to the workspace: the page reads their columns from the instance. [Write an app as code](write-an-app) deploys them.
- Fernhill is set up: see [Set up the Fernhill example](../../../start/how-to/example/set-up-the-fernhill-example).

## Steps

:::steps
1. From the repository, start the dev server. If the repository defines one app, no name is needed. If it defines several, the command stops and lists them: "Say which app: board (interface), desk (files), guide (docs)." Give the app's path.

   ```bash
   volvel dev desk --tenant fernhill --workspace apps-docs
   ```

   ```text
   desk is at http://localhost:5174/
   The page is served under Volvel's content policy: no inline script, nothing from another site. A browser's console says what it refused; --no-strict turns this off.
   It reads and writes fernhill/apps-docs on http://localhost:8091, as maya.brooks@fernhill.example. Press Ctrl+C to stop.
   ```

   The default port is 5174. If it is taken, the next free one is used, and the first line says which. `--port` chooses another (1 to 65535).

2. Open the address. Change a file and save. An app of files reloads through Vite. An interface and a docs site reload the whole page when any file in the repository changes, except under `node_modules`, `.git`, `.platform` and `dist`.

3. Try the app as the person you are. Calls to `/api` go to the instance with your key, and `/portal` goes to the instance, so signing in at the tenant's pages brings you back to localhost. End-user sign-in changes who the page thinks you are: it does not change the calls, which still carry your key.

4. If the repository does not build, the page says so instead of drawing: "This app cannot be drawn yet", then each problem, for example "src/index.ts:111: Unexpected ";"". It reloads when you fix the file. (An app of files shows the error in the browser's overlay.)

5. Stop with :kbd[Ctrl+C].
:::

## An app of files

The page is built from `source` as Vite serves it. Its context says what a deployed app's says: `base` is `/`, `portal` is `/portal/<tenant slug>`, and `tenant.logo` is true or false, read from the instance, so `logoUrl()` returns an address or null as it will when deployed. These differ from the deployed page:

- `principal.groups`, `principal.groupKeys` and `principal.attributes` are not filled. Deployed, a member's groups and an end user's groups and attributes are.
- You have your own permissions, often `data_all`, so the tables' row rules show you every row. Check them as the people they are for: see [Decide who sees which rows](../../../console/how-to/data/row-rules).
- Your key is not an app session. A guest's refusals ("Sign in to start a script") do not occur: you are signed in.

## An interface

An interface app is drawn from the interface's file in your repository, with the screens the CLI carries. Edit the interface (`defineInterface`) and the page reloads with the change. Data comes from the workspace, as you.

- The columns, and the names of the groups, come from the deployed interface when there is one. A table you have not deployed has none.
- Field help is not drawn: the runtime is told there is none.
- To draw with a different build of the screens, set `SCREENS_DIR` to its folder. If the CLI has no screens, the command stops: "The files that draw an interface are not in this install, and an interface app is drawn with them."

## A docs site

A docs app is drawn from the Markdown pages under its folder, with the same renderer the instance uses, and with search. A page's raw Markdown is at its address with `.md` added, and search is at `_search`. A notice at the top of every page says what is not here: the product's own terms, readers' answers to "Was this page helpful?" and diagrams. Pictures beside the pages are served.

## What the content policy does here

The page is served under the policy a deployed app gets, so what it would refuse, it refuses here: no inline script, nothing from another site, no remote font. A docs site is served under the docs policy, which also allows images from `https:`. See [What an app may load](../../reference/apps/content-policy). The browser's console reports each refusal, for example "Loading the stylesheet 'https://fonts.googleapis.com/css2?family=Inter' violates the following Content Security Policy directive".

One thing differs from the instance: the dev server's own scripts carry a nonce made for the run, and `ws://localhost:*` and `ws://127.0.0.1:*` may be connected to, for reload. The nonce goes only on the dev server's scripts, so an inline script of yours is refused in dev as it is once deployed.

`--no-strict` turns the policy off and says so: "The page is served without Volvel's content policy (--no-strict), so it may do what a deployed app cannot." Use it to find out whether a refusal is the policy's.

## The result

The app runs at `http://localhost:<port>/`, reloads as you change it, and reads and writes the workspace as you do. Nothing is deployed. When it works, deploy it ([Write an app as code](write-an-app)).

## If it does not work

| What you see | Why and what to do |
| --- | --- |
| "This repository defines no app." | None of the repository's resources is an app. Add one with `defineApp`. |
| "This repository has no app at "x". Its apps: …" | The name is not an app's path. The list names each app with its kind. |
| "Say which app: …" | Several apps, no name. Give one. |
| "Not signed in. Run: volvel login --url <url> --token <api key>" | Sign in. |
| "The instance at … did not answer." on a page | The instance is not running or its address is wrong. |
| A white page and a refusal in the console | The policy refused something. See the content policy page. |

## Related

- [Write an app as code](write-an-app)
- [The app client](../../reference/apps/app-client)
- [The command line](../../reference/cli)
