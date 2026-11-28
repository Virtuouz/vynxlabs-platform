# Fact-check: self-host/how-to/running/install-on-fly.md

Written at commit `14f7d5b9`. Lines are those of that commit. Checked by: second agent, 2026-11-23.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| `fly.toml` values, `HOST = "::"`, `kill_timeout = 60`, the health check, vm size, swap. | `deploy/fly/fly.toml` | writer, 2026-11-23 | holds |
| The secrets and `workers` group. | `deploy/fly/README.md` | writer, 2026-11-23 | copied; NOT RUN |

## Second check (2026-11-23)

Not run: no Fly account and no internet. The page matches deploy/fly/fly.toml and README.md line by line; the 1024 MB machine gives 3 run slots by the formula in `machine.ts:134`.

## Decision 0008 (apps isolation), 2026-11-28

The page was changed for decision 0008 (`docs/adr/0008-apps-written-as-code-are-sandboxed.md`). Lines are those of the working tree of branch `feat/apps-isolation`, before its commit. Read in code, not run.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| `APPS_URL` is optional; without it apps are served at the console's address. | `routes/instance.ts:67`; `kernel/apps/hosts.ts:60` | writer, read in code, not run, 2026-11-28 | holds |
