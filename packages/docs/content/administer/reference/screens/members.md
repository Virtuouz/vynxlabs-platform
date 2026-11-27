---
title: Members and access
topic: tenant-members
description: "Every control, state and permission of the Members tab and of a member's page: adding, suspending, removing, password reset links and what someone may do."
moved_from:
  - tenant/members
---

**Members & access** is one nav item with five tabs: **Members**, **Groups**, **Roles**, **Access** and **Access changes**. This page is about the **Members** tab and the page of one member. The other tabs have their own pages: [Groups](groups), [Roles](roles), [Access](access) and [Access changes](access-changes).

A member is a person who belongs to the tenant. Belonging gives nothing by itself: what a member may do comes from the roles they are given, directly or through groups. See [how access works](../../explanation/access/how-access-works).

Each tab has its own address, so a link keeps working: `/members`, `/groups`, `/roles`, `/access` and `/releases` (the tab **Access changes** keeps the address `releases`), all under the tenant. F1 (**Help for this page**) opens the help topic `tenant-members`.

## The Members tab

The tab has the title **Members & access**, the five tabs, a search box (**Search by email or name**), the button **Add member** and a table. The description line reads "People who belong to this tenant. Belonging grants nothing by itself: give access under Access."

| Column | What it shows |
| --- | --- |
| **Name** | The member's name, or the email when there is no name. On a narrow window the email is shown under the name. |
| **Email** | The member's email. Hidden on a narrow window. |
| **Status** | **Active** or **Suspended**. |
| **Roles** | **No access** (no role given directly and in no group), **Through groups only**, or "N given directly". Empty while the counts are not yet known. Hidden on a narrow window. |
| **Added** | How long ago the member was added to the tenant. Hidden on a narrow window. |

The list loads 50 members at a time. **Load more** brings the next 50. Typing in the search box asks the server, so it finds a member however far down the list they are. The search is kept in the address (`?q=`), and so is the member whose inspector is open (`?member=`). A member beyond the pages loaded is read by itself when a link opens them.

### The member inspector

Choosing a row opens the **Member** inspector. It shows the member's **Email**, **Status** and when they were **Added**, then **Given directly**: the roles they hold by a binding of their own, each with where it applies (**Whole tenant**, a workspace, or one resource with a link to it). With none, it says "Nothing. Whatever they hold comes from the groups they are in." Roles that come through groups are not listed here: **View access** shows them.

| Button | What it does |
| --- | --- |
| **View access** | Opens the member's page: everything they may do, and what gives it. See below. |
| **Make a password reset link** | Asks "Make a password reset link for …?", then makes a one-time link. See [Password reset links](#password-reset-links). |
| **Suspend** / **Resume** | **Suspend** asks "Suspend …?" ("They hold nothing in this tenant until they are resumed. What they were given is kept, and so is whatever they hold in other tenants.") and then suspends. **Resume** acts at once. |
| **Remove** | Asks "Remove … from this tenant? Their access here is removed too." and removes them. |

Suspending ends the member's console and app sessions in this tenant, their open event streams and sign-ins that have not finished. It does not delete what they were given. A member cannot suspend themselves ("You cannot suspend yourself.").

**Remove** takes the member out of the tenant and deletes their direct bindings and their group memberships in it, the links their identity provider made for them and their SCIM record in this tenant. The account itself is not deleted: Volvel has no deletion of a member's account. A member removed from every tenant still exists.

### Add member

**Add member** opens a dialog. For someone who already has an account, the email is enough.

| Field | What it takes |
| --- | --- |
| **Email** | The person's email, 254 characters at most. The address is lowercased. |
| **Name** | Only for a new account. |
| **Initial password** | Only for a new account. At least 12 characters and at most 128. |
| **Role**, **Where they work** | A role to give with the membership, in the same change. **Role** starts at **No access yet**. **Where they work** appears once a role is chosen: **The whole tenant** or one workspace. Roles that belong to a workspace are not offered. |
| **Add another role**, **Remove** | Up to 20 role and place pairs. **Add another role** appears once the last pair has a role. |

When it works, the notice says "<email> is a member, with <roles>." or "<email> is a member. They hold no role yet." The roles are given with `binding:write` at each place you chose. For an email with no account, **Name** and **Initial password** are needed: without them the answer is "No member has that email. Send name and password to create one."

Volvel sends no invitation email for a new member. Tell the person their email and the initial password yourself, or add them with an initial password and then [make a reset link](#password-reset-links) so they choose their own.

When [approval by a second person](access-changes) is on, a notice in the dialog says that a role given straight to a member applies at once and does not wait. See [Second-person approval](../../explanation/access/second-person-approval).

### Password reset links

**Make a password reset link** is how a member's password is reset. Nobody sees or sets the password: whoever opens the link chooses it.

- The link works once and runs out after 2 hours. A link made earlier and not yet used stops working when a new one is made.
- Where the instance sends mail, the link is emailed to the member and the dialog says "It was emailed to <email>. It works once, until <time>. You are not shown it." Where it does not, the dialog **Password reset link** shows the link once, with a copy control, and says "This instance sends no mail, so pass the link on yourself."
- Using the link ends all the member's other sign-ins.
- A tenant admin can make the link for a member who belongs to this tenant and to no other, and who holds no role at the instance. The same holds for a member of several tenants whom nobody has proved is the owner of the account (their password was typed by an admin and never replaced through a mailed link or single sign-on), but only where the link is emailed. For anyone else the answer is "<email> also belongs to another tenant or runs the instance, so only an operator can make a password link for them." An operator makes it for any member of the instance.
- It is refused for yourself ("Change your own password on your Account screen."), for a disabled account ("This account is disabled. Enable it first.") and for a member whose identity provider has turned passwords off ("<email> signs in with <provider>, and passwords are turned off for them. There is no password to reset.").
- A link that was used or has run out answers "This link has been used or has run out. Ask the person who gave it to you for a new one."
- The audit log records `member.password_link_created`, with who made it and for whom, never the link.

## A member's page: View access

**View access** opens the page of one member, titled with their name. For your own page the title is **What I may do here** and the line under it reads "Everything you may do in this tenant, where, and what gives it." (it is the entry in the account menu inside a tenant). For someone else it reads "Everything they may do in this tenant, where, and what gives it." and a link **All members** goes back.

The page shows **Email**, **Status** and **Groups** (their names, or "None"), then:

| Part | What it shows |
| --- | --- |
| Notice | For a suspended member: "Suspended: none of their bindings count until they are resumed. They are listed as they will be." |
| **What gives them access** | One line for each source: the role (a link to where it is managed), where it applies, "through the group <name>" or "given to anyone" where that is how it reaches them, and "not while suspended" for a source that does not count. An operator's access grant is listed as **operator access**, with its role and "until <time>" or "until it is revoked". With none: "Nothing: they hold no permission in this tenant." |
| **Find or check a permission** | Type part of a permission or its label to narrow the list ("No permission matches." when nothing does). Type a whole permission such as `promotion:write` to check it: **Allowed** with the places it is held, or **Denied** with the reason. |
| **Permissions** | Every permission they hold, by area, with its label, `kind:verb`, what it means and the sources that give it. |

The check explains its answers:

- **Allowed**: "<name> holds `x:y` everywhere in the tenant." or "only in: <places>."
- When every source of the permission is an operator's access grant, it adds "It comes only from operator access, which ends when the grant does."
- **Denied** because the member is suspended: "<name> is given `x:y`, but none of it counts while they are suspended. It counts again when they are resumed."
- **Denied** for an explicit permission (`sql:read`, `workspace_production:write`) when they hold `*:*` and no role lists it: "<name> holds `*:*`, which gives every permission except those given by name, and `x:y` is one of those. A role that lists it, bound to them or a group of theirs, would give it."
- **Denied** otherwise: "<name> does not hold `x:y` anywhere. A role with it, bound to them or a group of theirs where it is needed, would give it."

A line "A role they hold gives every permission except those given by name (`*:*`): each is listed with it." appears for a member who holds `*:*`.

A service account has the same page, from its own screen: see [Service accounts](service-accounts).

## States

| State | What you see |
| --- | --- |
| Empty | "No members yet", "Add the people who work in this tenant." |
| No match | "No member matches that search". |
| Not loaded | The list's error state, with a retry. |
| Read only | A line says what you can see and that **member:write** is needed. **Add member** is disabled. In the inspector the buttons **Make a password reset link**, **Suspend**, **Resume** and **Remove** are disabled, with the reason as their tooltip. **View access** stays on. |
| Refused: the last admin | "That would leave the tenant with nobody who can change its access. Give someone else the tenant admin role first." Suspending or removing the last member who holds `binding:write` at the tenant, directly or through a group, is refused. |

## Permissions

| Action | Needs |
| --- | --- |
| See the list and a member's inspector | `member:read` |
| **Add member**, **Suspend**, **Resume**, **Remove**, **Make a password reset link** | `member:write` |
| Give a role in **Add member** | `binding:write` at the place chosen, as well |
| **View access** for someone else | `binding:read` |
| **What I may do here**, your own page | Nothing: it is open to the member it is about |

The [permissions reference](../permissions) lists the permissions. Reading is never hidden: a control you may not use is disabled, and the screen says what it needs and whom to ask.

## Related

- [Groups](groups), [Roles](roles), [Access](access) and [Access changes](access-changes): the other tabs.
- [How access works](../../explanation/access/how-access-works).
- [Add a member](../../how-to/access/add-a-member).
- [Check what someone can do](../../how-to/access/check-what-someone-can-do).
- [Suspend or remove a member](../../how-to/access/suspend-or-remove-a-member).
