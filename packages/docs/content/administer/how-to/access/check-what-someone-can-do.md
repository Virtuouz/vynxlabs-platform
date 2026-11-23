---
title: Check what someone can do
description: "See everything a member or service account may do in the tenant, what gives it, and whether one permission is held."
subjects: [access, members]
---

## Check what someone can do

You see what a member or a service account may do, where, and which role or group gives it. You can also ask about one permission and get an answer with the reason.

### Before you start

You need `binding:read` for someone else. Anyone may read their own page.

:::steps
1. For a member: open **Members & access**, select the member and press **View access**. For a service account: open **Service accounts**, the account, then the **Access** tab. For yourself: open the account menu (the circle with your initial) and choose **What I may do here**.
2. Read **What gives them access**. Each line is a role, where it applies and how it reaches them ("through the group <name>", "given to anyone"). Choose a role to see where it is managed.
3. In **Find or check a permission** (the box suggests "promotion:write, or secrets"), type a whole permission such as `promotion:write`. A part of a permission or of its label narrows the list instead.
4. Read the answer: **Allowed** ("<name> holds `table:read` everywhere in the tenant." or "only in: <places>."), or **Denied**, with the reason. A denial for a permission nothing gives them ends "A role with it, bound to them or a group of theirs where it is needed, would give it."
:::

### Reading a source

- "not while suspended": the member is suspended. Nothing they are given counts until they are resumed.
- **operator access**: an operator's time-limited grant. When it is the only source, the answer adds "It comes only from operator access, which ends when the grant does."
- `*:*` does not give a permission that is only given by name (`sql:read`, `workspace_production:write`). When someone who holds `*:*` is checked for one, the answer says so and adds "A role that lists it, bound to them or a group of theirs, would give it." The built-in roles `tenant_admin`, `workspace_admin` and `developer` list `sql:read` themselves, so they are allowed it.

### The result

You know whether the permission is held, in the whole tenant or only in the places listed, and what to change: remove a binding on the **Access** tab, take the person out of a group, or give a role that holds it.

### If it does not work

- The page says "Nothing: they hold no permission in this tenant." The member belongs to the tenant and has been given nothing. See [Give access](give-access).
- "No permission matches." The text is not part of any permission's label or name. Use the form `kind:verb`, such as `table:write`.

## Related

- [Members and access](../../reference/screens/members), the page of one member.
- [How access works](../../explanation/access/how-access-works).
