---
title: Run a script now or later
description: Start a deployed script with input, at a time and priority you choose, read the run, run it again, and cancel it.
subjects: [scripts, runs]
---

## Run a script now or later

By the end you will have started a deployed script by hand, once now and once later, run a finished run again, and canceled one.

## Before you start

- A deployed script. A script that is only a draft cannot be run from the list: it says "Not deployed yet. Deploy it to run it, or try the draft from its editor." To try a draft, see [Test a script before you deploy it](test-a-script).
- `run:write` in the workspace, or on the script. A workspace admin has it. See the [permissions reference](../../../administer/reference/permissions).
- A worker for scripts. A run waits in **Queued** until one claims it.

A guest of an app, someone who is not signed in, cannot start a script this way. A guest whom the app's access lets start it is refused with "Sign in to start a script."

## Run it

:::steps
1. Open **Build**, then **Scripts**, and choose the script's row. The inspector opens.
2. Press **Run**. The dialog is titled "Run {path}". If the script has a draft it is "Run {path}, as deployed", because a run starts the deployed version, not the draft.
3. Fill in the input. For the **Greet someone** starter it is **Name**. **Fields** and **JSON** switch between a form and JSON.
4. Leave **Start** on **Now**, and **Priority** empty. Press **Run**.
5. The run opens. Its state is **Queued**, then **Running**, then **Succeeded** or **Failed**. The page shows **Attempts**, the log, and the **Input** and **Output**.
:::

The same **Run** button is on the script's own page.

## Run it later

:::steps
1. In the run dialog, change **Start** to **Later**. **Starts at** appears.
2. Choose a date and time in the future. A time that has passed is refused: "Choose a time that has not passed."
3. Optionally set **Priority**, a whole number from -100 to 100. A higher priority goes first when runs wait for a worker. Anything else is refused: "Priority is a whole number from -100 to 100."
4. Press **Run**. The run opens with the state "Waiting until" and the time. It starts then.
:::

## Run a run again

:::steps
1. Open a finished run, from the script's **Runs** tab or from **Runs**.
2. Press **Re-run**. Choose **With the same input**, **With other input…** or **On the version deployed now**.
3. For the first and last, the console asks "Run {path} again?". It says "With the same input, on version N, the one it ran." or "With the same input, on the version deployed now." Press **Run again**.
4. For **With other input…**, a dialog titled "Run {path} again" opens with the input filled in. Change it and press **Run again**.
5. The new run opens, and shows **Re-run of a run** beside its version. The first run shows **Run again once**.
:::

A run again keeps the first run's input and tags. A value the first run masked cannot be reused: the dialog says "N values were masked when shown" and asks you to enter them again. A step of a flow cannot be run again here: retry the flow's run instead.

## Cancel a run

:::steps
1. Open **Runs**. On the run's row, open **Actions for {run ID}** and choose **Cancel**.
2. Read "Cancel this run of {path}?" and press **Cancel the run**. Press **Keep it** to leave it.
:::

A run that is queued, running or waiting for a time can also be canceled with **Cancel run** on its page, which asks "Cancel this run?" with **Cancel run** and **Keep running**. The worker stops a running script at its next check, and says "Canceling. The worker stops it at its next check."

## The result

A run is in **Runs** and on the script's **Runs** tab with its state, who started it ("By hand"), and its output. A run again says "Re-run" as its trigger. A canceled run ends **Canceled**.

## If it does not work

- **Run is grayed out and a notice names a permission.** You lack `run:write`. Ask for the role that has it.
- **"Choose when it starts, or start it now."** **Start** is **Later** and **Starts at** is empty.
- **Some of the input is not what it takes.** The dialog marks the fields the script's input schema refuses. Correct them.
- **The run fails at once.** Open it: **Why it failed** gives the error and, for a script, the line. See [Test a script before you deploy it](test-a-script).
- **"This run is a step of a flow run. Retry the flow run instead."** Run again is not offered for a flow's step.
- A script has no schedule of its own. To run one on a schedule, open its **Triggers** tab and press **Add a schedule**.
