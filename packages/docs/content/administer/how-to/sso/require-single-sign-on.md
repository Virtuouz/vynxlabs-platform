---
title: Require single sign-on
description: "Turn off passwords for the people a provider covers, know who keeps one, make recovery codes first, and undo it."
subjects: [sso]
---

## Require single sign-on

Requiring a provider turns off passwords for the people it covers. By the end they can only sign in through the provider, and you know how an owner gets back in if the provider breaks.

## Before you start

- You hold `sso:write`. The provider is **on**, and for members it has at least one proved domain.
- You have tried the provider as a person it will cover, so that you know it works.
- Owners of the tenant have made **recovery codes**: see below. The console reminds you of this on a provider of members that is on and not required.

## Make recovery codes

A recovery code lets an owner sign in with their password when the provider is broken. Each owner makes their own.

:::steps
1. Open **Account**. Find **Recovery codes**.
2. Press **Make recovery codes**, or **Make new codes** if you have some. Making new codes ends the old ones: "The codes you have now stop working."
3. Copy the ten codes now. They look like `k3x9q-7mzt2` and are not shown again. Keep them somewhere that does not depend on your organization's sign-in.
:::

Only an owner with a direct `tenant_admin` binding can make codes. Each code works once.

## Require it

:::steps
1. Open **Tenant**, then **Single sign-on**, and open the provider.
2. Press **Require it**. The button is shown only while the provider is on.
3. Read the dialog "Require single sign-on?". For members it says that members with an email in this provider's proved domains can no longer sign in with a password, that their open sessions end now except yours, and that they sign in again with the provider. For end users it says that those in its proved domains, or everyone when there are none, can no longer use a password, and their open sessions end now.
4. Press **Require it**. "Single sign-on is now required." The provider shows the tag **Required**.
:::

## Who keeps a password

| Person | Keeps a password? |
| --- | --- |
| A member with an email in no proved domain of the provider | Yes |
| An operator with an enabled `operator_admin` role at the instance | Yes: a broken provider does not lock the operators out. |
| A person holding another role at the instance | No |
| An end user in a proved domain, or any end user when the provider has none | No |
| API keys | They keep working |

A person who has no password to use is shown "Sign in with <name>. Passwords are turned off for you." when they try to set one.

## Sign in with a recovery code

When the provider is required and broken, an owner opens the sign-in screen, follows **Use a recovery code**, types the email and password and the **Recovery code**, and presses **Sign in with the recovery code**. The code is spent before the password is checked, so a wrong password costs the code: the screen says "That email and password do not match an account. The recovery code was used up by this try; use another code."

## Stop requiring it

Open the provider and press **Stop requiring it**. The people it covers can use a password again. Turning the provider off does the same: **Turn off** asks first, names the domains it covers, and says whether it was required.

## The result

The provider shows **Required**. In the audit log, `identity_provider.enforced` records how many sessions ended.

## If it does not work

| You see | Cause and fix |
| --- | --- |
| **Require it** is missing | The provider is off or paused. Turn it on. |
| A person cannot sign in and the provider is down | An owner uses a recovery code; otherwise an operator can turn the provider off. |
| A person was signed out | Requiring ends the open sessions of those it covers, other than yours. They sign in again with the provider. |
