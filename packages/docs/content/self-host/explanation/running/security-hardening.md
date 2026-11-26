---
title: What is protected, and a hardening checklist
description: "What an instance protects and from whom, what it does not protect against, and the settings to check before anyone else can reach it."
subjects: [security, install]
---

This page says what an instance protects, and what is left to you. The full list is in `SECURITY.md` in the repository, and the ideas behind it are here.

## The idea

Two rules hold the design:

- **The control plane never runs a tenant's code.** Work that needs a tenant's code, such as reading the schema a script declares, is a task that one of the tenant's workers does, in a process of its own.
- **The control plane reaches an address a tenant chose only through a named list, behind an egress guard.** See [What an instance reaches](egress-and-offline).

## What it protects

| What | How |
| --- | --- |
| A tenant from another tenant | Every record carries its tenant's ID and one authorization function checks every request. A request for another tenant's ID answers 404. |
| A tenant from the operator | An operator has no access inside a tenant by default. Access is a time-limited grant with a reason, which the tenant's admins can see and end. Everything done under it is audited. |
| Secrets at rest | Each tenant has its own key, wrapped by the master key. See [the master key](keys-and-secrets). |
| A person's rows from another person | Postgres row-level security on every custom table. Row requests sign in as a role that owns nothing. |
| The console from a tenant's app | A member's console session counts only at the instance's own address. Apps written as code are served only at `APPS_URL`. |
| What happened | One write path records an audit entry in the same transaction as the change. Entries cannot be changed or deleted one by one. |
| A worker's credential from a script | The script's process is never given it. |

## What it does not protect against

- **Code a tenant deploys, from what its worker can reach.** No sandbox. Run a tenant you do not trust on a worker of its own, on a machine of its own.
- **Workers started beside the control plane** (`MANAGED_WORKERS=process`). They share its network, and with `MANAGED_WORKER_USER=same` or where the container may not switch users, its user.
- **A worker host without `NET_ADMIN`.** Block link-local addresses at the machine.
- **An operator with access to the database, the master key or the host.** Such a person can read everything. Use a dedicated instance where that matters.
- **A lost master key.** Nothing encrypted can be recovered without it.
- **Apps on the console's address**, if you set `APPS_ON_CONSOLE_ADDRESS=true`. An app then runs as whoever opens it.
- **One tenant's app written as code, from another tenant's.** Every app written as code is served at one address, `APPS_URL` or the console's own, which a browser treats as one site. A page of tenant A's app can read and change what tenant B's app shows, as any visitor who is signed in to B's apps in that browser. This was run in a browser, for both addresses. On an instance whose tenants do not trust each other, give the right to deploy an app written as code (`deployment:write`) only to people you trust, until apps have addresses of their own. A hostname a tenant registers for an app is an origin of its own, and keeps the sign-in used there from other tenants' pages. It does not take the app off the shared address, where anyone who signs in is exposed again.
- **A flood from many addresses.** Limits are per address and are counted in Postgres across every replica. The address is the one your proxy saw: set `TRUSTED_PROXIES` to match your proxies. Put a proxy with limits of its own in front of a public app.
- **A column, from someone who may read the row.** Row rules decide which rows, not which columns.

## Checklist

- A TLS-terminating proxy is in front. The control plane speaks plain HTTP and listens on `127.0.0.1:8080` in the Compose file. See [Put a proxy in front](../../how-to/running/put-a-proxy-in-front).
- `TRUSTED_PROXIES` matches the proxies in front (`0` when none), and the proxy overwrites `X-Forwarded-For`, `X-Forwarded-Host` and `X-Forwarded-Proto`.
- `PUBLIC_URL` is the address people type. Cookies are marked Secure by its scheme.
- `APPS_URL` is a different host from `PUBLIC_URL`, if tenants write apps as code. It keeps the console's sign-in from an app, and does not keep one tenant's app from another's: see above.
- `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_PASSWORD` are removed after the first start.
- `MASTER_KEY` is kept in a second place, and every key is kept as long as the backups it sealed.
- Backups run, and a restore has been tried. See [Restore an instance](../../how-to/running/restore-an-instance).
- The worker host has `NET_ADMIN`, and `WORKER_EGRESS_ALLOW` lists only what scripts need.
- `METRICS_TOKEN` is set if a scraper reads the metrics, and is at least 32 characters.
- Postgres and the object store are not reachable from outside the instance.

Related: [Report a vulnerability](../../reference/running/security-reports), [Supported versions](../../reference/running/versions-and-support).
