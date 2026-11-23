---
title: Install Volvel on one machine
description: Start an instance with Docker Compose on a single machine, sign in as its first operator, check that it is ready and that a script runs, take a backup, and keep the master key.
subjects: [install, backup, instance]
---

You will have an instance running on your machine with its own database, object store and worker host, signed in as its first operator, with a script that ran and a backup of its database. It takes about 30 minutes. Nothing here is for production: see [the proxy how-to](../how-to/running/put-a-proxy-in-front) before anyone else can reach it.

## Before you start

- A machine with Docker and Docker Compose, 2 GB of memory free, and a checkout of this repository. Run the commands in the folder `deploy/compose` of the checkout.
- An image of Volvel. No image is published yet, so Compose builds one from the checkout when you start it, which needs the internet. If you already have an image, name it in `VOLVEL_IMAGE`, as step 3 does. The run behind this page used an image built earlier on the same machine.
- Port 8095 free on the machine. Use another if it is not, and change it in both places step 2 says.
- `openssl`, to make the secrets.

:::steps
1. **Copy the settings file.**

   ```bash
   cp .env.example .env
   chmod 600 .env
   ```

   Open `.env`. The line `COMPOSE_PROFILES=postgres,objectstore` starts the database and the object store that come with the stack. Without it neither starts.

2. **Fill in the secrets.** Set each of these in `.env`, with the value from the command beside it:

   | Setting | Value |
   | --- | --- |
   | `POSTGRES_PASSWORD` | `openssl rand -hex 24` |
   | `OBJECTSTORE_SECRET` | `openssl rand -hex 24` |
   | `AUTH_SECRET` | `openssl rand -hex 32` |
   | `MASTER_KEY` | `openssl rand -base64 32` |
   | `WORKER_HOST_TOKEN` | `openssl rand -hex 32` |

   Then set `PUBLIC_URL=http://localhost:8095` and `VOLVEL_BIND=127.0.0.1:8095`, the address people type and the address the container is reached at. Set `BOOTSTRAP_ADMIN_EMAIL=owner@example.com` and `BOOTSTRAP_ADMIN_PASSWORD` to a password of at least 12 characters: they make the first operator admin on the first start.

   :::alert[Copy the master key now]{type=warning}
   `MASTER_KEY` wraps every tenant's encryption key. The `.env` file says: "Back this up somewhere safe. Without it, no stored secret can ever be read again." Copy the file to a place that is not this machine.
   :::

3. **Start it.**

   ```bash
   docker compose -f compose.yaml up -d
   ```

   To use an image you have, put `VOLVEL_IMAGE=your/image:tag` before the command. Compose starts four services: `postgres`, `objectstore`, `control-plane` and `worker-host`.

4. **Check that it is ready.**

   ```bash
   docker compose -f compose.yaml ps
   curl http://127.0.0.1:8095/api/v1/readyz
   ```

   `ps` lists the four services, each **healthy** (the worker host reads "health: starting" for a few seconds). The `curl` answers `{"status":"ready","checks":{"database":{"ok":true,…},"objectStore":{"ok":true}}}`.

5. **Check the settings.**

   ```bash
   docker compose -f compose.yaml exec control-plane node dist/main.js check-config
   ```

   It says "The settings are valid." and exits 0. When something is wrong it says every problem at once and exits 1.

6. **Sign in as the first operator.** Open `http://localhost:8095` in a browser. Type `owner@example.com`, press **Continue**, type the password and press **Sign in**. The first screen is **Tenants**: "No tenants yet", "A tenant is one client organization. Create the first one to start adding workspaces and members."

7. **Read the Health screen.** In the menu on the left under **Instance**, choose **Health**. It says **Ready**, "This replica takes requests.", the database and object store as **Answers**, **Version** `0.5.0`, and under **MASTER KEY** a fingerprint of your key, with `MASTER_KEY_SECONDARY` **Not set**. Under **THIS REPLICA'S SETTINGS** it says **Workers** "Started in a worker host", and **Address** `http://localhost:8095`. **Apps** says "Not served yet: set APPS_URL", which only matters for apps written as code.

8. **Run a script.** Follow [your first script](../../start/tutorials/your-first-script), from step 1, on this instance. The test pane shows **Succeeded**, and the workspace's **First steps** list has **A worker to run code** done. The worker host starts the worker that ran it.

9. **Take a backup.**

   ```bash
   docker compose -f compose.yaml exec -T postgres pg_dump -U platform platform > backup.sql
   ```

   The file is the instance's database: in the run behind this page it was 262 KB and held 110 `CREATE TABLE` statements. The object store holds uploaded bundles and files and is backed up separately. A dump is no use without the `MASTER_KEY` that sealed what is in it: keep each key as long as the backups it sealed.

10. **Remove the first-operator lines.** Delete `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_PASSWORD` from `.env`, as its comment says to, and run step 3 again. The control plane restarts. Sign in again: the same operator, the same tenants.

11. **Check from the command line.** From the checkout, `VOLVEL_URL=http://localhost:8095 node packages/cli/dist/bin.js status` says the version and "Ready".
:::

## What you built

- An instance on `http://localhost:8095`: a control plane, a worker host, a database and an object store, as four containers of one Compose project.
- A first operator, and a `.env` that holds the instance's secrets. It is the only copy of the master key, and it is the file to back up.
- A backup of the database, `backup.sql`, and a script that ran on a worker the instance started.

To stop the instance and keep its data: `docker compose -f compose.yaml stop`. `docker compose -f compose.yaml down -v` also deletes the database and the object store.
