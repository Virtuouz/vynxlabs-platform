# Fact-check: self-host/reference/running/versions-and-support.md

Written at commit `14f7d5b9`. Lines are those of that commit. Checked by: second agent, 2026-11-23.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| 0.5.0 and migration level 99. | run: `GET /instance` | writer, 2026-11-23 | holds |
| Newest minor and the one before get security fixes; first publish date not set. | `SECURITY.md`; D62 | writer, 2026-11-23 | holds |
| Release: tag `v*`, `RELEASE_ENABLED`, package list, image tags, `next` from main. | `.github/workflows/release.yml:8-14,161-183` | writer, 2026-11-23 | holds |
| Apache License 2.0; allowlist. | `LICENSE`; `scripts/check-licenses.mjs:8-30` | writer, 2026-11-23 | holds |
| Oldest bundle core 0.2.0. | `deploy.ts:161` | writer, 2026-11-23 | holds |

## Second check (2026-11-23)

Every claim read against the code and matched; commands and messages were also run in the drill (see the run log).
