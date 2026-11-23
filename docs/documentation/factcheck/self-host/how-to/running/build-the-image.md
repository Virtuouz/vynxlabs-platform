# Fact-check: self-host/how-to/running/build-the-image.md

Written at commit `14f7d5b9`. Lines are those of that commit. Checked by: the writer; the second agent's column is open.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| `docker build -t volvel/volvel:docs .` builds; image about 900 MB. | run: `docker images` showed 905MB; build log | writer, 2026-11-23 | holds |
| Without `VOLVEL_IMAGE`, Compose builds `volvel/volvel:local` from the repository. | `deploy/compose/compose.yaml:1-7,17-19` | writer, 2026-11-23 | holds |
| The build pulls `node:24-slim` and runs `pnpm install --frozen-lockfile`. | `Dockerfile:2,24` | writer, 2026-11-23 | holds |
