---
title: Prove an email domain
description: "Show that your organization controls an email domain with a DNS TXT record, so that a provider of members may sign in people with an email in it."
subjects: [sso, domains]
---

## Prove an email domain

A provider of members signs in only people whose email is in a proved domain. By the end the domain is **Proved** and the provider can be turned on.

## Before you start

- You hold `sso:write`, and a provider is connected.
- You can create a DNS record in the domain. DNS must carry the record before the check passes, which can take time.
- A domain of members can be proved for one provider on the whole instance. If another provider of members has proved it, adding it is refused: "Another provider of members has already proved <domain>. A domain of members belongs to one provider on the whole instance."

## Steps

:::steps
1. Open **Tenant**, then **Single sign-on**, open the provider and choose **Domains**.
2. Type the domain in **Email domain**, for example `example.com`, and press **Add domain**. The message says "Prove it is yours with the record shown."
3. The domain shows **Not proved** with a **Record name** and a **Record value**. The name is `_vx-challenge.<domain>` and the value is `vx-domain=` and 40 hexadecimal characters. Copy each.
4. Where the domain's DNS is managed, create a TXT record with that name and value.
5. Wait for DNS to carry it, and press **Check now**. If it is found, the domain turns **Proved**.
:::

## The result

The domain shows **Proved**, and the step **Prove domains** on the steps bar says "Proved". You can turn the provider on.

## What a proved domain means

Proving is how Volvel decides to believe an email. A member is signed in only by an email in a proved domain. For end users the provider is optional: with no proved domain, an end-user provider that is required covers everyone, and with some it covers only those domains.

The record is derived from the instance's secret, the tenant and the name, so no other tenant can use yours. See [How a hostname is proved](../../explanation/sso/how-hostnames-are-proved).

## If the record is later removed

A proved domain stays proved after its record is removed. The domain then shows "Proved <time>; record gone since <time>", and the audit log records `identity_domain.record_gone` once. Nothing stops: the domain still signs people in. Create the record again and press **Check now** to clear it.

## Removing a domain

**Remove** asks first. People already tied to the provider still sign in. Nobody new in the domain will. If it was the last proved domain of a provider of members, the provider is turned off and no longer required.

## If it does not work

| You see | Cause and fix |
| --- | --- |
| "No TXT record _vx-challenge.<domain> with the value vx-domain=… was found." | The record is not there yet, or has another value. DNS may take time. Check the name, and that the value is exactly as shown. |
| **Check now** is missing | A proved domain has no record to check. |
| "Prove at least one email domain before turning this provider on." | Prove a domain first. |
