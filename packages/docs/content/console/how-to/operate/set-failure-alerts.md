---
title: Get told when a run fails
description: Choose a script to start, a connection to post to, or both, when a script or flow fails for the last time, test it, and see what was sent.
subjects: [alerts]
---

## Get told when a run fails

By the end you will have chosen who is told when a run of this workspace fails for the last time, sent a test, and found where each alert is listed.

## Before you start

- You hold `workspace:write` to save the default, and `connection:write` to send a test alert. A workspace admin has both. See the [permissions reference](../../../administer/reference/permissions).
- To start a script on a failure, the script exists in the workspace. It is given the failed run as `{ run: { id, script, attempt, error } }`.
- To post to a connection, the connection uses the `http` connector and is set up in this workspace. It is posted JSON.

## Set the workspace's default

:::steps
1. Open **Configure**, then **Alerts**.
2. Under **This workspace's default**, choose a script in **Start a script**, a connection in **Post to a connection**, or both. **None** turns one off.
3. Press **Save**. The console says "Alerts will go there from the next failure."
4. With a connection chosen, press **Send a test alert**. It reads "Sending…" while a worker posts it. The answer is "The test alert was posted." or the reason it was not.
:::

::screenshot{name=console/configure-alerts-default alt="The Alerts screen with a script chosen to start and a connection chosen to post to, and the Save and Send a test alert buttons."}

## Let one script choose for itself

A script that sets `onFailure` in its definition replaces the workspace's default, as a whole, for its own failures. The workspace's connection is not also posted to. Set it in the repository:

```ts title="src/scripts.ts"
export const sendReminders = defineScript({
  path: "reminders/send",
  onFailure: { script: "alerts/run-failed" },
  // …
});
```

An `onFailure` that names neither a script nor a connection leaves the default in force. The script appears on the **Alerts** screen under **Set by scripts themselves**, with the tag **From the repository**.

## The result

Each alert is listed under **Recent alerts** with the failed run linked, **Posted** or **Not posted**, the error, and a link **The script it started**. The failed run's page shows the same: **The failure handler's run**, "The failure notification was posted.", or the reason it was not. A connection is posted:

```json
{
  "text": "Run failed: reminders/send in sandbox. The SMS gateway answered 503.",
  "run": {
    "id": "…",
    "script": "reminders/send",
    "attempt": 3,
    "error": "The SMS gateway answered 503.",
    "workspace": "sandbox"
  }
}
```

More failures of the same script or flow within ten minutes of an alert are not sent. They are counted on it: "+N more" in the list and "N later failures were counted on this alert, not sent on its own." on the run's page.

## If it does not work

- **Nothing was sent.** The run may not have failed for the last time: a run that has retries left is not alerted until its last try fails. A run that was canceled, a flow's own step, and a handler's run are not alerted either. A failure within ten minutes of an earlier one is counted on that alert.
- **"The failure handler did not start: …"** The script could not be started, for example because it no longer exists.
- **"The failure notification was not sent: …"** The connection is missing or not set up in this workspace ("The connection "*path*" is not set up in this workspace.") or the post failed.
- **Send a test alert is disabled.** You need `connection:write`. The tooltip says so.
- **A queue that is backing up does not alert.** Only a run that fails for the last time does.

## Related

- [Alerts](../../reference/screens/configure/alerts): every control.
- [Failure alerts](../../../develop/explanation/operate/failure-alerts): what counts as a failure.
