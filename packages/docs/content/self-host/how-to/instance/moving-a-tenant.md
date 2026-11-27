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

For a large file, or a script, the same import is one command on the instance it goes to: `volvel tenant import SLUG.tar --slug NEW --location NAME`, with an operator's API key and `VOLVEL_EXPORT_PASSPHRASE` set. It sends the file, says what it holds, asks, and imports. Add `--yes` where nobody can be asked.

## Passwords do not come with the file

An import brings no passwords. The accounts it creates have no password, so nobody can sign in to them until each person chooses one. The reason is that whoever made the export held every password in it: if the import kept them, that person could sign in as any member the import created, now or later. An account that already exists on the instance is not changed at all: it keeps its own password, keys and codes.

Each person gets a link and chooses a password with it: see [All members](../../reference/console/members), **Make a password reset link**. The console's import screen keeps none either, unless you tick its box for it.

If you are moving your own tenant between your own instances, you made the file and you hold it, so nobody else knows the passwords. Then keep them: tick **Bring the members' passwords in with the file** on the console's import screen, add `--keep-sign-ins` to the command, `volvel tenant import SLUG.tar --keep-sign-ins`, or send `keepSignIns=true` to the import route. Before it asks, the command says how many accounts it will create and whether they will have a password. The instance's log records which you chose and how many accounts were made with and without a password.

## A large tenant

Use the command line for a large tenant. It does the same as the console, through the same routes, and differs in three ways:

- It writes the archive to disk as it arrives. An export holds a database connection until its reader has taken all of it, and the instance ends one whose reader takes nothing for a while: a command line that writes to a disk reads as fast as the instance writes, which a browser tab does not promise.
- It needs no browser open for as long as the export takes. Run it in a terminal session that stays, from a machine beside the instance, or from a script.
- It shows progress on a terminal, waits and tries again when the instance is already writing as many exports as it allows, and says which setting ended an export that was ended.

The command line is not a way around the limits below: it is the same export, held to the same limits. It stays inside them because it reads without delay.

```sh
export VOLVEL_EXPORT_PASSPHRASE='a passphrase of at least 12 characters'
volvel tenant export --tenant SLUG --out SLUG.tar --history
volvel tenant import SLUG.tar --slug NEW --yes
```

`volvel tenant export` writes to `SLUG.tar.part` and renames it to `SLUG.tar` when the archive is whole. If the instance ends the export, it removes the part file and says why. It resumes nothing: run it again. When the instance answers that it is writing as many exports as it allows, or that the tenant is being exported, the command waits for the time the instance names (30 seconds) and asks again, up to 10 tries.

### The limits on exports

An instance bounds its exports so that slow readers cannot take every database connection. Four settings, in [How an instance is configured](../../reference/running/configuration):

| Setting | Default | What it limits |
| --- | --- | --- |
| `EXPORTS_AT_ONCE` | 3 | Exports the instance writes at once. The next is answered 429 with `Retry-After: 30`. |
| `EXPORTS_PER_TENANT` | 1 | Exports of one tenant at once. |
| `EXPORT_STALL_SECONDS` | 60 | Seconds the reader may take nothing before the export is ended. |
| `EXPORT_MAX_MINUTES` | 30 | Minutes one export may take, however it is read. 0 is no limit. |

Raise `EXPORT_MAX_MINUTES` (or set it to 0) when an export of a large tenant is ended at the time limit: the command says so, naming the setting. Raise `EXPORTS_AT_ONCE` only if the instance has connections to spare: each export holds one for its whole length, and one more if the tenant has a database location. Leave `EXPORT_STALL_SECONDS` alone unless a reader is slow for a reason you know, such as a slow disk.

### What size the defaults suit

One measurement: an archive of 20 MB was written in 2.1 to 2.6 seconds with one dedicated CPU, about 8 to 10 MB a second. At that rate 30 minutes is about 15 GB of archive. A tenant whose export is smaller than that finishes inside the default; a larger one needs `EXPORT_MAX_MINUTES` raised. This is one measurement on a small archive, not a measurement of a large one: the rate of a tenant with large tables or many stored files may differ. An export of a tenant that is that large has not been tried.

### What a large tenant meets

- An export reads from one snapshot of the database for its whole length, so it holds a transaction open that long. Rows written to the tenant meanwhile are not in it.
- An import takes the archive as a stream and writes it to a file in the control plane's temporary folder before it reads it: that folder needs room for the whole archive. The instance refuses a file larger than 50 GiB.
- An import is one database transaction: the tenant arrives whole or not at all, and so a very large import is one long transaction.
- A proxy in front of the instance may have a smaller body limit or a shorter timeout than the instance does. Both an upload and an export are one request.
- Moving a whole instance is not done tenant by tenant. For that, [back up the database and restore it](../running/back-up-an-instance) on the new one: see [Restore an instance](../running/restore-an-instance).

## What to do after

- Give each member a way in. The accounts the import created have no password unless you used `--keep-sign-ins`: make each person a link, see [All members](../../reference/console/members), **Make a password reset link**. A member who already had an account on this instance keeps it and its password, whichever way you imported.
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
- **"This tenant is already being exported" or "This instance is writing as many exports as it allows at once" (429).** Wait for the time in `Retry-After` and try again. The command line does so by itself, 10 times.
- **An export stops part-way.** The instance ended it: it was not read for `EXPORT_STALL_SECONDS`, or it took longer than `EXPORT_MAX_MINUTES`. The command line names the one it was.
- **The Import button stays disabled after you typed.** It waits for a check made with what is typed: wait a moment, or press **Check again**.
- **"No database location is registered as "X"."** Register it first.
- A staged upload that you do not import is removed an hour after it came. **Throw it away** removes it at once.
