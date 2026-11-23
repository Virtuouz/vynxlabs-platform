# Fact-check record: administer/reference/sso/scim

Code as of commit `14f7d5b9` (branch `phase-31-write-the-docs`), 2026-11-23. Written by the page's writer (area `sso`). Each line number is the first line of the file that holds the quoted text. "run" means the writer saw it on the throwaway instance (http://localhost:8091, tenant `sso-wave`); "code" means it was read in the code only. The second agent has not checked this page yet.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Token prefix vxp_ | `apps/control-plane/src/kernel/sso/scim.ts:26` | writer, code only, 2026-11-23 | holds (not run) |
| 401 text, 403 paused text | `apps/control-plane/src/kernel/sso/scim.ts:100` | writer, code only, 2026-11-23 | holds (not run) |
| Paused text | `apps/control-plane/src/kernel/sso/scim.ts:127` | writer, code only, 2026-11-23 | holds (not run) |
| Rate limit 1200 a minute | `apps/control-plane/src/routes/scim.ts:388` | writer, code only, 2026-11-23 | holds (not run) |
| Max page 200, default 100 | `apps/control-plane/src/routes/scim.ts:44` | writer, code only, 2026-11-23 | holds (not run) |
| ServiceProviderConfig: patch yes, bulk/sort/etag/changePassword no | `apps/control-plane/src/routes/scim.ts:506` | writer, run, 2026-11-23 | holds |
| Filter forms and the 400 text | `apps/control-plane/src/kernel/sso/scim.ts:154` | writer, run, 2026-11-23 | holds |
| User needs email text | `apps/control-plane/src/kernel/sso/scim.ts:629` | writer, run, 2026-11-23 | holds |
| Instance-runner refusal 403 text | `apps/control-plane/src/kernel/sso/scim.ts:696` | writer, code only, 2026-11-23 | holds (not run) |
| End-user takeover refusal 409 | `apps/control-plane/src/kernel/sso/scim.ts:756` | writer, code only, 2026-11-23 | holds (not run) |
| Hand-disabled stays off | `apps/control-plane/src/kernel/sso/scim.ts:555` | writer, code only, 2026-11-23 | holds (not run) |
| Duplicate userName/externalId 409 | `apps/control-plane/src/kernel/sso/scim.ts:647` | writer, code only, 2026-11-23 | holds (not run) |
| Refusals listed newest first, no limit | `apps/control-plane/src/routes/scim.ts:251` | writer, run, 2026-11-23 | holds |
| Resources paths | `apps/control-plane/src/routes/scim.ts:905` | writer, code only, 2026-11-23 | holds (not run) |
