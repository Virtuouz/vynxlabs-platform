---
title: How rate limits work
description: Which routes are limited, by how much and by what address, how the count is kept, and what TRUSTED_PROXIES has to do with it.
subjects: [api, errors]
---

Volvel limits the routes that anyone can reach, and does not limit a signed-in caller's general traffic. This page says which limit is where, how the count is kept and what a limited caller sees.

## The idea

A limit is a count for each caller address in a window of one minute. The first request opens the window and the count starts again when it has passed. The count is kept in the instance's database, so every replica shares one count for a caller.

When a caller goes over, the answer is 429 `rate_limited` with the headers `x-ratelimit-limit`, `x-ratelimit-remaining`, `x-ratelimit-reset` and `retry-after`, both in seconds:

```text
HTTP/1.1 429 Too Many Requests
x-ratelimit-limit: 120
x-ratelimit-remaining: 0
x-ratelimit-reset: 59
retry-after: 59

{"type":"about:blank","title":"Too Many Requests","status":429,"code":"rate_limited","detail":"Rate limit exceeded, retry in 59 seconds", ...}
```

Wait for `retry-after` seconds, then try again.

## The limits

| What | Limit a minute, for each address |
| --- | --- |
| An anonymous caller on a route an app calls for its guests (rows, totals, exports, starting a script or flow) | 120 |
| A webhook address (`POST /api/v1/hooks/<token>`) | 120 |
| SCIM calls from an identity provider | 1,200 |
| Asking what an expression gives against a flow run | 240 |
| Single sign-on, an app's hand-off from the console, the return of an OAuth connection | 60 |
| An approval link | 30 |
| A member's password-reset link | 20 |
| End-user sign-in | 20 |
| End-user sign-up | 5 |
| A member's sign-in, change of password or email, request for a reset or a verification mail | 20, for each address and path |

Other paths of the sign-in library are held to the library's own default limit.

The limit on guests counts only callers who are not signed in. A signed-in caller reading the same route is not counted. There is no general limit on authenticated API traffic: a program that sends too much is held by the database and the workers, and sees `busy` (503, with `retry-after`) before it sees 429.

File downloads for guests are counted in each replica's memory, not in the database, so the count is for each replica.

## Whose address it is

The address is the one the instance works out from the request, and it is also what the audit log records. It is set by `TRUSTED_PROXIES`, a setting for the operator:

- `1`, the default, believes one proxy in front of the instance: the address that proxy added last to `X-Forwarded-For` is the caller's.
- A larger number believes that many proxies. A list of networks, such as `10.0.0.0/8,172.16.0.0/12`, believes the proxies on those networks.
- `0` believes none, for an instance reached directly.

The proxy must set `X-Forwarded-For` itself and never pass on what the caller sent. With the default and no proxy, a caller can write the last entry, and the limit then counts whatever address they claim: an instance that is reached directly sets `TRUSTED_PROXIES=0`. See the [settings reference](../../../self-host/reference/settings).

## How it fits

- What a client does with a 429: [Handle an error from the API](../../how-to/api/handle-an-api-error).
- A sender of webhooks that is limited retries after `retry-after`: [Start a run from a webhook](../../how-to/api/start-a-run-from-a-webhook).
