# Fact-check record: develop/reference/command-line/versions.md

Lines are current at commit `5ebf1c80` (branch phase-31-write-the-docs). Paths are under `packages/cli/src` unless they start with `apps/`, `packages/`, `examples/` or `docs/`. Written by the writer. Checked by: second agent, 2026-11-23.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| `volvel --version` prints the CLI's version only; `status` prints `Version <core>, migration level <n>`. | `cli/cli.ts:1384-1387,1269-1272`; run | second agent, 2026-11-23 (writer: writer, run on the instance 2026-11-23) | holds as run |
| `SDK_VERSION` 0.5.0, `CORE_RANGE` min 0.5.0 below 0.6.0. | `packages/sdk/src/index.ts:50-52` | second agent, 2026-11-23 (writer: writer, read from the code 2026-11-23 (not run)) | holds as read |
| Compatibility table and both texts. | `packages/manifest/src/bundle.ts:288-296`; `deploy.ts:161,274-290` | second agent, 2026-11-23 (writer: writer, read from the code 2026-11-23 (not run)) | holds as read |
| `OLDEST_SUPPORTED_BUNDLE_CORE` 0.2.0. | `deploy.ts:161` | second agent, 2026-11-23 (writer: writer, read from the code 2026-11-23 (not run)) | holds as read |
| Bundle formats 1 to 4 and what each adds; the oldest that fits is written. | `packages/manifest/src/bundle.ts:182-190`; `docs/contracts/bundle.md:14-22` | second agent, 2026-11-23 (writer: writer, read from the code 2026-11-23 (not run)) | holds as read |
| `build` makes no instance request. | `cli/cli.ts:262-273` | second agent, 2026-11-23 (writer: writer, read from the code 2026-11-23 (not run)) | holds as read |
| API policy text. | `apps/control-plane/src/api-description.ts:84-89`; D56 | second agent, 2026-11-23 (writer: writer, read from the code 2026-11-23 (not run)) | holds as read |
| Old path answers 90 days with `Deprecation`, `Sunset`, `Volvel-Resource-Moved`. | `routes/workspaces.ts:822-823` | second agent, 2026-11-23 (writer: writer, read from the code 2026-11-23 (not run)) | holds as read |
| No package is published; first publish date not set. | `docs/documentation/decisions.md` D62 | second agent, 2026-11-23 (writer: writer, read from the code 2026-11-23 (not run)) | holds as read |

## Changed on 2026-11-28: the versioning policy (issue #27)

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| The quoted policy is the API description's (`API_POLICY`). | `apps/control-plane/src/api-description.ts`; `GET /api/v1/openapi.json` `info.description` | writer, 2026-11-28 | holds |
