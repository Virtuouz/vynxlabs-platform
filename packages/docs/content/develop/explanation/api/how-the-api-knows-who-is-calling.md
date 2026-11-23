---
title: How the API knows who is calling
description: The credentials the API accepts, what each reaches, how a session cookie differs from an API key, and why a service account's key is turned away from some routes.
subjects: [api, authentication]
---

The API has one front door, `/api/v1`, and several kinds of caller behind it. Each route says in the API description what it needs (`x-access`): a permission and where it is checked, that it is public, that it is for anyone signed in, or what the route decides itself from what is asked. This page explains how the caller is worked out. To make a key and use it, see [Call the API with an API key](../../how-to/api/call-the-api-with-a-key).

## The idea

A request is answered as one principal: a member, a service account, an end user, or nobody. The principal is worked out from the request before the route runs, and then the same permission check applies to everyone. A route that is open to all calls itself public, and a route that asks for a person says so.

| Credential | Looks like | Who it is | Where it works |
| --- | --- | --- | --- |
| API key | `Authorization: Bearer vxk_...` | A member, or a service account. | Every route that asks for a permission. |
| Console session | A cookie, `vx_member.session_token`. | A member. | The instance's own address only, and for seven days. |
| Sign-in to an app | A cookie, `vx_app_<tenant id>`, and a token that begins `vxs_`. | An end user (30 days), or a member who opened an app (12 hours). | The app's own address, for that tenant. |
| Worker credential | `vxw_...` | A worker. | The worker protocol. |
| SCIM token | `Authorization: Bearer vxp_...` | A provider's push. | One provider's SCIM address. |
| Webhook or form token | `vxh_...` or `vxf_...`, in the address. | Whoever holds the address. | That one trigger. |
| Approval link | A link in a message. | The person it was sent to. | One approval, for 48 hours, once. |

The metrics route is one more case: `GET /api/v1/metrics` takes a member or a key that holds `instance:read`, or a scraper that sends the operator's `METRICS_TOKEN`.

## How a key is checked

Only `Authorization: Bearer vxk_...` is accepted as a header. Any other `Authorization` header is refused with 401, even when a valid cookie comes with it. The key is looked up by its hash: the instance keeps the hash, the first characters and the last four, and shows the key once, when it is made.

A key is refused when it was revoked, when its `expiresAt` has passed, or when its owner is a disabled member. A key acts as its owner with the owner's permissions. It has no scopes of its own, so the way to make a key that can do less is to make it for a service account that holds less.

A service account's key reaches only that account's tenant.

## Why a cookie is different

A browser sends its cookies by itself, also when another site makes it send a request. So a change that arrives with a session cookie must come from a page of this instance: a write whose `Origin` header is not the address it was sent to, or the instance's own, is refused with 403 `cross_site`. A key is not sent by a browser unless a program puts it there, so it is not held to this. There is no cross-origin sharing: no `access-control-*` header is sent by the API.

A member's session counts at the instance's own address and nowhere else. At an app's address a person is known by their sign-in to that tenant's apps and by nothing else.

## Why a service account is turned away from some routes

Some routes are about a person's own account: their tenants, their API keys, their sessions. A key of a service account is refused there with "This is only for a person signed in, not for a service account's key." A route that a program may call as well says so. Two do: `GET /api/v1/me` and the batch of approvals.

End users and members who signed in to an app are also refused on those routes: "This is only for a member signed in to the workspace."

A service account does not stand for a second person. It may not approve or decline an access change that waits for one.

## Who a name is known to

A request to a tenant's registered hostname is answered for that tenant only, and 404 for any other. A route with a path that holds a tenant answers 404, not 403, to a caller who has no standing in the tenant, so that tenant IDs cannot be probed.

## How it fits

- To make a key, revoke it or give a program one: [Call the API with an API key](../../how-to/api/call-the-api-with-a-key).
- The permission each route needs is in the [API reference](../../reference/api/index) under the route, and the list of permissions in the [permissions reference](../../../administer/reference/permissions).
- How many tries a caller gets: [How rate limits work](how-rate-limits-work).
