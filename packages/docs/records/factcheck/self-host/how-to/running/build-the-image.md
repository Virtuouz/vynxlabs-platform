# Fact-check: self-host/how-to/running/build-the-image.md

Written at commit `14f7d5b9`. Lines are those of that commit. Checked by: second agent, 2026-11-23.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| `docker build -t volvel/volvel:docs .` builds; image about 900 MB. | run: `docker images` showed 905MB; build log | writer, 2026-11-23 | holds |
| Without `VOLVEL_IMAGE`, Compose builds `volvel/volvel:local` from the repository. | `deploy/compose/compose.yaml:1-7,17-19` | writer, 2026-11-23 | holds |
| The build pulls `node:24-slim` and runs `pnpm install --frozen-lockfile`. | `Dockerfile:2,24` | writer, 2026-11-23 | holds |

## Second check (2026-11-23)

Every claim read against the code and matched; commands and messages were also run in the drill (see the run log).

## Changed on 2026-11-28: the first release (0.6.0)

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| The image `volvel/volvel:0.6.0` (and `latest`) is on Docker Hub from 0.6.0. | `.github/workflows/release.yml` (build step, `tags:`) | writer, 2026-11-28 | holds |
| `docker pull volvel/volvel:0.6.0` is the normal way to get an image; building is for code that is not a release. | `.github/workflows/release.yml` | writer, 2026-11-28 | holds |
