---
title: Suspend or remove a member
description: "Stop a member's access for now, or take them out of the tenant, and know what each ends."
subjects: [access, members]
---

## Suspend or remove a member

**Suspend** keeps everything the member was given and stops it counting. **Remove** takes them out of the tenant.

### Before you start

You need `member:write`. You cannot suspend yourself.

:::steps
1. Open **Members & access** and select the member.
2. Press **Suspend** and confirm "Suspend <email>?", or press **Remove** and confirm "Remove <email> from this tenant? Their access here is removed too."
:::

### What each does

| | **Suspend** | **Remove** |
| --- | --- | --- |
| Roles and groups | Kept, and not counted until **Resume** | Direct bindings and group memberships in this tenant are deleted |
| Console and app sessions in this tenant | Ended | Ended |
| The account | Unchanged | Unchanged: it stays on the instance and in other tenants |
| Undo | **Resume**, at once | Add the member again, and give the roles again |

The member's roles in other tenants are not touched. Operator access that an operator holds on this tenant still counts for the operator.

### The result

A suspended member shows **Suspended** and the button **Resume**. A removed member is gone from the list. **View access** for a suspended member lists their sources as "not while suspended".

### If it does not work

"That would leave the tenant with nobody who can change its access. Give someone else the tenant admin role first.": they are the last member who holds `binding:write` at the tenant. Give the role to someone else, then try again. An operator who disables an account at the instance is not refused for a tenant's sake: the answer names the tenants left with no admin.

## Related

- [Members and access](../../reference/screens/members).
- [Check what someone can do](check-what-someone-can-do).
