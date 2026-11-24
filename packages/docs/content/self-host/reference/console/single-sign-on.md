---
title: Single sign-on for operators
topic: instance-single-sign-on
description: "Every control and state of the instance's Single sign-on screen, which signs operators and other instance-level members in through an identity provider, and how it differs from a tenant's."
subjects: [sso, operators]
moved_from:
  - instance/single-sign-on
---

The instance's **Single sign-on** screen connects an identity provider for the people who run the instance. A tenant connects its own provider under its settings; see the [tenant's Single sign-on screen](../../../administer/reference/screens/single-sign-on). The screen is under **Instance**, and F1 opens the help topic `instance-single-sign-on`.

It is the same screen as the tenant's, with these differences:

| On the tenant's screen | On the instance's |
| --- | --- |
| **Who signs in through it**: members or end users | Absent. A provider is for members. |
| Domains need a DNS record | Domains need no proof: "The email domains this provider signs in. As the instance's operator you answer for them, so no proof is asked." Adding one says "<domain> is added. It needs no proof here." and it is **Proved** at once. |
| **Groups** tab and the **Map groups** step | Absent. Groups of members belong to a tenant. |
| **Role given to a new member** | Absent. A provider here gives no role: "A person made here has no access until an operator gives it, one person at a time." |
| **Provisioning** shows **Groups** and the choice of where groups come from | Shows neither. A person the provider turns off has their account disabled everywhere: their sessions end and their API keys stop working. |
| Needs `sso:write` | Needs `instance:write` |

The description under the title is "Identity providers for the people who run this instance. A tenant connects its own under its settings." The empty state is "No identity providers".

## What a provider here can and cannot do

- It signs in people who already have an account, and, if **Create people the first time they sign in** is on, makes one for a person it has not seen. That person has no access.
- It does not give anyone the operator role. A person holds it only when an operator gives it.
- Requiring it affects members whose email is in its domains. The operators of the instance keep their passwords and sessions, so a broken provider does not lock everyone out. See [Require single sign-on](../../../administer/how-to/sso/require-single-sign-on).
- A person who is refused here sees the words of [Why a sign-in is refused](../../../administer/reference/sso/refusals). An unknown email gives "There is no account here for you yet. Ask your administrator for one."

## Permissions

| Action | Needs |
| --- | --- |
| See the providers | `instance:read` |
| Everything else on the screen | `instance:write` |

Without it the screen says "You can see this provider, not change it. It needs `instance:write`."

## Related

- [Connect an identity provider for operators](../../how-to/sso/connect-an-identity-provider-for-operators)
- [Operators](operators)
