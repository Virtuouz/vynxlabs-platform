---
title: Run a docs app locally
description: "See a docs site drawn from the files on your computer, with search, reloading as you save, and no deploy."
subjects: [documentation, repository]
---

## Run a docs app locally

By the end a docs app of your repository is served on your computer, drawn from your files with the renderer the instance uses, and it reloads when a page changes.

## Before you start

- A repository whose pages are files and that has a docs app: see [Keep documentation in the repository](keep-documentation-in-the-repository).
- You are signed in with `volvel login`, and the tenant and the workspace exist. `volvel dev` talks to that workspace as you.

## Steps

:::steps
1. In the repository run:

   ```bash
   volvel dev handbook --tenant fernhill --workspace sandbox
   ```

   `handbook` is the app's path. With one app in the repository you need not name it; with several, `volvel dev` says "Say which app" and lists them with their kinds, such as `handbook (docs)`.
2. Read the lines it prints: the address, such as `handbook is at http://localhost:5174/`, a line about the content policy, and which workspace it reads and writes and as whom.
3. Open the address. The site is drawn from your files, with its search. A notice across the top says what is not drawn.
4. Edit a page and save. The page reloads. If the repository does not build, the page says "This app cannot be drawn yet" with the problems, and it reloads when you mend a file.
5. Press :kbd[Ctrl+C] to stop.
:::

The port is 5174, or the next free one up to 20 above it. Give `--port <n>` to choose it.

## What is not drawn

The notice reads "Drawn from the files on this computer by volvel dev. What only the instance knows is not here: the product's own terms, readers' answers to "Was this page helpful?", and diagrams." So:

- a term of the product's help draws as its word, without its definition;
- the **Was this page helpful?** form is not there;
- a `mermaid` block is shown as its source;
- a moved page's old address is not followed;
- the pages are the files: pages written in the console and not in the repository are not shown.

## The content policy

The site is served under the same content policy the instance uses: no inline script, nothing from another site. A browser's console says what it refused. `--no-strict` turns the policy off while you find the cause.

## The result

You see each page as its readers will, before a deploy.

## If it does not work

- **"This repository has no app at "x"."** The message lists the apps it has. `volvel dev` draws an app made of files, an interface and a docs site.
- **"Say which app".** The repository has more than one app. Name it.
- **"This repository defines no app."** Nothing in the repository's manifests is an app. Check the `docs:` of `defineApp`.
- **A picture is missing.** Pictures are the files beside the pages, in the folder of the app that serves them.

## Related

- [Links, pictures and moved pages](../../reference/documentation/links-pictures-and-moved-pages)
- [The volvel command](../../reference/cli)
