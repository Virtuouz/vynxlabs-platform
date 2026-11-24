---
title: Handle an error from the API
description: Read a problem answer, tell which errors are worth retrying and after how long, and fix a save that was refused because someone else changed the draft.
subjects: [api, errors]
---

## Handle an error from the API

By the end your client will read every refusal the same way, retry the ones that can succeed later, and stop on the ones that cannot.

## Before you start

- A key and the instance's address, as in [Call the API with an API key](call-the-api-with-a-key).
- The list of every code, with its status and what to do, is the [error codes reference](../../reference/errors). The same list is in `GET /api/v1/openapi.json` under `x-error-codes`, 61 codes in this version.

## Read the answer

An error is a JSON body of type `application/problem+json` (RFC 9457). `type`, `title`, `status`, `code`, `instance` and `requestId` are in every one; `detail` and `errors` are there when there is something to say.

| Field | What it holds |
| --- | --- |
| `type` | `about:blank`. |
| `title` | The status's name, such as "Bad Request". |
| `status` | The HTTP status. |
| `code` | A stable word to program against, such as `validation_failed`. |
| `instance` | The path that was asked, without its query. |
| `requestId` | The same as the `x-request-id` header. An operator finds the cause with it. |
| `detail` | A sentence, when there is one. Written for a person. |
| `errors` | A list of `{path, message}`, on a refusal that names what is wrong. |

```bash
curl -s -G -H "authorization: Bearer $VOLVEL_KEY" \
  "$VOLVEL_URL/api/v1/tenants/$TENANT/workspaces/$WORKSPACE/rows/api-visits" \
  --data-urlencode 'filter={"column":"pet","op":"like","value":"x"}'
```

```json
{
  "type": "about:blank",
  "title": "Bad Request",
  "status": 400,
  "code": "validation_failed",
  "detail": "The filter is not valid.",
  "instance": "/api/v1/tenants/.../rows/api-visits",
  "requestId": "01a20a49-d382-7303-91fd-8cfe160b1cee",
  "errors": [
    {
      "path": "/filter",
      "message": "there is no operator \"like\". Use eq, ne, gt, gte, lt, lte, in, has, contains, not_contains or is_null"
    }
  ]
}
```

Program against `status` and `code`. Do not match on `detail`: it is for a person and its words may change. A failed sign-in passes on the sign-in library's code in lower case in `code`. The SCIM routes answer in SCIM's own error format instead: see [how SCIM provisioning works](../../explanation/api/how-scim-works).

## Decide what to do

:::steps
1. Look at `status`. A 4xx answer is about the request, so sending the same request again gives the same answer, with the exceptions below. A 5xx answer is about the instance.
2. For 400, read `errors`. Each `path` says which part was wrong (`/body/...`, `/querystring/...`, `/filter`). Nothing was changed.
3. For 401, send a valid key. For 403, the `detail` names the permission, and a person who manages access gives it by binding a role. A 404 may mean the thing is there and you may not know it: the two answer the same way on purpose.
4. For 409, read the `code`. `conflict` means something changed since you read it: read again and retry. `draft_changed` and `path_taken` are in the next section.
5. For 429, wait for the number of seconds in the `retry-after` header, then send the request again. The `x-ratelimit-limit`, `x-ratelimit-remaining` and `x-ratelimit-reset` headers come with it. See [how rate limits work](../../explanation/api/how-rate-limits-work).
6. For 503, send the request again after `retry-after` seconds. `busy` (the database had no connection to spare, or the request ran too long) and `read_only` (the database takes no changes) carry it: `busy` says 2 or 5 seconds, `read_only` says 30, and reading still works then. A `busy` answer is safe to repeat. A `workspace_paused` or `trigger_paused` answer from a webhook means a person paused it: the sender retries once it is resumed.
7. For 500, do not retry in a loop. Give the `requestId` to the operator.
:::

A request that changes something and then fails on the way back, so that you do not know whether it happened, is made safe to send twice with an idempotency key: see [Start a run safely twice](start-a-run-safely-twice).

## Fix a save that was refused

A draft of a resource (`PUT /api/v1/tenants/<t>/workspaces/<w>/drafts/<path>`) names the revision you saw, as `revision` in the body, or says `"create": true` for something new. Two saves in a row that both leave `revision` out show it.

```bash
curl -s -X PUT -H "authorization: Bearer $VOLVEL_KEY" -H 'content-type: application/json' \
  "$VOLVEL_URL/api/v1/tenants/$TENANT/workspaces/$DEV/drafts/new/name" \
  -d '{"kind":"script","schemaVersion":1,"body":{...}}'
```

The first save succeeds when nothing else is in the way, and answers a draft with `"revision": 1`. The second is refused:

```text
409 draft_changed
"Someone else saved this draft after you opened it. Reload it, then make your change again."
```

Read the draft again (`GET` on the same path), keep what you want of the newer text, and save with the `revision` you read. A save that says `"create": true` over a path that already holds a draft or a deployed resource is refused with 409 `path_taken` and saves nothing: choose another path or open that one.

## The result

Your client takes the `status` and the `code` of every refusal, waits when told to wait, and writes the `requestId` to its log.

## If it does not work

- **The body is not JSON.** A reverse proxy or a gateway answered. The instance always answers with `application/problem+json`.
- **413 `payload_too_large`, "Request body is too large".** The request body is over the limit of the route. A webhook takes at most 1 MiB. Send less.
- **400 "The filter must be JSON." or "The cursor is not valid."** A `filter` is a JSON string in the query, URL-encoded. A `cursor` is passed back as it was given. See [Page through a list](page-through-a-list).
- **Which codes can this route answer?** The API reference lists the classes of answer for each route (400, 401, 403, 404, 5XX). It does not list the codes one route can answer: use the list of all codes.
