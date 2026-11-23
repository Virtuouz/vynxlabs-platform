---
title: Your first script
description: Make a tenant and a dev workspace, write a script from a starter, run it, deploy it and run it again.
subjects: [scripts, deploy]
---

You will have a script that adds up a list of amounts, a version of it deployed in a new dev workspace, and two runs that succeeded. It takes about 15 minutes. You start from an empty tenant, not from Fernhill.

## Before you start

- You can sign in to the console as an operator admin of the instance. Making a tenant is an operator's act.
- The instance has a worker, a process that runs scripts. A worker the instance starts for itself counts. If there is none, the first step of the workspace's **First steps** list, **A worker to run code**, stays open and a run waits.
- A browser at least as wide as a laptop screen.

:::steps
1. **Make a tenant.** Sign in as the operator admin. The first screen is **Instance**, with the list **Tenants**. (If you already belong to a tenant, the console opens in it: choose **Instance** in the narrow bar on the left.) Press **Create tenant**. In **Name** type `Tut First`. In **Slug** type `tut-first`. Leave **Make me a member, as tenant admin** checked. Press **Create tenant**. The tenant opens on its overview, and under **AT A GLANCE** it shows **Workspaces** 0 and **Members** 1. You are inside as a member, so you do not need an access grant.

2. **Make a dev workspace.** In the tenant's overview press **Create one** beside "No workspaces yet", or choose **Workspaces** in the menu on the left and press **Create workspace**. Fill in:
   - **Name**: `Dev`
   - **Slug**: `dev`
   - **Type**: **Dev**
   - **Promotes to**: leave it at **Nothing**.

   Press **Create workspace**. The list shows `Dev`, `dev`, **DEV**. The type cannot be changed afterwards.

3. **Open the workspace.** Press **Dev** in the list. The overview says **Dev**, **DEV** and **Triggers paused**, and a list called **First steps** reads "1 of 4 done". **A worker to run code** is done. **A first script**, **A first run** and **A first deploy** are not.

4. **Start a script.** In **First steps** press **New script**. The page **New script** opens and says **Not saved**.

5. **Choose a starter.** Under **Start from** press **Total some numbers**. Its description reads "Takes a list of amounts and gives back their total, count and average." The editor fills with code that begins `import { type ScriptContext, z } from "@volvel/sdk";`.

6. **Name it.** In **Path** type `tut-totals`.

7. **Run the draft.** Click in the code, then press :kbd[Ctrl+Enter] (:kbd[⌘↵] on a Mac). This saves the draft and runs it on a worker without deploying. The **Test pane**, the panel to the right of the code (under it on a narrow screen), shows the result below **Run the draft**: scroll down in the panel if it is out of view. It reads **Succeeded**, and a line "waited … ms · ran … ms". Its log reads `Added up` with `{"count":3,"total":49.75}`. The starter has an example list, `12.5`, `30` and `7.25`, so it needs no input.

8. **Look at the result.** In the **Test pane**, under **Run of tut-totals: Succeeded**, choose **Input and output**. The output reads `count` 3, `total` 49.75 and `average` 16.583333333333332. **Logs** has the log line and **Details** says how the run went.

9. **Go to Deploy.** Choose **Overview** in the menu on the left. In **First steps** (now "3 of 4 done") press **Deploy**. The **Deploy** screen opens. Its steps are **Review draft**, with "1 change", and **Deploy to dev**. The list names `tut-totals` and marks it **NEW**.

10. **Deploy it.** In **What changed** type `First script`. Press **Deploy 1 change**. The message "Deployed as version 2: tut-totals." appears. The step **Review draft** now says "0 changes", and the list **VERSIONS OF DEV** has a new version, `v2`, with the note "First script".

11. **Find the script.** In the narrow bar on the left press **Build**, then choose **Scripts** in the menu beside it. The list has `tut-totals`, **Uses** reads "Nothing outside", and **Source** reads **CONSOLE**. Press `tut-totals`. The page shows **Last run**, **Succeeded**, and lists the test run as "test".

12. **Run the deployed script.** Press **Run**. In the dialog leave **Start** at **Now**, and press **Run**. The run page opens. It says **Succeeded**, **By hand** and the version you just made, `version 2`. Choose **Output**. It reads `count` 3, `total` 49.75, `average` 16.583333333333332.

13. **See that the steps ticked.** Open **Overview** again. The **First steps** list is gone, and **Running** shows the version.
:::

## What you built

- A tenant `tut-first` and a dev workspace `dev` in it.
- A script `tut-totals`, from the starter, owned by the console.
- A version of the workspace with that script in it, deployed to dev. It reaches production only when it is promoted, and this workspace promotes nowhere.
- Two runs of the script, one from the test pane and one by hand, under **Operate**, **Runs**.

Next, [build a flow with an approval in it](your-first-approval-flow).
