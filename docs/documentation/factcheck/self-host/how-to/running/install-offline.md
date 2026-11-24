# Fact-check: self-host/how-to/running/install-offline.md

Written at commit `14f7d5b9`. Lines are those of that commit. Checked by: second agent, 2026-11-23.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| `docker save` and `docker load` of the images; `up --no-build`. | Docker; `compose.yaml` | writer, 2026-11-23 | NOT RUN across two machines |
| The instance asks nothing of the internet when it runs. | `SECURITY.md` | writer, 2026-11-23 | holds as policy |

## Second check (2026-11-23)

Run on one machine: `docker save` of the three images (609 MB), `docker load`, `up -d --wait --no-build` started the services from loaded images (control plane stopped only on a port clash with another stack). Two-machine transfer not run.
