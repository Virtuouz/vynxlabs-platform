---
title: Provision people with SCIM
description: "Give an identity provider a SCIM address and a token so that it creates, updates and turns off people here without waiting for them to sign in."
subjects: [scim, sso]
---

## Provision people with SCIM

A provider can push the people and groups it holds, and say when one has left. By the end the provider has the address and a token, and you can see what it pushed and what was refused.

## Before you start

- You hold `sso:write`. A provider is connected: [Connect an OIDC provider](connect-an-oidc-provider) or [Connect a SAML provider](connect-a-saml-provider). It does not need to be on: a provider that is off still takes pushes. Only a paused provider does not.
- The provider can push over SCIM 2.0 with a bearer token.
- For members, the domain of the people's email is proved.

## Steps

:::steps
1. Open **Tenant**, then **Single sign-on**, open the provider and choose **Provisioning**.
2. Copy the **SCIM base address** with **Copy the address**. Give it to the provider as its SCIM 2.0 base address.
3. Press **Make a token**. Give it a **Name** after what will use it, and choose when it expires: **Never**, **In 30 days**, **In 90 days** or **In a year**. Press **Make the token**.
4. Copy the token now. "Copy the token now: it is not shown again." Give it to the provider as its bearer token. A token begins `vxp_`.
5. Under **How pushes are taken**, choose **The name the provider signs a person in by is pushed as**. With **externalId** or **userName**, a pushed person is tied to the provider at once, so their first sign-in finds them. The value must be the very value a sign-in gives as the subject, or the name ID. With **Not pushed**, each person is tied at their first sign-in, by email.
6. For a provider of a tenant, choose **A person's groups come from**. **What each sign-in says** is the default. With **The groups the provider pushes**, you may also check **Make a group here for each pushed group that nothing maps yet**. The **Groups** tab still says which of the provider's groups is which group here.
7. Press **Save** in the bar. "Saved how pushes are taken."
8. Have the provider push. The facts under **What has been pushed** change: **People**, **Of them, turned off**, **Groups** and **Last change**. **People pushed** lists each person with their state.
:::

## What a push does

| The provider | Here |
| --- | --- |
| Pushes a person | An end user's account is made or found. A member's account is found or made, and the person is added to the tenant with the provider's default role. The email must be in a proved domain for members. |
| Turns a person off, or deletes them | An end user is disabled. A member is suspended in this tenant. For the instance's own provider the account is disabled everywhere. An account is never deleted. |
| Turns a person on again | A person turned off by the provider is turned on. One that someone here turned off by hand stays off. |

A member's email and name do not follow a later push; an end user's do. A directory that pushes keeps pushing while the provider is off. The full protocol is in the [SCIM reference](../../reference/sso/scim).

## Revoke a token

Press **Revoke** in the token's row. "Revoke the token "<name>"?" says pushes made with it are refused from now on and what was pushed stays as it is. The row's **Status** shows **expired** after its expiry, and the token is refused.

## The result

The people appear on the provider's **People pushed** list, and, once they sign in, on **People**. The audit log has `scim.user_pushed`, `scim.user_changed`, and `scim_token.created` entries.

## If it does not work

A push the provider could not make is under **Refused pushes**, with the push, the answer and the reason, and is kept for as long as [retention](../../reference/screens/retention) keeps **Refused requests**. Nothing a refused push carried is kept: fix it at the provider and push again.

| The answer | Cause and fix |
| --- | --- |
| 401 "The token is not valid for this address." | A wrong, revoked or expired token, or another provider's. Make a new one. |
| 403 "This provider is paused. Save it again in the console before pushing to it." | The provider came with an imported tenant. Turn it on, or save its settings. |
| 400 "A user needs an email address: a work email, or a userName that is one." | The provider did not push an email. |
| 409 "An end user … exists, and this provider may not take the account over." | The domain is not proved, and **Take the provider's word on emails** is off. |
| 403 "… runs the instance, and a tenant's directory cannot push them." | A person who holds access at the instance cannot be pushed by a tenant's provider. |
