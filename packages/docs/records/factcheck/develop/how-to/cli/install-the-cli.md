# Fact-check record: develop/how-to/cli/install-the-cli.md

Lines are current at commit `5ebf1c80` (branch phase-31-write-the-docs). Paths are under `packages/cli/src` unless they start with `apps/`, `packages/`, `examples/` or `docs/`. Written by the writer. Checked by: second agent, 2026-11-23.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Node 24 or later (`.nvmrc` 24, engines `>=24`). | `.nvmrc`; `package.json:6-8` | second agent, 2026-11-23 (writer: writer, read from the code 2026-11-23 (not run)) | holds as read |
| `npm install --global @volvel/cli` is the published install command; the package is `@volvel/cli`, bin `volvel`. | `packages/cli/package.json:2,12-14`; `cli/local.ts:301` (init's step 2) | second agent, 2026-11-23 (writer: writer, read from the code 2026-11-23 (not run)) | holds as read |
| Nothing is published to npm; no first publish date. | `docs/documentation/decisions.md` D62; no network was used | second agent, 2026-11-23 (writer: writer, read from the code 2026-11-23 (not run)) | holds as read |
| `volvel init` writes `@volvel/sdk` at `^0.5.0`. | `cli/local.ts:212,220` | second agent, 2026-11-23 (writer: writer, run on the instance 2026-11-23) | holds as run |
| The SDK depends on `@volvel/widgets` at its own version; `packages/widget-sdk` is that package. | `packages/sdk/package.json` dependencies; `packages/widget-sdk/package.json`; tarball's package.json shows `"@volvel/widgets": "0.5.0"` | second agent, 2026-11-23 (writer: writer, run on the instance 2026-11-23) | holds as run |
| `pnpm pack` of packages/cli, sdk and widget-sdk gives `volvel-cli-0.5.0.tgz`, `volvel-sdk-0.5.0.tgz`, `volvel-widgets-0.5.0.tgz`; the CLI's prepack needs the screens build. | `packages/cli/package.json:19` (prepack), `packages/cli/bundle.mjs:33-39`; run | second agent, 2026-11-23 (writer: writer, run on the instance 2026-11-23) | holds as run |
| Installing the CLI tarball globally adds three packages and `volvel --version` prints `volvel 0.5.0`. | run (`npm i -g --prefix ... --offline`), `cli/cli.ts:1384-1387` | second agent, 2026-11-23 (writer: writer, run on the instance 2026-11-23) | holds as run |
| npm rewrites the SDK dependencies to `file:` paths when installed from tarballs. | run: package.json showed `file:../../tarballs/volvel-sdk-0.5.0.tgz` | second agent, 2026-11-23 (writer: writer, run on the instance 2026-11-23) | holds as run |
| The CLI keeps its sign-in in `$XDG_CONFIG_HOME/volvel/` or `~/.config/volvel/`. | `cli/cli.ts:39-42` | second agent, 2026-11-23 (writer: writer, run on the instance 2026-11-23) | holds as run |
| Vite refusal text for an app repository. | `cli/apps.ts:69-72` | second agent, 2026-11-23 (writer: writer, read from the code 2026-11-23 (not run)) | holds as read |
| The three tarballs were packed again with `pnpm pack` into a scratch folder and installed offline with npm: `volvel --version` printed `volvel 0.5.0`; the SDK tarball names `@volvel/widgets` at `0.5.0`; Node 24 in `.nvmrc` and `>=24` in `package.json`. | `.nvmrc`; `package.json:7`; packed `package.json` | second agent, 2026-11-23, run | holds as run |

## Changed on 2026-11-28: the first release (0.6.0)

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| The `@volvel` packages are on npm from 0.6.0, under the tag `latest`; `npm install --global @volvel/cli` installs the CLI. | `.github/workflows/release.yml` (stages the packages, tag `latest`); `packages/cli/package.json` name | writer, 2026-11-28 | holds |
| Tarballs are for running a checkout; not needed for a release. | the steps unchanged; `pnpm pack` in `packages/*` | writer, 2026-11-28 | holds |
| npm cannot find the package for a version below 0.6.0: nothing was published before it. | `CHANGELOG.md` ("From 0.6.0 on"); `.github/workflows/release.yml` | writer, 2026-11-28 | holds |
