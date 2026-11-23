---
title: Why a sign-in is refused
description: "Each reason a single sign-on sign-in is refused, the words the person sees, what it means for the administrator, and where to find it in the audit log."
subjects: [sso]
---

When a sign-in through an identity provider is refused, the person is sent back to the sign-in screen with a line that says why, in words for them. The administrator gets more: the audit log has an entry `sso.refused` with the **reason** and a longer **message** that is never shown to the person. To find them, search the [audit log](../screens/audit-log) for `sso.refused`, open an entry and read **Details**.

## The reasons

The words in the **The person sees** column are those the console's sign-in screen shows a member. An end user who signs in at a tenant's portal sees a page titled "You could not be signed in" with the refusal's own short sentence instead, for example "This account has been turned off." or "There is no account here for you yet. Ask whoever looks after this for one.", and a link "Back to sign-in". The reason is the same.

| Reason | The person sees | What it means, and what to do |
| --- | --- | --- |
| `provider_off` | "That way of signing in is turned off. Ask your administrator." | The provider is off or paused. Turn it on; for an imported tenant, see [Turn the provider on after an import](../../how-to/sso/connect-an-oidc-provider). |
| `provider_error` | "The identity provider did not sign you in. Try again." | The provider answered with an error, or its settings could not be read. The message has the provider's answer, or the address that failed. |
| `invalid_answer` | "The identity provider's answer could not be accepted. Try again, and if it happens again tell your administrator." | The answer failed a check. For SAML: a signature that does not match any certificate listed, a signature with SHA-1 while that is not allowed, a recipient or destination that is not the reply address, or an answer to a request this browser did not make. For OIDC: a token that did not verify. The message says which. |
| `replayed` | "That sign-in was already used. Start again." | A SAML assertion that was already accepted was sent again. |
| `expired` | "That sign-in took too long or was already used. Start again." | No sign-in in progress matched the answer. A sign-in must be answered within 10 minutes, and its last step, back at the address it began at, must take no more than 120 seconds. |
| `no_subject` | "The identity provider did not say who you are. Tell your administrator: the provider's settings need a look." | The provider's answer has no lasting name for the person. For SAML with a transient name ID, set the provider to send a persistent one, or name an attribute under **Subject**. |
| `no_email` | "The identity provider did not send your email address. Tell your administrator: the provider's settings need a look." | No claim held an email. Check the **Email** claim under **Settings**. |
| `email_unverified` | "The identity provider says your email address is not verified. Verify it there, then try again." | The provider sent `email_verified: false`. |
| `domain_not_proved` | "Your email address is not in a domain this sign-in is set up for. Ask your administrator." | A member's email is not in a domain proved for the provider. See [Prove an email domain](../../how-to/sso/prove-an-email-domain). |
| `email_not_trusted` | "Your account is tied to a different identity at the provider. Ask your administrator to untie it." | The person's account is tied to another subject, or an end user with that email exists in a domain that is not proved and the provider's word on emails is not taken. **Untie** the person on the **People** tab. |
| `no_account` | "There is no account here for you yet. Ask your administrator for one." | The person has no account, and **Create people the first time they sign in** is off. |
| `not_in_tenant` | "Your account has not been added here yet. Ask your administrator to add you." | The member exists on the instance and not in this tenant, and the provider does not add people. |
| `disabled` | "Your account has been turned off." | The account was disabled, or the member is suspended in this tenant. |
| `runs_instance` | "Your account runs this instance, and this sign-in does not open it. Use your password, or the instance sign-in." | A tenant's provider does not sign in a person who holds any binding at the instance. |
| `wrong_browser` | "You could not be signed in. Try again." | The sign-in was finished in a browser that did not begin it. It is recorded with that reason and message. |

A reason the screen has no words for shows "You could not be signed in. Try again."

## Limits that decide `expired`

| Limit | Value |
| --- | --- |
| Time to answer a sign-in request | 10 minutes |
| Time for the last step, back at the address the sign-in began at | 120 seconds |
| Clock difference accepted on a SAML assertion | 60 seconds |
| Age of a SAML assertion | 1 hour |
| Size of metadata read | 2 MB |

## Rate limits

Members' sign-in routes accept 60 requests a minute. For end users, a tenant's apps address accepts 30 starts and 300 answers every 60 seconds.

## Related

- [Single sign-on screen](../screens/single-sign-on)
- [Require single sign-on](../../how-to/sso/require-single-sign-on) for lock-out and recovery codes
