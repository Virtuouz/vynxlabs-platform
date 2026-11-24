---
title: Worker pools
description: "What a worker and a pool are, how a script reaches the worker it should run on, what the default pool is, and why the instance's workers and a tenant's own are different things."
subjects: [workers, pools]
---

A script runs on a **worker**. A worker is a process that asks the instance for work, runs a script, and reports. A **pool** is a name for a place workers run. This page says how a script finds its worker, and why a tenant would run its own.

## The idea

By default a tenant does not think about workers. When a script has to run and no worker of the tenant is up, the instance starts one, if the operator has set it up to. For most scripts that is all.

Some scripts must run somewhere in particular: inside a client's network, where a database that is not on the internet can be reached. A script says so with `worker`, in its definition, and names a pool. Only a worker that signed in with a credential for that pool takes it. The worker makes outbound calls only, so nothing needs to reach into the network.

A script that names no pool runs in the **default pool**. The default pool is not a record: it always exists, and it cannot be made or removed, and no pool can be named `default`.

## The pieces

| Piece | What it is |
| --- | --- |
| A pool | A name, with an optional description, that the tenant makes. |
| A credential | A secret made for a pool, and for every workspace of the tenant or one. A worker signs in with it. It is shown once and can be revoked. |
| A worker | A process, started with a credential, that runs scripts of its pool. |
| **Runs code of** | The workspaces whose scripts name a pool, or the workspace a credential is limited to. |

A credential for one workspace never runs another's scripts, so a client's network holds only that client's code. A script that names a pool nobody made waits: the pool shows the tag **Not made**.

## Workers the instance starts, and your own

The switch **Let the instance run workers** and **Run only on our own workers** is about the default pool. With it on, and the operator running workers, the instance starts a worker when the default pool has work. With it off, runs of the default pool wait for a worker you started with a credential for it. The switch does not touch other pools: a pool is served only by workers with its credentials.

Whether the instance starts workers at all is the operator's setting. The Workers screen says which of these is true, and an operator can turn the switch off for a tenant, after which only an operator can turn it on again. Where the instance has no worker host, the workers it starts run beside its control plane, on its network. It starts them only for a tenant whose code only the operators write. For a tenant whose code others write, the Workers screen says "This tenant's code runs on standalone workers only." and the tenant needs a worker host or standalone workers of its own.

## What is left to others

Volvel does not run a script in a container each. It gives each attempt a process of its own, limited by the script's time and memory, and, where the instance runs a worker host, a user of its own. A standalone worker runs scripts as the worker's own user on your machine. What else is on that machine, and what it can reach, is yours to decide.

## How it fits

The steps are [Add a worker pool](../../how-to/sso/add-a-worker-pool) and [Run a standalone worker](../../../self-host/how-to/sso/run-a-standalone-worker). The screen is [Workers](../../reference/screens/workers).
