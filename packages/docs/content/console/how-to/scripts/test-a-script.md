---
title: Test a script before you deploy it
description: Run a script's draft on a worker without deploying it, read the result and the log, and go to the line that failed.
subjects: [scripts, editor]
---

## Test a script before you deploy it

By the end you will have run the draft of a script, read what it returned and logged, and, if it failed, found the line.

## Before you start

- You are in a dev workspace. A production workspace shows scripts read only, and a test is not offered there.
- You hold `resource:write`, `code:write` and `run:write` in the workspace. A workspace admin has them. See the [permissions reference](../../../administer/reference/permissions).
- Writing code in the console is on for the tenant. If it is off, saving and testing are refused: see [If it does not work](#if-it-does-not-work).
- A script written in the console. To test a script from a repository, deploy it to a dev workspace, or see [Test scripts in code](../../../develop/how-to/scripts/test-scripts-in-code).

## Try the draft

:::steps
1. Open **Build**, then **Scripts**. Press **New script**, type a **Path** such as `greet`, and under **Start from** choose **Greet someone**. To test a script that exists, choose its row and press **Open editor**.
2. Change the code if you want to. The test pane is beside the code, on a narrow window below it.
3. Under the test pane's input, fill in the form. For **Greet someone** it is **Name**. **Fields** and **JSON** switch between a form and JSON for the same input.
4. Press **Save and run** (**Run the draft** when nothing is unsaved), or press :kbd[Ctrl+↵] (:kbd[⌘↵] on a Mac). A new script is saved first, and the editor's address changes to `scripts/edit/greet`.
5. Read the **Result** tab. It shows the state, **Succeeded** or **Failed**, how long the run waited and ran, then the tabs **Logs**, **Input and output** and **Details**. **Logs** holds the lines the script wrote with `ctx.log` and `console.log`. **Input and output** holds the input and what the script returned. **Events it published** at the foot says "None." when the script published no event.
6. If it failed, the **Result** starts with **Why it failed**, the error, and when the error points at a line of your code, **Go to line N**. Press it: the cursor goes to that line.
7. Open the **Problems** tab for what the editor finds as you type. Each item is a line and column and a message; press it to go there. **Problems (N)** counts them, and an item tagged **Build** is a refusal of the build. With none it says "No problems found."
8. Open the **Runs** tab for the script's latest 20 runs. A test run says "· test" beside when it started. A row opens the run.
9. Change the code, and press **Save and run** again. The input stays as you left it.
:::

::screenshot{name=console/scripts-test-pane alt="The script editor on a script named greet, with the code on the left and the test pane on the right showing a Succeeded run, its log line and the Result, Problems and Runs tabs."}

### Test with every draft

By default a test builds this script's draft and the drafts it names. If the script calls a script you have also changed, that change is in the test. A draft of something else is left out, so it cannot break your test.

To test as a deploy of everything would, check **Build with all drafts**. The test then builds every draft of the workspace, and a draft anywhere that does not build stops it.

### Start from a failed run

On a run page, **Edit with this input** (in a production workspace **Edit in {dev workspace}**) opens the script's editor with that run's input in the test pane. A value the run masked is left empty; enter it again.

## The result

The draft ran on a worker and nothing was deployed. The test run is in the **Runs** tab, marked "· test", and is deleted after seven days. The script stays a draft. To make the change live, press **Deploy**, then **This change only**: see [Change a script's settings](change-script-settings) for the same step.

## If it does not work

- **"Writing code in the console is turned off for this tenant. Code is deployed from its repository. Someone who may change the tenant can turn it on under Repository."** The tenant's switch is off. A person who may change the tenant turns it on in the **Repository** screen. See the [repository reference](../../../administer/reference/screens/repository).
- **"The code written in the console does not build." with a file and line.** The test did not start, because the code does not build. The **Problems** tab lists it with the tag **Build**. Correct the line it names, and try again.
- **Every test fails with another script's error.** **Build with all drafts** is checked, and a draft elsewhere does not build. Uncheck it, or fix that draft.
- **The run stays queued.** No worker has claimed it yet. A worker runs scripts: see [How scripts run](../../../develop/explanation/scripts/how-scripts-run).
- **"This script is not run from here. Run it from its page, or edit it in the dev workspace."** The editor is read only: the workspace is production, or the repository holds the script.
- **A Problems item with no matching build error.** The editor's check is not the build. Types are not checked when a script is built, so a type error is shown and the run still starts.
