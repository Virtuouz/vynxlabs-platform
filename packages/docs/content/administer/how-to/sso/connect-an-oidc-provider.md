---
title: Connect an OIDC provider
description: "Connect an identity provider that speaks OpenID Connect, try a sign-in before anyone depends on it, and turn it on for the tenant's members or end users."
subjects: [sso]
---

## Connect an OIDC provider

By the end the tenant has a provider that people can use to sign in, tried once and turned on.

## Before you start

- You hold `sso:write` on the tenant. A tenant admin has it. For the optional steps you may also need `binding:write` and `group:write`: see [single sign-on permissions](../../reference/sso/permissions).
- You can register an application at the provider, and you know its **issuer**: the address that serves `<issuer>/.well-known/openid-configuration`.
- The provider's address is reachable from the instance. A private address is refused unless the operator has allowed it with `EGRESS_ALLOW`.
- For members: the email domain of the people, and the right to publish a DNS TXT record there. For end users there is no such need.

## Connect the provider

:::steps
1. Open **Tenant**, then **Single sign-on**, and press **Connect a provider**.
2. Choose **Who signs in through it**: **Members, who use this console** or **End users, who use the tenant's apps**. This cannot be changed later.
3. Leave **Protocol** at **OpenID Connect (OIDC)**. Give the provider a **Name**. It is what the button says: "Sign in with" and the name.
4. Fill **Issuer** and **Client ID**. Fill **Client secret**, or leave it empty for a public client. Press **Connect**. If the issuer cannot be read, the sheet says why and nothing is saved. The provider opens, **Off**.
5. On **Set up**, under **1. Enter these at the provider**, copy the **Redirect address**. At the provider, register an application of the web kind with the authorization code flow, and give it that redirect address. Have it send the email, and a groups claim if you will map groups.
6. Under **2. Try it**, press **Try signing in**. A new tab opens at the provider. Sign in there as one person. The tab says "The provider answered". Close it and press **Show the result** in the console.
7. Read the result. **Subject**, **Email**, **Email verified**, **Name**, **Groups** and **Attributes** are what the provider sent. **Everything the provider sent** shows the raw claims. If **Email** or **Groups** is empty, open **Settings** and set the claim under **Which claims to read**: see [Map claims and groups](map-claims-and-groups).
8. For members, open **Domains** and [prove an email domain](prove-an-email-domain). For end users this is optional.
9. Press **Turn on**. The state is **On**, and a button "Sign in with <name>" is on the sign-in screen.
:::

::screenshot{name=administer/sso-provider-setup alt="A provider's Set up tab: the redirect address to enter at the provider, the sign-in address, and a Try signing in button with the facts the last try read."}

## What a try tells you

A try changes nothing: nobody is signed in and no account is made. It works while the provider is off. It does apply the provider's rules, so it can say "The last try, <time>, did not pass." with a reason, even though the provider answered. The commonest is "The domain of <email> has not been proved for this provider." The facts under it are still the provider's, which is what you need to set the claims.

## Scopes

Under **Settings**, **Scopes** is separated by spaces. A new provider has `openid email profile`. At most 20 may be set, and `openid` is added when it is left out.

## A public client

A provider that issues no client secret works as a public client, and the exchange is protected by PKCE. Leave **Client secret** empty when you connect it. To change an existing provider to that, open **Settings**, check **Remove the stored client secret** and save.

## If the provider's address or secret changes

On **Settings**, changing **Issuer** asks "Change the issuer?". It removes the ties between people and the provider, and the next time each person signs in they are found by email again. A client secret stored for the old address is not sent to the new one: give it again.

## After an import

A provider that came with an imported tenant is **Paused** and signs nobody in. Give the provider's administrator the **Redirect address** shown on **Set up**, which belongs to this instance, prove the domains again, then press **Turn on**.

## The result

The provider is listed with the state **On**. A person signs in with the button on the sign-in screen, and appears on the provider's **People** tab with the time of their last sign-in. They can still use a password until you [require single sign-on](require-single-sign-on).

## If it does not work

| You see | Cause and fix |
| --- | --- |
| The sheet refuses the issuer | The instance could not read `<issuer>/.well-known/openid-configuration`. Check the address, that it is reachable, and that it is public. |
| "Prove at least one email domain before turning this provider on. Members are signed in only by an email in a domain the provider has proved." | A provider of members needs a proved domain. See [Prove an email domain](prove-an-email-domain). |
| A sign-in is sent back with a line | Look it up in [Why a sign-in is refused](../../reference/sso/refusals). |
| The provider says the redirect address is not allowed | The address entered at the provider differs from the **Redirect address** on **Set up**. Copy it again. |
