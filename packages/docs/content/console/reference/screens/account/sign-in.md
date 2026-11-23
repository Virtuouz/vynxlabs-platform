---
title: Sign-in screen
description: "Every step, button, state and message of the console's sign-in screen, the password link a member opens, and the dialog that says your session ended."
subjects: [sign-in, account]
---

The sign-in screen is what the console shows to a person who is not signed in. It has two steps, **Email** and **How you sign in**, shown as a list at the top of the card. The card names the product and "Console", and the line under it shows the address of the instance. Anyone may open it; nobody can make an account on it. A member is made by an administrator.

Signing in works only at the instance's main address. An app has its own sign-in at its own address, which is not this screen. For the steps, see [Sign in](../../../../start/how-to/basics/sign-in).

::screenshot{name=console/basics-sign-in alt="The sign-in card at its first step, with an Email field and a Continue button."}

## Step 1: Email

| Control | What it does |
| --- | --- |
| **Email** | The address you sign in with. |
| **Continue** | Asks the instance how this address signs in; the button reads "Checking…" while it asks. Nothing is sent to you. |

The text under the form says "We check which ways of signing in your address has. Nothing is sent to you yet." The check is by the address's domain alone, so it says nothing about whether the person exists. If the check fails, the screen says "We could not check how this address signs in. {reason} Press Continue to try again." and does not fall back to a password form.

## Step 2: How you sign in

The step shows your address with **Change**, which goes back and forgets the password and any recovery code. What else it shows depends on how the address signs in.

| Control | When | What it does |
| --- | --- | --- |
| **Sign in with {provider}** | The domain has an identity provider. One for each provider. | Leaves for the provider's sign-in. The console page you were on, or the `return` address of an app, comes back with you. |
| **Password** with **Show what you typed** / **Hide what you typed** | A password may be used. | The field, and a button that shows or hides what you typed. |
| **Sign in** | A password may be used and there is no provider. | Signs in with the password. |
| **Sign in with a password** | A password may be used and there is a provider. | The same, as a second choice under the provider's button. |
| "Your organization requires its own sign-in. There is no password to enter here." | No password may be used. | A sentence in place of the password. |
| **Use a recovery code** | No password may be used. | Shows **Recovery code** (hint "One of the codes you made on your account page. It works once, even if the password is wrong.") and **Password**, and the button **Sign in with the recovery code**. |
| **Back to your organization's sign-in** | In the recovery form. | Goes back. |

The text at the foot says "Use the account your administrator created for you, or your organization's sign-in."

## Messages

| Message | When |
| --- | --- |
| "That email and password do not match an account." | A wrong password, an address with no account, or an account that is turned off. They read the same on purpose. |
| "That email and password do not match an account. The recovery code was used up by this try; use another code." | A recovery code was offered with a wrong password. The code is spent. |
| "That recovery code is not right, or was already used. Each code works once." | The code does not match an unused code of the account. |
| The server's own words | Any other refusal, for example a limit: sign-in is limited to 20 attempts a minute from one address. |

When single sign-on sends you back with a reason, a red notice shows it and the reason is taken out of the address so a reload does not show it again. There are fourteen:

| Reason | The notice |
| --- | --- |
| Provider turned off | "That way of signing in is turned off. Ask your administrator." |
| Provider error | "The identity provider did not sign you in. Try again." |
| Invalid answer | "The identity provider's answer could not be accepted. Try again, and if it happens again tell your administrator." |
| Replayed | "That sign-in was already used. Start again." |
| Expired | "That sign-in took too long or was already used. Start again." |
| No subject | "The identity provider did not say who you are. Tell your administrator: the provider's settings need a look." |
| No email | "The identity provider did not send your email address. Tell your administrator: the provider's settings need a look." |
| Email not verified | "The identity provider says your email address is not verified. Verify it there, then try again." |
| Domain not proved | "Your email address is not in a domain this sign-in is set up for. Ask your administrator." |
| Email not trusted | "Your account is tied to a different identity at the provider. Ask your administrator to untie it." |
| No account | "There is no account here for you yet. Ask your administrator for one." |
| Not in a tenant | "Your account has not been added here yet. Ask your administrator to add you." |
| Account off | "Your account has been turned off." |
| Runs the instance | "Your account runs this instance, and this sign-in does not open it. Use your password, or the instance sign-in." |
| Any other reason | "You could not be signed in. Try again." |

## After signing in

A session lasts 7 days. A password has at least 12 characters. A console page you were on when you were asked to sign in is not lost for single sign-on: the provider's link carries it. After the sign-in the console follows a `return` address only when it begins with `/apps/`, `/portal/` or `/api/v1/app-handoffs/start`, so a link cannot send you to another site. Opening the console at `/` takes you back to where you were last (see [Your tenants](../home/tenants)).

## The password link

A member whose password was reset gets a link to `/reset-password/{token}`. It needs no sign-in: the link is the member's own. Opening it changes nothing.

| Part | What it shows |
| --- | --- |
| Heading | **Choose a new password**, with "For {email}. The link works once, until {time}. Choosing a password signs you out everywhere else." |
| **New password** | At least 12 characters, hint "At least 12 characters." |
| **New password again** | "The two do not match." when they differ. |
| **Set password** | Sets it. The page then says **Your password is set**: "Every other sign-in you had has ended. Sign in with the new password." with **Go to sign in**. |
| A link that was used, or ran out | **Nothing to set here**: "This link has been used or has run out. Ask the person who gave it to you for a new one." with **Go to sign in**. |

A link works once and runs out two hours after it was made. A tenant admin with `member:write` makes it for a member of that tenant who belongs to no other, and an operator makes it for any member; it is mailed where the instance sends mail and otherwise shown once to the person who made it. It is not made for a member who signs in only through an identity provider.

## Your session ended

When the server refuses a request because the session is over, a dialog opens over the page: **Your session ended**, "Sign in again as {email} to carry on. Nothing on this page was lost." It cannot be dismissed.

| Control | What it does |
| --- | --- |
| **Sign in with {provider} in a new tab** | For an address with a provider. Sign in there, then return to this tab; the page carries on when it regains focus. |
| **Password** and **Sign in** | For an address that may use a password. A wrong password says "That password does not match this account." |
| "Your organization requires its own sign-in. Come back to this tab once you have signed in there." | For an address with no password. |

If the same person signs in again, the page resumes with what was typed kept, and what waited is asked again. If another person signs in, the page reloads clean for them. A page that only listens for live events notices the end of the session at its next request.

## Permissions

None. The screen is open to anyone who can reach the instance's main address. Who may sign in is decided by the account: it exists and is on, and its domain's rules allow a password or require a provider.

## Related

- [Sign in](../../../../start/how-to/basics/sign-in): the steps, a forgotten password and a recovery code.
- [Your account](account): change your password, end sessions, make recovery codes.
