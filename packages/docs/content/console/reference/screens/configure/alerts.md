---
title: Alerts
topic: configure-alerts
description: "Every control, state and permission of the Alerts screen: the workspace's default for who is told when a run fails for the last time, the scripts that set their own, and the alerts sent."
subjects: [alerts]
moved_from:
  - configure/alerts
---

The **Alerts** screen sets who is told, and how, when a script or a flow fails for the last time in one workspace, and lists the alerts that were sent. It has three sections: the workspace's default, the scripts that set their own, and the recent alerts. How an alert is chosen and what counts as a failure is explained in [Failure alerts](../../../../develop/explanation/operate/failure-alerts).

The screen is reached from **Configure**, then **Alerts**. F1 (**Help for this page**) opens the help topic `configure-alerts`. There is no alert on a queue that backs up: only a run that fails for the last time is alerted.

::screenshot{name=console/configure-alerts alt="The Alerts screen: the workspace's default with a script and a connection to choose, the scripts that set their own, and a list of recent alerts."}

## Controls

The description reads "Who is told when a script or a flow fails for the last time. A script's own onFailure replaces this workspace's default, as a whole. More failures of one script within ten minutes of an alert are counted on it, not sent again."

### This workspace's default

| Control | What it does |
| --- | --- |
| **Start a script** | Chooses a script of the workspace, or **None**. The script is started with the failed run as its input. A script that was chosen and is no longer found stays listed as "*path* (not found)". |
| **Post to a connection** | Chooses a connection, or **None**. Only connections of the `http` connector that are set up in this workspace are offered. The connection is posted a summary as JSON, with a line of text a chat webhook shows as it is. One that was chosen and is no longer set up stays listed as "*path* (no longer set up here)". |
| **Save** | Saves both. It says "Alerts will go there from the next failure." Disabled until something changed. Shown only where the screen is editable. |
| **Send a test alert** | Offered once a connection is chosen. Posts a test through the connection, by a worker. The button reads "Sending…" and then "Waiting for a worker…" if no worker picks it up soon. The result shows "The test alert was posted." or the error. Disabled, with "It needs connection:write.", without that permission. |

Both choices can be set at once: a failure then starts the script and posts to the connection.

### Set by scripts themselves

A list of the scripts that declare their own `onFailure`, each linked to its editor, with what it does: "starts *script*", "posts to *connection*". A script defined in the repository carries the tag **From the repository**. This section is shown only if at least one script sets its own. A script's own setting replaces the workspace's default, as a whole; a script's `onFailure` that names neither a script nor a connection leaves the default in force.

### Recent alerts

The alerts sent from this workspace, newest first, 50 to a page, with **Older alerts** for more. Each shows the path of the failed script or flow (linked to its run), how long ago, **Posted** or **Not posted**, "+N more" for later failures counted on it, the error, the error of a failed post, and **The script it started** (a link) or the error that stopped it starting. When none has been sent it says "No alert has been sent from this workspace."

## States

| State | What the screen shows |
| --- | --- |
| Loading | "Loading…" in the recent alerts. |
| Error | A message for each part that did not load (the alert settings, the scripts, the connections), with a retry. |
| No permission | A line saying what is needed; the controls are disabled. |

## Permissions

| Action | Needs |
| --- | --- |
| See the recent alerts | `run:read` |
| See the default and the scripts that set their own | `resource:read` |
| **Save** the default | `workspace:write` |
| **Send a test alert** | `connection:write` |

Saving the default and sending a test are separate permissions, so a person may be able to do one and not the other. Each control is disabled for someone without its permission.

## Related

- [Get told when a run fails](../../../how-to/operate/set-failure-alerts)
- [Failure alerts](../../../../develop/explanation/operate/failure-alerts)
- [The run page](../operate/run-page): what became of one run's alert.
