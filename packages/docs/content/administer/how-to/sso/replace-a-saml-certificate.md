---
title: Replace a SAML certificate
description: "Read a provider's metadata again, or list a new signing certificate beside the old one, so that a provider can change its certificate without a failed sign-in."
subjects: [saml, sso]
---

## Replace a SAML certificate

A SAML provider signs what it sends with a certificate. When it replaces the certificate, Volvel must know the new one. By the end the provider's certificates are current and sign-in did not stop.

## Before you start

- You hold `sso:write` on the tenant.
- The provider is a SAML provider that is already connected: [Connect a SAML provider](connect-a-saml-provider).

## Read the metadata again

Use this when the provider publishes its metadata at an address, or you have its new file.

:::steps
1. Open **Tenant**, then **Single sign-on**, open the provider and choose **Settings**.
2. Under **Read the metadata again**, fill **Metadata address**, or paste the file into **Or paste the metadata**.
3. Press **Read the metadata**. The dialog "Read the metadata again?" says the sign-in address, the provider's entity ID and the signing certificates are replaced by what the metadata says, and that if the entity ID is another, the ties between people and this provider's sign-ins are removed. Press **Read the metadata**.
4. The message "The metadata was read. The sign-in address and certificates are as it says." appears, and the fields below show the new values.
:::

## Or list both certificates by hand

Use this to change over with no gap: while the provider still signs with the old certificate, list the new one beside it.

:::steps
1. On **Settings**, open **Signing certificates**. It takes one or more certificates in PEM form, each from `-----BEGIN CERTIFICATE-----` to `-----END CERTIFICATE-----`.
2. Add the new certificate under the old one. A provider may hold up to 10.
3. Press **Save** in the bar. Sign-ins signed with either now pass.
4. When the provider has changed over, remove the old certificate and save again.
:::

## What changes the ties

If the **Provider's entity ID** is changed, by hand or by reading metadata that names another, the ties between people and the provider are removed, because a subject is only meaningful to the provider that named it. The dialog says so and the audit log records `identity_provider.links_removed`. The next time each person signs in, they are found by their email again.

## The result

**Signing certificates** lists the certificates in force. A sign-in signed with one of them is accepted.

## If it does not work

| You see | Cause and fix |
| --- | --- |
| The read fails with a message | The address could not be read, or the file is not metadata. Nothing is changed. |
| Sign-ins fail with "The identity provider's answer could not be accepted." after the provider changed over | The new certificate is not listed. List it, with the old one if it still signs. |
