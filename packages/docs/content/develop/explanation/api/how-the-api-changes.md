---
title: How the API changes
description: What stays the same inside version 1, how a route, field or parameter is retired, and what a renamed resource's old path does for 90 days.
subjects: [api, errors]
---

A program built on the API needs to know what it can rely on. This page says what the API promises about its own changes, and how a rename of something in a workspace shows up in the API.

## The idea

The API has one version, `v1`, and its address starts `/api/v1`. Within `v1` the API only grows. A route, a field of an answer or an optional parameter may be added. Nothing that exists changes its meaning or is taken away without notice.

Something that is to be removed is marked `deprecated` in the API description, `GET /api/v1/openapi.json`, and keeps working for at least 90 days after the release that says so. In this version nothing is marked deprecated.

Write a client so that it ignores fields it does not know, and does not depend on the order of fields or on the words of a `detail`.

## The description is the contract

`GET /api/v1/openapi.json` needs no sign-in. It describes every route, with the tag that groups it, an `operationId`, what it needs (`x-access`), the credentials it takes (`bearerAuth` and `cookieAuth`), and the error answers. The 61 error codes, each with its status and title, are listed under `x-error-codes`. The [API reference](../../reference/api/index) is drawn from it, so that it says what this version does.

Every answer carries `x-request-id`. An `x-request-id` you send is kept when it is 1 to 128 characters of letters, digits, dots, underscores and hyphens, and made up otherwise. A `traceparent` header joins the request to your trace, and `x-trace-id` says which. IDs of resources are UUIDs. The API takes `<tenant id>/<workspace id>` IDs, where the command line takes slugs.

## What a rename does

A resource of a workspace may be given a new path. Deployed, it is the same resource at the new path: its history, its data and what is bound to it stay. Programs that call it by its old path are not broken at once. For 90 days the old path still answers, and says so in the answer's headers:

```text
deprecation: @1795469178
sunset: Sun, 21 Feb 2027 21:26:18 GMT
volvel-resource-moved: new/name
warning: 299 - "old/name was renamed to new/name. The old path stops answering on 2027-02-21."
```

- `deprecation` is when the old path began to be deprecated, in seconds since 1970.
- `sunset` is when it stops answering.
- `volvel-resource-moved` is the path the resource has now.
- `warning` says the same in words.

An idempotency key that was used on the old path still finds its first run. An agent's tool keeps its old name until the same date, with a description that says "Renamed: call <new name> instead."

After the date the old path answers as a path that is not there: 404.

A webhook is the exception: a renamed webhook's address changes unless the trigger has a `key`. The editor sets the key to the old name when it renames one, and a deploy lists the address that stops answering.

## What the API does not have

- No `ETag` or `If-Match`. A save of a draft names the revision it saw, as `revision` in its body, and is refused with 409 `draft_changed` when it was not the newest. A save that makes something new says `"create": true` and is refused with 409 `path_taken` if the path is taken.
- No cross-origin sharing, and no outbound webhooks: an alert notifies through a connection.
- No general rate limit on a signed-in caller. See [How rate limits work](how-rate-limits-work).

## How it fits

- A client's handling of the answers the API gives: [Handle an error from the API](../../how-to/api/handle-an-api-error).
- Who the API thinks is calling: [How the API knows who is calling](how-the-api-knows-who-is-calling).
