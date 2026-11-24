---
title: Run the command line from a checkout
description: Build the Volvel repository and run its CLI from the checkout, with no install, to try the repository's own examples.
subjects: [cli, install]
---

## Run the command line from a checkout

By the end the checkout's own `volvel` runs from any folder, as the `volvel` alias, and you can build and deploy the repository's examples with it.

This page is for working on Volvel itself, or for trying the CLI before there is a release. To use the CLI in your own repository, [install it](install-the-cli).

## Before you start

- A checkout of the Volvel repository.
- Node 24 or later and pnpm 9.15, the versions in the repository's `package.json` (`engines` and `packageManager`).
- The setup for working on the instance itself (Docker, the database, `pnpm dev`) is in the repository's `CONTRIBUTING.md`. You do not need it to run the CLI. You do need an instance to sign in to: the steps use one you already have.

## Run it from the checkout

:::steps
1. In the checkout, install and build:

   ```bash
   pnpm install
   pnpm build
   ```

   `pnpm build` makes `packages/cli/dist/bin.js`, the file the `volvel` command runs.
2. Make `volvel` a name for it in your shell. From the checkout:

   ```bash
   alias volvel="node $PWD/packages/cli/dist/bin.js"
   ```

   Put the line in your shell's startup file to keep it.
3. Check it:

   ```bash
   volvel --version
   ```

   ```text
   volvel 0.5.0
   ```
4. Sign in, with a key made under **Account** in the console, and build an example:

   ```bash
   volvel login --url <your instance> --token <api key>
   cd examples/acme
   volvel build
   ```

   `volvel build` lists what the repository holds and writes `.platform/bundle.json`. The examples take the SDK of the checkout through pnpm's workspace. A repository of your own, outside the checkout, takes it from [tarballs](install-the-cli).
:::

## The result

`volvel` runs the code of the checkout: after a change to `packages/cli/src`, run `pnpm build` (or `tsc -b`) again and the alias runs the new code. `volvel --version` prints the version of `packages/cli/package.json`.

## If it does not work

- **`Cannot find module .../packages/cli/dist/bin.js`.** The checkout is not built. Run `pnpm build`.
- **An example says the SDK cannot be found.** Run `pnpm install` in the checkout's root, so that pnpm links the workspace's packages into the examples.
- To send an example to a workspace, see [Deploy a repository](deploy-a-repository).
