---
title: Serve an app on your own hostname
description: "Register a hostname such as portal.example.com, point it at the instance, prove you control it with a TXT record, enable it, and change or remove what it serves."
subjects: [domains, hostnames, apps]
---

## Serve an app on your own hostname

By the end a name of your own opens an app, or the portal and every app of a workspace.

## Before you start

- You hold `domain:write`. A tenant admin has it. Without it the **Domains** screen says "You can see this tenant's hostnames, not change it" and **Add a hostname** is grayed out.
- You can create DNS records for the name, and something in front of the instance ends TLS for it. Volvel issues no certificate, and whatever ends TLS must hold one for the name.
- For one app: the workspace has the app deployed. A workspace with no apps offers none: "This workspace has no apps. Deploy one first, or choose another workspace."
- The name is not one of the instance's own addresses. A name is also held by one tenant at a time, once it is verified or on.

## Steps

:::steps
1. Open **Tenant**, then **Domains**. The table lists each hostname with what it **Serves**, its **State** and its **Last check**. Press **Add a hostname**.
2. Choose the **Workspace**. Under **Serves**, choose **One app, at the hostname's root** and then the **App**, or **The portal, and every app by its path**. Type the **Hostname**: the name alone, with no `https://` and no path, such as `desk.example.com`. The first workspace in the list is chosen for you. For the portal, the sign-in pages and the list of apps are at the root, and each app of the workspace is at `/its-path/`. Press **Add hostname**.
3. The hostname's sheet opens, **Off** and **Not verified**. Under **1 · Point the name here**, create a CNAME or an address record from the name to the instance.
4. Under **2 · Show the name agrees**, copy the **Record name** (`_vx-challenge.<hostname>`) and **Record value** (`vx-domain=` and 40 characters). Create a TXT record with them.
5. Wait for DNS, then press **Check now**. The check looks for the record, and when it finds it, it also asks the instance, through the hostname, for its check address. Under **3 · Check and enable**, "Record created and found" then says "Verified" and when, the state is **Verified**, and the list's **Last check** says "Passed <time>". If the record is not found, it says "Not verified. Last checked <time>." and a notice says "No TXT record … with the value … was found."
6. Press **Enable**. The step **Enabled** says "Serving." The name opens the app, and its row in **Domains** links to it.
:::

::screenshot{name=administer/sso-domains-details alt="A hostname's details sheet: what it serves, the three steps, the TXT record name and value to publish, and the Remove, Enable and Check now buttons."}

## Change what it serves

Open the hostname from the list with **Details**. Under **What it serves**, change **Serves** or **App**, and press **Change what it serves**. It works while the hostname is on. You need not remove it, and the hostname and its record stay.

## Turn it off or remove it

**Disable** asks "Turn off <hostname>?" first. Press **Turn off**. The hostname stops answering: the app is no longer served there, and sign-ins made at that hostname end. The record stays and the name stays verified; a hostname that is verified and off answers 404, "This hostname is not served here. Its registration is turned off." **Enable** serves again.

**Remove** asks "Remove <hostname>?" first. Press **Remove**. It deletes the hostname and also ends those sign-ins. A name that was never verified and is off is not "turned off": it opens the instance's own address, as any name the instance does not know.

## A name that exists only inside a network

DNS from outside cannot show a record for a name that exists only inside your network. **Enable** is then refused: "This hostname is not verified yet, so it cannot be enabled." An operator of the instance, who holds `instance:write`, may enable it. The instance then serves the name, and the step **Enabled** says "Serving." although the name is not verified. After that the tenant can disable it and enable it again, until an operator disables it.

## The result

The list shows the hostname **On** and **Verified**, and the name opens the app or the portal. The app's row in **Apps** lists the hostname under **Address**, and the app's inspector has a **Hostname** row (**Hostname (off)** while it is off). A sign-in made at the hostname is its own, because it is a different address from the instance's. Other replicas of the instance follow within 30 seconds. When an app is renamed, a hostname that serves it follows the new path, and the old address redirects (308).

## If it does not work

| You see | Cause and fix |
| --- | --- |
| "No TXT record _vx-challenge.<hostname> with the value vx-domain=… was found." | The record is missing, not yet carried by DNS, or has another value. |
| "This workspace has no apps. Deploy one first, or choose another workspace." | Choose another workspace, or serve the portal. |
| "That is not a hostname." | The name is not written as a name with at least one dot, such as `desk.example.com`. |
| "That is one of this instance's own addresses." | The name is the instance's own address, or its apps address. Choose another. |
| "This tenant has already registered that hostname." / "Another tenant has already proved or enabled that hostname on this instance. Ask its owner, or an operator of the instance, to remove it there first." | A name is unique to a tenant while it is verified or on. Until then anyone may register it, and the first to prove it holds it. |
| "The record is there, but the hostname did not reach this instance from here. Check where it points, and its certificate." | The TXT record is found, so the name is verified, but the name does not reach the instance from where the instance is. Check the CNAME or address record and the certificate. A name that resolves only inside a network may still be right. |
| The name opens the instance's own address | The name is not verified, or not enabled. A name the instance does not know opens its own address. |
| "Verified, record gone" | The record was removed after it was proved. The name still serves. Create it again and check. |
| A browser warning about the certificate | Whatever ends TLS in front of the instance does not hold a certificate for the name. Volvel issues none. |
