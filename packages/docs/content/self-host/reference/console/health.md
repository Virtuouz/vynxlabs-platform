---
title: Instance health
topic: volvel-instance-health
type: reference
description: "Every section, line and state of the Health screen: readiness of the database and object store, the master key and its rotation, what this replica is set to, and the metrics endpoint."
subjects: [instance, triggers]
moved_from:
  - instance/health
---

The **Health** screen shows whether the replica that answered the page is ready, how a master key rotation stands, what that replica read from its environment, and how to scrape its metrics. It shows no secret: where a value is secret it says only whether it is set. It is in the **Instance** area. F1 (**Help for this page**) opens the help topic `volvel-instance-health`.

The screen is about one replica, the one the request reached. Another replica may be set differently. Ask each one, or read each one's `/api/v1/readyz`.

::screenshot{name=self-host/instance-health alt="The Health screen: Ready with the database and object store answering, the version and migration level, then the master key fingerprints, this replica's settings and the metrics section."}

The title is **Health**. The description reads "Whether this replica is ready, its keys, and what it is set to." The screen has four sections, in this order.

## Health

The section is **Health**, with the button **Check again**. The screen asks `/api/v1/readyz` when it opens, every 15 seconds while it is open, and when **Check again** is pressed.

| Line | What it shows |
| --- | --- |
| **Ready** / **Not ready** | **Ready** with "This replica takes requests." when the database and the object store both answer. **Not ready** with "This replica answers 503 to /readyz, so a load balancer takes it out." when either does not. Then "Checked TIME." |
| **Database** | **Answers** with how long it took in milliseconds, or **Down** with the kind of failure. When the database answers but takes no writes, a **Takes no writes** tag is added and a notice reads "The database answers but takes no writes, such as when its disk is full. Reads are served and every change is refused until it takes writes again." |
| **Object store** | **Answers** or **Down** with the kind of failure. No time is shown for it. |
| **Version** | The version of the control plane, in code style. |
| **Migration level** | The number of the last database migration the instance has applied. |

Each check is allowed 3 seconds, and "timed out" is a failure. The failure says only the kind of error: the cause is in the instance's log. A database that takes no writes still answers `/readyz` with 200 and `readOnly: true`, so a load balancer keeps the replica in. While it is so, a strip on every screen says "The instance is read only." with "The database is taking no changes for now: its disk may be full, or it is in maintenance. Reading still works. An operator of this instance can look at its Health screen or run `volvel status`." The strip is asked for every 30 seconds. Every settings **Save** bar and every create dialog is disabled with that reason. Other buttons stay, and the server refuses a change with 503 `read_only` and `retry-after: 30`. The queue, background work and managed workers stop and start again by themselves when writes return. `volvel status` prints "Read only: …".

If the screen cannot reach the instance at all, a red notice reads "The instance did not answer."

`/api/v1/healthz` answers 200 whenever the process serves requests. `/api/v1/readyz` and `/api/v1/healthz` are public and are not traced. `/api/v1/instance` is public too and gives the version, the migration level, the apps address, whether mail is set up and the public URL.

## Master key

The section is **Master key**. It says where a rotation stands. It changes nothing.

| Line | What it shows |
| --- | --- |
| **MASTER_KEY** | The key's fingerprint: the start of a hash of the key, enough to tell two keys apart and nothing more. |
| **MASTER_KEY_SECONDARY** | The second key's fingerprint, or "Not set". |

Below them, one of three notices:

- With no second key: "No second key is set, so no rotation is under way." It adds "N sealed values cannot be opened with this key." if any value cannot be opened.
- With a second key that still seals values: "Still sealed with the second key: N in PLACE, ... Run `rekey` where the instance runs, then keep the second key until this says it can go." It adds "N values open with neither key." when there are such.
- With a second key that seals nothing: "Nothing is sealed with the second key any more. MASTER_KEY_SECONDARY can be removed from the environment."

A value that no key opens is listed under the notice as its place and ID (the first 20). The command is `node dist/main.js rekey`; it exits 1 if a value opens with neither key.

## This replica's settings

The section is **This replica's settings**, under "What the process that answered this page read from its environment. Another replica may be set differently. No secret is shown, only whether it is set." It lists:

| Line | What it shows |
| --- | --- |
| **Workers** | "Started in a worker host" (`MANAGED_WORKERS=host`), "Started beside the control plane, for code only operators write" (`process`), or "None started here: standalone workers ask for work". |
| **Run slots**, **Memory floor**, **Most workers alive** | The value set, or "Not set: worked out from this machine". |
| **Database pools** | "N for Volvel's own work, N for rows", and ", N for one tenant at once" when `DATA_TENANT_CONNECTIONS` is set. |
| **Time limits** | "N s for a data operation, N s for a query". |
| **Schedule backlog** | "No limit", or "A schedule skips its time past N queued runs". |
| **Triggers** | "Paused by TRIGGERS_PAUSED where the instance runs", or "Not paused by the environment". This is the environment only: a pause made on [Triggers](triggers) is not shown here. |
| **Kept: runs**, **Kept: events**, **Kept: refusals**, **Kept: audit log** | The instance's default retention, in days. A tenant may set its own. |
| **Address** | The public URL. |
| **Apps** | "At the console's address, each app sandboxed" or "At their own address, URL". |
| **Mail** | "Not set up: nobody is mailed", "Written to files, for development", or "Sent from ADDRESS". |
| **Reachable networks** | "Only public addresses", or the networks and hosts allowed besides. |
| **Proxies trusted** | "None", "N in front", or the list of addresses. |

## Metrics

The section is **Metrics**. It says that `/api/v1/metrics` gives every series in Prometheus text format, each starting `volvel_`: runs by state, queue depth, workers and slots, request counts and times, database pools and the background loop. It is read with an operator's API key (`instance:read`), or by a scraper that sends `Authorization: Bearer <METRICS_TOKEN>`.

| Line | What it shows |
| --- | --- |
| **Scraper token** | "Set (METRICS_TOKEN)", or "Not set: only an operator's key reads it". |
| **Tenant and workspace labels** | **Yes** or **No**. |
| **Also sent by OTLP** | **Yes** or **No**. |

## States

| State | What you see |
| --- | --- |
| Loading | Each section shows its own loading state. |
| A section does not load | The master key, settings and metrics sections each show an error state with a retry; the others stay. |
| Not ready | The pill reads **Not ready** and the failed part reads **Down** with the kind of failure. |
| Read only database | **Takes no writes** and the notice described above, and the strip on every screen. |
| Not an operator | A person who is not an operator who opens `/instance/health` sees "For operators". |

## Permissions

| Action | Needs |
| --- | --- |
| See the **Master key** and **This replica's settings** sections | `instance:read` at the instance. |
| **Check again**, and the readiness lines | Nothing: `/api/v1/readyz` is public. |

## Related

- [Triggers](triggers): the pause made from the console.
- [All tenants](tenants): the per-tenant worker switch.
- [Instance audit log](audit-log): `instance.rekeyed` and `instance.data_role_rekeyed`.
