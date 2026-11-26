---
title: Put a TLS proxy in front of an instance
description: "Terminate TLS in front of the control plane, pass the headers and long requests it needs, set TRUSTED_PROXIES and PUBLIC_URL, and give apps and tenants' hostnames their addresses."
subjects: [security, install]
---

## Put a TLS proxy in front of an instance

By the end people reach the instance over HTTPS through a proxy that you run, and the instance knows who is calling and which address they used.

## Before you start

- An instance that runs. The control plane speaks plain HTTP and listens on `127.0.0.1:8080` in the Compose file (`VOLVEL_BIND`) for this reason.
- A proxy that terminates TLS (Caddy, nginx or the one your cloud gives you), on the same machine or a network that reaches port 8080.
- A name for the instance, and a certificate for it. Volvel issues none and never sees one.

## Set it up

:::steps
1. Set `PUBLIC_URL` to the address behind the proxy, for example `https://volvel.example.com`. Sign-in checks requests against it, and cookies are marked Secure when its scheme is `https`.
2. Set `TRUSTED_PROXIES` to how many proxies sit in front of the instance (default `1`), or to the networks they are on, comma separated. Use `0` for an instance reached directly. The caller's address is then the one your proxy saw, and the rate limits and the audit log use it.
3. Make the proxy overwrite three headers and not pass the caller's own: `X-Forwarded-For` (the caller's address), `X-Forwarded-Host` (the `Host` the caller used) and `X-Forwarded-Proto` (`https`). Keep callers from reaching port 8080 directly.
4. Let the run event stream through as it comes. The console keeps one long request open per tab, `GET /api/v1/tenants/<id>/stream`, answered as `text/event-stream`. Turn response buffering off for that path and allow an idle time of at least 30 seconds (a heartbeat is sent every 20). The response says `X-Accel-Buffering: no`, which nginx honors. A proxy that cuts or holds the stream back costs only freshness: the console asks again every few seconds.
5. Do not cut requests to `/api/v1/hooks/` shorter than 25 seconds. A flow can answer the webhook that started it, and such a request is held open for up to 25 seconds.
6. Restart the instance and open `PUBLIC_URL`.
:::

An example for Caddy, which also gets its certificate itself and sets the three headers:

```text
volvel.example.com {
  reverse_proxy 127.0.0.1:8080
}
```

An example for nginx, with the stream and hooks paths:

```nginx
server {
  listen 443 ssl;
  server_name volvel.example.com;
  # ssl_certificate and ssl_certificate_key here

  location / {
    proxy_pass http://127.0.0.1:8080;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Forwarded-Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
  location ~ ^/api/v1/tenants/[^/]+/stream$ {
    proxy_pass http://127.0.0.1:8080;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Forwarded-Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_buffering off;
    proxy_read_timeout 60s;
  }
  location /api/v1/hooks/ {
    proxy_pass http://127.0.0.1:8080;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Forwarded-Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 60s;
  }
}
```

## Addresses for apps and for tenants' hostnames

An app a tenant builds in the App Builder is served at `PUBLIC_URL/apps/<tenant>/<workspace>/<app>/`, and a tenant's sign-in pages at `PUBLIC_URL/portal/<tenant>/`. An app written as code is not served there, because its code would run at the console's address, where a member who opens it is already signed in.

| Setting | What it does |
| --- | --- |
| `APPS_URL` | A second hostname that reaches the same instance, for example `https://apps.example.com`. Its host must differ from `PUBLIC_URL`'s. Apps and sign-in pages are then served only there, the console is not served there, and a member's console session is never sent there. Use it for an instance with more than one tenant. Point the second name at the same proxy, with a certificate for it. |
| `APPS_ON_CONSOLE_ADDRESS` | `true` serves apps written as code at `PUBLIC_URL` too, when there is no `APPS_URL`. Only where everyone who writes code works for you. |

Every app written as code shares the one address, `APPS_URL` or, if you set `APPS_ON_CONSOLE_ADDRESS`, the console's, and a browser treats that address as one site. A page of one tenant's app can read and change another tenant's app as any visitor who is signed in to that app in the same browser, staff and end users alike. Where tenants do not trust each other, give the right to deploy an app written as code (`deployment:write`) only to people you trust, until apps have addresses of their own. A separate `APPS_URL` keeps the console's sign-in from apps; it does not separate apps from each other.

A tenant's admin can register a hostname for one app under **Domains**, such as `portal.example.com`. You do three things for it:

1. Point the name at the instance: a CNAME to the instance's hostname, or an address record. For a name that exists only inside a network, an entry in that network's DNS.
2. Give the proxy a certificate for it. With Caddy, add the name to the site's addresses:

   ```text
   volvel.example.com, apps.example.com, portal.example.com {
     reverse_proxy 127.0.0.1:8080
   }
   ```

   On Fly.io: `fly certs add portal.example.com --config deploy/fly/fly.toml`.
3. The tenant creates the TXT record `_vx-challenge.<hostname>` the Domains page shows, and presses Check. An operator can enable a name without it, for a name with no public DNS. That is recorded in the audit log.

The proxy must pass the `Host` header through unchanged, and say whether the request came over HTTPS.

A registered hostname is an origin of its own. The sign-in a person makes there is sent only there, the API there answers for that tenant alone, and a page of another tenant's app cannot read it. What it does not do is take the app off the shared address, where the same app is still served by path: someone who signs in at that address is exposed to other tenants' apps again. A name registered for the whole workspace, rather than for one app, serves every app of that workspace, and those apps share it.

Any hostname the instance does not recognize acts as the console's address: an IP address, or a proxy's own name. Do not point a name at the instance that you do not mean to be the console.

## What reaches what

| At | The console | The API | A member's console session | Apps |
| --- | --- | --- | --- | --- |
| `PUBLIC_URL` | Yes | All of it | Counts | By path, unless `APPS_URL` is set. Apps written as code only with `APPS_ON_CONSOLE_ADDRESS=true`. |
| `APPS_URL` | No | All of it, by API key or app sign-in | Ignored | By path |
| A registered hostname | No | That tenant only | Ignored | One app at the root |

## The result

`curl -I https://volvel.example.com/api/v1/readyz` answers 200 through the proxy. Sign in at `PUBLIC_URL`: the cookie is Secure. A member who signs in wrong 21 times in a minute from one address gets 429, counted by the address the proxy saw.

## If it does not work

- **Everyone shares one rate limit, or the audit log shows the proxy's address.** `TRUSTED_PROXIES` is wrong for the number of proxies. Behind a CDN and a proxy it is `2`.
- **A caller can choose their own address.** The proxy does not overwrite `X-Forwarded-For`. With the default `1` and no proxy at all, a caller can still write the last entry: set `TRUSTED_PROXIES=0`.
- **A registered hostname shows the console.** The name is not enabled, or the proxy rewrites the `Host` header.
- **A staff sign-in from an app loops back to the console.** The app's address is not `APPS_URL` or an enabled hostname of that tenant.
- **The console's run list updates only every few seconds.** The proxy buffers the event stream.
- **A webhook that waits for a flow answers 502 or 504.** The proxy cuts it before 25 seconds.

Related: [Settings](../../reference/settings), [Hardening](../../explanation/running/security-hardening).
