---
title: Follow runs as they happen
description: Open the server-sent event stream of a tenant, read the events, reconnect after a break, and read the data again when the stream says events may have been missed.
subjects: [api, runs]
---

## Follow runs as they happen

By the end you will have a connection that tells you when a run, a flow run or a step changes, and a program that reads the run again when told to.

## Before you start

- A key and the instance's address, as in [Call the API with an API key](call-the-api-with-a-key). A person's key or a service account's key both work.
- What you are sent depends on what you may read. You get script runs in the workspaces where you hold `run:read`, and flow runs and steps where you hold `flow_run:read`. Someone who holds neither anywhere in the tenant, such as an end user of an app, is sent the runs and flow runs they started themselves.
- Whatever sits between you and the instance, such as a reverse proxy, must not buffer the response.

## Open the stream

:::steps
1. Request `GET /api/v1/tenants/<tenant id>/stream` and keep the connection open. There is one stream for the whole tenant, not one for each workspace.

   ```bash
   curl -s -N -H "authorization: Bearer $VOLVEL_KEY" "$VOLVEL_URL/api/v1/tenants/$TENANT/stream"
   ```

2. The first lines say how long to wait before reconnecting and that you are connected.

   ```text
   retry: 3000

   id: 1795468993320
   event: ready
   data: {}
   ```

3. Start a run, for example as in [Start a run safely twice](start-a-run-safely-twice). Each change of its status arrives as an event.

   ```text
   id: 1795468995392
   event: run
   data: {"w":"01a20a00-271a-7066-b1b9-8cf40806393b","k":"run","id":"01a20a4a-ab31-71c2-8d20-a15326b4ea32","flow":null,"s":"queued","p":"appointments/free-times"}
   ```

   Later events for the same `id` say `"s":"running"`, then `"s":"succeeded"`.
4. When an event arrives, read what changed with the ordinary route, `GET /api/v1/tenants/<t>/workspaces/<w>/runs/<id>`. The stream tells you that something changed. It never carries the data.
:::

## The events

Each message has an `id`, an `event` and a `data` that is JSON.

| `event` | When | `data` |
| --- | --- | --- |
| `ready` | The connection is open. | `{}` |
| `snapshot` | The connection came back with a `Last-Event-ID` header: events may have been missed. | `{}` |
| `run` | A script run changed status. | `w` (workspace ID), `k` (`run`), `id` (the run), `flow` (the flow run it belongs to, or `null`), `s` (status), `p` (the script's path) |
| `flow_run` | A flow run changed status. | `w`, `k` (`flow_run`), `id`, `s`, `p` (the flow's path) |
| `step` | A step of a flow run changed. | `w`, `k` (`step`), `id` (the flow run), `node`, `s`, `p` |
| `log` | A run wrote log lines. At most twice a second for each run. | `w`, `k` (`log`), `id`, `flow` |

A comment line, `: ping`, comes every 20 seconds to keep the connection from being closed for being quiet.

## Reconnect

A browser's `EventSource` reconnects by itself after the `retry` of 3,000 milliseconds and sends the last `id` as `Last-Event-ID`. The stream does not replay what was missed. A connection that sends `Last-Event-ID` gets `snapshot` in place of `ready`, and that is your cue to read again everything you show: the list of runs and the runs you follow.

```bash
curl -s -N -H "authorization: Bearer $VOLVEL_KEY" -H 'last-event-id: 1' \
  "$VOLVEL_URL/api/v1/tenants/$TENANT/stream"
```

```text
event: snapshot
data: {}
```

## Limits

- At most 5 streams for one caller, on one instance replica. A caller who may read no runs anywhere in the tenant, and so follows only their own, may hold 2. A further one is refused with 429 `too_many_streams`: close one first.
- What you may read is worked out once, when the stream opens. If a role is given or taken away, open a new connection to see the change.
- When a member's sessions end, as when the account is disabled, their streams on that replica are closed.

## The result

Your program learns of a change within the time the run takes to change, and reads only the runs that changed.

## If it does not work

- **401 "Sign in or send an API key."** The request had no credential. 
- **404.** You have no standing in the tenant, so it is not there for you.
- **429 `too_many_streams`.** You have too many connections open. Close the ones that are not used.
- **Nothing arrives, then everything arrives at once.** A proxy is buffering. The instance sends `x-accel-buffering: no`; set the proxy not to buffer this path.
- **Events from a workspace are missing.** You do not hold `run:read` or `flow_run:read` there. A member who may read runs in another workspace still follows their own runs.
