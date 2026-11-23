---
title: Run again
description: Run a script or flow again with the same input, with other input, on another version, from its failed step, or later with a priority.
subjects: [runs]
---

## Run again

By the end you will have started a new run from an old one, or started a script later, and know which version it ran on.

## Before you start

- You hold `run:write` for a script run, at the workspace or on the script, or `flow_run:write` for a flow run, at the workspace or on the flow. A workspace admin has both. See the [permissions reference](../../../administer/reference/permissions).
- The run has finished. A run that is still going is canceled, not run again: see [Find and stop runs](find-and-stop-runs).
- A run a trigger source started is not run again by hand: its trigger starts it.

## Run a script again

:::steps
1. Open **Operate**, then **Runs**, and choose the run. Press **Open full view**, or open its **Actions** menu in the list.
2. For the same input on the same version, choose **Run again…** in the list, or **Re-run**, then **With the same input** on the run's page. The console asks "Run *script* again?" and says "With the same input, on version *N*, the one it ran." Press **Run again**.
3. For the same input on the newest version, choose **Re-run**, then **On the version deployed now**. The question says "With the same input, on the version deployed now."
4. For other input, choose **Re-run**, then **With other input…**. The dialog **Run *script* again** starts with the old input in fields drawn from the script's input schema. Change them and press **Run again**. The same fields are in a JSON view, under **How to give it**. A value that was masked when the run was shown is left out and named: type it again.
:::

The new run opens as soon as it starts. A run started from the list says "Started again." with **Open it**.

## Run a script later

A later run is started from the script, not from an old run.

:::steps
1. Open the script from **Build**, then **Scripts**, and press **Run**.
2. Under **Start** choose **Later**. In **Starts at** give a time that has not passed.
3. Optionally give a **Priority**, a whole number from -100 to 100. A higher priority goes first when runs wait for a worker. Zero is the default.
4. Fill in the input and press **Run**.
:::

The run opens at once and says "Waiting until *time*". In the Runs list it counts under **Waiting for a time**. It starts then. **With other input…** on an old run has neither a start time nor a priority, and a flow cannot be started for later.

## Run a flow again

:::steps
1. Open the flow run's page and press **Re-run**.
2. If the run failed or was canceled, choose **Retry from the failed step…**. The console lists "Runs again:" with the steps, "Kept as it was:" with the steps it keeps, "Approvals kept, not asked again:" with the approvals already granted, and the version it will run on. Press **Retry**. Steps that went well are not run again, and an approval already granted is not asked again; one that was rejected or still pending is asked again.
3. If a newer version is deployed and draws the kept steps the same, **Retry from the failed step on v*N* (deployed now)…** is offered. Use it to try a fix on a run that failed.
4. To run every step again, choose **Again from the start** (the same input, the same version), **Again, with other input…** or **On the version deployed now**.
5. To run on a version that is not the newest, choose **On another version…**. Choose a **Version** and under **Run** choose **From the failed step** (offered for a failed run) or **Every step again, from the start**. Press **Continue**.
:::

If the version you chose draws a kept step differently, the question says "That version draws *steps* differently, so this retry would be refused: retry from the start instead."

To run many at once, check their rows in the Runs list and press **Run again**. Scripts run again with the same input on the version they ran. Flows retry from their failed step, or from the start if none failed.

## The result

A new run exists and is linked from the old one: the old run's page says "Run again once" or "Retried once", and the new run's says "Re-run of a run" or "Retry of a run". A flow retried from its failed step shows each kept step with "Kept from the run this one retries" and a link to it.

## If it does not work

- **There is no Run again on a row.** The run is still going, was started by a trigger source, or you may not run it again. The menu leaves out what you may not do.
- **A step cannot be run again alone.** A flow's step is run again by retrying its flow run: the step's page offers **Retry the flow that started it**.
- **"Choose a time that has not passed."** The start time is in the past.
- **"Priority is a whole number from -100 to 100."**
- **"This workspace has no versions yet."** **On another version…** needs a deployed version.
- **The retry is refused.** The version you chose draws kept steps differently. Retry from the start instead.

## Related

- [The run page](../../reference/screens/operate/run-page): the **Re-run** menus.
- [Runs](../../reference/screens/operate/runs)
- [How runs work](../../explanation/operate/how-runs-work)
