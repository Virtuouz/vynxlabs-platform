---
title: How a hostname is proved
description: "Why a DNS record shows that the owner of a name agrees, why one record serves a hostname and an email domain, why Volvel issues no certificate, and what a name that is not served here means."
subjects: [domains, hostnames]
---

A tenant can serve its apps on names of its own, and can have single sign-on believe emails in a domain of its own. Both need Volvel to be sure that the person asking controls the name. This page says how that is decided, and what Volvel leaves to you.

## The idea

Anyone can type a name into the console. If Volvel served `bank.example` for whoever asked first, one tenant could take another's name, or an attacker could have an app answer for a name it does not own. So a name is served only once its owner has agreed, and the only thing an owner can do that nobody else can is change that name's DNS.

For each name Volvel works out a **record**: a TXT record at `_vx-challenge.<name>` with a value that begins `vx-domain=` and holds 40 hexadecimal characters. The value is a keyed hash of the tenant and the name, made with a secret of the instance. Only this tenant, on this instance, gets this value for this name. Publishing it says: whoever controls this name agrees that this tenant uses it. **Check now** asks DNS for the record. If it is there, the name is **Verified**.

One record serves both a hostname and an email domain, because both say the same thing about the same name. If the instance's secret is changed, every record changes, and names must be proved again.

## What verified means, and what it does not

A name is checked when you ask. If the record is removed afterwards, the name stays verified. The screen then says "Verified, record gone" for a hostname and "Proved <time>; record gone since <time>" for a domain, and the audit log records `identity_domain.record_gone` once. Nothing is turned off: the record was the proof at the time, and removing a record by accident should not take an app down. Publishing it again and checking clears the notice.

A hostname is also **enabled** or not. Verified and enabled serves. Verified and disabled answers "not served here". A name that is not verified and not enabled is left as it was: the name opens the instance's own address, as any name the instance does not know does. A name is unique only while it is verified or enabled, so a tenant that typed a name it does not own does not keep the real owner out.

An operator of the instance may enable a name that is not verified, for a name that exists only inside a network and cannot be checked from outside.

## What Volvel does not do

Volvel does not change DNS, and does not issue a certificate. You point the name at the instance with a CNAME or an address record, and whatever ends TLS in front of the instance holds the certificate for the name. This is a decision, not a gap: where TLS ends, and who holds certificates, is for the operator and the tenant. Other replicas of the instance learn of a change within 30 seconds.

## How it fits

The steps are [Serve an app on your own hostname](../../how-to/sso/serve-an-app-on-your-own-hostname) and [Prove an email domain](../../how-to/sso/prove-an-email-domain). The screen is [Domains](../../reference/screens/domains).
