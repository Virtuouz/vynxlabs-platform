---
title: Install an instance with Compose
description: "Start an instance on one machine with the Compose file in the repository, sign in as the first operator and remove the bootstrap settings."
subjects: [install]
---

## Install an instance with Compose

By the end you will have an instance running on one machine, with its own Postgres and object store, and you will be signed in to the console as its first operator.

## Before you start

- Docker with Compose, and a machine with 2 GB of memory to start.
- The repository, for the Compose file in `deploy/compose`, and an image. The normal way is to pull a release (step 3). To run other code, build one ([Build the image from source](build-the-image)) or let Compose build it.
- The other [requirements](../../reference/running/requirements).
- A machine for a trial can use `http://localhost:8080`. For anyone else, a [proxy with TLS](put-a-proxy-in-front) goes in front before they can reach it.

## Install

:::steps
1. From the repository root, copy the example settings:

   ```bash
   cp deploy/compose/.env.example deploy/compose/.env
   chmod 600 deploy/compose/.env
   ```

2. Fill in `deploy/compose/.env`. Each value below is a line in the file. Avoid characters that need escaping in a URL.

   | Setting | What to put |
   | --- | --- |
   | `COMPOSE_PROFILES` | Leave `postgres,objectstore`. Without it neither bundled service starts. |
   | `POSTGRES_PASSWORD`, `OBJECTSTORE_SECRET` | Long random values: `openssl rand -hex 24`. |
   | `AUTH_SECRET` | `openssl rand -hex 32`. At least 32 characters. |
   | `MASTER_KEY` | `openssl rand -base64 32`. **Keep a copy somewhere safe.** Without it no stored secret can be read again. |
   | `WORKER_HOST_TOKEN` | `openssl rand -hex 32`. At least 32 characters. |
   | `PUBLIC_URL` | The address people will type, for example `https://volvel.example.com`. For a trial, `http://localhost:8080`. |
   | `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD` | The first operator. The password is at least 12 characters. |
   | `VOLVEL_BIND` | Where it listens on the host. The default is `127.0.0.1:8080`. |
   | `MANAGED_WORKER_UID`, `MANAGED_WORKER_GID`, `MANAGED_WORKER_USERS` | Leave them out. The defaults, `10001`, `10001` and `256`, are used. Write them only to change them. |

3. Pull the image of the release. It is on Docker Hub from 0.6.0:

   ```bash
   docker pull volvel/volvel:0.6.0
   ```

   Then name it in `deploy/compose/.env`: `VOLVEL_IMAGE=volvel/volvel:0.6.0`. Without `VOLVEL_IMAGE`, Compose builds an image from the repository and names it `volvel/volvel:local`.
4. Start it:

   ```bash
   docker compose -f deploy/compose/compose.yaml up -d --wait
   ```

   Compose starts Postgres and the object store, then the control plane, then the worker host. The control plane makes and migrates the database on its first start. The command returns when every service is healthy.
5. Check it. `curl http://localhost:8080/api/v1/readyz` answers 200 with `"status":"ready"`, and `curl http://localhost:8080/api/v1/instance` names the version and the migration level.
6. Open `PUBLIC_URL` in a browser and sign in with `BOOTSTRAP_ADMIN_EMAIL` and its password. You are an operator admin. Create a tenant from **Instance**, then **All tenants**.
7. Remove `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_PASSWORD` from `.env`, and apply the change: `docker compose -f deploy/compose/compose.yaml up -d`.
:::

## The result

Four containers run: `control-plane`, `worker-host`, `postgres` and `objectstore`. The control plane listens on `VOLVEL_BIND`. The log of the control plane says "created the first operator admin" once. Only `postgres` and `objectstore` hold data, in the volumes `postgres` and `objectstore` of the Compose project.

The first operator is made only when the instance has no members. On any later start the two settings do nothing, so removing them is tidiness, and keeps a password out of the file.

Next:

- [Put a proxy in front](put-a-proxy-in-front) before anyone else reaches it.
- [Back up an instance](back-up-an-instance) and try a [restore](restore-an-instance).
- To try the instance with a demo tenant, [Set up the Fernhill example](../../../start/how-to/example/set-up-the-fernhill-example).
- To use your own database or store, see [Use your own Postgres](use-your-own-postgres) and [Use your own object store](use-your-own-object-store).

## If it does not work

- **A container restarts on start.** Read its log: `docker compose -f deploy/compose/compose.yaml logs control-plane`. A missing or malformed setting is named there, every problem at once. `docker compose run --rm --no-deps control-plane node dist/main.js check-config` says whether the settings are valid and opens nothing.
- **`up` stops with "set PUBLIC_URL in .env".** The Compose file requires `PUBLIC_URL`, `AUTH_SECRET`, `MASTER_KEY` and `WORKER_HOST_TOKEN`.
- **No database starts.** `COMPOSE_PROFILES=postgres,objectstore` is missing from `.env`.
- **The worker host is unhealthy.** Read `docker compose logs worker-host`. A worker user setting that is not a whole number stops it.
- **Sign-in fails.** The instance made the first operator only at its first start, and only with both settings. If the instance has members and nobody can sign in, see [Recover an operator](recover-an-operator).
- **"The instance has no members. Set BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD and restart..."** in the log: add them and restart.

To be led through it from a fresh checkout, with a script run and a backup, and to see what each screen says, follow the tutorial [Install Volvel on one machine](../../tutorials/install-on-one-machine). This page is the short form for someone who knows what they want: it does not run a script or take a backup.

Related: [Settings](../../reference/settings), [Configuration groups](../../reference/running/configuration), [Install on Fly.io](install-on-fly).
