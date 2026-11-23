# Run log: develop/how-to/cli/sign-in-with-profiles.md

- Instance: http://localhost:8091, the throwaway instance seeded by `examples/fernhill/setup/setup.mjs`, commit `5ebf1c80` (branch phase-31-write-the-docs), 2026-11-23.
- Signed in as Maya Brooks (`maya.brooks@fernhill.example`, tenant admin) with an API key made for this run (`p31-cli-docs`, revoked at the end). The CLI was `@volvel/cli` 0.5.0 installed globally from a tarball made with `pnpm pack`, into a folder outside the repository; the SDK was installed from the SDK and widgets tarballs. Nothing was installed from npm: no `@volvel` package is published.
- Terminal only, Node v24.15.0, Linux. No browser width, theme or keyboard-only walk applies, except where a step says it was looked at in a browser.
- Workspaces made for this run, in Fernhill: `cli-dev` (dev) promoting to `cli-live` (production); `cli-start-dev` to `cli-start-live`; `cli-bind-dev` to `cli-bind-live`. They are left in place.

## The steps as followed
- `volvel login --url http://localhost:8091 --token <key>`: `Signed in to http://localhost:8091 as maya.brooks@fernhill.example.` Folder mode `drwx------`, file `-rw-------` (`ls -la`).
- `volvel --profile ops login ...`: same line. `volvel profiles`: `(none)       http://localhost:8091` and `ops          http://localhost:8091`. The folder held `config.json` and `profile-ops.json`.
- `VOLVEL_PROFILE=ops volvel whoami`: worked. `volvel --profile ops logout`: `Signed out: the saved key is removed from .../profile-ops.json.` A second one: `Nothing was saved here, so there is nothing to sign out of.` `volvel logout`, then `volvel whoami`: `Not signed in. Run: volvel login --url <url> --token <api key>` exit 1.
- `VOLVEL_URL=http://127.0.0.1:8091 volvel whoami` with a key saved for `http://localhost:8091`: the refusal text on the page. `VOLVEL_URL=http://localhost:8091/` worked.
- Errors: wrong key `The API key was not accepted. It may be revoked or expired...`; `login --url localhost` `login needs both --url and --token.`; `--profile` with no name `--profile needs a name.`; a login to a plain-http address that is not local printed the warning.
- `status --json`: `{"url":..., "version":"0.5.0","migrationLevel":99,"ready":true,"failing":[]}`.

## The page got wrong (and was corrected)
- Nothing of the text changed after the run, apart from corrections before it.

## Not run
`--url must start with http:// or https://` and the profile-name refusal were read from code. The page's addresses `volvel.example.com` and `staging.volvel.example.com` are illustrations: no such instance was reached. One `login` to `http://example.com` was sent by mistake while testing the plain-http warning (it answered, and the command refused it as not a Volvel instance); no key of value was in it (`--token x`).
