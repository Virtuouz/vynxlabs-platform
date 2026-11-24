---
title: Support access for operators
description: "See when the people who run the instance entered your tenant and why, end a grant, and, as an operator, open one."
subjects: [access, operators]
---

## Support access for operators

An operator cannot see inside a tenant without a grant that is time-limited, has a reason, and is visible to the tenant's admins. This page is for both sides.

### As a tenant admin: read and end grants

:::steps
1. Open **Operator access**. Each row is a grant: **Operator**, **Reason**, **Access level**, **Opened** and **Status**.
2. A grant that is active says "until <time>". To end it now, press **End access** and confirm "End <email>'s access now?".
:::

A grant ends by itself at its end time. The tenant's audit log has `access_grant.opened`, `access_grant.revoked` and, for every request under a grant, `operator.access`. You need `access_grant:read` to see the list and `access_grant:write` to end a grant.

### As an operator: open access

:::steps
1. Open the tenant. Without a grant the page says "You have no access to this tenant" and "Operators see inside a tenant only through an access grant".
2. Press **Open operator access**.
3. Type a **Reason** of 3 to 500 characters, choose an **Access level** (**viewer (read only)** is first) and a **Duration**: **1 hour**, **4 hours**, **24 hours** or **Other** (1 to 1440 minutes).
4. Press **Open operator access**.
:::

While the grant is open, a strip says **Operator access** as <role> until <time>. **End now** ends it. **Hide** hides the strip and puts a mark **Operator** in the header, whose menu has **Show the notice** and **End access now**. If a grant cannot be ended, the console says so and the strip stays.

### The result

The operator works in the tenant with the role's permissions, and the tenant's admins can read why. Removing an operator or disabling their account ends their open grants. **View access** for an operator lists the grant as **operator access** with its end time.

### If it does not work

If **Open operator access** is refused, the account is not an operator. If nobody who is an operator can sign in at all, see [Recover an operator](../../../self-host/how-to/access/recover-an-operator).

## Related

- [Operator access](../../reference/screens/operator-access).
- [Who runs what](../../../self-host/explanation/access/who-runs-what).
