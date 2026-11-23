---
title: Run a standalone worker
description: "Start volvel-worker on a machine of your own for a pool, with the credential read from standard input or a file, in a shell or with the worker's Compose file."
subjects: [workers, pools]
---

## Run a standalone worker

By the end a worker on a machine of your own is online for a pool, and runs the scripts that name it. The worker makes only outbound calls to the instance and publishes no port.

## Before you start

- A tenant admin has made a pool and a credential for it: [Add a worker pool](../../../administer/how-to/sso/add-a-worker-pool). The credential is shown once, and begins `vxw_`.
- The machine reaches the instance's address.
- The same version of Volvel as the instance. A worker older than 0.6.0 shows **Older version** and takes no tasks of the platform.

## Steps

:::steps
1. Save the credential where the worker can read it, and nowhere else. A worker reads it from the first line of standard input or of a file.
2. Start the worker, in one of these two ways.
3. Look at the tenant's **Workers** screen. The pool shows "1 online".
:::

:::tabs
::::tab{label="A command"}
```bash
printf '%s\n' 'the credential' | volvel-worker --url https://volvel.example.com --token-stdin
```

`--token-stdin` reads the credential from the first line of standard input, which keeps it out of the process's environment and command line. To read it from a file, such as a secret:

```bash
volvel-worker --url https://volvel.example.com --token-file ./worker-token
```
::::
::::tab{label="Compose"}
```bash
cd deploy/worker
cp .env.example .env
umask 077; printf '%s\n' 'the credential' > worker-token
docker compose up -d
```

Fill `.env` first: `VOLVEL_IMAGE`, the same image the instance runs at the same version, and `VOLVEL_URL`, the address of the instance as the worker reaches it. The credential is not set in `.env`; the file `worker-token` beside `compose.yaml` holds it as one line.
::::
:::

## Options

| Option | Meaning |
| --- | --- |
| `--url <address>` | The instance's address. `VOLVEL_URL` also sets it. |
| `--token-stdin` | Read the credential from the first line of standard input. |
| `--token-file <path>` | Read it from the first line of a file. |
| `--token <credential>` | Give it on the command line. Other processes of the same user can read it; prefer the two above. `VOLVEL_WORKER_TOKEN` also sets it. |
| `--concurrency <n>` | Runs handled at once. Default 4. `VOLVEL_WORKER_CONCURRENCY` also sets it. |
| `--idle-exit <s>` | Exit after this many seconds with nothing to do. `VOLVEL_WORKER_IDLE_EXIT` also sets it. |

Without `--url` and a credential, the worker says "volvel-worker needs --url and a credential: --token-file, --token-stdin or --token, or VOLVEL_URL and VOLVEL_WORKER_TOKEN." and exits.

The worker finishes the scripts it has before it stops. The Compose file gives it 300 seconds to stop; raise `stop_grace_period` to the longest script you run. A worker started with Compose is healthy while the instance answered its last request for work, which it makes every 20 seconds at most.

## The result

The log says `worker started`. On the tenant's **Workers** screen the pool shows "1 online", and the worker is listed under **Workers online** with its credential's name and its version.

## If it does not work

| You see | Cause and fix |
| --- | --- |
| The worker exits at once with the message above | The address or the credential is missing. |
| The pool shows "No worker online" | The credential was revoked, names another pool, or the machine cannot reach the instance. |
| The log warns "kernel.yama.ptrace_scope is 0: a script could read this worker's memory. Set it to 1 or more." | Scripts run as the worker's own user, and with that setting a script could read the worker's memory, credential included. Set `kernel.yama.ptrace_scope` to 1 or more on the machine. |
