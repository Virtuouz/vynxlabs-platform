---
title: The run page
description: "Every control, state and permission of the page of one run: a script run with its attempts and log, a flow run with its timeline and graph, the failure alert, and the comparison with the last success."
subjects: [runs]
---

A run has a page of its own at `runs/<id>` in its workspace. The address does not say whether the run is a script's or a flow's: the page asks for a script run first and, if none has the ID, for a flow run. If neither has it, the page says it is not found and links back to **Go to the runs**. A script run is the page described under **A script run**. A flow run is described under **A flow run**.

The page is reached from the [Runs](runs) list (a row's title, **Open**, or **Open full view**), from an event, trigger or approval that names the run, or by its address. F1 (**Help for this page**) on a run page, and on the compare page, opens the help topic `operate-runs`.

::screenshot{name=console/operate-run-failed alt="A failed script run: the header with the state, version and Re-run menu, the attempts and details on the left, and on the right the error, a diagnosis, the log and the input and error tabs."}

## A script run

### Header

| Item | Shows or does |
| --- | --- |
| Run ID | The ID, with a copy button. |
| Script | The script's path, a link to its page. A run started by a trigger source names the source and links its editor. |
| State | The state pill. "attempt n of m" follows when the script may try more than once. A run set for later reads "Waiting until HH:MM:SS". |
| Waited and ran | "waited 2.1 s · ran 3.0 s", counting while the run goes. |
| Started by | What started it, linked: a schedule or trigger by name, "Step *node* of a flow run", an event with **The event** beside it. Nothing for a re-run: the link below says it. |
| version *n* | A link to the script's source at that version. A trigger source's run links the source. |
| **Re-run of a run** | On a run that was started again from another: links to that run. |
| **Trace** | The trace ID, with a copy button, for a collector or the logs. |
| **Run again once** or **Run again N times** | On a run that was run again: links to the first of those. |
| Tags | Each tag links to the runs list narrowed to it. |
| **Cancel run** | While the run is queued or running. Asks "Cancel this run?" with **Cancel run** and **Keep running**, then says "Canceling. The worker stops it at its next check." |
| **Re-run** | A menu: **With the same input**, **With other input…**, **On the version deployed now**. Each asks first. |
| **Edit with this input** or **Edit in *dev workspace*** | Opens the script in a dev workspace's editor with this run's input loaded: here if this is a dev workspace, otherwise the dev workspace that promotes here. Disabled, with the reason, without `resource:write` there. |
| Copy as curl | **Copy as curl: run this again with the same input**: the `POST runs/<id>/rerun` call. |

A step of a flow has none of the **Re-run** menu: its flow run is run again instead. A trigger source's run has neither the menu nor the curl button. Without `run:write` on the script, **Cancel run** and **Re-run** are disabled and the reason is written beside them.

**With other input…** opens **Run *script* again**, with the input as fields drawn from the script's input schema, or as JSON. A value that was masked when shown is left out, named in a notice ("One value was masked when shown (*path*). Enter it again to run with it."), and must be typed again. An input too large to show says "This input is too large to show or change here. It can be run again with the same input." and offers **Run again with the same input**. This dialog has no start time or priority; see [Run again](../../../how-to/operate/run-again).

### Left pane

- **Attempts**: one line per attempt, "#1 failed" or "#2 succeeded", with "N error lines" if it logged any, and when it started or "nothing logged". A failed attempt is one that was followed by another, or the one the run failed on.
- **Received**, **Started**, **Finished**, **Worker** (name and pool), **Time limit** (in seconds), and **Concurrency key** ("*value* · one at a time" or "N at a time") when the script has one.
- **Uses**: each connection the script uses, linked to **Connections**, with **Set up here** or **Not set up here**. Read from the version the run ran.
- The failure alert, if one was made: see below.
- **Published**: for a run that has ended, the events it published, each linked to **Events**, or "It published no events."

### Right pane

- **Why it failed**: the error message in full, when the run failed.
- A **diagnosis** when the failure is of a known kind: a cause, a next step, and a button **Open *section*** (connections, secrets, variables, settings, triggers). The kinds are in [What a diagnosis says](../../operate/diagnosis).
- A notice with why a queued run waits, when it does: no worker of the pool, no worker of the tenant's own, or the same concurrency key is busy.
- **Log**: see below.
- **Since it last worked**, for a run that failed or was canceled: see below.
- Tabs **Input** and **Output** (**Error** when the run failed), kept in the address as `?io=`.

## A flow run

### Header

The same header with these changes: the flow's path; the state; how long it has lasted; **Retry of a run** and **Retried once** or **Retried N times**; **Cancel flow run** while it goes ("Cancel this flow run?", "Steps in progress are canceled too.", then "Canceling. Steps that are running are stopped."); and a **Re-run** menu with, as they apply:

| Item | When |
| --- | --- |
| **Retry from the failed step…** | The run failed or was canceled. Shows what runs again and what is kept, including approvals already granted, which are not asked again. |
| **Retry from the failed step on v*N* (deployed now)…** | As above, and the version deployed now is newer and draws the kept steps the same. |
| **Again from the start** | Every step again with the same input. |
| **Again, with other input…** | Opens **Run *flow* again** to change the input. |
| **On another version…** | Opens **Run *flow* on another version**: **Version** (each as "vN, *time*", and "(deployed now)") and **Run**: **From the failed step** (only for a failed run) or **Every step again, from the start**. |
| **On the version deployed now** | Every step again, on the newest version. |

A flow run that another flow started has instead **Retry the flow that started it**, which opens that flow run. **Copy as curl: start this flow again with the same input** copies the retry call. Without `flow_run:write` on the flow, **Cancel flow run** and **Re-run** are disabled and the reason is written beside them.

### Below the header

- A failure notice: "Failed at *step*: *message*", with **Show *step*** when another step is chosen; or "The flow failed." and the message.
- For each step waiting for approval: "Waiting for approval: *title*", the first fields of its detail, "You may decide this." with **Approve** and **Reject**, or "You may not decide this: it waits for *who*." Approve takes an optional note. **Reject** asks "Why is it rejected?" and the sentence "Rejecting fails the step: the flow takes its error path, or fails if it has none."
- The failure alert, if any, and **Since it last worked**.
- **Timeline** and **Graph** tabs, kept in the address as `?view=`. The timeline's legend reads **Waiting for a worker**, **Running**, **Waiting on purpose**. The graph is drawn as the flow was at this run's version; if the flow has changed since, it says "The flow has changed since this run. It is drawn as it ran, at version *N*."
- A **step panel** for the step chosen (`?step=`, by default the failed one, or the one going or waiting): its state; "took the case *name*"; **Open script**; **Started**, **Waited for a worker**, **Ran**, **Run ID**; its error ("The flow carried on down its error path." if it was handled) and its diagnosis; its input, output and log; "Waits until *time*."; "Kept from the run this one retries" with a link, when the step was not run again; **Open this step's run**; **See the flow run this step started**; and "N of M items done." for a step that works over items. A flow run has no list of the events it published.

## The log

The log of a script run, and of a step, has: **Search the log** with previous and next match, **Only matching**, a toggle per level (**Levels to show**, each with its count), **Wrap**, **Follow** (while the run goes), **Copy**, **Download**, a link to each line (`#L42`), and the count of lines. Past 500 lines the log draws only what is on screen. It holds the newest 50,000 lines; when older lines were left out it says "The first N lines are not shown here." with **Download the whole log**. A line's message is cut at 8,000 characters. Fields of a line over 32,000 bytes are replaced by a note. The log is masked by the values the run was given. An empty log says "The script logged nothing." (or "Waiting for the first line…" while the run goes, or "The step logged nothing.").

## Since it last worked

For a failed or canceled run, a panel compares it with the last earlier run of the same script or flow that succeeded: "It last succeeded *time* on v*N*." with rows **Input** ("The same as the last success", "Different from the last success" or "Too large to compare here"), **Version** ("The same, v*N*" or "v*A* then, v*B* now") and **Took** ("*now* now, *then* then"). **Show the input's difference** (only if the input differs) opens a diff, "The last success's input" against "This run's input", or says "Only masked values differ." **Compare the source** (a script) or **Compare the flow** (only if the version differs) opens `runs/<id>/compare/<other>`, titled **Compare runs**, which sets the two versions' code or flow side by side, or says "The code is the same in both" with links to each input. If no earlier success exists the panel says "It has not succeeded before here, so there is no earlier run to compare it with."

## The failure alert

When a run failed for the last time and the workspace or script says who to tell, the page shows what became of it, as the run stores it:

- **The failure handler's run**, a link to the run the handler script made.
- "The failure handler did not start: *reason*".
- "The failure notification was posted.", "The failure notification was not sent: *reason*" or "The failure notification is waiting for a worker to post it."
- "N later failures were counted on this alert, not sent on its own." ("1 later failure was counted…" for one.)
- "No alert was sent: it is counted on the alert of an earlier failure, sent less than ten minutes before."

How alerts are chosen is in [Failure alerts](../../../../develop/explanation/operate/failure-alerts).

## Commands in the palette

On a script run page the command palette offers, under **This run**: **Cancel this run** (while queued or running), **Run again with the same input** and **Run again on the version deployed now** (not for a step of a flow or a trigger source's run), **Open *script* in the editor**, **Compare with the last success**, **Copy the run ID**. On a flow run: **Cancel this flow run** while it goes, otherwise **Retry from the failed step**, **Retry from the failed step on v*N***, **Run again from the start** (or **Retry the flow run that started this one**), **Open *flow* in the editor**, **Compare with the last success**, **Copy the run ID**.

## States

| State | What the page shows |
| --- | --- |
| Loading | A loading mark. |
| Not found | "Go to the runs" beside the not-found notice. |
| Error | The error with a retry. |
| Live | The state, times and log update while the run goes. A read that failed and is being tried again shows "Reconnecting…". |
| Waiting for a time | "Waiting until HH:MM:SS". The page offers **Re-run** and **Edit with this input**, and no **Cancel run**: cancel such a run from the [Runs](runs) list, whose row menu has **Cancel**. |

## Permissions

| Action | Needs |
| --- | --- |
| See a script run, its attempts and diagnosis | `run:read` |
| See a flow run | `flow_run:read` |
| **Cancel run**, **Re-run** a script run | `run:write`, at the workspace or on the script |
| **Cancel flow run**, **Re-run** a flow run | `flow_run:write`, at the workspace or on the flow |
| **Approve** or **Reject** a step | `approval:write`, and membership of the step's approvers if it names any |
| **Edit with this input** | `resource:write` in the dev workspace |

## Related

- [Runs](runs): the list.
- [Find and stop runs](../../../how-to/operate/find-and-stop-runs), [Run again](../../../how-to/operate/run-again)
- [What a diagnosis says](../../operate/diagnosis)
- [How runs work](../../../explanation/operate/how-runs-work)
- [Approvals](approvals)
