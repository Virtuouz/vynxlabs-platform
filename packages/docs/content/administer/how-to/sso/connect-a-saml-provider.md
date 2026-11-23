---
title: Connect a SAML provider
description: "Connect an identity provider that speaks SAML 2.0 from its metadata, give it Volvel's side, choose the name ID, try a sign-in and turn it on."
subjects: [sso, saml]
---

## Connect a SAML provider

By the end the tenant has a SAML provider that people can use to sign in, tried once and turned on.

## Before you start

- You hold `sso:write` on the tenant. See [single sign-on permissions](../../reference/sso/permissions).
- The provider publishes its metadata at an address, or you have the metadata file. It is at most 2 MB.
- You can register a service at the provider.

## Connect the provider

:::steps
1. Open **Tenant**, then **Single sign-on**, and press **Connect a provider**.
2. Choose **Who signs in through it**, and under **Protocol** choose **SAML 2.0**. Give the provider a **Name**.
3. Fill **Metadata address**, or paste the file into **Metadata**. A pasted file is used instead of the address. Press **Connect**. The sign-in address, the provider's entity ID and its signing certificates are read from the metadata. The provider opens, **off**.
4. On **Set up**, under **1. Enter these at the provider**, find **Reply address (ACS)**, **Entity ID (audience)** and **Metadata address**. If the provider can read metadata, give it the **Metadata address**. Otherwise enter the other two.
5. At the provider, have the service send three things: a name ID that lasts, the email, and the groups if you will map them. The name the provider calls an attribute is what you will type under **Which claims to read**. The usual names are tried when a field is empty: `email` or `mail` for the email, `name` or `displayName` for the name, and `groups` or `memberOf` for the groups.
6. Open **Settings**. Under **Name ID format**, choose **Persistent** if the provider can send one, or **Email address** if it has no lasting one. Leave **Sign the requests sent to the provider** on unless the provider will not read signed requests. Press **Save** in the bar.
7. Back on **Set up**, press **Try signing in**, sign in at the provider in the new tab, close it and press **Show the result**. **Subject** must be a value that is the same each time the person signs in.
8. For members, [prove an email domain](prove-an-email-domain). Then press **Turn on**.
:::

## Name ID and subject

By default the person's lasting name, their **Subject**, is the name ID. A **Transient** name ID is a new one at every sign-in, so it cannot tie a person to the provider: the sign-in is refused with "The identity provider did not say who you are in a way that lasts." Either set the provider to send a persistent name ID, or name an attribute under **Which claims to read**, **Subject**.

## Signing, encryption and SHA-1

| Setting | Default | Use |
| --- | --- | --- |
| **What must be signed** | **The assertion or the whole response** | Narrow it to **The assertion**, **The whole response** or **Both** if you want to require one. |
| **Sign the requests sent to the provider** | On | The provider verifies requests with the certificate in the metadata. |
| **Ask the provider to encrypt assertions** | Off | Publishes a certificate of Volvel's in the metadata for the provider to encrypt to. The provider must wrap the key with RSA-OAEP with MGF1 and the SHA-1 digest. Keycloak's defaults differ: set both on its client. |
| **Accept SHA-1 signatures** | Off | Weak. Only for a provider that cannot sign with SHA-256. Turning it on is written to the audit log. |
| **Accept sign-ins the provider begins** | Off | For a tile on the provider's own start page. Such a sign-in answers no request of ours. Turning it on is written to the audit log. |

A SAML answer is accepted for 1 hour after the provider made it, with 60 seconds of difference between the clocks, and only once. The sign-in request must be answered within 10 minutes.

## The result

The provider is on, and its **Sign-in address** (on **Set up**) opens its sign-in directly: use it for a tile in the provider's app list or a bookmark. It works once the provider is on.

## If it does not work

| You see | Cause and fix |
| --- | --- |
| The sheet refuses the metadata | The address could not be read, or the file is not metadata or is over 2 MB. |
| "The identity provider's answer could not be accepted." in the sign-in, and the audit log says the signature or the recipient is wrong | The certificate listed does not match the one the provider signs with, or the provider sends to another reply address. Replace the certificate: [Replace a SAML certificate](replace-a-saml-certificate). Check the **Reply address (ACS)** at the provider. |
| The audit log says the signature "is too weak" | The provider signs with SHA-1. Set it to sign with SHA-256, or turn on **Accept SHA-1 signatures**. |
| "Prove at least one email domain before turning this provider on." | A provider of members needs a proved domain. |

Other reasons are in [Why a sign-in is refused](../../reference/sso/refusals).
