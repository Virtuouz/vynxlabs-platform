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

## Changed on 2026-11-28: the versioning policy (issue #27)

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| 0.x until 1.0; a patch only fixes and adds; a minor may change the API, manifest format and worker protocol, with release notes; from 1.0, deprecated first in an earlier release. | the owner's decisions on issue #27 (comment of 2026-11-28); `API_POLICY`, `apps/control-plane/src/api-description.ts` | writer, 2026-11-28 | holds |
| The newest minor version gets security fixes (replaces the row "Newest minor and the one before"). | issue #27; `SECURITY.md` | writer, 2026-11-28 | holds |
| Upgrade from any earlier version straight to the newest. | CONTRIBUTING ("A migration must work on a database from any earlier release"); `upgrade.test.ts` | writer, 2026-11-28 | holds |
| A bundle built with an older SDK runs on an instance at least three minors newer; today back to 0.2.0. | issue #27; `OLDEST_SUPPORTED_BUNDLE_CORE = "0.2.0"`, `kernel/execution/deploy.ts:176`; `bundleCompatibility`, `packages/manifest/src/bundle.ts:263-271` | writer, 2026-11-28 | holds |
| A worker keeps working with an instance up to three minors newer; the Workers page marks one that needs an update. | issue #27; no refusal of an older worker in `routes/execution.ts`; `outdated`, `routes/execution.ts:3658` (`oldestCurrentWorker`, :106-110) | writer, 2026-11-28 | holds |
## Changed on 2026-11-28: the first release (0.6.0)

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| The image `volvel/volvel:0.6.0` (and `latest`) is on Docker Hub from 0.6.0. | `.github/workflows/release.yml` (build step, `tags:`) | writer, 2026-11-28 | holds |
| The `@volvel` packages are on npm from 0.6.0, under the tag `latest`; `npm install --global @volvel/cli` installs the CLI. | `.github/workflows/release.yml` (stages the packages, tag `latest`); `packages/cli/package.json` name | writer, 2026-11-28 | holds |
| The first public release is 0.6.0. | `CHANGELOG.md`; `SECURITY.md` | writer, 2026-11-28 | holds |
| A push to `main` stages `next` only when `PUBLISH_NEXT` is `true`; nothing is published unless `RELEASE_ENABLED` is `true`. | `.github/workflows/release.yml` header | writer, 2026-11-28 | holds |
