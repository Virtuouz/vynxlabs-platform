---
title: Install the command line
description: Install the volvel command and the SDK a repository is written against, and check that the command runs.
subjects: [cli, install]
---

## Install the command line

By the end `volvel --version` prints a version and a repository you start can import `@volvel/sdk`.

:::alert[From npm, since 0.6.0]{type="info"}
The `@volvel` packages are on npm from 0.6.0, the first public release. The command that installs the CLI is `npm install --global @volvel/cli`. To run what is in a checkout of the repository instead, install from tarballs, as the last steps below do. Everything after the install step is the same either way.
:::

## Before you start

- Node 24 or later. The repository's `.nvmrc` says 24 and its `package.json` says `"node": ">=24"`.
- npm, which comes with Node.
- Only to install from tarballs: a checkout of the Volvel repository, built. If you do not have one, follow [Install from source](install-from-source) first and come back for the tarballs.

## Install from npm

```bash
npm install --global @volvel/cli
volvel --version
```

The package is `@volvel/cli` on npm. A repository gets the SDK from its own `package.json`. `volvel init` writes the dependency `@volvel/sdk` at `^0.5.0`, and `npm install` in the repository fetches it.

## Install from tarballs

Use this to run the code of a checkout, for example one you changed. It is not needed for a release. The CLI has one runtime dependency, `esbuild`, which npm fetches from the registry as it does for any package. The SDK depends on `@volvel/widgets`, so pack that too.

:::steps
1. In the checkout, build everything once: `pnpm build`. The CLI's packing step needs the files that draw an interface, which `pnpm build` makes.
2. Make a folder for the tarballs, then pack the three packages into it. The folder is yours to name; `~/volvel-tarballs` is used here.

   ```bash
   mkdir -p ~/volvel-tarballs
   (cd packages/cli && pnpm pack --pack-destination ~/volvel-tarballs)
   (cd packages/sdk && pnpm pack --pack-destination ~/volvel-tarballs)
   (cd packages/widget-sdk && pnpm pack --pack-destination ~/volvel-tarballs)
   ```

   The folder holds `volvel-cli-0.5.0.tgz`, `volvel-sdk-0.5.0.tgz` and `volvel-widgets-0.5.0.tgz`.
3. Install the CLI from its tarball, away from the checkout:

   ```bash
   npm install --global ~/volvel-tarballs/volvel-cli-0.5.0.tgz
   ```

   npm adds the CLI and `esbuild`, with the binary of `esbuild` for your platform.
4. Check it runs:

   ```bash
   volvel --version
   ```

   ```text
   volvel 0.5.0
   ```
5. For each repository you start, install the SDK from its tarballs in place of the registry:

   ```bash
   npm install ~/volvel-tarballs/volvel-sdk-0.5.0.tgz ~/volvel-tarballs/volvel-widgets-0.5.0.tgz
   ```

   npm rewrites the two dependencies in the repository's `package.json` to `file:` paths. Change them back to the registry's version to use a release.
:::

## The result

`volvel` is on your path, and `volvel --help` lists the commands. The command line keeps what it saves in `$XDG_CONFIG_HOME/volvel/`, or `~/.config/volvel/` when that variable is not set; the next step is to [sign in and deploy](../../tutorials/cli/quickstart).

## If it does not work

- **`volvel: command not found`.** npm's global folder is not on your `PATH`. `npm config get prefix` names the folder; its `bin` folder must be on the path.
- **npm cannot find `@volvel/cli` or `@volvel/sdk`.** The name is misspelled, or the version asked for is below 0.6.0: nothing was published before it. To run a checkout, install from the tarballs above.
- **`npm install` of the SDK tarball fails on `@volvel/widgets`.** The SDK names the widgets package at its own version, `0.5.0`. Install the widgets tarball in the same command, as step 5 does.
- **"This repository defines an app, which is built with Vite. Install it: add vite and @vitejs/plugin-react to devDependencies."** A repository that defines an app made of files loads Vite from its own dependencies, not from the CLI. Add them there.

See [the command reference](../../reference/cli) for every command.
