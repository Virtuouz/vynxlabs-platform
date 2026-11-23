---
title: Your account
topic: account
description: "Every control, state and limit of the Account screen: your API keys, your name, your password, where you are signed in, and recovery codes."
moved_from:
  - start/account
---

The **Account** screen holds what is about you and not about a tenant: the API keys that act as you, your name, your password, the sessions you are signed in on and, for a tenant's owner, recovery codes. Its description line reads "Your name, your password, your sessions and the keys that act as you."

It is reached from the account menu in the header (the circle with your initial): **Account**. The same menu shows "Signed in as <name>", and inside a tenant it has **What I may do here**. F1 (**Help for this page**) opens the topic `account`.

::screenshot{name=console/account-sessions alt="The Account screen: API keys, Profile, Password and the Sessions table with the session in use marked This session."}

## API keys

"A key acts as you, with your permissions. Use one for the command line or a script." A key holds what you hold: there is no per-key scope.

| Column | What it shows |
| --- | --- |
| **Name** | What you called the key. |
| **Key** | The key's first characters and last four. A key made before the last four were kept shows only the first characters, with that said on hover. |
| **Last used** | How long ago, or "Never". |
| **Expires** | How far off, or "Never". |
| **Status** | **Active**, **Expired** or **Revoked**. |

**Create API key** asks for a **Name** ("Where the key will be used.", for example "My laptop") and **Expires**: **Never**, **In 30 days**, **In 90 days** or **In a year**, with the hint "After this the key stops working, and you make a new one." The key is shown once in a notice above the table: "Copy this key now. It is shown only once, and cannot be read again.", with **Copy the key** and **Done**. **Revoke** asks "Revoke the key "<name>"? Anything using it stops working." Empty: "No API keys", "Create a key to sign in from the command line."

An administrator's keys for a service account are on the [Service accounts](../../../../administer/reference/screens/service-accounts) screen.

## Profile

One field, **Name**, and **Save name**. It is shown "to the people you work with, beside your email." Your **Email** is shown and cannot be changed here. Where a directory pushes your name, the field is read only and says "Your name comes from <provider>. Change it there."

## Password

"Changing it signs you out everywhere else. If your organization's sign-in is the only way you get in, you have no password here to change."

| Field | What it takes |
| --- | --- |
| **Current password** | Your password now. A wrong one answers "The current password is not right." |
| **New password** | At least 12 characters. The field says "Use at least 12 characters." as you type, and **Change password** stays off until all three fields are filled, the new password is long enough and the two match. |
| **New password again** | Must match: "The two do not match." |

When it works: "Your password is changed. Your other sessions were signed out." If an administrator made you a password reset link, you set your new password on the page the link opens, not here.

## Sessions

"Where you are signed in now. A session you do not know is a reason to change your password."

| Column | What it shows |
| --- | --- |
| **Device** | The browser and system as the browser reported them (for example "Firefox on Linux"), "Command line" for the CLI, or "Unknown device". The session you are using is marked **This session**. |
| **Address** | The address it signed in from, or "Not known". Hidden on a narrow window. |
| **Signed in** | How long ago; the date from 7 days on. |
| (end) | **End**, on every session but the one in use. |

**End** asks "End this session?" ("<device> is signed out and has to sign in again."). **End other sessions** asks "End all other sessions?" ("The other session is signed out. This one stays." or "The other N sessions are signed out. This one stays.") and says "Your other sessions are ended." It is disabled when there is no other session. Empty: "You are not signed in anywhere." A console session lasts 7 days.

## Recovery codes

Shown only to a tenant's owner: a member who holds `tenant_admin` at the tenant by a binding of their own (not through a group). "You own a tenant. If your organization's sign-in breaks while it is required, a recovery code with your password lets you in once, to put it right. Each code works one time."

It shows **Codes left** ("None made yet" before the first) and **Made**. **Make recovery codes** (or **Make new codes**, which asks "Make new recovery codes?": "The codes you have now stop working. Keep the new ones somewhere safe that does not depend on your organization's sign-in.") makes 10 codes and shows them once, with **Copy all** and **I have kept them**, and the notice "Copy these codes now. They are not shown again." With two codes left or fewer, a notice says "Only N left." or "You have no codes left." and asks you to make new ones while you can still sign in.

## What I may do here

Inside a tenant the account menu has **What I may do here**. It opens your own page of everything you may do in that tenant, where, and what gives it: the page described in [Members and access](../../../../administer/reference/screens/members). Reading it needs no permission.

## Permissions

Every part of this screen is about your own account and needs no permission, except that **Recovery codes** appear for a tenant's owner only.

## Related

- [Change your password and end sessions](../../../how-to/account/change-password-and-end-sessions).
- [Make an API key](../../../how-to/account/make-an-api-key).
