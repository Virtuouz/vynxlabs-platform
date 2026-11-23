---
title: Roll back to an earlier version
description: "Put an earlier version of a workspace in place, or deploy a version that never ran there, in a dev or a production workspace."
subjects: [deploy, versions]
---

## Roll back to an earlier version

By the end the workspace runs the version you chose. Runs in progress finish on the version they started with, and new runs use the one now in place.

## Before you start

- You hold `deployment:write` in the workspace. See the [permissions reference](../../../administer/reference/permissions).
- The version is in the workspace's list. Production's **Versions** lists what ran there. A version that was uploaded and never ran there is under **Not yet run here**.

## Steps

:::steps
1. Open **Operate**, then **Versions** in a production workspace, or **Deploy** and the step **Deploy to dev** in a dev workspace.
2. Find the version in **Versions of *workspace***. The row **Running in *workspace*** is what runs now.
3. Press **Roll back to this version**. A version later than the one running, or one that never ran here, says **Deploy this version**.
4. Read the question. "Roll back *workspace* to version N?" says what happens. In production the button is **Roll back in production**.
5. Press it.
:::

## The result

The message says "Version N is what runs here now." The list gains a new row at the top: the version, tagged **Running in *workspace***, with "No message". Rolling back does not remove a row. The version you left now has the button **Deploy this version**.

Nothing about the other workspaces changes. A dev workspace that promotes here still runs its own version, and **How *here* differs from *there*** shows the difference.

## If it does not work

- **There is no button on a row.** That version is the one running.
- **"Delete *paths* in *workspace*?"** The version would delete something that holds runs, rows or access and create something of the same kind. Press **Delete them and look again** only if it is not a rename.
- **The version is refused for what it needs.** A deploy to production refuses what is not set up there, as a promotion does. Set it up, then deploy it again. See [Why a deploy or promotion is refused](../../../develop/reference/releases/refusals).
- **An old version says it is incompatible.** A version built for a core the instance no longer runs cannot be deployed. The oldest the instance runs is `0.2.0`.

## From the command line

`volvel rollback <version> --tenant <slug> --workspace <slug>` does the same. See [Roll back a version from the command line](../../../develop/how-to/cli/roll-back-a-version).
