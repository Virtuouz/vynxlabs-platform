---
title: Workers
topic: tenant-workers
description: "Every control, state and permission of the Workers screen: the queue, the worker pools, the switch for workers the instance starts, and the credentials of standalone workers."
subjects: [workers, pools]
moved_from:
  - tenant/workers
---

The **Workers** screen shows where the tenant's scripts run. A script runs on a worker. A **pool** is a place code runs, such as a client's network. A script names its pool with `worker`, and only a worker that signed in with a credential for that pool runs it. A script that names no pool runs in the **Default pool**.

The screen is under **Tenant**, in the group **Delivery**. F1 opens the help topic `tenant-workers`. For the idea, see [Worker pools](../../explanation/sso/worker-pools).

::screenshot{name=administer/sso-workers-pools alt="The Workers screen: an empty queue, the table of pools with one pool that has a worker online, the line about workers the instance starts, and the credentials table."}

## Queue

**Queue** shows what waits for a worker.

| Part | What it shows |
| --- | --- |
| A notice | "Runs are waiting in <workspace>" (or "in N places"), "the oldest for <time>.", when any run is due and waiting. |
| The table | **Workspace** (a link to the workspace's queued runs), **Pool** (`default` for none), **Waiting**, **Oldest**, **Later** and **Running**. |
| Empty | "Nothing is waiting, and nothing is running." |
| Tasks | "N tasks for Volvel waiting too: reading schemas, sending alerts, trying connections." |
| **Workers online** | Each worker's credential name, its version, "idle" or "running <scripts>". A worker older than 0.6.0 shows **Older version** and "takes no tasks". An instance older than 0.6.0 counts a worker of its own version as current. |

## Pools

**Add pool** opens a dialog with **Name** ("Lower case letters, digits and dashes", at most 40 characters, with single dashes between words) and an optional **Description** (at most 300 characters). The name `default` is refused. A pool is made without a worker; make a credential for it next.

| Column | What it shows |
| --- | --- |
| **State** | "N online" with when it was last seen, or "No worker online" with "last seen <time>" or "never seen". The state is a warning when workspaces use the pool, no worker is online and the instance does not run it. |
| **Pool** | The name, or **Default pool** ("Runs every script that names no pool."). Tags: **Instance-run**, and **Not made** for a pool that a script names and nobody made. The description shows under the name. |
| **Runs code of** | The workspaces whose scripts name the pool, or "No workspace yet". |
| **Credentials** | How many credentials serve the pool. |

A made pool has the row action **Remove the pool**. It asks 'Remove the pool "<name>"?' and says "Scripts that name it wait until it is made again." It is refused while a credential that is not revoked serves the pool: "Revoke the credentials that serve this pool first." The empty state is "No pool yet": "Scripts that name no pool use the default."

### Workers the instance starts

A line under the table says which of these is true:

| Line | When |
| --- | --- |
| "The instance starts no workers for this tenant." | The tenant switch is off. |
| "The instance starts workers for the default pool when there is work." | The switch is on and the instance starts workers. |
| "This tenant lets the instance start workers, but the instance starts no workers for any tenant. Ask its operator, or run your own." | The switch is on and the instance starts none. |
| "The instance would start workers for this tenant, and does not: see above." | The instance refuses this tenant, with a notice "This tenant's code runs on standalone workers only." |

The button is **Run only on our own workers** (it asks "Stop the instance starting workers?" and says how many credentials serve the default pool) or **Let the instance run workers**. If an operator turned the switch off, the button is replaced by "An operator turned this off. Only an operator can turn it on again." The switch needs `tenant:write`.

## Credentials for standalone workers

The text under the title shows the command `volvel-worker --url <instance address> --token-stdin`. **Create credential** opens a dialog.

| Field | What it takes |
| --- | --- |
| **Name** | For example "Warehouse network". |
| **Pool** | **Default pool: scripts that name no pool**, or one of the made pools. "The worker runs only the scripts of this pool." |
| **Runs code of** | **Every workspace of the tenant**, or one workspace. "A worker for one workspace never runs another's scripts, so a client's network holds only that client's code." |

The credential is shown once, with **Copy the credential**, **Done**, and the command to start a worker: `printf '%s\n' '<credential>' | volvel-worker --url <instance address> --token-stdin`. See [Run a standalone worker](../../../self-host/how-to/sso/run-a-standalone-worker).

| Column | What it shows |
| --- | --- |
| **Name**, **Credential** (its first characters) | |
| **Pool** | The pool, or **Default pool**. |
| **Runs code of** | A workspace, or "Every workspace of the tenant". |
| **Created** | How long ago. |
| **Status** | **active** or **revoked**. |

An active credential has **Revoke**. It asks 'Revoke "<name>"? A worker using it stops.' The empty state is "No standalone workers": "You only need one to run scripts inside your own network."

## States

| State | What you see |
| --- | --- |
| Not loaded | The error state of the queue, or of the pools, with a retry. |
| Read only | "You can see this tenant's workers, not change them. It needs `worker:write`." |

## Permissions

| Action | Needs |
| --- | --- |
| See the workers, pools and credentials | `worker:read` |
| Make and remove pools, create and revoke credentials | `worker:write` |
| Switch the instance's workers on or off for the tenant | `tenant:write` |
| Turn the switch back on after an operator turned it off | An operator of the instance |

Without `worker:write` the whole screen is drawn but disabled, under the notice above, so the switch is disabled for a person who holds `tenant:write` and not `worker:write`. The server decides again.

## Related

- [Worker pools](../../explanation/sso/worker-pools)
- [Run a standalone worker](../../../self-host/how-to/sso/run-a-standalone-worker)
