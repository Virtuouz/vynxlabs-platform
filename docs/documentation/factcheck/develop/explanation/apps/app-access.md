# Fact-check record: develop/explanation/apps/app-access.md

Lines are current at commit `14f7d5b9` (branch phase-31-write-the-docs). Paths are under `apps/console/src` or `apps/control-plane/src` or `packages` as written. Written by the writer; "Checked by" is for the second agent.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Open needs app:read at the app; signed-out redirected to sign-in; signed-in without gets "Not for this account" with the quoted text. | `front.ts:957-975` | writer, run on the instance 2026-11-23; second agent pending | holds as run |
| portal_reader, portal_user permissions. | migrations 0027, 0018 | writer, read in code, not run; second agent pending | holds |
| App-facing kinds list and ceiling; anonymous gives nothing outside; operator grants not counted. | `packages/manifest/src/permissions.ts` (appFacing); `kernel/authorize.ts:134-138,172,192` | writer, read in code, not run; second agent pending | holds |
| Bindings per resource; Share sheet binds tables only. | `Apps.tsx:310-326` | writer, run on the instance 2026-11-23; second agent pending | holds as run |
| Session cookie name, HttpOnly, Lax, Secure over HTTPS, 30 days end user, 12 hours member. | `kernel/apps/sessions.ts:8-45` | writer, read in code, not run; second agent pending | holds |
| Hand-off: one use, 60 s, host-bound, member's own sign-in, API key refused. | `sessions.ts:163-179`; `routes/apps.ts:1084-1140` | writer, read in code, not run; second agent pending | holds |
| A console session is 7 days. | D51 | writer, read in code, not run; second agent pending | not re-read; second agent to check |
| A run's starter may read it. | inventory APP-01 | writer, read in code, not run; second agent pending | not re-read; second agent to check |
| ctx.run.startedBy and .as(id). | `packages/sdk/src/context.ts:19-25` | writer, read in code, not run; second agent pending | holds |
| Guest 403 on start; guest 401 on the stream; guest limits. | `kernel/errors.ts:43`; `routes/stream.ts:53`; `front.ts:179-181`; `http.ts:83-90` | writer, read in code, not run; second agent pending | holds |
| decide_in_console 403. | `kernel/pages/approvals.ts:528-533` | writer, read in code, not run; second agent pending | holds |
| A shared-origin note for two tenants' code at one address. | design; not tested | writer, read in code, not run; second agent pending | design claim, not tested |
| Policy kinds open, owner, rules. | `Apps.tsx:50-54` | writer, run on the instance 2026-11-23; second agent pending | holds |
