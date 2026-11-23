---
title: Set up the instance's mail
description: "Give the instance a mail server so it sends invitations, reset links and approval mail, and try mail without a server."
subjects: [install]
---

## Set up the instance's mail

By the end the instance sends the mail it owns: end users' invitations and password-reset links, and approval mail for flows.

## Before you start

- An SMTP server the control plane can reach, and an address mail is sent from.
- Mail is optional. Without it the instance sends nothing: whoever makes an invitation is shown the link to pass on, and "Forgot your password" tells people to ask.

## Set it up

:::steps
1. In `deploy/compose/.env`, set both. The first is the server as a URL, `smtp://user:password@host:port` or `smtps://user:password@host:port`:

   ```bash
   SMTP_URL=smtps://user:password@smtp.example.com:465
   MAIL_FROM=Volvel <no-reply@example.com>
   ```

   They must be set together. Setting one alone is refused with "SMTP_URL and MAIL_FROM must be set together."
2. Check the settings: `docker compose -f deploy/compose/compose.yaml run --rm --no-deps control-plane node dist/main.js check-config`.
3. Restart the instance. `GET /api/v1/instance` answers `"mail": true`.
:::

## The result

The instance sends mail itself. When a flow waits for an approval, each member who may decide it gets a mail with a link of their own: the members of the tenant who hold `approval:write` in the workspace and, when the step names groups or roles, are among them. Suspended and disabled members are not mailed, nor is an operator inside the tenant on an access grant. At most 50 are mailed for one step; the rest see it in the console.

A link:

- is the approver's own, and enough by itself: it opens a page with what is asked and Approve and Reject, with no sign-in. Opening it decides nothing, so a mail scanner that fetches links does no harm;
- works once, and only until 48 hours have passed, the step's own timeout comes, or anyone decides the approval. Then every link to it stops working;
- is checked again when used: a member suspended, or no longer allowed to decide, since the mail went out is refused.

A forwarded link can be used once by whoever holds it, and decides as the approver it was sent to. The decision is recorded as that member's, with `via: "email"` in the audit log.

A tenant sends mail from its flows through its own `smtp` connection, made by a worker. The instance's `SMTP_URL` is not used for that, and the mail server must be reachable from where workers run.

## Try mail without a server

`MAIL_CAPTURE_DIR=/some/folder` writes each message the instance would send to a file there, readable, and sends nothing. It overrides `SMTP_URL`. The instance warns in its log when it starts. It is for development and tests, never for an instance people use: the files hold one-time links. The Compose file does not pass `MAIL_CAPTURE_DIR`, so use it on an instance you start another way.

## If it does not work

- **Invitations are not arriving.** Check `SMTP_URL`, `MAIL_FROM` and the instance's log, which names the address that could not be sent to.
- **The log says "MAIL_CAPTURE_DIR is set: mail is written to files there and nothing is sent. For development only".** Remove `MAIL_CAPTURE_DIR`.
- **A tenant's flow cannot send mail.** That is the tenant's `smtp` connection, not this setting.

Related: [Settings](../../reference/settings).
