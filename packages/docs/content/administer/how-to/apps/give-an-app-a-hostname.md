---
title: Give an app a hostname of its own
description: Register a hostname for an app or for the portal, prove with a DNS record that you control the name, turn it on, point it at something else, and remove it.
subjects: [apps, domains]
---

## Give an app a hostname of its own

By the end you will have a hostname, such as `desk.example.com`, that serves one app at its root, or the tenant's portal with every app of a workspace by its path.

## Before you start

- You need `domain:write` in the tenant. A tenant admin has it. Without it the **Domains** screen says what is missing and **Add a hostname** is grayed out.
- The app is deployed to the workspace. A workspace with no apps offers none: "This workspace has no apps. Deploy one first, or choose another workspace."
- You manage the hostname's DNS, or know who does. Volvel issues no certificate: whatever ends TLS in front of the instance has to hold one for the name.
- The instance serves apps at an address of their own, or the app is made in the App Builder or is a site of documentation. See [the Apps screen](../../../console/reference/screens/build/published-apps).

## Add the hostname

:::steps
1. Open **Domains**. The table lists each hostname with what it **Serves**, its **State** and its **Last check**.
2. Press **Add a hostname**. A sheet opens with the text "It serves what you choose once the hostname is verified and enabled."
3. Choose the **Workspace**. The first one in the list is chosen for you: change it if it is not the one.
4. Choose what it **Serves**: **One app, at the hostname's root**, or **The portal, and every app by its path**. For the first, choose the **App**. For the second, the sign-in pages and the list of apps are at the root, and each app of the workspace is at `/its-path/`.
5. Type the **Hostname**: the name alone, without `https://` or a path, such as `desk.example.com`. Press **Add hostname**.
6. The hostname's details open. Its state is **Off** and **Not verified**.
:::

::screenshot{name=administer/apps-hostname alt="The details sheet of a hostname that is off and not verified: what it serves, the three steps, the record name and value with Copy buttons, and Remove, Enable and Check now."}

## Point the name here and prove it

:::steps
1. In the hostname's DNS, make a CNAME or an address record that points the name to the instance. Make sure TLS in front of the instance holds a certificate for the name. The details say this under **1 · Point the name here**.
2. Under **2 · Show the name agrees**, copy the **Record name** (`_vx-challenge.` and the hostname) and the **Record value** (it begins `vx-domain=`) with their **Copy** buttons. Create a TXT record with that name and value where the hostname's DNS is managed.
3. When DNS carries the record, press **Check now**. The check looks for the record, and then asks the instance, through the hostname, for its check address. Under **3 · Check and enable**, "Record created and found" says "Verified" and when. If the record is not found, it says "Not verified. Last checked" and the time, and a notice says "No TXT record … with the value … was found."
4. Press **Enable**. The state becomes **On** and **Verified**, and the hostname serves.
:::

## Change what it serves, turn it off, remove it

:::steps
1. To serve another app, or the portal, open the hostname with **Details**. Under **What it serves**, choose and press **Change what it serves**. The hostname and its record stay.
2. To stop serving without losing the record, press **Disable** and then **Turn off**. The hostname stops answering, so the app is no longer served there and sign-ins made at that hostname end. A verified hostname that is off answers 404, "This hostname is not served here. Its registration is turned off." **Enable** serves again.
3. To forget the hostname, press **Remove** and then **Remove**. The app is no longer served there, and sign-ins made at that hostname end.
:::

## The result

The hostname's row in **Domains** is **On** and **Verified**, and its name is a link. The app's row in **Apps** lists the hostname under **Address**, and the app's inspector has a **Hostname** row. A sign-in made at the hostname is its own: it is a different address from the instance's.

## If it does not work

| What you see | Why and what to do |
| --- | --- |
| "This hostname is not verified yet, so it cannot be enabled. Create the TXT record shown here, wait for DNS to carry it, and press Check now. For a name that exists only inside a network and cannot be checked from here, ask an operator of this instance to enable it." | **Enable** needs a verified name. Create the record and check. An operator of the instance can enable a name that cannot be checked from the internet. After that, the tenant may disable it and enable it again, until an operator disables it. |
| "The record is there, but the hostname did not reach this instance from here. Check where it points, and its certificate." | The TXT record is found, and the name does not reach the instance from where the instance is. Check the CNAME or address record and the certificate. A name that resolves only inside a network may still be right. |
| "Another tenant has already proved or enabled that hostname on this instance. Ask its owner, or an operator of the instance, to remove it there first." | A hostname is unique only while it is verified or enabled. Another tenant holds it. |
| "That is not a hostname." / "That is one of this instance's own addresses." | The name is wrong, or it is the instance's own. |
| The state says **Verified, record gone**. | The check no longer finds the record. The name keeps working. Create the record again and press **Check now**. |
| The name opens the instance's own address. | It is not verified or not enabled. A name the instance does not know opens its own address. |

Changes reach the instance's other replicas within 30 seconds. When an app is renamed, a hostname that serves it follows the new path, and the old address redirects (308).

## Related

- [The Domains screen](../../reference/screens/domains)
- [Share an app](../../../console/how-to/apps/share-an-app)
- [How access to an app works](../../../develop/explanation/apps/app-access)
