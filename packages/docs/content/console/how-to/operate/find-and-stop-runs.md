---
title: Find and stop runs
description: Find a run by what it did, narrow the list to a window of time, and cancel one run, several, the queued ones, or everything that has been going too long.
subjects: [runs]
---

## Find and stop runs

By the end you will have found the runs you meant, canceled a run that was going, and know how to clear a backlog of queued runs or of runs that never finish.

## Before you start

- You are signed in and the workspace is open. To see runs you need `workspace:read` and `run:read` (scripts) or `flow_run:read` (flows). To cancel, `run:write` for script runs or `flow_run:write` for flow runs. A workspace admin has them. See the [permissions reference](../../../administer/reference/permissions).
- Runs are kept 30 days unless the tenant's retention says otherwise. A run older than that is gone.

## Find a run

:::steps
1. Open **Operate**, then **Runs**. The list shows the last 24 hours, newest first.
2. Press a status chip to narrow it: **Failed**, **Running**, **Waiting for approval**, **Waiting for a time**, **Queued**, **Succeeded** or **Canceled**. Each chip carries a count.
3. Type in **Search**. It finds a script or flow by the start of its path, a run by its exact ID or tag, and any run whose error contains the text. The list follows 300 ms after you stop typing.
4. Choose **Kind**, **Scripts** or **Flows**, to leave out the other.
5. Change **When**. **Last hour**, **Last 24 hours** and **Last 7 days** are relative to now. For a fixed span choose **Between…**, then set **From** and **To** in your own time zone. Leave **To** empty for "until now". **Everything kept** drops the window.
6. To follow one script or flow, open the **Actions** menu of any of its rows and choose **Only runs of *path***.
7. Choose a row. Its run opens beside the list: **Logs**, **Input and output** and **Details**. Press **Open full view** for its page.
:::

An ID older than the window is found only under **Everything kept** or **Between…**. The address of the list keeps every filter, so a link or a reload shows the same list. To keep a set of filters for next time, use the bookmark menu, **Saved views**, then **Save this view…**.

## Cancel runs

:::steps
1. To cancel one run, open its **Actions** menu in the list and choose **Cancel**, or press **Cancel run** on the run's page. The console asks "Cancel this run of *path*?" Press **Cancel the run**.
2. To cancel several, check their boxes. A bar says "N selected". Press **Cancel**, read "Cancel N runs?" and press **Cancel N runs**. Runs that have finished are left as they are.
3. To cancel every queued script run that fits the list, set the status chip to **All** or **Queued** and press **Cancel N queued**. Press **Cancel queued runs**. This cancels runs the page has not loaded too. Runs already going carry on.
4. To cancel what has been going too long, press **Cancel by age…**. Choose **Which runs**: **Flow runs that are going** or **Script runs, queued and going**. Under **Started more than this long ago** give an amount and a unit. Press **Continue**, read the warning and press **Cancel runs older than** the length you gave.
:::

**Cancel N queued** is offered only when the status chip is **All** or **Queued**, **Kind** is not **Flows**, and you hold `run:write` on the whole workspace. **Cancel by age…** is offered while any run in the list is in progress.

::screenshot{name=console/operate-cancel-by-age alt="The Cancel runs by age dialog, with a choice of flow runs or script runs and a field for how long ago they started."}

## The result

A canceled run reads **Canceled** and stays in the list, under the **Canceled** chip. A script run stops where it is: the worker stops it at its next check. A flow run stops with every step it has going. A run that has not started never starts. Canceling also publishes `platform/run-finished` for a script run, with the status `cancelled`.

**Cancel runs by age** and **Cancel N queued** cancel up to 10,000 runs at a time. When more are left the notice says "N flow runs canceled. More are left: cancel again.", "N script runs canceled. More are left: cancel again." or "N queued runs canceled. More are left: cancel again." Press the button again.

## If it does not work

- **There is no Cancel on a row.** You may not cancel it. The row menu leaves out what you may not do. A run that has finished cannot be canceled.
- **"The end is before the start."** **To** is before **From**. Change one. The list is empty until you do.
- **"No run has this ID."** The run is older than what is kept, belongs to another workspace, or the ID is mistyped.
- **A flow's steps are not in the list.** Search shows the flow run. A step's run ID typed into the address shows its script and a link, "A step of a flow run."
- **The dialog says "N done, M not done."** When some of the runs had finished before the cancel reached them, it adds ", K left alone because they had finished": nothing was wrong with those. It lists each run that was not done with why, and a request ID to give whoever looks into it. Press **Retry the M not done** to try those again, or **Close**.

## Related

- [Runs](../../reference/screens/operate/runs): every control of the list.
- [Run again](run-again)
- [How runs work](../../explanation/operate/how-runs-work)
