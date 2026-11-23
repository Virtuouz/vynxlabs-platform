---
title: Connect an identity provider for operators
description: "Connect an identity provider for the people who run the instance, add its email domains, try it and turn it on, and know what it does not give."
subjects: [sso, operators]
---

## Connect an identity provider for operators

By the end the people who run the instance can sign in through your organization's provider. It signs in people who have an account, and gives none of them a role.

## Before you start

- You are an operator and hold `instance:write`.
- You can register an application at the provider. The steps at the provider are those of [Connect an OIDC provider](../../../administer/how-to/sso/connect-an-oidc-provider) or [Connect a SAML provider](../../../administer/how-to/sso/connect-a-saml-provider).

## Steps

:::steps
1. Open **Instance**, then **Single sign-on**, and press **Connect a provider**. There is no choice of who signs in: a provider here is for members.
2. Choose the protocol, name it, fill the issuer and client or the metadata, and press **Connect**.
3. Enter the addresses of **Set up** at the provider and press **Try signing in**.
4. Open **Domains**, type each email domain of your people and press **Add domain**. "<domain> is added. It needs no proof here." Each is **Proved** at once: as the instance's operator you answer for them.
5. Open **Settings**. Decide **Create people the first time they sign in**: off, only people who already have an account sign in; on, a person made by a sign-in has no access until an operator gives it.
6. Press **Turn on**.
:::

## What it does not do

- It gives no role. A provider here has no **Role given to a new member**. An operator gives access to each person one at a time.
- It does not give anyone the operator role. Nothing but a binding made by an operator does.
- It has no **Groups** tab.

## Require it

**Require it** ends passwords for the people with an email in its domains, and ends their open sessions except yours. The operators of the instance keep their passwords and sessions: a person with an enabled `operator_admin` role at the instance keeps a password, so that a broken provider does not lock everyone out. A person with another role at the instance does not.

## The result

The provider is listed with the state **on**. A person whose email is in a domain, with an account, signs in with its button. A person with no account sees "There is no account here for you yet. Ask your administrator for one."

## If it does not work

See [Why a sign-in is refused](../../../administer/reference/sso/refusals). The screen's controls are in [Single sign-on for operators](../../reference/console/single-sign-on).
