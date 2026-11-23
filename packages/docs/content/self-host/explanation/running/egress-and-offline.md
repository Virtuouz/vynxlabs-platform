---
title: What an instance reaches
description: "What an instance and its workers connect to, which setting opens an internal address for which of them, and why it needs no internet to run."
subjects: [security, install]
---

An instance opens no connection you did not configure. It runs with no route to the internet.

## The idea

The connections an instance makes are to your Postgres, your object store, and the systems a tenant has chosen: connections, data sources, an identity provider, a Git remote. It sends no telemetry, makes no update check and no license check. It sends mail only when `SMTP_URL` is set, and OpenTelemetry only when an endpoint is named.

Installing is different: images are pulled or built, and a build fetches packages. See [Install where there is no internet](../../how-to/running/install-offline).

## Two lists, for two things

An address that a tenant chooses can be reached by the instance, or by a worker. Each has its own guard, and its own list.

| | What it holds | Opened by |
| --- | --- | --- |
| The control plane, for a tenant | An identity provider's settings and endpoints, a Git remote, a data source, an OAuth connection's token address, and a hostname a tenant registers, to check it. | `EGRESS_ALLOW` |
| A script on a worker | Anything a script calls. | The worker host's firewall, opened by `WORKER_EGRESS_ALLOW` |

**The instance's guard.** It refuses an address that is loopback, private, link-local (cloud metadata included), shared or reserved, and says so. It checks the address actually connected to and every redirect (10 seconds to answer, 5 redirects). To let it reach an internal Git server, an identity provider or a database on your network, list it in `EGRESS_ALLOW`, comma separated, as networks or host names:

```bash
EGRESS_ALLOW=10.20.0.0/16,git.internal,192.168.1.40
```

A name in the list is allowed whatever it resolves to. A network is allowed for any name that resolves into it.

**The worker host's firewall.** It refuses a script every private, loopback and link-local address except the control plane and the name servers. To let scripts reach an API inside your network, list it on the worker host in `WORKER_EGRESS_ALLOW`, in the same form. It is empty unless you set it, and it needs the `NET_ADMIN` capability. See [Workers, users and what a script can reach](managed-workers-and-isolation).

Everything else a tenant's systems are asked, such as posting a failure alert or trying a connection, is done by a worker, not the control plane.

## OAuth connections

A member authorizes an OAuth 2.0 connection once in the console, and the instance keeps its tokens and refreshes them. Two things follow for you:

- The provider sends members back to one address, `<PUBLIC_URL>/api/v1/oauth/connections/callback`. Each app a tenant registers with a provider must list it, so `PUBLIC_URL` must be the address members' browsers use.
- The control plane calls the provider's token address, to exchange the code and to refresh. That goes through the guard: a provider inside your network must be in `EGRESS_ALLOW`.

Workers are handed the current access token, never the refresh token or the client's secret.

## What is not guarded

For a data source, the guard checks the host before each pool connects. A name that answers differently a moment later is not checked again.

Related: [Hardening](security-hardening), [Settings](../../reference/settings).
