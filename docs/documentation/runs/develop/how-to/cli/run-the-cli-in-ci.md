# Run log: develop/how-to/cli/run-the-cli-in-ci.md

- Instance: http://localhost:8091, the throwaway instance seeded by `examples/fernhill/setup/setup.mjs`, commit `5ebf1c80` (branch phase-31-write-the-docs), 2026-11-23.
- Signed in as Maya Brooks (`maya.brooks@fernhill.example`, tenant admin) with an API key made for this run (`p31-cli-docs`, revoked at the end). The CLI was `@volvel/cli` 0.5.0 installed globally from a tarball made with `pnpm pack`, into a folder outside the repository; the SDK was installed from the SDK and widgets tarballs. Nothing was installed from npm: no `@volvel` package is published.
- Terminal only, Node v24.15.0, Linux. No browser width, theme or keyboard-only walk applies, except where a step says it was looked at in a browser.
- Workspaces made for this run, in Fernhill: `cli-dev` (dev) promoting to `cli-live` (production); `cli-start-dev` to `cli-start-live`; `cli-bind-dev` to `cli-bind-live`. They are left in place.

## The steps as followed
- With `XDG_CONFIG_HOME` pointing at an empty folder (nothing saved) and `CI=true VOLVEL_URL=... VOLVEL_TOKEN=...` set: `volvel build`, `deploy --preview --json`, `deploy --json --allow-delete cli-extra`, `promote --preview --json`, `promote --json`, `rollback 3 --json` all ran signed in by the environment. The version's note was the git subject of the repository's last commit.
- The two GitHub Actions files were not run on GitHub.
- A service account and its key were not made: the harness refused to create one. The role claims (`deployer`, `promotion:write`) come from the migration and the routes; the Service accounts page text from `administer/reference/screens/service-accounts.md`.

## The page got wrong (and was corrected)
- A first draft said secrets are not given to a fork's pull request: GitHub's behavior, not Volvel's, removed.

## Not run
GitHub Actions; a service account key; `tenant plan`; exit 4.
