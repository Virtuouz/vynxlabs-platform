---
title: Give access
description: "Give a person, a group, a service account or an end user a role at the tenant, in one workspace or on one thing, and give anyone without signing in what an app shows in public."
subjects: [access]
---

## Give access

You give a role to someone, at the place they need it. From the next request they may do what the role allows there.

### Before you start

- You need `binding:write` at the place you give the role: at the tenant, or in the workspace for the workspace's own **Access**. A tenant admin has it everywhere.
- The role exists. A role of your own is made under [Make a role](make-a-role).
- The person, group or service account exists. For a person who is not a member yet, [add them](add-a-member) first.

:::steps
1. Open **Members & access**, then the **Access** tab, and press **Give access**.
2. In **Who**, type a name or an email and choose the person, group, service account or end user. Two choices are always there: **Every end user who signs in**, and **Anyone, without signing in**.
3. In **Where**, keep **The whole tenant**, or choose a workspace. Access at the tenant reaches every workspace in it.
4. If you chose a workspace, **What** appears. Keep **Everything in the workspace**, or choose one script, flow, app or other thing. The person then holds the role on that one thing and nothing else in the workspace.
5. In **Role**, choose the role. Its description is shown under the field.
6. Press **Give access**.
:::

### The result

A notice says "<name> holds <role> in the whole tenant.", "...in <workspace>." or "...on <kind> <path> in <workspace>." The binding is on the **Access** tab. Remove it with **Remove**.

You can also give it from where the thing is: **Share** on an app, **Offer to an agent…** on a script or flow (see [Let an agent run a script](let-an-agent-run-a-script)), the **Access** tab of a service account, or a workspace's **Settings**, **Access**.

### Give a role to anyone

**Anyone, without signing in** is for what an app shows in public. It offers only the roles that hold something an app uses (`app:read`, `data:read` and the like). Roles that hold nothing an app uses are refused.

### When a second person is asked for

If the tenant asks for a second person, a role given straight to a member or to every end user applies at once. A role given to a group, a service account or a group of end users waits as an access change, and the sheet says "Nothing changed yet". A notice on the sheet says which applies. See [Ask for a second person](ask-for-a-second-person).

### If it does not work

- The role is not in the list: a role a workspace defines is offered only when you chose that workspace.
- **Give access** stays disabled until **Who** and **Role** are chosen.
- Giving a role that is already given answers with the existing binding and records nothing.
- A binding from the repository shows the tag **From repository** and has no **Remove**: change it in the repository. See [Keep access in a repository](../../../develop/how-to/access/keep-access-in-a-repository).

## Related

- [Access](../../reference/screens/access), every control on the tab.
- [How access works](../../explanation/access/how-access-works).
- [Check what someone can do](check-what-someone-can-do).
