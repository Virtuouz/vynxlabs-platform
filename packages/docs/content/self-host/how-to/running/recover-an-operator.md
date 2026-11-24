---
title: Recover an operator who is locked out
description: "Enable an account, make it an operator admin and set a new password from the host, for an instance with no operator who can sign in."
subjects: [emergency]
---

## Recover an operator who is locked out

By the end one account is an enabled operator admin with a password only you know, and every earlier sign-in of that account has ended. This was run on a Compose stack.

## Before you start

- You can run a command in the instance's image, with the instance's environment, on the machine. This is the operator's own way back: nothing in the console does it.
- The account already exists. The command makes no account.

## Recover

:::steps
1. Run the command, with the account's email:

   ```bash
   docker compose -f deploy/compose/compose.yaml run --rm --no-deps -T control-plane \
     node dist/main.js recover-operator ops@example.com
   ```

   From a source checkout, `node apps/control-plane/dist/main.js recover-operator <email>`.
2. Read the password it prints. It is shown once:

   ```text
   ops@example.com is an enabled operator admin. Its password is now: <24 characters>
   Sign in with it and change it. Every earlier sign-in of that account has ended.
   ```

3. Sign in with it and change the password.
:::

## The result

The account is enabled, holds the operator admin role at the instance, and has a new random password. Its sessions are over: in the run, the old session answered 401 and the old password was refused. The change is audited.

## If it does not work

- **"Recovery failed: No account on this instance has the email ..."** Exit status 1. Check the spelling. The email is compared in lower case.
- **"Say whose account: node dist/main.js recover-operator <email>"** Exit status 2. No email was given.
- **The instance has no members at all.** Use the first-start settings instead: set `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_PASSWORD` and restart. See [Install an instance with Compose](install-with-compose).

Related: [the commands](../../reference/running/commands), [Operators screen](../../reference/console/operators).
