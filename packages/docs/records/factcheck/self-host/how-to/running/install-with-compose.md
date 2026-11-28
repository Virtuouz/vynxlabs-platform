# Fact-check: self-host/how-to/running/install-with-compose.md

Written at commit `14f7d5b9`. Lines are those of that commit. Checked by: second agent, 2026-11-23.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Required: `PUBLIC_URL`, `AUTH_SECRET`, `MASTER_KEY`, `WORKER_HOST_TOKEN`; message "set X in .env". | `deploy/compose/compose.yaml` `${X:?set X in .env}` | writer, 2026-11-23 | holds |
| `openssl rand` commands and lengths: `AUTH_SECRET` >= 32, `MASTER_KEY` 32 bytes, token >= 32. | `apps/control-plane/src/config.ts:203-209,296` | writer, 2026-11-23 | holds |
| Bootstrap password at least 12 characters; both together. | `config.ts:122,224-230` | writer, 2026-11-23 | holds |
| Empty `MANAGED_WORKER_UID`/`_GID`/`_USERS` make the worker host exit with the quoted messages. | `packages/worker/src/host-bin.ts:49-61`; run: worker-host restarting, then healthy after the three were set | writer, 2026-11-23 | holds; PRODUCT FAULT reported |
| `up -d --wait` returns when healthy; first start creates the first operator ("created the first operator admin"). | run; `kernel/bootstrap.ts` | writer, 2026-11-23 | holds |
| `readyz` answers `ready`; `instance` names version and migration level. | run: `{"coreVersion":"0.5.0","migrationLevel":99,...}` | writer, 2026-11-23 | holds |
| Volumes `postgres` and `objectstore`. | `compose.yaml` volumes; run `docker compose config` | writer, 2026-11-23 | holds |
| `check-config` via `run --rm --no-deps`. | run | writer, 2026-11-23 | holds |

## Second check (2026-11-23)

Run again with the page's `.env` including the three worker-user lines: all four services healthy. Overlap: the tutorials inventory lists 'Install on one machine'; no such tutorial page exists (self-host/tutorials/index.md has no pages), so this how-to is the one page. fault fixed (fa): Compose passes 10001/10001/256 defaults and the worker host reads an empty setting as unset, confirmed in the code (compose.yaml:61-63, 122-124; host-bin.ts setting); the warning and the table note are gone from the page.

## Changed on 2026-11-28: the first release (0.6.0)

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| The image `volvel/volvel:0.6.0` (and `latest`) is on Docker Hub from 0.6.0. | `.github/workflows/release.yml` (build step, `tags:`) | writer, 2026-11-28 | holds |
| `VOLVEL_IMAGE` names the image Compose runs; without it Compose builds `volvel/volvel:local`. | `deploy/compose/compose.yaml:6,16` | writer, 2026-11-28 | holds |
| The steps after the new step 3 (pull, name, start, check, sign in, remove bootstrap) are numbered 4 to 7 in order. | the page | writer, 2026-11-28 | holds |
