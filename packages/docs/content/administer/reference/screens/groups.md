---
title: Groups
description: "Every control, state and permission of the Groups tab: creating a group, who is in it, renaming, describing, filling it from sign-in values and deleting it."
---

The **Groups** tab of **Members & access** lists the tenant's groups of members. A group is a set of members that is given access together: give the group a role under [Access](access) and every member in it holds that role. Groups of end users are a different thing, on the [End users](end-users) screen.

The tab is reached from **Members & access**, then **Groups** (address `/groups`). It has the five tabs of the screen, a **Create group** button and a table. The description line reads "A group is a set of members that can be given access together. Give a group a role under Access."

::screenshot{name=administer/access-groups alt="The Groups tab: the tabs of Members and access, the Create group button and a table of groups with their keys and row buttons."}

## The list

| Column | What it shows |
| --- | --- |
| **Name** | The group's name, its description under it, and "Filled by sign-in: <values>" when it has sign-in values. |
| **Key** | The group's key in code style, with the tag **Identity provider** when a provider made the group. Hidden on a narrow window. |
| **Created** | How long ago. Hidden on a narrow window. |
| (buttons) | **Members**, **Rename**, **Describe**, **Sign-in values** and **Delete**. |

The key is made from the name when the group is made and never changes. Code and files that name a group by key keep working when the group is renamed.

### Create group

**Create group** opens a dialog with **Name** (for example "Finance team") and **What it is for** (optional). A group's description is 500 characters at most, on every route.

### Members

**Members** opens "Who is in <group>". It says "Whatever the group is given, each member in it has from their next request." **Add a member** searches by email (**Search by email**); **Add** puts the chosen member in. A member already in the group is not offered. Each person in the group is listed with email and name and has **Take out**, which asks "Take <email> out of <group>?" ("They lose whatever <group> gives, from their next request. Anything given to them directly, or through other groups, stays.").

The dialog says "Nobody is in this group yet" for an empty group. **Done** closes it. The open group is kept in the address (`?group=`).

### Rename and Describe

**Rename** asks for the new name and says "Its key, <key>, stays: access given to it, and code that names it by key, is not touched." **Describe** asks "What <group> is for" with the **Description** field, 500 characters at most. Empty clears it. Both are off for a group a provider made.

### Sign-in values

**Sign-in values** opens "Filled by sign-in: <group>". The field **Values** takes one value per line, as the identity provider names it: "Someone whose sign-in says one of these values is put in this group when they sign in." Empty fills the group by hand only. A group takes at most 50 values, each at most 200 characters. The button is off for a group a provider made, with the tooltip "An identity provider made this group. Change it there."

### Delete

**Delete** asks "The group <name> is deleted, and access given to it is removed." and deletes it. It is off for a group a provider made, with the reason "An identity provider made this group. Remove it there." It is refused when a bundle still binds the group, or when the group decides a change that waits for approval (the error code is `principal_in_use`).

## States

| State | What you see |
| --- | --- |
| Empty | "No groups yet", "Create a group when several people need the same access." |
| Not loaded | The list's error state, with a retry. |
| Read only | A line says what you can see and that `group:write` is needed. **Create group** and the row buttons are disabled. |
| Refused: the last admin | Taking out the last member who can change the tenant's access is refused: "That would leave the tenant with nobody who can change its access. Give someone else the tenant admin role first." |
| Waits for approval | When [approval by a second person](access-changes) is on, a change to a group is recorded as an access change and waits. The screen says so in a notice. Who is in a group does not wait. |

## Permissions

| Action | Needs |
| --- | --- |
| See the list and who is in a group | `group:read` |
| **Create group**, **Members** (add, **Take out**), **Rename**, **Describe**, **Sign-in values**, **Delete** | `group:write` |

## Related

- [Manage groups](../../how-to/access/manage-groups).
- [Access](access): give a group a role.
- [Rule rows by group or attribute](../../how-to/access/rule-rows-by-group-or-attribute).
