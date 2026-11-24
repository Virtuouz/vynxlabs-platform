---
title: Sign in to the console
description: "Sign in with a password, with your organization's sign-in or with a recovery code, sign out, and what to do when you cannot get in."
subjects: [sign-in, account]
---

## Sign in to the console

By the end you are in the console, and you know how to leave it and what to do when a sign-in fails.

## Before you start

- A member account on the instance. Nobody makes their own: an administrator adds you, and the instance has no sign-up. Without one, ask the administrator of your tenant, or an operator of the instance.
- The instance's main address. Signing in works only there. An app has its own sign-in at its own address, which this page does not cover.
- To try it on the seeded Fernhill example, use `maya.brooks@fernhill.example` and the password `fernhill-demo-2026`.
- Fernhill is set up: see [Set up the Fernhill example](../../../start/how-to/example/set-up-the-fernhill-example).

## Sign in

:::steps
1. Open the console. The card says **Sign in** and shows the steps **Email** and **How you sign in**.
2. Type your address in **Email** and press **Continue**. The button reads "Checking…" while the instance looks at your address's domain. Nothing is sent to you.
3. Sign in the way the card offers.
   - With a password: type it in **Password** and press **Sign in**. The eye button, named **Show what you typed**, shows what you typed.
   - With your organization's sign-in: press **Sign in with** and the provider's name, and sign in there. You come back to the console, to the page you were on when you were asked.
   - Where both are offered, the provider's button comes first and the password button reads **Sign in with a password**.
4. The console opens. When you open the root address and have been somewhere before, it takes you back to the last workspace overview, or to the tenant, you were in. Otherwise it shows your list of tenants.
:::

To correct the address, press **Change**.

## Sign out

:::steps
1. Open the account menu, the round button with your initial at the foot of the rail (in the phone's menu drawer, beside your email), and choose **Sign out**.
2. If a screen has changes you have not saved, the console asks "Leave without saving?" first. Choose **Stay** to go back and save, or **Leave**.
3. The console shows the sign-in card. Signing out also clears this browser's copy of your settings, your pins and what it had read. The instance keeps your settings, and they come back when you sign in again.
:::

## If you forgot your password

A member cannot reset their own password from the sign-in card. Someone else makes a one-time link:

- A tenant admin, who needs `member:write` on the tenant, makes it under **Members & access**: choose the member, and press **Make a password reset link** in the inspector. It works for a member who belongs to that tenant and to no other.
- An operator makes it for any member in a row of **All members** under **Instance**.

The link is emailed to you where the instance sends mail. Where it does not, the person who made it is shown it once and passes it on. Open it, choose a new password of at least 12 characters twice and press **Set password**. The link works once and runs out two hours after it was made. Choosing a password ends your other sign-ins. It is refused for a member whose password is turned off because their organization's sign-in is required: their password lives there.

An operator who cannot sign in at all, with no other operator to ask, is helped from the command line of the instance: `recover-operator <email>` turns that account on, makes it an operator admin and prints a new password once. Every earlier sign-in of that account ends.

## If your organization's sign-in is broken

When your organization requires its own sign-in, the card says "Your organization requires its own sign-in. There is no password to enter here." A tenant admin can have made recovery codes beforehand, on the **Account** screen under **Recovery codes**, for this day.

:::steps
1. After **Continue**, press **Use a recovery code**.
2. Type your **Password** and the **Recovery code**, one of the ten like `k3x9q-7mzt2` you kept.
3. Press **Sign in with the recovery code**. You are in. Put the sign-in right, then make new codes.
:::

A recovery code works once, even if the password is wrong: a wrong password with a valid code still spends the code, and the card says so. Only a person who holds the `tenant_admin` role over a tenant can make codes, and they must make them while they can still sign in. People who run the instance keep their passwords while their organization's sign-in is required, so they do not need codes. **Back to your organization's sign-in** returns to the provider's button.

## The result

You are signed in for 7 days on that browser. **Account** lists the sessions you have and lets you end the others.

## If it does not work

| You see | Because | Do this |
| --- | --- | --- |
| "That email and password do not match an account." | The password is wrong, the address has no account, or the account is turned off. The three read alike on purpose. | Check the address and the password. Ask an administrator whether the account is on. |
| "We could not check how this address signs in. … Press Continue to try again." | The instance did not answer the first step. | Press **Continue** again. |
| "That recovery code is not right, or was already used. Each code works once." | The code is wrong or spent. | Use another code. |
| "That email and password do not match an account. The recovery code was used up by this try; use another code." | The code was right and the password was wrong. | Use another code, with the right password. |
| "Too many requests. Please try again later." | Sign-in is limited to 20 attempts a minute from one address. | Wait a minute. |
| A red notice such as "There is no account here for you yet. Ask your administrator for one." | Single sign-on sent you back with a reason. | The [sign-in screen reference](../../../console/reference/screens/account/sign-in) lists all fourteen with what to do. |
| "You could not be signed out. Check your connection and try again." | The sign-out request failed. | You are still signed in. Try again when the connection is back. |
| The dialog **Your session ended** over a page | Your session is over (7 days, or ended from another browser). | Type your **Password** in the dialog and press **Sign in**; the page keeps what you typed. A wrong password says "That password does not match this account." |
