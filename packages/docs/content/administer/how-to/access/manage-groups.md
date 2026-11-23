---
title: Manage groups
description: "Make a group of members, fill it by hand or from sign-in values, and give it a role."
subjects: [access]
---

## Manage groups

You collect people who need the same access, and give the group a role once.

### Before you start

You need `group:write`, and `binding:write` to give the group a role.

:::steps
1. Open **Members & access**, then the **Groups** tab, and press **Create group**.
2. Type a **Name**, such as "Finance team", and optionally **What it is for**. Press **Create group**.
3. Press **Members** on the group's row. Search by email in **Add a member**, choose the person and press **Add**. Repeat for each person.
4. Open the **Access** tab, press **Give access**, choose the group in **Who**, then a place and a role.
:::

### The result

Each person in the group holds the role from their next request. A member's **View access** says "through the group <name>".

### Fill a group from sign-in values

When people sign in through an identity provider that sends groups, the group can fill itself. On the group's row press **Sign-in values** and type one value per line, as the provider names it. Someone whose sign-in says one of the values is put in the group when they sign in. A group takes up to 50 values. Leave it empty to fill the group by hand only.

### Rename, describe and delete

- **Rename** changes the name. The key made from the first name never changes, so access given to the group and code that names it are not touched.
- **Describe** sets what the group is for (500 characters at most).
- **Delete** removes the group and the access given to it. A group an identity provider made has these buttons off, with the reason: change it at the provider.
- To take someone out, open **Members** and press **Take out**. They keep what is given to them directly or through other groups.

### If it does not work

- "That would leave the tenant with nobody who can change its access. Give someone else the tenant admin role first.": the person is the last one who holds `binding:write` through the group.
- `principal_in_use`: a bundle still binds the group, or it decides a change that waits. Remove that first.
- When the tenant asks for a second person, making, renaming or deleting a group waits. Who is in a group does not.

## Related

- [Groups](../../reference/screens/groups), every control on the tab.
- [Keep access in a repository](../../../develop/how-to/access/keep-access-in-a-repository): groups as files.
