---
title: Start a run safely twice
description: Give a request an idempotency key so that sending it again, after a timeout or a retry, returns the first run and does not start another.
subjects: [api, runs]
---

## Start a run safely twice

By the end you will have started a script run and a flow run with an idempotency key, sent each request a second time, and got the first run back.

## Before you start

- A key and the instance's address, as in [Call the API with an API key](call-the-api-with-a-key). In the examples `$WS` is `$VOLVEL_URL/api/v1/tenants/<tenant id>/workspaces/<workspace id>`.
- A script and a flow in the workspace. The examples use Fernhill's `appointments/free-times` and `billing/chase-unpaid`.
- Starting a script needs `run:write`, at the workspace or at the script. Starting a flow needs `flow_run:write`. A guest of an app cannot start either (403).
- Fernhill is set up: see [Set up the Fernhill example](../../../start/how-to/example/set-up-the-fernhill-example).

## Send the request with a key

:::steps
1. Choose a key that names the thing you are doing, not the attempt: an order number, a form's ID, a job's name with its date. It is 1 to 200 characters. Two different requests must not share one.
2. Start the run with `idempotencyKey` in the body.

   ```bash
   curl -s -i -X POST -H "authorization: Bearer $VOLVEL_KEY" -H 'content-type: application/json' \
     "$WS/runs" \
     -d '{"script":"appointments/free-times","input":{"clinic":"northside","date":"2026-12-01"},"idempotencyKey":"free-times-northside-2026-12-01"}'
   ```

   The first answer is `201 Created` with the run, `"status": "queued"`.
3. Send the same request again.

   ```text
   HTTP/1.1 200 OK
   ```

   The answer is `200 OK`, and the run in it has the same `id`. Nothing new was started. Tell a first start from a repeat by the status: 201 or 200.
4. For a flow, the same body field goes to `POST $WS/flow-runs` with `{"flow": "billing/chase-unpaid", "idempotencyKey": "..."}`. It answers 201 the first time and 200 after.
:::

## What a key matches

The key is matched within the workspace and the script or flow path, so the same key may start a different script. If the script was renamed since, the old path counts too, and the repeat still finds its first run.

A repeat that sends a different `input` with the same key does not start a run with the new input and is not refused: it returns the first run, unchanged. Change the key when the work is different.

## Other places that take a key

| Where | How | What it does |
| --- | --- | --- |
| A webhook (`POST /api/v1/hooks/<token>`) | The `idempotency-key` header, 1 to 200 characters. | A repeated delivery answers 202 with the same `runId`. See [Start a run from a webhook](start-a-run-from-a-webhook). |
| An agent's tool call (MCP) | An `idempotencyKey` argument on each script and flow tool. | A repeated call answers with the first run. See [Connect an agent](connect-an-agent). |
| Batch | Not taken. | Each item is done by its own route as it would be alone. See [Act on many runs at once](act-on-many-runs-at-once). |

A form's submission is kept by the form's own key. A schedule, a poll and an event start their runs with keys of their own, so the same time or the same event does not start a second run.

## The result

The run list shows one run for the key, however many times you sent the request.

```bash
curl -s -H "authorization: Bearer $VOLVEL_KEY" "$WS/runs/<run id>"
```

The run answers its own `idempotencyKey`.

## If it does not work

- **Two runs started.** The two requests used different keys, or different script paths, or different workspaces, or one had no key. A request with no key always starts a new run.
- **400 on `idempotencyKey`.** It must be a string of 1 to 200 characters.
- **404 on the script.** The path is not a script of this workspace. Scripts are named by path, such as `appointments/free-times`.
- **400 "The input does not match the script's schema."** `errors` says which part of `input` is wrong. No run was started.
- **403 for a guest.** Starting a script or flow needs someone signed in.
