---
title: Set up the instance's mail
description: "Give the instance a mail server so it sends invitations, reset links and approval mail, and try mail without a server."
subjects: [install]
---

## Set up the instance's mail

By the end the instance sends the mail it owns: end users' invitations and password-reset links, a one-time link for a member's new password, and approval mail for flows.

## Before you start

- An SMTP server the control plane can reach, and an address mail is sent from.
- Mail is recommended for an instance people use, and not required. Without it the instance sends nothing: whoever makes an invitation is shown the link to pass on, and "Forgot your password" tells people to ask.
- Mail does not make an end user's email address a proved one. Read [What mail does and does not prove](#what-mail-does-and-does-not-prove) before you build rules on an email address.

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

## What mail does and does not prove

When a tenant lets people create their own account, anyone can sign up with any email address, and is signed in at once. The instance does not ask them to prove the address, with mail or without it.

What mail changes:

- An invitation made in the console is emailed. The account has no password until its link is opened, so whoever opens it is someone who can read that mailbox. Without mail, the person who made the invitation passes the link on.
- "Forgot your password" sends a reset link to the address. The owner of an address can use it to take back an account someone else made with it: using the link sets a new password and signs out every session of the account. Without mail, the page tells people to ask.

What it does not change: an account made by signing up is not marked as checked, and an app sees the address as the person gave it, in lower case.

Without mail, an app that shows a person the rows that carry their email address shows them to whoever signed up with it. Whether or not you set up mail, do not key an app's rules, or a script's or a flow's decisions, on an end user's email address when people sign themselves up. Make the end users yourself instead, by inviting them from the console (see [Invite end users](../../../administer/how-to/access/invite-end-users)), or have them sign in through an identity provider of end users, which refuses an email its provider says is not verified. Rules that name a person by their ID, a group or an attribute you set are not affected.

## Try mail without a server

`MAIL_CAPTURE_DIR=/some/folder` writes each message the instance would send to a file there (`To:`, `Subject:`, then the text), readable, and sends nothing. It overrides `SMTP_URL`, and **Instance**, then **Health**, says "Written to files, for development". The instance warns in its log when it starts. It is for development and tests, never for an instance people use: the files hold one-time links. The Compose file does not pass `MAIL_CAPTURE_DIR`, so use it on an instance you start another way.

## If it does not work

- **Invitations are not arriving.** Check `SMTP_URL`, `MAIL_FROM` and the instance's log, which names the address that could not be sent to.
- **The log says "MAIL_CAPTURE_DIR is set: mail is written to files there and nothing is sent. For development only".** Remove `MAIL_CAPTURE_DIR`.
- **A tenant's flow cannot send mail.** That is the tenant's `smtp` connection, not this setting.

Related: [Settings](../../reference/settings).
