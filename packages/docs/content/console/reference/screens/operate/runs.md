---
title: Runs
topic: operate-runs
description: "Every control, state and permission of the Runs screen: the list of script and flow runs, its filters, saved views, batch actions, row menu and the inspector."
subjects: [runs]
moved_from:
  - operate/runs
---

The **Runs** screen lists every :term[run]{id=run} of one workspace, scripts and flows together, newest first. A flow's steps are part of its flow run and are not listed. Choosing a row opens the run beside the list, in an inspector. The full page of a run is described in [The run page](run-page).

The screen is reached from **Operate**, then **Runs**. F1 (**Help for this page**) opens the help topic `operate-runs`.

::screenshot{name=console/operate-runs alt="The Runs screen: the filter row, the status chips with counts, and a list of runs with their state, target, result, trigger, start time and duration."}

## Controls

### Header

The line under the title reads "Scripts and flows that ran here; a flow's steps are part of its run." and adds "Kept N days." (the tenant's retention for runs: 30 days unless it says otherwise). While the live stream is not connected it adds "Updated HH:MM" and, while any run is in progress, ", asked again every 5 s."

| Control | What it does |
| --- | --- |
| **Search** | Finds runs by a path prefix, an exact tag, text in the error, or an exact run ID. The placeholder says "A path, a run ID, a tag or an error". It takes up to 200 characters. The list follows 300 ms after typing stops, and the text is kept in the address. |
| **Kind** | **Scripts and flows**, **Scripts** or **Flows**. |
| **When** | **Last hour**, **Last 24 hours** (the default), **Last 7 days**, **Between…** or **Everything kept**. |
| **From**, **To** | Shown only under **Between…**. Date and time fields in your own time zone. **From** starts at 24 hours ago when you choose **Between…**. An empty **To** means until now. If **To** is before **From**, the screen says "The end is before the start." and asks for nothing. Choosing a window again clears both. |

Search and the window apply together. An ID older than the window is found only under **Everything kept** or **Between…**; the address `?run=<id>` is not limited by the window.

### Status chips

The chips filter by state and each carries the count of runs in the current search and window: **All**, **Failed**, **Running**, **Waiting for approval**, **Waiting for a time**, **Queued**, **Succeeded**, **Canceled**. A run set to start later counts under **Waiting for a time**, not **Queued**.

When the list is narrowed to a script or flow, or by tag, a chip appears for each: **Of** *path* with an ✕, and **Tagged** *tag* with an ✕ (several tags must all match). A tag on a row is a button that adds that filter.

### Toolbar

| Control | What it does |
| --- | --- |
| **Cancel N queued** | Cancels every queued script run that fits the search, tags, target and window, whether or not the page has loaded it. It is offered only when the status chip is **All** or **Queued**, **Kind** is not **Flows**, there is at least one queued run, and you hold `run:write`. It asks "Cancel N queued runs?" and says "Every queued script run" followed by what narrows the list ("of *path*", "matching "*text*"", "tagged *tag*", "from the last 24 hours") "is canceled, whether or not this page has loaded it.", with **Cancel queued runs** and **Keep them**. Runs already going carry on, a flow's steps are left to their flow, and a run set for later is not queued. It says "N queued runs canceled." and, if more were left, ". More are left: cancel again." |
| **Cancel by age…** | Opens **Cancel runs by age**. It is offered when any run in the list is in progress (queued, running, waiting for approval or waiting for a time) and you hold `run:write` or `flow_run:write`. See below. |
| **Columns** | A dialog titled **Columns**: check a column to show it, move it with the arrows or by dragging, **Show every column**. **State** cannot be hidden. |
| **Row density** | **Compact** (the default here), **Standard** or **Comfortable**. |
| **Saved views** | A bookmark menu. **Save this view…**, **Save over “name”**, **Rename “name”…**, **Delete “name”**, **Copy a link to this view**. A view keeps the filters, search, sort, columns and density. Views are yours alone. A list keeps at most 50, a view at most 16,384 bytes, and a name is 1 to 80 characters. |

**Cancel runs by age** asks **Which runs**: **Flow runs that are going** (the default) or **Script runs, queued and going**. **Started more than this long ago** takes an **Amount** and a **Unit** (seconds, minutes, hours, days), up to 10 years, counted from when each run was started. **Continue** asks again with "This cancels every flow run (or script run) started more than *length* ago that has not finished. It cannot be undone." and a button **Cancel runs older than** *length*. For script runs the search, tags and target of the list narrow the set, and the window does not. Up to 10,000 runs are canceled at a time; the answer says "N flow runs canceled." or "N script runs canceled." and, if there are more, adds ". More are left: cancel again."; with none to cancel it says "No flow run has been going for more than *length*." (or "No script run…").

### The list

| Column | Shows |
| --- | --- |
| **State** | The run's state with its icon. A run set for later reads "Waiting until HH:MM". Cannot be hidden. |
| **Target** | A script or flow icon, the path, and the run's tags. |
| **Result** | The error summary in red if it failed, otherwise the output summary (200 characters), otherwise a dash. |
| **Trigger** | What started it: **By hand**, **Schedule**, **Webhook**, **Event**, **Form**, **Another flow**, **Failure handler**, **Re-run** or **Retry**. |
| **Started** | How long ago, sortable. |
| **Duration** | How long it ran, sortable. A run that has not started shows a dash and sorts last in both directions. |
| **Attempt** | "n/m", only for a run on its second attempt or later. |
| **Run ID** | The last 8 characters. |

A page holds 100 runs. **Load more** adds older runs. Runs that arrive while you are down the list, or have rows checked, wait behind a button over the list, "N new runs" (or "1 new run"); pressing it brings them in and returns to the top. Where the live stream is not connected, the list asks again every 5 seconds while any run is in progress.

### Row menu

The **Actions** menu of a row, and its checkbox, show only what you may do (`run:write` for scripts, `flow_run:write` for flows, at the workspace or on that script or flow).

| Item | When | What it does |
| --- | --- | --- |
| **Open** | always | The run's page. |
| **Run again…** | a script run that has finished and was not started by a trigger source | Asks "Run *script* again?" and starts a new run with the same input on the version it ran. |
| **Retry from the failed step…** | a failed flow run | Shows what runs again and what is kept, then retries. |
| **Again from the start…** | a flow run that has finished | Runs every step again with the same input on the version it ran. |
| **On another version…** | a flow run that has finished and was not started by a trigger source | Opens **Run *flow* on another version**. |
| **Cancel** | a run that is queued, running, waiting for approval or waiting for a time | Asks "Cancel this run of *path*?" ("The run stops where it is." or, for a flow, "The flow stops, with every step it has going.") with **Cancel the run** and **Keep it**. |
| **Only runs of *path*** | always | Narrows the list to that script or flow. |
| **Copy the run ID**, **Copy a link to it** | always | Copies, and says "Run ID copied." or "Link copied." |

### Checked rows

Check rows with the checkbox. A bar says "N selected" with **Cancel**, **Run again** and **Clear**; it is shown only to someone who holds `run:write` or `flow_run:write`.

- **Cancel** asks "Cancel N runs?" and leaves finished runs as they are.
- **Run again** asks "Run N runs again?": scripts run again with the same input on the version they ran, and flows retry from their failed step, or from the start if none failed. A trigger source's runs are left out, and the question says so.
- The server takes at most 100 runs of one kind at a time; the console sends more in slices of 100 and adds up the answers. When some fail, a dialog says how many were done and not done, and offers a retry for the ones that failed. A cancel of a run that had already finished is not a failure: the dialog counts it as "left alone because they had finished".
- Rows checked and then filtered away are dropped.

### The inspector

Choosing a row opens the run beside the list and puts the run ID in the address (`?run=`). For a flow run it shows the state, the error, **Started**, **Finished**, **Started by**, **Flow**, **Version**, **Run ID**, and **Open full view**. For a script run it shows the state, how long it waited and ran, **Cancel run** (while queued, running or waiting for a time), **Open full view**, a copy-as-curl button (**Copy as curl: run this again with the same input**), a **Why it failed** block with the diagnosis when it failed, and three tabs:

- **Logs**: the log, live while the run goes.
- **Input and output**: **Input**, and **Result**.
- **Details**: **Received**, **Started**, **Finished**, **Script** (or **Trigger source**), **Started by**, **Version**, **Worker**, **Timeout**, **Run ID**, **Uses** with **Set up here** or **Not set up here** for each connection, and **The failure handler's run** when a handler was started.

A run ID in the address that is a step of a flow run shows the script's panel under "A step of a flow run." with **Open the flow run**. An ID that no run has says "No run has this ID." with **Back to the list**.

### Keys

In the list: :kbd[↑] :kbd[↓] (or :kbd[j] :kbd[k]) move between rows, :kbd[←] :kbd[→] between cells, :kbd[Home] :kbd[End] to the first and last cell of a row (with :kbd[Ctrl] or :kbd[⌘], of the table), :kbd[PageUp] :kbd[PageDown] a page, :kbd[Enter] opens the row (with :kbd[⌘] or :kbd[Ctrl], in a new tab), :kbd[Space] or :kbd[x] checks it, :kbd[Shift] with an arrow checks a range, :kbd[⌘A] or :kbd[Ctrl+A] checks every row shown, and :kbd[Escape] clears the checks. The keys j, k and x can be turned off in your preferences.

### The address

The address keeps `status`, `kind`, `when`, `from`, `to`, `q`, `tag` (repeatable), `target`, `sort` (`started` or `duration`), `dir`, `cols` and `run`. A link with `?status=cancelled` from before still works.

## States

| State | What the screen shows |
| --- | --- |
| Loading | The list shows its place while the first page is read. |
| Empty | "Nothing ran in this time". |
| Filtered to nothing | "Nothing matches these filters", "Change or clear the filters to see more." and **Clear filters**. |
| Backwards window | The notice "The end is before the start." and an empty list with zero counts. |
| Error | The error with a retry; a failure of **Load more** is shown the same way and retries the load. |
| Live | While anything is in progress the list updates from the stream, or asks again every 5 seconds when it is not connected. |
| Reconnecting | A run's inspector or page says "Reconnecting…" while a read is being tried again. |

## Permissions

| Action | Needs |
| --- | --- |
| See the list | `workspace:read`, and `run:read` or `flow_run:read` for the kind shown |
| Cancel or run again a script run | `run:write`, at the workspace or on the script |
| **Cancel N queued** | `run:write` at the workspace |
| Cancel, retry or run again a flow run | `flow_run:write`, at the workspace or on the flow |
| **Cancel by age…** | `run:write` for script runs, `flow_run:write` for flow runs |
| Saved views | A signed-in member. A service account or API key keeps none. |

A control you may not use is left out of the row menu and the batch bar. The row menu counts a grant on the script or the flow itself. The batch bar, **Cancel N queued** and **Cancel by age…** are offered only for the permission held on the whole workspace. The server decides again when you press a control.

## Related

- [The run page](run-page): one run, its attempts, log and failure.
- [Find and stop runs](../../../how-to/operate/find-and-stop-runs)
- [Run again](../../../how-to/operate/run-again)
- [What a diagnosis says](../../operate/diagnosis)
- [How runs work](../../../explanation/operate/how-runs-work)
- [Events](events), [Triggers](triggers), [Approvals](approvals)
