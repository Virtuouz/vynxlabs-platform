---
title: All members
topic: instance-members
description: "Every control, state and permission of the All members screen: the list, Create member, the password reset link, Disable and Enable."
subjects: [instance, members]
moved_from:
  - instance/members
---

The **All members** screen lists every person with an identity on the instance, whichever tenants they belong to. A member is an account: it has an email, a name and a password or a single sign-on link. Belonging to a tenant is a separate fact, so a member can belong to several tenants or to none. The screen is in the **Instance** area, which is shown only to an operator. F1 (**Help for this page**) opens the help topic `instance-members`.

A tenant's own members, who they are inside that tenant and what they may do, are on the tenant's [Members](../../../administer/reference/screens/members) screen.

::screenshot{name=self-host/instance-members alt="The All members screen: a search box, the Create member button and a list of members with their email, tenants, state and, in the last column, Make a password reset link and Disable."}

## Controls

The title is **All members**. The description reads "Every person with an identity on this instance, across all tenants." The description shows the first time you open the screen. On later visits it is folded behind the **About All members** button (the circled i) beside the title.

| Control | What it does |
| --- | --- |
| **Create member** | Opens the dialog below. |
| **Search all members** | Searches name and email, on the server, as you type. Kept in the address as `q`. |
| **Load more** | The list shows 50 members at a time, in the order they were made, with the line "Showing the first N members." and, when there are more, **Load more**. |

The columns. A column that does not fit gives way on a narrow window. On a phone only **Name** and **State** remain: the email sits under the name, and the row's buttons sit under that.

| Column | What it shows |
| --- | --- |
| **Name** | The member's name. |
| **Email** | The email. |
| **Tenants** | The names of the tenants the member belongs to, separated by commas, or "None". |
| **State** | **Active**, or a **Disabled** tag. |
| **Created** | How long ago. |
| **Actions** | The buttons below. |

Choosing a row opens the inspector (eyebrow **Member**, title the name). It shows **Email**, **Tenants** ("Belongs to no tenant" if none), **State** ("Active" or "Disabled: signs in nowhere"), **Created** and **ID**. It has no buttons: the actions are in the row.

### Create member

**Create member** opens a dialog with the line "Creates an identity without adding it to any tenant."

| Field | What it takes |
| --- | --- |
| **Name** | Required. |
| **Email** | Required. An email already on the instance is refused: "A member with that email already exists." |
| **Initial password** | At least 12 characters (the field says "Use at least 12 characters." when it is shorter). The hint says "They can change it on their Account screen after signing in." |

The new member belongs to no tenant and holds no role. A tenant admin adds them to a tenant, or an operator makes them an operator from [Operators](operators). When it works the console says "Created." and the list shows the member. The dialog's button is disabled while the instance is read only.

### Actions in a row

| Control | What it does |
| --- | --- |
| **Make a password reset link** | Shown for an active member other than yourself. Asks "Make a password reset link for EMAIL?" and explains: whoever opens the link chooses a new password for them, once, within two hours; using it ends all their other sign-ins; a link made before this one stops working; nobody sees the password. Press **Make the link**. Where the instance sends mail, the link is emailed to the member and the dialog "Password reset link" says "It was emailed to EMAIL. It works once, until TIME. You are not shown it." Where it does not send mail, the dialog shows the link once, to copy and pass on, and says "This instance sends no mail, so pass the link on yourself." Press **Done**. It is refused for a member who signs in only with an identity provider that has turned passwords off for them ("EMAIL signs in with PROVIDER, and passwords are turned off for them. There is no password to reset."). The action is audited as `member.password_link_created`; the link itself is never recorded. |
| **Disable** | Asks "Disable EMAIL?": "They can sign in nowhere, in any tenant: their sessions end now and their API keys stop working. The account and what it holds are kept. A tenant where they are the only admin is left with none until an operator opens access to it: the next message names those tenants." Press **Disable**. If a tenant is left with nobody who can administer it, the result names those tenants ("EMAIL is disabled. These tenants now have no admin: NAMES. An operator can open access to each from its page."). Otherwise it says "EMAIL is disabled." |
| **Enable** | Shown on a disabled member. It enables the account at once, without asking, and says "EMAIL is enabled." |
| "Change your own password on the Account screen." | Shown in place of the reset-link button on your own row. |
| "You cannot disable your own account." | Shown in place of **Disable** on your own row. |

A disabled member has no **Make a password reset link** button: enable the account first ("This account is disabled. Enable it first."). Disabling ends the member's sessions and the operator access grants they had opened, and refuses their API keys, passwords and single sign-on. It writes `member.disabled` to the instance's [audit log](audit-log); enabling writes `member.enabled`. Doing the same thing twice writes nothing. Disabling or removing the last operator who can sign in is refused: see [Operators](operators).

## States

| State | What you see |
| --- | --- |
| Empty | "No members". |
| Search finds none | "Nothing matches" with "Try fewer or other words." and a way to clear the search. |
| Not loaded | The error state with a retry. |
| Read only for you | A line says "You can see the members, not change it. It needs `member:write`. Ask an operator of this instance to give you access." **Create member** and the row buttons are disabled. |
| Read only instance | The strip "The instance is read only." is on every screen, and the **Create member** dialog's button is disabled with the reason. |
| Not an operator | The screen is not drawn. A person who is not an operator who opens `/instance/members` sees "For operators". |

## Permissions

| Action | Needs |
| --- | --- |
| See the list | `member:read` at the instance. |
| **Create member**, **Disable**, **Enable**, **Make a password reset link** | `member:write` at the instance. |

`operator_admin` holds `member:*` at the instance. See the [permissions reference](../../../administer/reference/permissions).

## Related

- [Operators](operators): making a member an operator.
- [Instance audit log](audit-log): `member.created`, `member.disabled`, `member.enabled`, `member.password_link_created`.
- [What the instance does not do](../../explanation/instance/what-is-not-there): editing or deleting a member.
