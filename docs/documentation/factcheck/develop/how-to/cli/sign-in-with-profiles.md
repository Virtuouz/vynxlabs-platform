# Fact-check record: develop/how-to/cli/sign-in-with-profiles.md

Lines are current at commit `5ebf1c80` (branch phase-31-write-the-docs). Paths are under `packages/cli/src` unless they start with `apps/`, `packages/`, `examples/` or `docs/`. Written by the writer; the second agent fills "Checked by" anew.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| `login` checks the key with `/me` before saving, saves `config.json` mode 0600 in a folder of mode 0700. | `cli/cli.ts:207-233`; run: `drwx------`, `-rw-------` | writer, run on the instance 2026-11-23 | holds as run |
| A plain http address to a host other than localhost, 127.0.0.1, [::1] warns that the key crosses the network unencrypted. | `cli/cli.ts:219-224`; run (the warning text appeared) | writer, run on the instance 2026-11-23 | holds as run |
| Profile names: letters, digits, `-`, `_`, up to 40, starts with a letter or digit; saved as `profile-<name>.json`. | `cli/cli.ts:36,47-58` | writer, read from the code 2026-11-23 (not run) | holds as read |
| `--profile <name>` works before or after the command; `VOLVEL_PROFILE` does the same; `--profile` without a name is `--profile needs a name.` | `cli/cli.ts:1362-1371`; run | writer, run on the instance 2026-11-23 | holds as run |
| `volvel profiles` lists `(none)` and each profile with its address. | `cli/cli.ts:1294-1313`; run | writer, run on the instance 2026-11-23 | holds as run |
| `logout` removes the saved file, says where; a second one says there is nothing saved; the key is not revoked. | `cli/cli.ts:1280-1293`; run | writer, run on the instance 2026-11-23 | holds as run |
| `VOLVEL_URL` and `VOLVEL_TOKEN` override one field each; a saved key is sent only to its own address (trailing slashes ignored); the refusal text. | `cli/cli.ts:73-96`; run: `The saved API key is for http://localhost:8091, not http://127.0.0.1:8091 ...` | writer, run on the instance 2026-11-23 | holds as run |
| Errors: `Not signed in...`, `login needs both --url and --token.`, `--url must start with http:// or https://`, `The API key was not accepted. It may be revoked...`, `... did not answer like a platform instance.` | `cli/cli.ts:93-96,186-233,119-127`; run for four of them | writer, run on the instance 2026-11-23 | holds as run |
| API keys are made under Account, API keys, Create API key; keys begin `vxk_`; Revoke on the same page. | `apps/console/src/screens/Account.tsx:502-540`; `apps/control-plane/src/auth` prefix `vxk_` (api-description.ts:78-80); walked: dialog lists Name and Expires | writer, run on the instance 2026-11-23 | holds as run |
| The page's example addresses (`volvel.example.com`, `staging`) are illustrations; the run used `http://localhost:8091` and a profile named `ops`. | run log | writer, run on the instance 2026-11-23 | holds as run |
