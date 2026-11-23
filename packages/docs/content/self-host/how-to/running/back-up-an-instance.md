---
title: Back up an instance
description: "What to back up, in what order, and how, with a pg_dump of the database, a copy of the object store and the master key."
subjects: [backup, database]
---

## Back up an instance

By the end you have the three things a restore needs: a copy of Postgres, a copy of the object store and every master key, taken close together.

## Before you start

- Access to the machine, or the provider's console, for Postgres and the object store.
- `MASTER_KEY` is kept once somewhere that is not the instance's disk, and again after each rotation, with the old one kept for older backups.
- If a tenant has a dedicated database, back it up too. The instance's database holds only its address.

## Back up

:::steps
1. Take the Postgres backup. Use your provider's point-in-time recovery, or `pg_dump` on a schedule. With the bundled Postgres:

   ```bash
   docker compose -f deploy/compose/compose.yaml exec -T postgres \
     pg_dump -U platform --no-owner -Fc platform > platform.dump
   ```

   `--no-owner` is what lets the dump be restored under any user or database name. A dump taken this way is a backup: the instance makes its policies again at the first start after a restore.
2. Back up the object store, close to the time of the dump. For an S3 service, copy the bucket with your provider's tool. For the bundled store, stop it and copy its volume:

   ```bash
   docker compose -f deploy/compose/compose.yaml stop objectstore
   docker run --rm -v <project>_objectstore:/data:ro -v "$PWD":/backup postgres:18 \
     tar czf /backup/objectstore.tgz -C /data .
   docker compose -f deploy/compose/compose.yaml start objectstore
   ```

   `<project>` is the Compose project name, `volvel` unless you gave `-p`. Copying a running store's files may not give a store that opens.
3. Keep the `.env` of the instance, or at least `MASTER_KEY` and `AUTH_SECRET`, with the backup, on another disk.
4. For a dedicated database, run its own `pg_dump` at the same moment.
5. Try a restore on another machine. A backup is a backup once a restore from it has worked: [Restore an instance](restore-an-instance).
:::

A tenant can also be backed up by itself, as an export, from its own **Export** page or with `volvel tenant export`. The file holds everything the tenant has, with its secrets encrypted under a passphrase. Treat it like a database backup.

## The result

Three things, from about the same moment:

| What | Why |
| --- | --- |
| A Postgres dump (and each dedicated database's) | Everything except files. |
| The object store | Bundles, uploaded files, large payloads and archived audit months. |
| The master key that sealed it, and `AUTH_SECRET` | Without the key no stored secret can be read. `AUTH_SECRET` can be replaced: see [Change AUTH_SECRET](change-auth-secret). |

A database that names a file the store does not have says so when the file is asked for, and not before.

## If it does not work

- **`pg_dump` is newer or older than the server.** Use the server's own `pg_dump`, as in the command above.
- **A dump taken without `--no-owner` fails to restore under another user.** Take it again with the option.

Related: [Restore an instance](restore-an-instance), [Upgrade an instance](upgrade-an-instance).
