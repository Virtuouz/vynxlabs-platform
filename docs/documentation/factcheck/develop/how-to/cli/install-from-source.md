# Fact-check record: develop/how-to/cli/install-from-source.md

Lines are current at commit `5ebf1c80` (branch phase-31-write-the-docs). Paths are under `packages/cli/src` unless they start with `apps/`, `packages/`, `examples/` or `docs/`. Written by the writer. Checked by: second agent, 2026-11-23.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Node >=24 and pnpm 9.15.0. | `package.json:5-8` | second agent, 2026-11-23 (writer: writer, read from the code 2026-11-23 (not run)) | holds as read |
| `pnpm build` runs `tsc -b` and builds docs, console and screens; `packages/cli/dist/bin.js` is the CLI's bin. | `package.json:10`; `packages/cli/package.json:12-14` | second agent, 2026-11-23 (writer: writer, read from the code 2026-11-23 (not run)) | holds as read |
| `node packages/cli/dist/bin.js --version` prints `volvel 0.5.0`; the alias form runs commands. | run | second agent, 2026-11-23 (writer: writer, run on the instance 2026-11-23) | holds as run |
| `volvel build` in `examples/acme` lists the repository's resources and writes `.platform/bundle.json`. | run: `Bundle ce540aecf615 ... role roles/order-requester ...`; `cli/cli.ts:262-273` | second agent, 2026-11-23 (writer: writer, run on the instance 2026-11-23) | holds as run |
| The examples take the SDK through pnpm workspace dependencies. | `examples/acme/package.json:8` (`workspace:*`) | second agent, 2026-11-23 (writer: writer, read from the code 2026-11-23 (not run)) | holds as read |
| The repository's `CONTRIBUTING.md` holds the contributor setup. | `CONTRIBUTING.md` | second agent, 2026-11-23 (writer: writer, read from the code 2026-11-23 (not run)) | holds as read |
| `node <checkout>/packages/cli/dist/bin.js --version` printed `volvel 0.5.0`; `build` run in `examples/acme` listed its resources; the `pnpm` version is `pnpm@9.15.0` in `package.json`. | `package.json:5,10` | second agent, 2026-11-23, run | holds as run |
