---
title: Upgrade Postgres to a newer major version
description: "Move an instance to a newer Postgres major version by restoring into a new server, then check that tenants' tables answer."
subjects: [database, upgrade]
---

## Upgrade Postgres to a newer major version

By the end the instance runs on a newer Postgres major version. The instance does not care which major version it runs on, only that the version is 16 or later. Moving is a restore into a new server.

This procedure was run on a Compose stack from Postgres 16 to Postgres 18, with a tenant, a table and rows: the three rows read after the move, and a new row was accepted. Other major versions were not run.

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

With the bundled Postgres in Compose, the data lives in a volume of its own. Stop the control plane and the worker host, then dump with the new version's client, over the Compose network, so the dump is made before the old container goes:

```bash
docker run --rm --network <project>_data -e PGPASSWORD=<POSTGRES_PASSWORD> -v "$PWD":/out \
  postgres:18 pg_dump -h postgres -U platform --no-owner -Fc platform -f /out/platform.dump
```

Then stop and remove the `postgres` container, remove the volume `<project>_postgres`, change the image tag in the Compose file, start only `postgres`, and restore as in [Restore an instance](restore-an-instance) (`pg_restore ... --no-owner`, which ends with the five expected `vxd_` errors and exit status 1). Start everything.

## The result

`readyz` shows the database `ok` and a tenant's table reads and takes a row.

## If it does not work

- **A tenant's table answers 403.** Restart the control plane. It makes the policies at start.
- **The restore says the role may not create roles.** The user needs `CREATEROLE`.

Related: [Use your own Postgres](use-your-own-postgres), [Requirements](../../reference/running/requirements).
