# Fact-check: self-host/how-to/running/set-up-mail.md

Written at commit `14f7d5b9`. Lines are those of that commit. Checked by: second agent, 2026-11-23.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| `SMTP_URL` is `smtp:` or `smtps:`; set with `MAIL_FROM`. | `apps/control-plane/src/config.ts:248-252`; run: check-config printed "SMTP_URL and MAIL_FROM must be set together." | writer, 2026-11-23 | holds |
| Approval mail goes to members with `approval:write`; at most 50; link 48 h; opening decides nothing. | `kernel/flows/approvers.ts:248` (`MAX_ASKED`), `approval-links.ts:20` (`LINK_HOURS`) | writer, 2026-11-23 | holds for 50 and 48; the rest carried from `docs/self-hosting.md` |
| `MAIL_CAPTURE_DIR` overrides SMTP; Compose does not pass it. | `config.ts:255`; `compose.yaml` (absent) | writer, 2026-11-23 | holds |
| `GET /api/v1/instance` has `mail`. | run: `"mail":false` | writer, 2026-11-23 | holds |
| A mail was actually sent. | none | writer, 2026-11-23 | NOT RUN: no mail server |

## Second check (2026-11-23)

Run with a node SMTP sink on the execution network: `check-config`, `mail:true`, a member's password link arrived with the expected subject and text. Page gained the member password link (`member-resets.ts:37`). `MAIL_CAPTURE_DIR` run: file written, SMTP_URL ignored, warning logged. Approval mail not run; 48 h and 50 hold in code.

## Round three (2026-11-26): what mail does and does not prove

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Sign-up takes any address and signs the person in at once, mail or not | `apps/control-plane/src/routes/endusers.ts:1013-1055`; `kernel/apps/front.ts:379-411`; `kernel/endusers.ts:40-75` (`createEndUser` checks nothing; `end_user` has no verified column) | writer, code, 2026-11-26 | holds |
| An invitation made in the console makes an account with no password; its link is emailed when mail is set up | `routes/endusers.ts:150-170`, `:264-310`; `kernel/endusers.ts:40-75` | writer, code, 2026-11-26 | holds |
| "Forgot your password" sends a link only when mail is set up; using a link sets the password and deletes the account's app sessions | `kernel/apps/front.ts:465-503`; `kernel/endusers.ts:205-262` (`app_session` deleted at `:258`) | writer, code, 2026-11-26 | holds |
| A provider of end users refuses an email the provider says is not verified | `kernel/sso/people.ts:89-93` | writer, code, 2026-11-26 | holds (only when the answer says false) |
| The address is stored trimmed and in lower case, and an app sees it as `email` | `kernel/endusers.ts:16-24`; `kernel/apps/sessions.ts:122-134` | writer, code, 2026-11-26 | holds |
| End users are made by sign-up, invitation, or a provider (sign-in or push); the console has no bulk import of them | `routes/endusers.ts:264`; `kernel/sso/people.ts:156`; `kernel/sso/scim.ts:663` | writer, code, 2026-11-26 | holds |
