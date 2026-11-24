---
title: Delete a tenant
description: "Delete a tenant and everything it owns from the instance, keep an export first, and know what stays and what to do when its database does not answer."
subjects: [tenants, instance]
---

## Delete a tenant

You remove a tenant, with its workspaces, secrets, tables and files, from the instance. It cannot be undone. Its history stays in the instance's audit log.

## Before you start

- You are an operator of the instance: you hold `tenant:write` at the instance (the role `operator_admin` has it).
- If anything the tenant holds should be kept, have an export first. Only the tenant's own admin, or an operator through an [access grant](../../../administer/reference/screens/operator-access) that includes `export:write`, can make one. See [Move a tenant](moving-a-tenant).
- No run of the tenant is queued or running, and no flow run is running. Deletion is refused while there is one.

## Delete it

:::steps
1. Sign in to the console as an operator. In the **Instance** area open **All tenants**. The console opens the workspace you were last in when you open it at its root, so use the navigation entry if you land in a tenant.
2. Choose the tenant's row. The inspector opens beside the list. Check the slug and the number of workspaces.
3. Press **Delete**. A dialog titled "Delete NAME?" says that every workspace, secret, table and file goes and that it cannot be undone.
4. Type the tenant's slug in the box. **Delete tenant** stays disabled until the slug matches exactly.
5. Press **Delete tenant**. The dialog closes, the inspector closes and the list no longer shows the tenant.
6. If a second dialog opens, "Delete NAME without dropping its tables?", read it. It means the database location that holds the tenant's tables did not answer. Press **Delete anyway** to delete the tenant and leave its tables in that database, or **Cancel**, bring the database back and start again.
:::

## The result

The tenant is gone from **All tenants**. Its workspaces, resources, secrets, custom tables and files are removed, and the files in the object store are removed after the deletion is committed. Its members' accounts stay, because they belong to the instance: they are still in [All members](../../reference/console/members), with the tenant no longer listed.

The instance's [audit log](../../reference/console/audit-log) records `tenant.deleted` with the tenant's name, slug and counts of workspaces, tables and files. The tenant's earlier entries are in that log too, tagged **Deleted tenant**: a deleted tenant has no log of its own.

If you pressed **Delete anyway**, the entry also has `tablesLeftIn`, the name of the location, and `schemas`, the schemas left in it. Whoever runs that database drops them.

## If it does not work

- **"N runs and M flow runs are still in progress. Pause the triggers, let them finish or cancel them, then try again."** The tenant is busy. Pause its triggers (an operator can [pause every trigger](pausing-triggers) at once), then let the runs finish or cancel them from each workspace's runs list, which needs an access grant to the tenant. Try again.
- **No Delete button.** The inspector shows **Delete** to operators only. A tenant admin cannot delete the tenant.
- **The button stays disabled.** The slug typed does not match. The slug is the one shown under **Slug** in the inspector, not the name.
- **The dialog "Delete NAME without dropping its tables?" appears.** The location holding the tenant's tables is down, and the tenant has workspaces. The message in the dialog is the database's own error. See the result above for what **Delete anyway** leaves.
- **"The instance is read only."** The database takes no writes. Deleting is refused until it does. See [Instance health](../../reference/console/health).
- A tenant cannot be restored once deleted. If you need to keep it, export it before you delete, and [import it](moving-a-tenant) later.
