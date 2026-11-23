---
title: Serve an app on your own hostname
description: "Register a hostname such as portal.example.com, point it at the instance, prove you control it with a TXT record, enable it, and change or remove what it serves."
subjects: [domains, hostnames]
---

## Serve an app on your own hostname

By the end a name of your own opens an app, or the portal and every app of a workspace.

## Before you start

- You hold `domain:write`. A tenant admin has it.
- You can create DNS records for the name, and something in front of the instance ends TLS for it. Volvel issues no certificate, and whatever ends TLS must hold one for the name.
- For one app: the workspace has the app deployed.

## Steps

:::steps
1. Open **Tenant**, then **Domains**, and press **Add a hostname**.
2. Choose the **Workspace**. Under **Serves**, choose **One app, at the hostname's root** and then the **App**, or **The portal, and every app by its path**. Type the **Hostname**: the name alone, with no `https://` and no path. Press **Add hostname**.
3. The hostname's sheet opens, **off** and not verified. Under **1 · Point the name here**, create a CNAME or an address record from the name to the instance.
4. Under **2 · Show the name agrees**, copy the **Record name** (`_vx-challenge.<hostname>`) and **Record value** (`vx-domain=` and 40 characters). Create a TXT record with them.
5. Wait for DNS, then press **Check now**. When the record is found the state is **verified**, and "Passed <time>" is shown.
6. Press **Enable**. The step **Enabled** says "Serving." The name opens the app.
:::

::screenshot{name=administer/sso-domains-details alt="A hostname's details sheet: what it serves, the three steps, the TXT record name and value to publish, and the Remove, Enable and Check now buttons."}

## Change what it serves

Open the hostname from the list with **Details**. Under **What it serves**, change **Serves** or **App**, and press **Change what it serves**. It works while the hostname is on. You need not remove it.

## Turn it off or remove it

**Disable** stops the hostname answering: the app is no longer served there, and sign-ins made at that hostname end. The record stays and the name stays verified; a hostname that is verified and off answers "not served here". **Remove** deletes the hostname and also ends those sign-ins.

## A name that exists only inside a network

DNS from outside cannot show a record for a name that exists only inside your network. **Enable** is then refused: "This hostname is not verified yet, so it cannot be enabled." An operator of the instance, who holds `instance:write`, may enable it. After that the tenant can enable and disable it as usual.

## The result

The list shows the hostname **on** and **verified**, and the name opens the app or the portal. Other replicas of the instance follow within 30 seconds.

## If it does not work

| You see | Cause and fix |
| --- | --- |
| "No TXT record _vx-challenge.<hostname> with the value vx-domain=… was found." | The record is missing, not yet carried by DNS, or has another value. |
| "This workspace has no apps. Deploy one first, or choose another workspace." | Choose another workspace, or serve the portal. |
| The name opens the instance's own address | The name is not verified, or not enabled. A name the instance does not know opens its own address. |
| "Verified, record gone" | The record was removed after it was proved. The name still serves. Create it again and check. |
| A browser warning about the certificate | Whatever ends TLS in front of the instance does not hold a certificate for the name. Volvel issues none. |
