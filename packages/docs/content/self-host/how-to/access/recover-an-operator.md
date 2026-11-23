---
title: Recover an operator
description: "Get back into an instance when no operator can sign in, with a command run on the machine."
subjects: [access, operators]
---

## Recover an operator

You make an account an operator again, with a new password, when no operator can sign in. It runs on the machine that runs the instance, so it needs no sign-in.

### Before you start

- You can run commands where the instance's `dist/main.js` and its environment (the settings, including the database) are.
- You know the email of an account that exists on the instance. The command does not create accounts: "No account on this instance has the email <email>."

:::steps
1. Run `node dist/main.js recover-operator operator@example.com` with the same environment the instance uses.
2. Copy the password it prints. It is printed once.
3. Sign in at the console with the email and that password, then change the password on **Account**.
:::

### The result

The command enables the account, binds the role `operator_admin` at the instance if it was not, sets a new password, and ends the account's sessions. The audit log records `operator.recovered`. The operator then sees **Instance** in the console.

### If it does not work

- "No account on this instance has the email …": check the address, or add the member first from a tenant.
- If the command cannot connect, its environment is not the instance's: it reads the same settings.

## Related

- [Who runs what](../../explanation/access/who-runs-what).
- [Members and operators](../../reference/console/members).
