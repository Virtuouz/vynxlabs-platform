---
title: Run a standalone worker in another network
description: "Run a tenant's scripts next to systems the instance cannot reach, with a worker that only makes outbound requests and takes its credential from a file."
subjects: [workers, install]
---

## Run a standalone worker in another network

By the end a worker you run in another network takes a tenant's scripts, and nothing has to be opened toward it. A worker makes outbound HTTPS requests to the instance and publishes no port.

## Before you start

- You need `worker:write` in the tenant, to create a credential.
- A machine in the other network with Docker and Compose, that reaches the instance's address, and the image (see [Build the image from source](build-the-image)). The worker ships inside it.
- The worker is best run at the same version as the instance. Upgrade the instance first.

## Run it

:::steps
1. In the console, open the tenant's **Workers** page and create a credential. Give it a pool, for example `plant`, if only some scripts should run there. The token is shown once. Via the API: `POST /api/v1/tenants/<id>/worker-credentials` with `name` and, optionally, `pool` and `workspaceId`.
2. In the tenant's repository, give the scripts that should run there `worker: "plant"`.
3. On the machine in that network, copy `deploy/worker/compose.yaml`, and make a file `.env` beside it:

   ```bash
   VOLVEL_IMAGE=volvel/volvel:docs
   VOLVEL_URL=https://volvel.example.com
   ```

   `VOLVEL_URL` is the instance's address as the worker reaches it. `VOLVEL_WORKER_CONCURRENCY` (4 when empty) is how many runs it handles at once. `VOLVEL_WORKER_IDLE_EXIT` (never when empty) is the seconds with nothing to do before it exits.
4. Write the token into a file named `worker-token` beside the Compose file, and keep it to yourself: `chmod 600 worker-token`. The container runs as the user `node`, uid 1000, and reads the file as it is on the machine, so the file must be readable by uid 1000. If your user has another uid, run `sudo chown 1000 worker-token`, or the worker cannot read it.
5. Start it:

   ```bash
   docker compose -f deploy/worker/compose.yaml up -d --wait
   ```
:::

## The result

The container becomes healthy, and its log says "worker started" with the worker's ID. The tenant's **Workers** page lists it, and `GET /api/v1/tenants/<id>/workers` lists it with its credential's name and `managed: false`. A script that names a pool runs only on a worker of that pool. A script that names none runs on the workers the instance starts. To have a tenant run nothing on the instance at all, choose "Run only on our own workers" on its Workers page.

A run that is waiting with no worker connected that could take it says so on its page.

## Without Compose

```bash
printf '%s\n' 'the credential' | volvel-worker --url https://volvel.example.com --token-stdin
volvel-worker --url https://volvel.example.com --token-file ./worker-token
```

| Option | Meaning |
| --- | --- |
| `--url <address>` | The instance's address. `VOLVEL_URL` also sets it. |
| `--token-stdin` | Read the credential from the first line of standard input. |
| `--token-file <path>` | Read it from the first line of a file. |
| `--token <credential>` | Give it on the command line. Other processes of the same user can read it. `VOLVEL_WORKER_TOKEN` also sets it. |
| `--concurrency <n>` | Runs handled at once. Default 4. |
| `--idle-exit <s>` | Exit after this many seconds with nothing to do. |

Without `--url` and a credential the worker says "volvel-worker needs --url and a credential: --token-file, --token-stdin or --token, or VOLVEL_URL and VOLVEL_WORKER_TOKEN." and exits. The worker finishes the scripts it has before it stops; the Compose file gives it 300 seconds, so raise `stop_grace_period` to the longest script you run.

## The credential

The token comes from `--token-file`, which the Compose file points at a Compose secret, `/run/secrets/worker_token`. Prefer it to `--token` or `VOLVEL_WORKER_TOKEN`: an environment is shown by `docker inspect`, and a script's process runs as the worker's own user, which can read the environment and command line of processes. `--token-stdin` also works. The credential is never given to the process a script runs in. An older `.env` that held `VOLVEL_WORKER_TOKEN` must move it into the `worker-token` file.

## If it does not work

- **The container is unhealthy.** It is healthy while the instance answered its last request for work, which it asks every 20 seconds at most. A worker that cannot reach `VOLVEL_URL`, or was refused, is not.
- **The log says the token was refused.** The credential was revoked, expired, or belongs to another instance.
- **Scripts do not arrive.** The pool names differ, or the credential is for one workspace only.
- **The log warns "kernel.yama.ptrace_scope is 0: a script could read this worker's memory. Set it to 1 or more."** Scripts run as the worker's own user. Set `kernel.yama.ptrace_scope` to 1 or more on the machine.
- **The worker cannot read the token file.** See step 4: uid 1000.
- **The worker shows "Older version, takes no tasks".** The worker is older than 0.6.0, or older than the instance. Update it to the instance's version.
- **The worker has no memory guard.** A standalone worker has no run slots and no floor. Size it by `VOLVEL_WORKER_CONCURRENCY`.

Related: [Workers, users and what a script can reach](../../explanation/running/managed-workers-and-isolation), [Sizing and scaling](../../explanation/running/sizing-and-scaling).
