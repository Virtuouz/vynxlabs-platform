---
title: Operator access
topic: tenant-operator-access
description: "Every control, state and permission of Operator access: the tenant's record of when the instance's operators entered it, ending a grant, and the strip an operator sees."
moved_from:
  - tenant/operator-access
---

The people who run the instance are operators. An operator is not a member of a tenant and sees inside it only through an access grant: time-limited, with a reason the tenant's admins can read. The nav item **Operator access** is the tenant's record of every grant. Its description line reads "Every time the people who run this instance opened access to your tenant, and why. You can end an active grant at any time." F1 (**Help for this page**) opens the topic `tenant-operator-access`.

## The list

| Column | What it shows |
| --- | --- |
| **Operator** | The operator's email. |
| **Reason** | What they gave when they opened it. Hidden on a narrow window. |
| **Access level** | The built-in role the grant gives, in code style. Hidden on a narrow window. |
| **Opened** | How long ago. Hidden on a narrow window. |
| **Status** | **Active** with "until <time>", or **Ended**. |
| (end) | **End access** on an active grant. |

**End access** asks "End <email>'s access now?" and ends the grant. A grant also ends by itself at its end time. Removing an operator, or disabling their account, ends their open grants.

Empty: "No operator has accessed this tenant", "If one ever does, the grant and its reason appear here."

## For an operator: Open operator access

An operator who opens a tenant they have no grant on sees "You have no access to this tenant" and "Operators see inside a tenant only through an access grant", with "A grant is time-limited and needs a reason. The tenant's admins can see it and end it." and the button **Open operator access**.

| Field | What it takes |
| --- | --- |
| **Reason** | 3 to 500 characters, for example "Support ticket 1042". "Shown to the tenant's admins." |
| **Access level** | A built-in tenant role. **viewer (read only)** comes first. `operator_admin` is not offered. |
| **Duration** | **1 hour**, **4 hours**, **24 hours** or **Other**. **Other** asks for **Minutes**, a whole number from 1 to 1440 (24 hours). |

The dialog says "Access is time-limited. The tenant's admins see this grant, your reason, and everything you do under it."

### The strip

While an operator has a grant, a strip under the header says **Operator access** as <role> until <time>, with the reason and "Everything you do here is recorded for the tenant." It has **End now** and **Hide**. After **Hide**, the header shows a mark **Operator** with when it ends, whose menu has **Show the notice** and **End access now**. A grant that cannot be ended says so: the strip stays as it was true.

### The audit trail

The tenant's audit log records `access_grant.opened` and `access_grant.revoked`, and `operator.access` for every request made under a grant, reads included. See [Audit log](audit-log).

## Permissions

| Action | Needs |
| --- | --- |
| See the list | `access_grant:read` |
| **End access** | `access_grant:write` in the tenant, or being the operator who opened the grant |
| **Open operator access** | `access_grant:write` at the instance, which only operators hold |

## Related

- [Support access for operators](../../how-to/access/support-access-for-operators).
- [Who runs what](../../../self-host/explanation/access/who-runs-what).
