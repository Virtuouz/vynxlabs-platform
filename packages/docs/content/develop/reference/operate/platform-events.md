---
title: Platform events
description: "The events whose names begin platform/: when each is published, what its payload holds, and how to listen for one."
subjects: [events]
---

Volvel publishes some events itself. Their names begin `platform/`. A tenant does not declare them and cannot publish one: the server refuses a publish whose name begins `platform/` with "Events under platform/ are published by the platform itself." A trigger or a flow listens for one the same way as for an event of its own, by its name, and the console's pickers list them after the workspace's own events.

A platform event is stored only when an event trigger of the workspace listens for it, is turned on, and is not held by a pause of the trigger, the workspace or the instance. Events that nothing listens for leave no trace in the [Events](../../../console/reference/screens/operate/events) log.

## The events

| Name | Published when | Payload |
| --- | --- | --- |
| `platform/run-succeeded` | A script run ended well. | `runId` (string), `script` (string, the script's path) |
| `platform/run-failed` | A script run failed for the last time. | `runId`, `script`, `error` (string, optional) |
| `platform/run-finished` | A script run ended, however it ended, including a run that was canceled. | `runId`, `script`, `status` (`succeeded`, `failed` or `cancelled`), `error` (optional) |
| `platform/flow-run-finished` | A flow run ended, however it ended. | `flowRunId` (string), `flow` (string, the flow's path), `status` (`succeeded`, `failed` or `cancelled`) |
| `platform/deployment-created` | A version was deployed to the workspace, by a deploy or by a promotion into it. | `deploymentId` (string), `bundleVersion` (number) |
| `platform/row-changed` | A row of a table was inserted, updated or deleted. | `table` (string, the table's path), `change` (`inserted`, `updated` or `deleted`), `id` (string, the row's ID) |

The stored status for a canceled run is spelled `cancelled`.

A run that is a step of a flow is a script run and publishes the first three too. A trigger source's run publishes them as well, and a run that fails because its source's answer could not be passed on is announced as failed.

`platform/row-changed` is published for a change made through the console, the API or a script's row operations. A change made by a reference's rule (for example a delete that cascades) is not announced. A change published by a script carries the depth of the chain that led to it, so a chain of row changes causing row changes stops at 10 events deep: the event at that depth is stored and starts nothing.

## Listening for one

Choose the event in the **Event** field of an event trigger, or in a flow's event start. In a repository, name it in `defineEventTrigger`:

```ts title="src/alerts.ts"
import { defineEventTrigger } from "@volvel/sdk";

export const onFailed = defineEventTrigger({
  path: "ops/on-run-failed",
  event: "platform/run-failed",
  script: "ops/tell-the-channel",
  filter: "event.payload.script == 'billing/chase-one'",
});
```

The script is given the event's payload as its input. The optional `filter` is a CEL expression over `event`; the script starts only when it is true. A filter that fails, or a payload that does not fit the script's input, skips that trigger and records a refusal on it, shown as **Last refused** on the [Triggers](../../../console/reference/screens/operate/triggers) screen.

## Related

- [Events](../../../console/reference/screens/operate/events)
- [Triggers](../../../console/reference/screens/operate/triggers)
- [Failure alerts](../../explanation/operate/failure-alerts): the default way to be told of a failure.
