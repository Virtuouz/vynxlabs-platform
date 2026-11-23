---
title: Use your own Postgres
description: "Point an instance at a Postgres you run, with the role and rights it needs."
subjects: [database, install]
---

## Use your own Postgres

By the end the instance keeps its records, its queue and its tenants' tables in a Postgres you run, and the bundled one is not started.

## Before you start

- Postgres 16 or later. CI tests 16 and 18.
- An empty database, and a user that owns it and may create roles (`CREATEROLE`). It does not need to be a superuser.
- The extension `pg_trgm` is optional.
- Connection from the control plane. A managed Postgres with point-in-time recovery is the better choice for anything that matters.
- Not a transaction pooler. The instance listens for changes, takes session locks and signs in again as other roles on a connection.

## Set it up

:::steps
1. Create the database and its owner. For example, as an administrator:

   ```sql
   create role volvel login password '<a long random password>' createrole;
   create database volvel owner volvel;
   ```

2. In `deploy/compose/.env`, take `postgres` out of `COMPOSE_PROFILES`, so that it reads `objectstore` or whatever else you still use.
3. Add the address:

   ```bash
   DATABASE_URL=postgres://volvel:<password>@db.example.com:5432/volvel
   ```

   Add `?sslmode=require` when the server needs TLS.
4. Restart: `docker compose -f deploy/compose/compose.yaml up -d`. The control plane migrates the database on start.
:::

## The result

`GET /api/v1/readyz` shows the database `ok`. The instance made one more role for itself in the database, which it signs in as for every request for a tenant's rows. The role owns nothing, so row policies apply to it. Its password is made from a secret sealed in the database and is never stored.

## If it does not work

- **The instance does not start and names the database.** The log says why. The user must own the database and be allowed to create roles.
- **Connections run out.** Add up `DATABASE_POOL_SIZE + DATA_POOL_SIZE + 3` for each replica, and more for dedicated databases and data sources. See [Sizing and scaling](../../explanation/running/sizing-and-scaling).
- **A tenant's tables answer 503 after a restore or a move.** See [Restore an instance](restore-an-instance).

Related: [Upgrade Postgres to a newer major version](upgrade-postgres), [Dedicated databases](give-a-tenant-its-own-database).
