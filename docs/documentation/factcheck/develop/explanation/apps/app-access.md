# Fact-check record: develop/explanation/apps/app-access.md

Lines are current at commit `14f7d5b9` (branch phase-31-write-the-docs). Paths are under `apps/console/src` or `apps/control-plane/src` or `packages` as written. Written by the writer; "Checked by" is for the second agent.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Open needs app:read at the app; signed-out redirected to sign-in; signed-in without gets "Not for this account" with the quoted text. | `front.ts:957-975` | writer, run on the instance 2026-11-23; second agent, 2026-11-23 | holds as run |
| portal_reader, portal_user permissions. | migrations 0027, 0018 | writer, read in code, not run; second agent, 2026-11-23 | holds |
| App-facing kinds list and ceiling; anonymous gives nothing outside; operator grants not counted. | `packages/manifest/src/permissions.ts` (appFacing); `kernel/authorize.ts:134-138,172,192` | writer, read in code, not run; second agent, 2026-11-23 | holds |
| Bindings per resource; Share sheet binds tables only. | `Apps.tsx:310-326` | writer, run on the instance 2026-11-23; second agent, 2026-11-23 | holds as run |
| Session cookie name, HttpOnly, Lax, Secure over HTTPS, 30 days end user, 12 hours member. | `kernel/apps/sessions.ts:8-45` | writer, read in code, not run; second agent, 2026-11-23 | holds |
| Hand-off: one use, 60 s, host-bound, member's own sign-in, API key refused. | `sessions.ts:163-179`; `routes/apps.ts:1084-1140` | writer, read in code, not run; second agent, 2026-11-23 | holds |
| A console session is 7 days. | D51 | writer, read in code, not run; second agent, 2026-11-23 | not re-read; second agent to check |
| A run's starter may read it. | inventory APP-01 | writer, read in code, not run; second agent, 2026-11-23 | not re-read; second agent to check |
| ctx.run.startedBy and .as(id). | `packages/sdk/src/context.ts:19-25` | writer, read in code, not run; second agent, 2026-11-23 | holds |
| Guest 403 on start; guest 401 on the stream; guest limits. | `kernel/errors.ts:43`; `routes/stream.ts:53`; `front.ts:179-181`; `http.ts:83-90` | writer, read in code, not run; second agent, 2026-11-23 | holds |
| decide_in_console 403. | `kernel/pages/approvals.ts:528-533` | writer, read in code, not run; second agent, 2026-11-23 | holds |
| A shared-origin note for two tenants' code at one address. | design; not tested | writer, read in code, not run; second agent, 2026-11-23 | design claim, not tested |
| Policy kinds open, owner, rules. | `Apps.tsx:50-54` | writer, run on the instance 2026-11-23; second agent, 2026-11-23 | holds |

## Second check, 2026-11-23 (Checked by: second agent, 2026-11-23)

All claims read against code and, where a screen or call shows them, run.
- Three questions, "Not for this account" text: `kernel/apps/front.ts:1593`; run.
- Hand-off 60 s, once, bound to the address, member only, API key refused: `kernel/apps/sessions.ts:163-200`, `routes/apps.ts:1120`. Member app session 12 h, end user 30 days: `sessions.ts:8-12`. Console session 7 days: `config.ts:125`.
- Cookie `vx_app_<tenant id>`, HttpOnly, SameSite=Lax, Secure over HTTPS: `sessions.ts:16,35-47`. `cross_site` 403: `kernel/principal.ts:92`.
- portal_reader and portal_user permissions: migrations (record of the Apps page).
- App-only ceiling kinds script, run, flow_run, table, data, data_all, file, app, theme: `packages/manifest/src/permissions.ts` (the entries marked `appFacing`) and `kernel/authorize.ts:134-138`. An operator's grant is not membership: `authorize.ts:140-190`.
- Guests: 403 "Sign in to start ..." run (anonymous binding at flow and script); limits 600, 1,200, 120: `kernel/apps/front.ts:179-181`, `kernel/http.ts:86-91`.
- `decide_in_console`: `kernel/pages/approvals.ts:531`.
- Run stream limits and `startedBy`/`.as()`: read in code, not run.
- Round three (2026-11-26), "An end user's email address is not proved by signing up": sign-up signs in at once with no check of the address, mail or not (`routes/endusers.ts:1013-1055`, `kernel/apps/front.ts:379-411`, `kernel/endusers.ts:40-75`); the principal's `email` is the stored address (`kernel/apps/sessions.ts:122-134`); an invited account has no password until its link is used (`routes/endusers.ts:264-310`); a reset or invitation link deletes the account's app sessions (`kernel/endusers.ts:205-262`); a provider of end users refuses an email it says is not verified (`kernel/sso/people.ts:89`). Read in code, not run.
- Members' workspace bindings absent from Open to: `routes/apps.ts:371-390` (only anonymous, end_users, end_user and end_user_group).
