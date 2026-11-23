---
title: Restore an instance
description: "Bring back the database, the object store and the keys together, under the same or another database name, and check that the restore is whole."
subjects: [backup]
---

## Restore an instance

By the end an instance runs from a backup: the same tenants, tables, rows and files, signed in with the same passwords. This procedure was run on a fresh Compose stack for this page.

## Before you start

- A Postgres dump taken with `--no-owner` and an object store copy from about the same time ([Back up an instance](back-up-an-instance)).
- The `MASTER_KEY` the backup was sealed with. If a rotation happened after the backup, you need both keys.
- `AUTH_SECRET`. A different one works, and signs everyone out ([Change AUTH_SECRET](change-auth-secret)).
- The instance's `.env`. The restore target has the same `COMPOSE_PROFILES`, `POSTGRES_PASSWORD` and `OBJECTSTORE_SECRET`, or whatever your own services use.
- If tenants use dedicated databases, backups of those from the same moment.
- Every replica of the control plane and the worker host stopped, if you restore over a running instance.

## Restore

:::steps
1. Start only the database, so the control plane does not run on an empty one: `docker compose -f deploy/compose/compose.yaml up -d --wait postgres`.
2. Restore the object store into its volume. For the bundled store:

   ```bash
   docker compose -f deploy/compose/compose.yaml create objectstore
   docker run --rm -v <project>_objectstore:/data -v "$PWD":/backup:ro postgres:18 \
     tar xzf /backup/objectstore.tgz -C /data
   ```

3. Restore the dump into the empty database:

   ```bash
   docker compose -f deploy/compose/compose.yaml exec -T postgres \
     pg_restore -U platform -d platform --no-owner < platform.dump
   ```

   `pg_restore` reports 5 errors and ends with "warning: errors ignored on restore: 5", exit status 1. All five are about a role that does not exist on the new server, `vxd_` and a number: a policy and four grants that name the instance's data role. That is expected. The instance makes the role and its policies again at start. Do not use `--exit-on-error`: it stops at the first of them, and leaves tables that have no policies.
4. Put back the keys. Set `MASTER_KEY` in `.env` to the key the backup was sealed with. If a rotation happened since, set that older key as `MASTER_KEY_SECONDARY` and the current one as `MASTER_KEY`. See [Rotate the master key](rotate-the-master-key). Keep `AUTH_SECRET` as it was.
5. Start everything: `docker compose -f deploy/compose/compose.yaml up -d --wait`. Migrations run on start: a restore is a database of an earlier level, and it moves forward. The log says "row policies now read the signed claim" with the number of tables it made policies for.
6. Check. `GET /api/v1/readyz` answers 200. Open **Instance**, then **Health**: the database and the object store answer, and **Master key** lists no value that opened with neither key. Open a tenant that holds a file and read the file: that shows the two backups agree. Add a row to a table: that shows the policies are back.
:::

## The result

The instance runs from the backup. The data role's password is made again from the secret kept in the database as each replica starts, so tenants' tables answer without a step of yours. In the run for this page, the restored stack listed the tenant, read its three rows, returned the file's 28 bytes and accepted a new row, and the earlier password still signed in.

The restored database may carry a different name. The data role's name comes from the database name, and the instance gives its policies to whichever role it now uses.

## If it does not work

- **The instance stops at start and the log says "Unsupported state or unable to authenticate data".** `MASTER_KEY` is not the key the backup was sealed with. The instance cannot open the data role's seed.
- **"The database is at migration N but this build only knows migrations up to M."** An older image was started on a newer database. Start the newer image.
- **A tenant's tables answer 403 or are empty.** The policies were not made. Restart the control plane and check its log for "row policies now read the signed claim".
- **A file is asked for and is missing.** The store copy is older than the database. Restore a store copy from closer to the dump.
- **A dedicated database answers 503.** It was not restored, or its address is out of date. See [Give a tenant a database of its own](give-a-tenant-its-own-database).
- **Rate limit counts start again from zero after a crash.** The table that holds them is not written to Postgres's log, so a crash empties it. A restore from a dump brings back what the dump held.

Related: [Upgrade Postgres to a newer major version](upgrade-postgres), [Settings](../../reference/settings).
