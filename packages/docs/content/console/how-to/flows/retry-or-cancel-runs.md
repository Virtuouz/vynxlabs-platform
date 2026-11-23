---
title: Retry or cancel runs
description: Run a flow again, retry it from the failed step, even on another version, cancel one flow run, or cancel every run older than a time.
subjects: [flows, runs]
---

## Retry or cancel runs

By the end you will have run a flow again, or stopped runs that will not finish.

## Before you start

- You need `flow_run:write` in the workspace or on that one flow. Without it the buttons are disabled and a line says why. See the [permissions reference](../../../administer/reference/permissions).

## Run a flow again

:::steps
1. Open the run from **Operate**, then **Runs**, or from the flow's page.
2. Press **Re-run** and choose:
   - **Retry from the failed step…** keeps the steps that succeeded, were skipped or failed and were handled, and the approvals already granted. Steps that were refused or pending are asked again.
   - **Retry from the failed step on vN (deployed now)…** is listed when the flow has been deployed again since the run. It does the same on the deployed version, if the kept steps are drawn the same there.
   - **Again from the start** runs every step again with the same input and the same version.
   - **Again, with other input…** asks for new input.
   - **On another version…** opens a dialog. Choose the **Version**, and **Run** either **From the failed step** or **Every step again, from the start**, then **Continue**.
   - **On the version deployed now** runs every step again on it.
3. Read the question, for example "Retry from the failed step?" with "Runs again: approve. Kept as it was: nothing. On version 21, with the same input." Press **Retry**. The new run's page opens, and says "Retry of a run".
:::

A run of a sub-flow has no **Re-run**. It shows **Retry the flow that started it**, which opens the parent. **Copy as curl** copies the call that starts the flow again with the same input.

## Cancel one run

:::steps
1. Open the flow run. While it is going, the header shows **Cancel flow run**.
2. Press it, read "Cancel this flow run?", and press **Cancel flow run**. **Keep running** leaves it.
:::

The console says "Canceling. Steps that are running are stopped." and the run ends as **Canceled**.

## Cancel by age

:::steps
1. Open **Operate**, then **Runs**. The header shows **Cancel by age…** only while a run is going.
2. In **Which runs**, choose **Flow runs that are going** or **Script runs, queued and going**.
3. In **Started more than this long ago**, set an **Amount** and a **Unit**. Press **Continue**.
4. The dialog warns that it cancels every run started more than that long ago that has not finished, and that it cannot be undone. Press **Cancel runs older than** the length, or **Keep them**.
:::

It cancels up to 10,000 at a time. If more are left it says so; do it again.

## If it does not work

- **The console refuses with a conflict.** A kept step is drawn differently on that version, the run is still going, the run succeeded and you chose **Retry from the failed step**, or you chose it with other input. Choose **Again from the start** instead.
- **"This workspace has no versions yet."** Deploy first.
- **The buttons are disabled.** You need `flow_run:write`.

## The run page of a flow

A flow run's page, opened from **Runs**, shows the run's ID, the flow, its state, how long it took, how it was started and the version, with **Trace**. A **Timeline** tab lists each step with its state and time, and a **Graph** tab draws the flow as it was at the run's version. Choosing a step shows when it **Started**, how long it **Ran**, its input and output. A failed run says "Failed at <step>: <reason>". A run waiting for a person shows the approval with **Approve** and **Reject**. The header has **Cancel flow run** while the run is going, **Re-run** after it, **Copy as curl**, and "Compare with the last success" when there is one. A retry links back with "Retry of a run", and a run that was retried links forward with "Retried once". This section stands in for a Runs screen page that does not yet cover flow runs.

See [How a flow runs](../../explanation/flows/how-a-flow-runs).
