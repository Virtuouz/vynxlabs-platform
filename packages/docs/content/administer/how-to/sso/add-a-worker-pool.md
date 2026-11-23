---
title: Add a worker pool
description: "Make a pool for code that must run somewhere particular, make a credential for it, point a script at it with worker, and see its workers come online."
subjects: [workers, pools]
---

## Add a worker pool

By the end a script that names your pool runs only on workers that signed in with a credential for it, such as workers inside a client's network.

## Before you start

- You hold `worker:write`. A tenant admin has it.
- A machine where the worker will run, which can reach the instance's address. The worker makes only outbound calls.
- A script. A script names its pool in its definition with `worker`.

## Steps

:::steps
1. Open **Tenant**, then **Workers**, and press **Add pool**.
2. Type a **Name**: lower case letters, digits and dashes, at most 40 characters, for example `warehouse`. The name `default` is refused. Add a **Description** if you like and press **Add pool**. The pool is listed with "No worker online".
3. Under **Credentials for standalone workers**, press **Create credential**. Give it a **Name**. In **Pool** choose your pool. In **Runs code of** choose **Every workspace of the tenant**, or one workspace so that the machine holds only that workspace's code. Press **Create credential**.
4. Copy the credential, or the command under it, now. It is shown once.
5. On the machine, start a worker with the command. See [Run a standalone worker](../../../self-host/how-to/sso/run-a-standalone-worker).
6. In the script, set `worker` in the options of `defineScript` to the pool's name, for example `worker: "warehouse"`, and deploy it.
:::

## The result

**Workers** shows the pool's state as "1 online" with when it was last seen, and the worker under **Workers online** with its version and "idle". A run of a script that names the pool is taken by that worker. Runs that no worker can take are under **Queue**, in the row for the pool, until one comes online.

## Take a pool away

A pool with a credential that is not revoked cannot be removed: "Revoke the credentials that serve this pool first." Revoke each credential: **Revoke** asks `Revoke "<name>"? A worker using it stops.` and the credential shows **Revoked**. Then open the pool's row menu and choose **Remove the pool**. It asks `Remove the pool "<name>"?` and says "Scripts that name it wait until it is made again."

## If it does not work

| You see | Cause and fix |
| --- | --- |
| "No worker online" with a warning | Workspaces use the pool and no worker is up. Start the worker, and check it reaches the instance. |
| **Not made** next to a pool name | A script names a pool nobody made here. Add it with that name. |
| **Older version** and "takes no tasks" beside a worker | The worker is older than 0.6.0. It takes none of the tasks Volvel itself sets. Update it. |
| Scripts wait in **Queue** | No online worker holds a credential for their pool and workspace. |

The button under the table, **Let the instance run workers** (or **Run only on our own workers** while it is on), is about the default pool only. See [Worker pools](../../explanation/sso/worker-pools).
