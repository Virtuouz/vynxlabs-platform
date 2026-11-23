---
title: Move a tenant
description: "Move a tenant to another instance, or from the instance's database to a database location and back, by exporting it, deleting it where it was and importing it."
subjects: [tenants, instance, portability, database-locations]
---

## Move a tenant

You take a tenant out of one place and bring it in at another: to a different instance, or, on one instance, between the instance's own database and a registered database location. The tenant arrives whole or not at all, with its workspaces' triggers paused so that two copies never both act.

## Before you start

- On the instance the tenant is leaving: the tenant's admin, or a person with `export:write` in the tenant, makes the export. An operator needs an [access grant](../../../administer/reference/screens/operator-access) whose access level includes `export:write`: a grant as `viewer` does not.
- On the instance the tenant goes to: you are an operator with `tenant:write` at the instance, and the instance is at the same version as the one that made the export (the same migration level). Upgrade one of them first if not.
- If the tenant is to go into a database location, register it first on [Database locations](../../reference/console/databases).
- A passphrase of at least 12 characters, chosen for this export. Pass it on separately from the file.
- Moving on one instance, from one location to another, is export, delete, import: the tenant cannot be imported while it is still here ("This tenant is already on this instance. Delete it here first if it should be replaced."). Make a good export and keep the file safe before you delete.

## Move it

:::steps
1. Export the tenant. In the tenant, open **Export**, type the passphrase twice, choose whether to include run, flow and event history ("History can make the file much larger."), and press **Export tenant**. The browser downloads `SLUG-YYYY-MM-DD.tar`. For a large tenant use the terminal instead: set `VOLVEL_EXPORT_PASSPHRASE`, then run `volvel tenant export --tenant SLUG --out SLUG.tar --history`.
2. If the tenant is to move on this instance, [delete it](deleting-a-tenant) now, after checking the file. If it is to go to another instance, keep it running until step 8.
3. On the instance it goes to, as an operator, open **Instance**, then **Import a tenant**.
4. Under **Export file**, choose the `.tar` file. Optionally type **Its passphrase**. Press **Upload and check**. The **Check** step shows the tenant's name, when it was exported, the version, its workspaces, rows and members.
5. Type **Its passphrase** if you have not. After a moment the check runs again by itself. Read **Can it come in**: every line should pass. "The tenant is not here yet" and "Its slug is free here" must pass.
6. Optionally type a **Slug on this instance** (empty keeps the slug it had) and choose **Where its custom tables go**: the instance's own database, or a location. After a moment the check runs again with what you typed.
7. Press **Import tenant**. It says "Importing…", then "NAME was imported" with the counts, where the tables are, and what was not carried. Press **Open the tenant**.
8. Finish what an export does not carry, in the next section.
:::

For a large file, or a script, the same import is one command on the instance it goes to: `volvel tenant import SLUG.tar --slug NEW --location NAME`, with an operator's API key and `VOLVEL_EXPORT_PASSPHRASE` set. It checks and imports in one step.

## What to do after

- Sign in as one of the tenant's members. Their passwords came with the file, except for a member who also belongs to another tenant or holds an instance role: that account is the whole instance's. One who already had an account on this instance keeps it and its password. A member created without a password needs one: see [All members](../../reference/console/members), **Make a password reset link**.
- Make new API keys and worker credentials. They are never in an export.
- Point whatever calls the tenant's webhooks at the new address. The part after the host is unchanged.
- Hostnames, identity providers and domains need to be set up again. Single sign-on providers and git sync arrive paused, domains unproved.
- Stop the tenant where it was: pause its workspaces' triggers there, or [pause every trigger](pausing-triggers) on that instance.
- Resume each workspace's triggers on the new instance. Each arrives paused.
- When you are satisfied, [delete the tenant](deleting-a-tenant) on the old instance. Its history stays there.

## The result

The tenant is in **All tenants** with the same name, the slug you chose, and the same IDs as before. Its tables are where you said, shown under **Tables kept in**. A `tenant.imported` entry is in the tenant's own audit log, and `tenant_import.staged` is in the instance's.

## If it does not work

- **"This tenant is already on this instance. Delete it here first if it should be replaced."** The check line "This tenant is on this instance already" fails and **Import tenant** stays disabled. Delete the tenant, or import elsewhere.
- **"Another tenant here already uses the slug "X". Import with a different slug."** Type a different **Slug on this instance**.
- **"The passphrase does not open this export."** Retype it. Without the right passphrase the secrets cannot be read.
- **"Made by an instance at another version: upgrade one of them first."** The two instances must be at the same migration level.
- **"This file is not a tenant export."**, or "The export is damaged: PATH is not what was written." The file is not what an export wrote. Make a new export.
- **"The uploaded file is no longer here: another replica of the control plane kept it, or it was removed. Upload it again."** An upload is kept on the replica that received it, for an hour. Use sticky routing, upload again, or use the command line.
- **"The export is larger than this instance accepts."** The limit is 50 GiB for one file.
- **The Import button stays disabled after you typed.** It waits for a check made with what is typed: wait a moment, or press **Check again**.
- **"No database location is registered as "X"."** Register it first.
- A staged upload that you do not import is removed an hour after it came. **Throw it away** removes it at once.
