---
title: Write an app as code
description: Put an app in a tenant's repository with defineApp, build it with Vite, deploy it to a dev workspace and say who may open it with YAML bindings.
subjects: [apps, access]
---

## Write an app as code

By the end you will have an app in a tenant's repository that reads a table and starts a script, deployed to a dev workspace, with a binding that lets a group of end users open it.

## Before you start

- A tenant repository (`volvel init` makes one) and the CLI signed in to the instance (`volvel login`). See [the CLI reference](../../reference/cli).
- A dev workspace to deploy to, and `bundle:write` there. A deploy stops before it uploads anything if it would delete console resources the repository has no file for, so use a workspace you can spare while you try this. A deploy also deletes what an earlier deploy of a repository made and this repository no longer defines, and it does not ask first: the output lists each as `deleted`, so deploy to a workspace whose other repository you do not need.
- Node.js, and these in the repository's `package.json`: `@volvel/sdk`, `@volvel/app`, `@volvel/ui`, `react` and `react-dom` as dependencies, and `vite`, `@vitejs/plugin-react`, `@tailwindcss/vite` and `tailwindcss` as development dependencies. Without Vite the build stops and says to install it.
- The table and the script the app uses. This page uses a table `visits` and a script `check-in`, which are in the first step.
- Fernhill is set up: see [Set up the Fernhill example](../../../start/how-to/example/set-up-the-fernhill-example).

## Steps

:::steps
1. Define what the app uses. The app reads `visits` and starts `check-in`. The table is a file in the console's folder, `platform/visits.table.yaml`. The script is code, in `src/index.ts`; it lists the table in `tables`, or its writes are refused with "This needs a declared use of the table".

   ```yaml title=platform/visits.table.yaml
   schemaVersion: 1
   body:
     description: Pets that have been checked in.
     columns:
       pet: { type: text, required: true }
       seen: { type: boolean, default: false }
   ```

   ```ts title=src/index.ts
   import { defineApp, defineScript, z } from "@volvel/sdk";

   export const checkIn = defineScript({
     path: "check-in",
     description: "Adds a visit for a pet and says it is seen.",
     input: z.object({ pet: z.string() }),
     output: z.object({ id: z.string() }),
     tables: ["visits"],
     async run(input, ctx) {
       const row = await ctx.table("visits").insert({ pet: input.pet, seen: true });
       return { id: row.id };
     },
   });
   ```

2. Declare the app. `path` is part of its address. `source` is the folder that holds its `index.html`. `reads` lists the tables the app's code reads, so that whoever shares the app can see what it reaches.

   ```ts title=src/index.ts
   export const desk = defineApp({
     path: "desk",
     title: "Desk",
     description: "Check pets in.",
     source: "apps/desk",
     reads: ["visits"],
   });
   ```

   An app has exactly one of `source`, `interface` and `docs`; `defineApp` throws if it has none or more than one. `title` is at most 100 characters. `reads` lists at most 100 paths. `entry` (default `index.html`) names the page inside the built app, and `fallback` (default `true`) lets an address that names no file answer the page, for an app that routes in the browser.

3. Make the folder `apps/desk` with three files and one shared declaration. The page's own folder holds `index.html`, `main.tsx` and `styles.css`. `apps/env.d.ts` says that a stylesheet may be imported.

   :::file-tree
   - apps
     - env.d.ts
     - desk
       - index.html
       - main.tsx
       - styles.css
   - src
     - index.ts
   - package.json
   :::

   ```html title=apps/desk/index.html
   <!doctype html>
   <html lang="en">
     <head>
       <meta charset="utf-8" />
       <meta name="viewport" content="width=device-width, initial-scale=1" />
       <title>Desk</title>
     </head>
     <body>
       <div id="app"></div>
       <script type="module" src="./main.tsx"></script>
     </body>
   </html>
   ```

   ```css title=apps/desk/styles.css
   @import "@volvel/ui/tokens.css";
   @source "./";
   ```

   ```ts title=apps/env.d.ts
   declare module "*.css";
   ```

4. Write the page. Import the table's types as types only, from `@volvel/sdk`, so that none of the repository's server code reaches the browser. `TableOf<"visits">` is typed by `.platform/volvel-env.d.ts`, which `volvel build` writes. `useQuery` loads rows, and `runScript` starts the script as the person using the app. [The app client](../../reference/apps/app-client) lists everything `@volvel/app` gives you.

   ```tsx title=apps/desk/main.tsx
   import { runScript, table, useQuery } from "@volvel/app";
   import type { TableOf } from "@volvel/sdk";
   import { Button, PageShell, TextField } from "@volvel/ui";
   import { useState } from "react";
   import { createRoot } from "react-dom/client";
   import "./styles.css";

   function Desk() {
     const found = useQuery(() => table<TableOf<"visits">>("visits").find({ sort: ["-created_at"] }));
     const [pet, setPet] = useState("");
     return (
       <PageShell title="Desk">
         <TextField label="Pet" value={pet} onChange={setPet} />
         <Button
           onClick={async () => {
             await runScript("check-in", { pet });
             setPet("");
             found.reload();
           }}
         >
           Check in
         </Button>
         <ul>
           {(found.data ?? []).map((row) => (
             <li key={row.id}>{row.pet}</li>
           ))}
         </ul>
       </PageShell>
     );
   }

   createRoot(document.getElementById("app") as HTMLElement).render(<Desk />);
   ```

5. Check the build. The command compiles the app with the repository's own Vite and lists its files.

   ```bash
   volvel build
   ```

   ```text
   Bundle fce0d864feb4, 757 KB of code, SDK 0.5.0
     table      visits
     script     check-in
     app        desk  (6 files, 686 KB)
   ```

6. Say who may open the app. Staff whose role lets them read the workspace need no binding. For end users, bind a role that holds `app:read` at the app, and bind the tables and scripts it uses too: a binding at the app gives no table. `portal_user` holds `app:read`, `data:read` and `data:write`; `portal_reader` holds `app:read` and `data:read`. To start a script or a flow, the role must hold `run:write` or `flow_run:write`, which no built-in portal role does, so the repository defines one, `starts_runs`.

   These are three files in the console's folder, `platform/`. They are YAML because nothing in the code imports them. A binding names the role by its name, the principal, and the resource it binds at by its path.

   ```yaml title=platform/access/desk-app.binding.yaml
   schemaVersion: 1
   body:
     role: portal_user
     principal:
       type: end_user_group
       key: front-desk
     resource: desk
   ```

   ```yaml title=platform/access/desk-visits.binding.yaml
   schemaVersion: 1
   body:
     role: portal_user
     principal:
       type: end_user_group
       key: front-desk
     resource: visits
   ```

   ```yaml title=platform/roles/starts-runs.role.yaml
   schemaVersion: 1
   body:
     name: starts_runs
     description: Starts a script or a flow it is bound at.
     permissions:
       - run:write
       - flow_run:write
   ```

   ```yaml title=platform/access/desk-check-in.binding.yaml
   schemaVersion: 1
   body:
     role: starts_runs
     principal:
       type: end_user_group
       key: front-desk
     resource: check-in
   ```

   A group is named by its `key`, which stays when the group is renamed. The other principals are `member` (by email), `group`, `service_account`, `end_user` (by email), `end_user_group`, `end_users` (every signed-in end user) and `anonymous` (anyone, signed in or not). [How access to an app works](../../explanation/apps/app-access) says what each one gives.

7. Deploy to the dev workspace.

   ```bash
   volvel deploy --tenant fernhill --workspace apps-docs
   ```

   ```text
   App files: 6, 4 new.
   Deployed version 1 to apps-docs (dev): 7 created, 0 updated, 0 deleted, 0 unchanged.
   ```

   The command uploads only the files the instance does not already hold, six at a time, and says how many were new.
:::

## The result

The app is in **Build**, then **Apps**, with the tag **Repository**, its address, and, in **Open to**, the group the binding names, tagged **From repository** in the Share sheet. Its address is `/apps/<tenant>/<workspace>/<app>/` on the instance's address for apps.

A repository app is served at the console's address, or at `APPS_URL` when the operator set one. Every page is served sandboxed: it has no origin of its own, so it has no cookie, no `localStorage` or `sessionStorage`, and cannot read another page. It acts with a token the instance puts in the page. What an app remembered in the browser, such as a chosen tab, is forgotten on reload. See [How access to an app works](../../explanation/apps/app-access).

## What the build checks

| Check | Rule |
| --- | --- |
| Source | The app's `source` is inside the repository and holds `index.html`. |
| Plugins | The React and Tailwind plugins load for you. If the app folder has its own `vite.config.ts`, `.js`, `.mjs` or `.mts`, that file is used instead and you load them yourself. The build uses a `base` of `./`, in production mode, so the same files are served under a path and at a hostname's root. |
| File names | Each part of a file's path is made of letters, digits and `. _ @ ~ -`, and starts with a letter, a digit, or one `_` or `.` (so `.well-known/assetlinks.json` and `_commonjsHelpers-1a2b.js` are allowed). A path is at most 500 characters. A path that starts with `_/`, a part that is `.` or `..`, spaces and accents are refused. The error names the file and says to rename it in `public/`, or in the build's `rollupOptions.output`. |
| Entry | The entry file is among the files. Nothing is under `_/`. No file appears twice. |
| Size | A file is at most 25 MB. A bundle lists at most 5,000 files and is at most 20 MB of JSON. |

Files that no deployable version names any more are removed a week after the deploy that stopped naming them. A version older than a week is deployed again by uploading its files again, which `volvel deploy` and `volvel promote` do for you.

## If it does not work

| What you see | Why and what to do |
| --- | --- |
| "This repository defines an app, which is built with Vite. Install it: add vite and @vitejs/plugin-react to devDependencies." | Add them and install. |
| "the app "desk" needs a source, an interface or docs, and only one of them." | `defineApp` was given none or several of `source`, `interface` and `docs`. |
| The build names a file and says to rename it. | A name the app cannot be served under: see the file names row above. |
| The deploy stops and lists console resources it would delete. | The workspace holds resources the repository has no file for. Name each one with `--allow-delete <path>`, or add the file. |
| The app opens and the table is empty, or the page says it may not read. | The group has the app and no binding at the table. Add the second binding in step 6. |
| "Sign in to start a script" in the page. | The person is not signed in. See [How access to an app works](../../explanation/apps/app-access). |

## Related

- [Run an app while you write it](run-an-app-while-you-write-it)
- [The app client](../../reference/apps/app-client)
- [What an app may load](../../reference/apps/content-policy)
- [Share an app](../../../console/how-to/apps/share-an-app)
