---
title: Make a role
description: "Make a role of your own from permissions, so that people and groups can be given exactly what they need."
subjects: [access, roles]
---

## Make a role

You make a role that holds the permissions you tick. It is then offered under **Give access** for the whole tenant.

### Before you start

You need `role:write` at the tenant. A tenant admin has it. A workspace admin does not: it can give roles in its workspace, not make them.

:::steps
1. Open **Members & access**, then the **Roles** tab, and press **Create role**.
2. Type a **Name**: lowercase letters, digits and underscores, starting with a letter, 63 characters at most. The name cannot be changed afterwards.
3. Type a **Description** (500 characters at most): what the role is for.
4. In the picker, find the permissions with **Find a permission**. Tick **Read** or **Change** for each kind of thing. **Read everything** and **Change everything** tick every one of that kind.
5. Press **Create role**.
:::

### The result

The notice says "The role <name> is made. Give it to people under Access." The role is in the list with **Reads N of M** and what it changes. Select it and read **In short**, which says in words what it allows (for a role that reads **Tables**: "Data: reads Tables.").

### Things to know

- Kinds marked "Given only when ticked here: 'everything' does not include it" (`sql:read`, `workspace_production:write`) are held only when ticked by name.
- Kinds marked "End users can hold it" are the ones an end user, or anyone without signing in, may hold.
- A built-in role cannot be changed. Make a role of your own to allow something else.
- A role cannot be deleted while it is held: **Delete** is off, with the reason "A role that is held cannot be deleted. Remove its bindings first." **Held by** in the inspector says who holds it. Once nobody does, **Delete** asks "The role <name> is deleted. Nobody holds it."
- When the tenant asks for a second person, making or changing a role waits for one. See [Ask for a second person](ask-for-a-second-person).

### If it does not work

- **Create role** is disabled until at least one permission is ticked.
- A name that breaks the rule is refused at the field: "Use only lowercase letters, digits and underscores."
- A name that is taken is refused in a notice above the buttons: "This tenant already has a role named <name>." Choose another name.

## Related

- [Roles](../../reference/screens/roles), every control on the tab.
- [How access works](../../explanation/access/how-access-works), with the built-in roles.
