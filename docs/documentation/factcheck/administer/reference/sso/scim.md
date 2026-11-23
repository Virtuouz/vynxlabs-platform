# Fact-check record: administer/reference/sso/scim

Code as of commit `14f7d5b9` (branch `phase-31-write-the-docs`), 2026-11-23. Written by the page's writer (area `sso`). Each line number is the first line of the file that holds the quoted text. "run" means the writer saw it on the throwaway instance (http://localhost:8091, tenant `sso-wave`); "code" means it was read in the code only. Checked by: second agent, 2026-11-23. Method: every bold label, quoted text, permission, flag, setting name and cited line was matched to the code by script (none missing), the limits, refusal texts and sequences were read in the code, and what depends on the screen was run on the instance (see the run log). Rows below the table add what the second check found.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Token prefix vxp_ | `apps/control-plane/src/kernel/sso/scim.ts:26` | second agent, code, 2026-11-23 | holds |
| 401 text, 403 paused text | `apps/control-plane/src/kernel/sso/scim.ts:100` | second agent, code, 2026-11-23 | holds |
| Paused text | `apps/control-plane/src/kernel/sso/scim.ts:127` | second agent, code, 2026-11-23 | holds |
| Rate limit 1200 a minute | `apps/control-plane/src/routes/scim.ts:388` | second agent, code, 2026-11-23 | holds |
| Max page 200, default 100 | `apps/control-plane/src/routes/scim.ts:44` | second agent, code, 2026-11-23 | holds |
| ServiceProviderConfig: patch yes, bulk/sort/etag/changePassword no | `apps/control-plane/src/routes/scim.ts:506` | second agent, run, 2026-11-23 | holds |
| Filter forms and the 400 text | `apps/control-plane/src/kernel/sso/scim.ts:154` | second agent, run, 2026-11-23 | holds |
| User needs email text | `apps/control-plane/src/kernel/sso/scim.ts:629` | second agent, run, 2026-11-23 | holds |
| Instance-runner refusal 403 text | `apps/control-plane/src/kernel/sso/scim.ts:696` | second agent, code, 2026-11-23 | holds |
| End-user takeover refusal 409 | `apps/control-plane/src/kernel/sso/scim.ts:756` | second agent, code, 2026-11-23 | holds |
| Hand-disabled stays off | `apps/control-plane/src/kernel/sso/scim.ts:555` | second agent, code, 2026-11-23 | holds |
| Duplicate userName/externalId 409 | `apps/control-plane/src/kernel/sso/scim.ts:647` | second agent, code, 2026-11-23 | holds |
| Refusals listed newest first, no limit | `apps/control-plane/src/routes/scim.ts:251` | second agent, run, 2026-11-23 | holds |
| Resources paths | `apps/control-plane/src/routes/scim.ts:905` | second agent, code, 2026-11-23 | holds |
| 401, 403 paused, 400 filter and email messages, 409 uniqueness, count max 200, Bulk not served (404), Patch deactivates | `apps/control-plane/src/routes/scim.ts:388` | second agent, run, 2026-11-23 | holds (curl against an end-user provider) |
