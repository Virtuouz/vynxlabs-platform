# Fact-check record: self-host/tutorials/install-on-one-machine

Code as of commit `5ebf1c80`, 2026-11-23. Written by the page's writer; run 2026-11-23 (run log). "Checked by" is left for the second agent.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| `.env.example` has COMPOSE_PROFILES=postgres,objectstore, and the settings listed | `deploy/compose/.env.example:7-80` | writer, run | holds |
| The secrets' generating commands | `.env.example:17-26,52-53` | writer, run | holds |
| "Back this up somewhere safe. Without it, no stored secret can ever be read again." | `.env.example:25` | writer | holds |
| The bootstrap operator is made on the first start; remove both lines afterwards | `.env.example:34-37`, run | writer, run | holds |
| Four services: postgres, objectstore, control-plane, worker-host | `deploy/compose/compose.yaml`, run | writer, run | holds |
| `readyz` answer | run | writer, run | holds |
| `check-config` says "The settings are valid." and exits 0, 1 when wrong | `node dist/main.js --help`, run | writer, run | holds |
| Health screen texts | `apps/console/src/screens/` (Health), run | writer, run | holds |
| The image is built from source unless `VOLVEL_IMAGE` is set | `compose.yaml:1-5,22-26` | writer | holds (build itself not run) |
| `pg_dump` is a backup; a key must be kept as long as the backups it sealed | `docs/documentation/inventory/tutorials-and-style.md` section 2, tutorial 11 (D59) | writer | not re-derived from code |
| The worker host starts the worker | run (script ran; worker-host log) | writer, run | holds |

## Second check (2026-11-23)

Checked by: second agent, 2026-11-23. Cross-link with self-host/how-to/running/install-with-compose added both ways. Commands NOT re-run by the second check: the classifier denied 'docker compose up' for project p31tut. Not rechecked against the current image.

## Changed on 2026-11-28: the first release (0.6.0)

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| The image `volvel/volvel:0.6.0` (and `latest`) is on Docker Hub from 0.6.0. | `.github/workflows/release.yml` (build step, `tags:`) | writer, 2026-11-28 | holds |
| `VOLVEL_IMAGE` names the image Compose runs; without it Compose builds `volvel/volvel:local`. | `deploy/compose/compose.yaml:6,16` | writer, 2026-11-28 | holds |
