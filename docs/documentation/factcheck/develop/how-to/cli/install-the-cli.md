# Fact-check record: develop/how-to/cli/install-the-cli.md

Lines are current at commit `5ebf1c80` (branch phase-31-write-the-docs). Paths are under `packages/cli/src` unless they start with `apps/`, `packages/`, `examples/` or `docs/`. Written by the writer; the second agent fills "Checked by" anew.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Node 24 or later (`.nvmrc` 24, engines `>=24`). | `.nvmrc`; `package.json:6-8` | writer, read from the code 2026-11-23 (not run) | holds as read |
| `npm install --global @volvel/cli` is the published install command; the package is `@volvel/cli`, bin `volvel`. | `packages/cli/package.json:2,12-14`; `cli/local.ts:301` (init's step 2) | writer, read from the code 2026-11-23 (not run) | holds as read |
| Nothing is published to npm; no first publish date. | `docs/documentation/decisions.md` D62; no network was used | writer, read from the code 2026-11-23 (not run) | holds as read |
| `volvel init` writes `@volvel/sdk` at `^0.5.0`. | `cli/local.ts:212,220` | writer, run on the instance 2026-11-23 | holds as run |
| The SDK depends on `@volvel/widgets` at its own version; `packages/widget-sdk` is that package. | `packages/sdk/package.json` dependencies; `packages/widget-sdk/package.json`; tarball's package.json shows `"@volvel/widgets": "0.5.0"` | writer, run on the instance 2026-11-23 | holds as run |
| `pnpm pack` of packages/cli, sdk and widget-sdk gives `volvel-cli-0.5.0.tgz`, `volvel-sdk-0.5.0.tgz`, `volvel-widgets-0.5.0.tgz`; the CLI's prepack needs the screens build. | `packages/cli/package.json:19` (prepack), `packages/cli/bundle.mjs:33-39`; run | writer, run on the instance 2026-11-23 | holds as run |
| Installing the CLI tarball globally adds three packages and `volvel --version` prints `volvel 0.5.0`. | run (`npm i -g --prefix ... --offline`), `cli/cli.ts:1384-1387` | writer, run on the instance 2026-11-23 | holds as run |
| npm rewrites the SDK dependencies to `file:` paths when installed from tarballs. | run: package.json showed `file:../../tarballs/volvel-sdk-0.5.0.tgz` | writer, run on the instance 2026-11-23 | holds as run |
| The CLI keeps its sign-in in `$XDG_CONFIG_HOME/volvel/` or `~/.config/volvel/`. | `cli/cli.ts:39-42` | writer, run on the instance 2026-11-23 | holds as run |
| Vite refusal text for an app repository. | `cli/apps.ts:69-72` | writer, read from the code 2026-11-23 (not run) | holds as read |
