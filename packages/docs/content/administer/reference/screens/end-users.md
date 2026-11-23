---
title: End users
topic: tenant-end-users
description: "Every control, state and permission of the End users screen and its Groups tab: inviting, links, attributes, disabling, deleting, and groups of end users."
moved_from:
  - tenant/end-users
---

An end user is someone who signs in to the tenant's apps and portal and does not run the tenant. End users belong to one tenant alone, are kept apart from members, and never see the console. The screen's description line reads "The people who sign in to this tenant's portal and apps: the client's own customers. They belong to this tenant alone, separate from members, and never see the console."

The nav item **End users** has two tabs: **End users** and **Groups**. F1 (**Help for this page**) opens the topic `tenant-end-users`.

::screenshot{name=administer/access-end-users alt="The End users screen: search box, Invite an end user button, tabs End users and Groups, and a table with email, name, status, groups and last sign-in."}

## The End users tab

| Column | What it shows |
| --- | --- |
| **Email** | The end user's email. |
| **Name** | Their name. Hidden on a narrow window. |
| **Status** | **Active**, **Invited** or **Disabled**. Invited means they have no password, no provider has signed them in and they have never signed in. A person signed in by an identity provider is **Active**. |
| **Groups** | The groups of end users they are in. |
| **Last signed in** | When. |

The list loads 50 at a time, with **Previous** and **Next** and "Page N". **Search by email or name** narrows it; the search is in the address (`?q=`) and so is the end user whose inspector is open (`?user=`). Empty: "No end users yet", "Invite someone by email. They get a link to choose a password, and can then open the apps that are open to them." With a search that finds nothing: "No end user matches that search".

### Invite an end user

**Invite an end user** opens a dialog: "They get a link to choose their password. Inviting gives no access by itself: open an app to them under Access or in the repository."

| Field | What it takes |
| --- | --- |
| **Email** | Required. |
| **Name** | Optional. |
| **On which address** | Only when the tenant has hostnames of its own that are enabled. **This instance's own address** or one of them: "The link they are given opens on this address." |

Giving the invitation does not give any access. Give the end user a role under [Access](access), give their group one, or open an app to them.

### The end user inspector

Choosing a row opens the inspector with **Email**, **Name** ("Not given" when empty), **Status**, **Last signed in** ("Never" when so), **Added** and **Groups** ("None"), and these buttons:

| Button | What it does |
| --- | --- |
| **Rename** | "The name is what people see beside their email. Their email, what they were given and their sign-in are not touched." Empty clears the name. |
| **Attributes** | Opens "Attributes of <email>". See below. |
| **New invitation link** | For someone who has never signed in and is not signed in by a provider. |
| **Password reset link** | For someone who has a password or has signed in. |
| **Enable** / **Disable** | **Disable** asks "Disable <email>?" ("They are signed out of every app now and cannot sign in until you enable them again. What they were given is kept."). **Enable** acts at once: "<email> can sign in again." |
| **Delete** | Asks "Delete <email>?" ("They can no longer sign in, and access given to them is removed. Their rows in tables are kept."). |

Someone a provider signs in gets neither link: a link would add a password beside their sign-in.

**Links.** Either link opens the dialog **Invitation link** or **Password reset link**, which shows the link once with **Copy link**. It says "It was also emailed to them." where the instance sends mail, and "This instance sends no mail, so pass the link on yourself." where it does not. A link works once. An invitation runs out after 7 days and a reset link after 2 hours. A new link replaces the older one. "It is not shown again here: make a new one if it is lost."

### Attributes

**Attributes** takes facts about the person that a table's rules can match, such as which customer they belong to: "Facts about this person that a table's rules can match, such as which customer they belong to."

| Field | What it takes |
| --- | --- |
| **Name** | Lowercase letters, digits and underscores, starting with a letter, 63 characters at most. Example `customer_id`. A name used twice is refused at the field: "<name> is given twice. Each name takes one value." |
| **Value** | 500 characters at most. |
| **Add an attribute**, **Remove** | Add or take away a row. |

At most 50 attributes. **Save** replaces the whole set. See [Rule rows by group or attribute](../../how-to/access/rule-rows-by-group-or-attribute).

### What an end user sees

End users sign in at the portal, `/portal/<slug>`, or at the tenant's own hostname. The sign-in page has **Sign in**, **Forgot your password?**, **Create an account** (only when the tenant allows people to create their own account) and **Staff sign-in**. The switch **People may create their own account** is on the [Branding](branding) screen and is off by default. A password is 12 to 200 characters. An end user's session lasts 30 days. A member who opens an app at its address stays signed in for 12 hours. Sign-in is limited to 20 attempts a minute, and sign-up and password reset to 5 a minute.

## The Groups tab

The **Groups** tab lists groups of end users. Its description line reads "Sort the people who use your apps into groups, such as one per customer or per job. Give a group a role under Access, and rule a table's rows by it under Tables."

| Column | What it shows |
| --- | --- |
| **Name** | The name in code style. |
| **Key** | The key, with the tag **Identity provider** for a group a provider made. |
| **What it is for** | The description, and "Filled by sign-in: <values>". |
| **People** | How many end users are in it. |
| (buttons) | **People**, **Rename**, **Describe**, **Sign-in values**, **Delete**. |

**Create group** takes **Name** ("Any name on one line, such as Front desk.") and **What it is for**. "It gets a key from its name. The key is what code and a table's rules refer to, and never changes. The name can be changed later." **People** opens "Who is in <group>", with **Add an end user** and **Take out**, as for [Groups](groups). **Rename** warns "A rule that holds the old name stops matching its people: have rows hold the key." **Sign-in values** work as for members' groups: at most 50. **Delete** asks "The group <name> is deleted. Its people lose what it was given, and rows ruled by it are shown to nobody in it." **Rename**, **Sign-in values** and **Delete** are off for a group an identity provider made.

Empty: "No groups of end users yet", "Create one when some of your apps' users should see or do what others should not."

## Permissions

| Action | Needs |
| --- | --- |
| See end users and their groups | `end_user:read`, `end_user_group:read` |
| **Invite an end user**, **Rename**, **Attributes**, links, **Enable**, **Disable**, **Delete** | `end_user:write` |
| Make, change, fill or delete a group of end users | `end_user_group:write` |

A disabled control says what is needed and whom to ask.

## Related

- [Invite end users](../../how-to/access/invite-end-users).
- [Rule rows by group or attribute](../../how-to/access/rule-rows-by-group-or-attribute).
- [Single sign-on](single-sign-on).
