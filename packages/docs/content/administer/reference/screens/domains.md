---
title: Domains
topic: tenant-domains
description: "Every control, state and permission of the Domains screen: a tenant's own hostnames, what each serves, the DNS record that proves it, and what enabling and disabling do."
subjects: [domains, hostnames]
moved_from:
  - tenant/domains
---

The **Domains** screen registers hostnames of the tenant's own, such as `portal.example.com`, and says what each one serves. A hostname serves one app at its root, or the portal and every app of a workspace by its path. Volvel does not issue a certificate and does not change DNS: you point the name at the instance, and whatever ends TLS in front of the instance holds the certificate.

The screen is under **Tenant**, in the group **Delivery**. F1 opens the help topic `tenant-domains`. A hostname's details are in the address as `?hostname=<id>`. For the idea, see [How a hostname is proved](../../explanation/sso/how-hostnames-are-proved).

::screenshot{name=administer/sso-domains-details alt="A hostname's details sheet: what it serves, the three steps, the TXT record name and value to publish, and the Remove, Enable and Check now buttons."}

## The list

The screen opens with two paragraphs: a hostname serves one app at its root, or the portal with every app of a workspace by its path; point the name at the instance with a CNAME or an address record; then create the TXT record shown and run a check. The button is **Add a hostname**.

| Column | What it shows |
| --- | --- |
| **Hostname** | The name. It is a link to the served address while the hostname is on. |
| **Serves** | "The portal and every app", or the app's path, with "in" and the workspace's name. |
| **State** | **On** or **Off**, and **Verified**, **Not verified**, or **Verified, record gone**. |
| **Last check** | "Passed <time>", the reason the last check failed, "Not checked yet", or "Verified <time>; record gone since <time>". |
| **Details** | Opens the hostname's sheet. |

The empty state is "No hostnames yet": "Every app already has an address on this instance. Add a hostname when the client wants one of their own for an app."

### Add a hostname

The sheet "Add a hostname" says "It serves what you choose once the hostname is verified and enabled."

| Field | What it takes |
| --- | --- |
| **Workspace** | The workspace whose apps the name serves. |
| **Serves** | **One app, at the hostname's root** or **The portal, and every app by its path**. |
| **App** | For one app: the workspace's apps, shown as "title (path)". If there are none: "This workspace has no apps. Deploy one first, or choose another workspace." |
| **Hostname** | "The name alone, without https:// or a path." A refused name shows its reason under the field. |

The buttons are **Cancel** and **Add hostname**. A new hostname is off and not verified, and its sheet opens.

## A hostname's sheet

The title is the hostname and the line under it says "The portal and every app" or "Serves <app>". Under that: its state pills, then:

| Part | What it has |
| --- | --- |
| **What it serves** | The same **Serves** and **App** fields, and **Change what it serves**, enabled once the choice differs. Works while the hostname is on. |
| **1 · Point the name here** | "A CNAME or an address record to this instance, and a certificate for the name wherever TLS ends in front of it." |
| **2 · Show the name agrees** | The **Record name** (`_vx-challenge.<hostname>`) and **Record value** (`vx-domain=` and 40 hexadecimal characters) of a TXT record, each with a copy button. |
| **3 · Check and enable** | Two steps with their state: **Record created and found** (or "Record found when verified, and not since") and **Enabled**, each with a sentence. A failed check shows its reason in a notice. |

The footer has **Remove**, **Disable** or **Enable**, and **Check now**.

| Button | What it does |
| --- | --- |
| **Check now** | Asks DNS for the TXT record. Found: the hostname is verified. It then asks the instance, through the hostname, for its check address; if that does not answer, a notice says "The record is there, but the hostname did not reach this instance from here. Check where it points, and its certificate." The name stays verified. |
| **Enable** | Starts serving. Needs the hostname verified; see below. |
| **Disable** | Asks "Turn off <hostname>?" The hostname stops answering, and sign-ins made at that hostname end. The record stays. A verified name that is off answers 404, "This hostname is not served here. Its registration is turned off." |
| **Remove** | Asks "Remove <hostname>?" The app is no longer served there, and sign-ins made at that hostname end. |

Enabling a hostname that is not verified is refused: "This hostname is not verified yet, so it cannot be enabled. Create the TXT record shown here, wait for DNS to carry it, and press Check now. For a name that exists only inside a network and cannot be checked from here, ask an operator of this instance to enable it." An operator of the instance, who holds `instance:write`, can enable an unverified name. The instance then serves it, and the step says "Serving, though the name is not verified. An operator of this instance enabled it without proof, so the name opens this app for whoever points it here." The tenant can then disable it and enable it again, until an operator disables it.

### Steps and what they say

| Step | Sentence |
| --- | --- |
| Verified, record found | "Verified <time>." |
| Verified, record gone | "Verified <time>. The record has not been found since <time>. The name stays verified: create the record again and check." |
| Not verified | "Not verified. Last checked <time>." or "Not checked yet." |
| Enabled | "Serving." |
| Enabled by an operator, not verified | "Serving, though the name is not verified. An operator of this instance enabled it without proof, so the name opens this app for whoever points it here." |
| Verified and not enabled | "Serves nothing: the name answers "not served here" until it is enabled." |
| Not verified and not enabled | "Not enabled. Until it is verified, the name opens this instance's own address, as any name the instance does not know does." |

## States

| State | What you see |
| --- | --- |
| Not loaded | The error text and **Try again**. |
| Read only | A line says what is needed (`domain:write`). **Add a hostname** and the sheet's buttons are disabled. |

## Permissions

| Action | Needs |
| --- | --- |
| See the hostnames | `domain:read` |
| Register, change, check, enable, disable and remove a hostname | `domain:write` |
| Enable a name that is not verified | `instance:write` (an operator of the instance) |

## Related

- [Serve an app on your own hostname](../../how-to/sso/serve-an-app-on-your-own-hostname)
- [How a hostname is proved](../../explanation/sso/how-hostnames-are-proved)
