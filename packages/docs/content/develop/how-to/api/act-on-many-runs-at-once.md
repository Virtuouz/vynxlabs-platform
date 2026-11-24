---
title: Act on many runs, triggers or drafts at once
description: Cancel or run again many runs, pause many triggers, decide many approvals and discard many drafts in one request, and read what happened to each.
subjects: [api, runs]
---

## Act on many runs, triggers or drafts at once

By the end you will have run again a list of runs in one request and read which ones worked and which did not.

## Before you start

- A key and the instance's address, as in [Call the API with an API key](call-the-api-with-a-key). In the examples `$WS` is `$VOLVEL_URL/api/v1/tenants/<tenant id>/workspaces/<workspace id>`.
- A batch can do nothing its caller could not do one item at a time. Each item is done through the route that does it alone, as the caller, so it needs what that route needs: `run:write` to cancel or run again.

## Run again a list of runs

:::steps
1. Collect the IDs. A batch takes 1 to 100, each once.
2. Send them with the action.

   ```bash
   curl -s -X POST -H "authorization: Bearer $VOLVEL_KEY" -H 'content-type: application/json' \
     "$WS/runs/batch" \
     -d '{"action":"rerun","ids":["<run id>","<another run id>"]}'
   ```

3. Read the answer. It is always 200 when the request itself was valid, and it says what happened to each item, in the order you sent them.

   ```json
   {
     "results": [
       { "id": "01a20a4a-ab31-71c2-8d20-a15326b4ea32", "ok": true, "status": 201, "runId": "01a20a4b-3140-71b9-80f3-fdb829bfb2f2" },
       { "id": "01a20a4a-0000-7000-8000-000000000000", "ok": false, "status": 404, "detail": "The run was not found.", "requestId": "01a20a4b-3a0a-7427-a72f-5822b249860f" }
     ],
     "done": 1,
     "failed": 1
   }
   ```

   `status` is what the single route answered. `runId` is the run that was started, for a run again. `detail` and `requestId` come with a failure.
:::

The items are done one at a time, in order, so a batch does not hit the database as a burst. One that fails does not stop the ones after it, and the ones before it stay done.

## The routes

| Route | Body | Needs, for each item |
| --- | --- | --- |
| `POST $WS/runs/batch` | `action`: `cancel` or `rerun`; `ids` of runs. | `run:write`. The route itself asks `run:read`. |
| `POST $WS/flow-runs/batch` | `action`: `cancel`, `retry` or `restart`; `ids` of flow runs. | What the single action needs. The route asks `flow_run:read`. |
| `POST $WS/trigger-pauses/batch` | `paused` (`true` or `false`), an optional `reason` of up to 500 characters, and `triggers`: a list of `{path, node?}`. | What pausing one trigger needs. The route asks `trigger:read`. |
| `POST $WS/drafts/batch-discard` | `paths` of drafts. | What discarding one draft needs. The route asks `resource:read`. |
| `POST /api/v1/tenants/<t>/approvals/batch` | `decision`: `approve` or `reject`; an optional `comment` of up to 2,000 characters; `approvals`: a list of `{workspaceId, flowRunId, node}`. | Who may decide is asked of each approval. |

Each takes 1 to 100 items. The approvals route is open to anyone signed in and to a service account's key, and asks each approval's own route who may decide it. A rejection needs a `comment`: without one each item answers 400 "Say why it is rejected: the flow and its people read it." A service account whose role lacks `approval:write` has each item refused with 403 "This needs the approval:write permission." The `id` in the results of an approval is `<flow run id>/<node>`; in a draft it is the path.

`POST $WS/drafts/batch` is not this kind of batch. It saves, moves and removes several pages of documentation as one change: every change is made or none is, and a stale `revision` refuses them all.

## The result

Each item has its own entry in the audit log, as if it had been done alone. `done` and `failed` add up to the number you sent.

## If it does not work

- **400 "The request body is not valid."** `errors` says which part. An `action` that is not in the table, more than 100 items, or an ID that is listed twice in `ids` or `paths` is refused, and nothing is done. In the approvals route the same approval listed twice is tried twice: the first is decided and the second answers 409 "This approval is no longer waiting for a decision."
- **A result says `ok: false` with 409.** The single action refused it, for example "The flow run already succeeded." Nothing else is wrong with the batch.
- **A result says 404.** The item is not there, or you may not know it is.
- **403 for the whole batch.** The key's owner lacks the permission the route itself asks, such as `run:read` for `runs/batch`.
