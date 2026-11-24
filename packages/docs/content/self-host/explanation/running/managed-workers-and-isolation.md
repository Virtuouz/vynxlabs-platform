---
title: Workers, users and what a script can reach
description: "Where managed workers run, which user each runs as, what the worker host's firewall refuses, and what is not protected."
subjects: [workers, security]
---

A script runs on a worker. For a tenant with work and no worker of its own, the instance starts one. Where that happens is the choice that decides what a script can reach.

## The idea

Each attempt of a script is a process of its own. It is ended at its time limit or when canceled, and held to the script's `memoryMb` (512 by default). Volvel does not run each script in a container, and it does not sandbox it. It gives each worker a user of its own and a network to stand on.

`MANAGED_WORKERS` chooses where managed workers run:

| Value | Where | Default |
| --- | --- | --- |
| `host` | In a worker host: the same image, started as `volvel-worker-host`, in a container of its own on the `execution` network. | The Compose file. |
| `process` | Beside the control plane, on its machine and network. | The code, when the setting is not set. `true`, from before there was a worker host, reads as `process`. |
| `false` | None. Every tenant is served by standalone workers. | |

## A worker host

The host asks the control plane for a tenant with work, gets a credential for it and starts a worker with it. Each live worker has:

- a user and group of its own: the lowest free one of a range that starts at `MANAGED_WORKER_UID` and `MANAGED_WORKER_GID` (10001) and holds `MANAGED_WORKER_USERS` ids (256). The host never runs more workers at once than that;
- a directory of its own, mode `0700`, that is its `HOME`, its `TMPDIR` and its working directory, and is removed when the worker ends.

One worker cannot read, write, list or signal another worker or the host. The host holds only the capabilities `SETUID`, `SETGID`, `CHOWN`, `DAC_OVERRIDE`, `KILL` and `NET_ADMIN`. It says at start when it lacks `CAP_KILL`.

The host and the control plane share `WORKER_HOST_TOKEN`. The host never gives it to a worker. Each tenant has at most one managed worker at a time, however many replicas or hosts run.

### The firewall

With `NET_ADMIN`, the host adds firewall rules at start. They refuse workers loopback, private and link-local addresses, cloud metadata among them, and the IPv6 forms of those (mapped, NAT64, 6to4, Teredo and site-local). Open to a worker are:

- the control plane's address, from `VOLVEL_URL` or `--url`;
- the container's name servers, IPv4 and IPv6;
- what `WORKER_EGRESS_ALLOW` lists: networks and host names, comma separated, empty unless you set it.

Names are looked up once, when the host starts, and the rules are made once, for the control plane's address then. Restart the worker host when the control plane's container is recreated with another address.

Without `NET_ADMIN`, the host says so in its log, and only the network keeps workers from the instance's services. Block `169.254.169.254` at the machine if the instance runs in a cloud.

`WORKER_EGRESS_ALLOW` is not `EGRESS_ALLOW`. See [What an instance reaches](egress-and-offline).

### Stopping

A stopping host asks each worker to finish for up to 30 seconds, ends it, and gives up 10 seconds later with "a worker could not be stopped and is left running". The Compose file gives the host `stop_grace_period: 60s` for that.

## Process mode

Without a worker host, the control plane starts workers itself. They can reach whatever the control plane reaches. So it starts one only for a tenant whose code only the operator writes. A tenant whose code is written by anyone else, a member or a group with `code:write` who holds no instance-wide role, or any service account, gets none. Its Workers page says it runs on standalone workers only.

Workers in this mode run as a user of their own where the container may switch users. The image starts the control plane on `node-cp` and workers on plain Node, which cannot switch back. Without `CAP_SETUID` and `CAP_SETGID` it starts the control plane on plain Node, says so, and workers run as the control plane's own user.

`MANAGED_WORKER_USER` has two values: `own` (the default) and `same`. `same` runs workers as the control plane's user for every tenant. By choosing it you say that everyone who writes code works for you.

This is the mode for development, and for a single site where only the operator writes code.

## What is not there

- **No sandbox.** A script's process runs as its worker's user with no further container. It can reach the network, and the files that user can read. Sandboxing code from authors you do not trust is not built.
- A worker never gives its credential to a script's process. Every call a script makes goes through the worker, and only for its own run.
- Where `kernel.yama.ptrace_scope` is 0, a script could read its worker's memory, credential included. A worker warns at start when that is so.

Run a tenant you do not trust on a worker of its own, on a machine of its own. See [Run a standalone worker](../../how-to/running/run-a-standalone-worker) and [Hardening](security-hardening).

## Lifetimes

| What | Value |
| --- | --- |
| A managed worker's credential | 24 hours |
| A managed worker with nothing to do exits after | 60 seconds |
| A worker waiting for work holds its request open | 20 seconds (25 at most) |
| A worker counts as alive for | 90 seconds after it was last heard from |

Related: [Sizing and scaling](sizing-and-scaling), [the settings](../../reference/settings).
