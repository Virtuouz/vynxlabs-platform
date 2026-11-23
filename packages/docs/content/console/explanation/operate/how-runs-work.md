---
title: How runs work
description: What a run is, the states it passes through, how retries and time limits end it, what the console hides in what it shows, and how long runs are kept.
subjects: [runs]
---

A run is one execution of a script or of a flow. This page explains the states a run has, what ends it, and what the console shows of it and keeps. To find a run, see [Find and stop runs](../../how-to/operate/find-and-stop-runs). For every control of the list, see [Runs](../../reference/screens/operate/runs).

## The idea

Two kinds of run exist. A **script run** is one execution of a script by a worker. A **flow run** is one execution of a flow: it walks the flow's graph, and each script step it reaches is a script run of its own, started by the flow. The [Runs](../../reference/screens/operate/runs) list shows script runs and flow runs together. A flow's steps are not listed: they are part of the flow run, and the flow run's page lists them.

Everything that starts a run records what started it: a person, a schedule, a webhook, an event, a form, another flow, a failure handler, or a re-run or retry of an earlier run. That is the **Trigger** column.

## The states

One vocabulary is used on every screen.

| State | Meaning |
| --- | --- |
| **Queued** | It waits for a worker. |
| **Running** | A worker is executing it. |
| **Waiting for approval** | A flow's step waits for a person to decide. |
| **Waiting for a time** | A flow waits on a delay, or a script run was set to start later. It reads "Waiting until *time*". |
| **Succeeded** | It ended well. |
| **Failed** | It ended badly, for the last time. |
| **Canceled** | Someone or something stopped it. |
| **Skipped** | A step of a flow that did not run. Only steps have it. |

A queued run that was set to start later counts as waiting for a time, not queued: nothing is holding it up. A flow run that waits for a person is not running, and a queued run is not waiting. The stored status for a canceled run is spelled `cancelled`, in the API and in the events a run publishes.

## Retries and attempts

A script may say how many more times a failed run is tried: from 0 to 10, with a delay of up to 3,600 seconds before each try and, if it asks, a delay that doubles each time. Each try is an **attempt**. While attempts remain, a failed run goes back to **Queued** with its error kept, and the run's page shows "attempt *n* of *m*". Only the failure of the last attempt makes the run **Failed**, publishes `platform/run-failed`, and is alerted. An attempt that logged nothing says "nothing logged".

A script also has a time limit, from 1 to 3,600 seconds, and a memory limit, from 64 to 4,096 MB (512 unless it says). A run that exceeds either fails, and the run page gives a [diagnosis](../../reference/operate/diagnosis). A script that returns more than 10 MB of output fails with "The output is larger than 10 MB" and its size, and is not tried again.

A flow decides what a failed step means. A step that has an error path hands the failure to it, and the flow carries on. A step that has none fails the flow run.

## Canceling

Canceling a queued or waiting run ends it before it starts. A running script hears the cancel at its next check and stops. Canceling a flow run cancels the steps it has going. A canceled run is announced to listeners as `platform/run-finished` with the status `cancelled`, and is not alerted.

## What the console shows of a run

- **Masked values.** A value the run was given, such as a secret or credential, is masked wherever it turns up in the run's log, error, output or alert, whatever key it sits under. An input or output key that names a secret (`password`, `token`, `api_key` and the like), or is marked secret in its schema, shows `[redacted]`. What is stored is not changed: a re-run on the server uses the real values, and the console's input form asks you to type again a value it had to mask.
- **Large payloads.** An input or output over 256 KB is kept as a file and read back when needed. The console may say an input "is too large to show or change here".
- **The log.** A line's message is cut at 8,000 characters. The console holds the newest 50,000 lines of a run and offers "Download the whole log".
- **Tags.** A run may carry up to 10 tags, each of 1 to 64 characters from `a-z`, `0-9`, `_`, `.`, `:` and `-`. They are searched exactly.

## How long runs are kept

Runs are kept 30 days, events 30 days and trigger refusals 7 days, unless the tenant's retention policy says otherwise. The Runs screen says "Kept N days". After that a run is gone, and a link to it says it was not found.

## How it fits

A run is where the screens of **Operate** meet. A [trigger](../../reference/screens/operate/triggers) starts it. An [event](../../reference/screens/operate/events) is what some triggers listen for, and every run ends by publishing events that other triggers can listen for. An [approval](../../reference/screens/operate/approvals) is a state of a flow run. A [failure alert](../../../develop/explanation/operate/failure-alerts) is what happens when a run fails for the last time.
