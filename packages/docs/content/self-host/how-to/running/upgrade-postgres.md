---
title: Upgrade Postgres to a newer major version
description: "Move an instance to a newer Postgres major version by restoring into a new server, then check that tenants' tables answer."
subjects: [database, upgrade]
---

## Upgrade Postgres to a newer major version

By the end the instance runs on a newer Postgres major version. The instance does not care which major version it runs on, only that the version is 16 or later. Moving is a restore into a new server.

:::alert[Written from the code, not run]{type=warning}
The steps below were not run as a major-version upgrade. The dump, the restore into an empty server and the first start are the same steps that [Restore an instance](restore-an-instance) ran.
:::

## Before you start

- A [backup](back-up-an-instance). Keep the dump until the new server has run for a while.
- A new Postgres server of the version you want, with a database owned by a user who may create roles (`CREATEROLE`).
- Every replica of the control plane and the worker host can be stopped.

## Upgrade

:::steps
1. Stop every replica of the control plane and the worker host: `docker compose -f deploy/compose/compose.yaml stop control-plane worker-host`.
2. Dump the instance's database with the new version's `pg_dump`, and restore it into the new server with `pg_restore --no-owner`, into a database owned by the same user. Do the same for every dedicated database. `pg_upgrade` on a server you manage yourself does the same job in place. The restore reports errors about a role named `vxd_` and a number: see [Restore an instance](restore-an-instance).
3. Point `DATABASE_URL` at the new server, and start the control plane. It makes the roles it signs in as for tenants' rows again from the secret kept in the database, so the roles of the old server need not be carried over.
4. Check `GET /api/v1/readyz` and **Instance**, then **Health**, then open a tenant's table.
:::

With the bundled Postgres in Compose, the data lives in a volume of its own: dump from the old container, change the image tag in the Compose file, remove the volume, start the new container and restore.

## The result

`readyz` shows the database `ok` and a tenant's table reads and takes a row.

## If it does not work

- **A tenant's table answers 403.** Restart the control plane. It makes the policies at start.
- **The restore says the role may not create roles.** The user needs `CREATEROLE`.

Related: [Use your own Postgres](use-your-own-postgres), [Requirements](../../reference/running/requirements).
