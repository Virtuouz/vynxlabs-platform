# Run log: develop/how-to/cli/run-a-script-on-the-instance.md

- Instance: http://localhost:8091, the throwaway instance seeded by `examples/fernhill/setup/setup.mjs`, commit `5ebf1c80` (branch phase-31-write-the-docs), 2026-11-23.
- Signed in as Maya Brooks (`maya.brooks@fernhill.example`, tenant admin) with an API key made for this run (`p31-cli-docs`, revoked at the end). The CLI was `@volvel/cli` 0.5.0 installed globally from a tarball made with `pnpm pack`, into a folder outside the repository; the SDK was installed from the SDK and widgets tarballs. Nothing was installed from npm: no `@volvel` package is published.
- Terminal only, Node v24.15.0, Linux. No browser width, theme or keyboard-only walk applies, except where a step says it was looked at in a browser.
- Workspaces made for this run, in Fernhill: `cli-dev` (dev) promoting to `cli-live` (production); `cli-start-dev` to `cli-start-live`; `cli-bind-dev` to `cli-bind-live`. They are left in place.

## The steps as followed
- `volvel run hello --remote --tenant fernhill --workspace cli-dev --input '{"name":"Ada"}'`: `Test run <id> of hello in cli-dev, from this build (preview, version 1). Nothing was deployed.`, the log line, `Succeeded in 210 ms.`, `Output:` as a JSON block, exit 0.
- Against `cli-live` (production): `cli-live is a production workspace. A local build is tried in a dev workspace.` exit 1. A path that is not there: `There is no script or flow "nothing" in this build. It has: hello (script).` exit 1.
- `volvel runs`, `volvel runs --script hello`, `volvel runs <id>`, `volvel runs --json`, `volvel logs <id>`, `volvel logs <id> -f` on a run that had ended: output as the page shows. The `-f` of an ended run printed the log and exited 0.
- Following a run that is still going, Ctrl+C, `runs cancel`, a failed or canceled run (exit 1, 3), and a flow run were not run: the repository has no flow.
- The tenant's **Code in the console** was on (the remote run worked); the 403 was not provoked.

## The page got wrong (and was corrected)
- A first draft said a run that never starts means the instance has no worker, and that a run stays after its bundle is gone. Neither was seen; both removed.

## Not run
Flow run, cancel, exit codes 1 and 3, a missing permission, `console_code_off`.
