---
title: Failure alerts
description: What counts as a failure that is alerted, who is told, how the workspace default and a script's own onFailure combine, and why a run of failures sends one alert.
subjects: [alerts]
---

A failure alert tells someone that a run failed for the last time. This page explains what is alerted, who is told, and why a burst of failures sends one message. To set it up, follow [Get told when a run fails](../../../console/how-to/operate/set-failure-alerts).

## The idea

A run that fails is not yet a failure to tell anyone about: it may have attempts left, or it may be a step whose flow has an error path for it. An alert is for the end of the line: a script run that has failed on its last attempt, or a flow run that failed. The alert goes where the workspace says, or where the script says.

## What is alerted

- A **script run** that failed for the last time, after all its attempts.
- A **flow run** that failed, as a whole. A flow's own steps are not alerted: the flow decides what a failed step means, and its failure is the flow run's. A sub-flow's failure is reported by the flow that started it.
- A **trigger source's** run that ends as failed because what it gave back could not be passed on, or because some of its items were refused (the alert goes out once for the whole tick).

These are not alerted: a run that was canceled; a run that failed but has attempts left; a failure the flow handled down an error path; a run of the failure handler itself, so a handler that fails does not start another.

Nothing alerts on a queue that backs up, on a run that runs long, or on a run that succeeded.

## Who is told

Two places can say, and one of them wins:

- The script's own `onFailure`, in its definition: `{ script, notify }`.
- The workspace's default, set on the **Alerts** screen: a script to start and a connection to post to.

A script's `onFailure` **replaces** the workspace's default, as a whole. It is not added to it: a script that names only a script does not also post to the workspace's connection. An `onFailure` that names neither a script nor a connection asks for nothing of its own, so the default stands. A flow uses the workspace's default. If neither says anything, no alert is sent.

Each can do two things:

- **Start a script.** It is started with the failed run as its input: `{ run: { id, script, attempt, error } }`. It runs as a run of its own, started by "Failure handler". Its ID is kept on the failed run, and the run's page links it.
- **Post to a connection.** A connection of the `http` connector, set up in the workspace. It is posted JSON with `text` ("Run failed: *path* in *workspace*. *error*") and `run` (`id`, `script`, `attempt`, `error`, `workspace`). The post is queued and made by a worker of the failed run's pool, or, for a flow, a worker of a pool that serves the connection. The failed run's page says "The failure notification is waiting for a worker to post it." until it is posted.

A connection renamed in the console is renamed in the workspace default too.

## One alert for a burst

Failures of one script, or one flow, within ten minutes of an alert are counted on that alert and not sent. The first failure sends the alert. Each later one in the window adds one to its count: the alert shows "+N more" in the list on the **Alerts** screen and "N later failures were counted on this alert, not sent on its own." on its run's page; the later run says "No alert was sent: it is counted on the alert of an earlier failure, sent less than ten minutes before." The next failure after the window sends a new alert, and its message adds "(and N more failures since the last alert)".

The window is per script or flow path, in one workspace. A failure of another script sends its own alert.

## Doing more than the default

A run that fails for the last time also publishes the event `platform/run-failed`, with the run's `runId`, its `script` and its `error`; every payload is listed in [Platform events](../../reference/platform-events). An event trigger can listen for it and start a script of its own, with a `filter` to pick which failures count. This is separate from the alert: it fires for every last failure, with no ten-minute window, and only while the trigger is on and not paused.

```yaml title="platform/ops/on-run-failed.trigger.yaml"
schemaVersion: 1
body:
  type: event
  script: ops/tell-the-channel
  event: platform/run-failed
  filter: event.payload.script == 'billing/chase-one'
```

The script is given the event's payload as its input. The `filter` is a CEL expression over `event`. A filter that fails, or a payload that does not fit the script's input, skips that trigger and records a refusal on it, shown as **Last refused** on the [Triggers](../../../console/reference/screens/operate/triggers) screen.

## What is left to others

Volvel does not page anyone by itself, and has no built-in mail or chat integration for alerts. It starts a script you wrote and posts to a connection you set up: what happens next, such as texting an on-call person, is that script's or that service's.

## Related

- [Alerts](../../../console/reference/screens/configure/alerts)
- [The run page](../../../console/reference/screens/operate/run-page)
- [Platform events](../../reference/platform-events): the payload of `platform/run-failed` and the others.
