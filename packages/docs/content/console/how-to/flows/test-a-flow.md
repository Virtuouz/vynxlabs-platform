---
title: Test a flow
description: Run a flow's draft from the editor, read what each step did, and test again from one step without repeating the ones before it.
subjects: [flows]
---

## Test a flow

By the end you will have run a draft without deploying it and read each step's result.

## Before you start

- A flow open in the editor, in a dev workspace.
- You have `run:write` and `flow_run:write`. If a draft script is among what the test builds, you need `code:write` too. See the [permissions reference](../../../administer/reference/permissions).

:::alert[A test is a real run]{type=warning}
A test runs the flow's scripts for real, with their connections, and an **Approval** step mails its approvers with the subject "[Test] Approval needed". Nothing is deployed, but nothing is pretended.
:::

## Run a test

:::steps
1. In the editor, press **Test**. A panel, "Test the draft", opens under the canvas.
2. If the flow has more than one start, choose one in **Start from**. The input is what that start would receive.
3. Leave **Build with all drafts** off to build with this flow's draft and the drafts it uses. Turn it on only to try every draft of the workspace together; another draft that does not build then stops the test.
4. Fill in the input, if the form asks for any (**As JSON** switches the form to a JSON box), and press **Run a test**. Each step's state shows on the graph and in the panel as it goes.
5. Choose a step on the graph, or in the panel. The inspector shows **Last test**: its state, when it **Started**, how long it **Took**, its error, its output, with a **Copy** button, and its log.
6. To run again from a step, choose it and press **Test from <step>**. It keeps what the steps before it did, and runs that step and what follows on the draft as it is now.
7. After an edit, press **Run again** for a fresh test. The panel says "The flow changed since this test." until you do.
:::

## The result

The panel shows the test's state, the state of each step, and **Open the run**, which opens the run on [Runs](../../reference/screens/operate/runs). Expression fields now show a "Gives …" line worked out against this test.

## If it does not work

- **The panel names why it cannot run.** It says what is missing, such as a permission.
- **The test stops before it starts, naming another draft.** **Build with all drafts** is on. Turn it off.
- **"The last test did not reach this step."** The flow took another path.
- **A step you want to retry is not offered.** **Test from** is not offered on the start, or on a step that is still running.
