# Fact-check: self-host/how-to/running/set-up-mail.md

Written at commit `14f7d5b9`. Lines are those of that commit. Checked by: the writer; the second agent's column is open.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| `SMTP_URL` is `smtp:` or `smtps:`; set with `MAIL_FROM`. | `apps/control-plane/src/config.ts:248-252`; run: check-config printed "SMTP_URL and MAIL_FROM must be set together." | writer, 2026-11-23 | holds |
| Approval mail goes to members with `approval:write`; at most 50; link 48 h; opening decides nothing. | `kernel/flows/approvers.ts:248` (`MAX_ASKED`), `approval-links.ts:20` (`LINK_HOURS`) | writer, 2026-11-23 | holds for 50 and 48; the rest carried from `docs/self-hosting.md` |
| `MAIL_CAPTURE_DIR` overrides SMTP; Compose does not pass it. | `config.ts:255`; `compose.yaml` (absent) | writer, 2026-11-23 | holds |
| `GET /api/v1/instance` has `mail`. | run: `"mail":false` | writer, 2026-11-23 | holds |
| A mail was actually sent. | none | writer, 2026-11-23 | NOT RUN: no mail server |
