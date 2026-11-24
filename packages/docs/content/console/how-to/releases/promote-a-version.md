---
title: Promote a version
description: "Send the version that runs in a dev workspace to the workspace it is linked to, read what it would change first, and read the refusals."
subjects: [promotion]
---

## Promote a version

By the end the workspace this one promotes to runs the same version that runs here. Nothing is rebuilt.

## Before you start

- You hold `promotion:write` in the workspace you promote to. The built-in role Deployer has it. If you do not hold it, [ask for a promotion](ask-for-a-promotion).
- The dev workspace is linked to a workspace. If it is not, set **Promotes to** under **Configure**, **Workspace settings**.
- What the version needs is set up in the target: its connections, secrets, variables without a default, and data sources.

## Steps

:::steps
1. Open **Operate**, then **Deploy**, and go to the step **Promote**. After a deploy, the message's **Promote to *name*** goes there too.
2. Read **What changes in *name***: what it creates, changes, renames and removes, and the changes to tables.
3. Read **Before it goes**. **Tried here** says how many runs of this version there were and how many failed.
4. Press **Promote to production**, or **Promote to *name*** for another dev workspace.
5. Confirm "Promote to *name*?".
:::

## The result

The screen says "*Name* now runs version N." The target's **Versions** lists it as "Promoted". **How *here* differs from *there*** at the foot says "*Here* and *there* run the same resources."

Runs in progress in the target finish on the version they started with.

If the tenant's repository has a release branch, the message adds "Committed to *branch*." If the commit failed, it says "The release branch was not updated: *reason*." The promotion stands. Press **Try again from Git sync**, then **Commit to the release branch again**.

## If it does not work

- **"It cannot be promoted yet."** The notice names what is missing. For `bindings_missing`, each connection, secret, variable or data source has a **Set up** link that opens the target workspace. Set it up there and come back. See [Why a deploy or promotion is refused](../../../develop/reference/releases/refusals).
- **A button "Delete them anyway".** The promotion would delete something that holds runs, rows or access and create something of the same kind. If it was renamed, give the new resource the old one's key. If not, press it, read "Delete *paths* in *name*?" and press **Delete them and look again**.
- **"This changes a name that something outside calls."** The promotion to production would remove or rename a tool an agent calls. Each is listed. The confirmation names them, and by confirming you say you have read them.
- **There is no promote button, but a request form.** You do not hold `promotion:write` in the target.
- **"This workspace has nothing deployed, so there is nothing to promote."** Deploy something in the dev workspace first. **Promote to …** is disabled until then.
- **"This version has not run here yet."** A notice, not a refusal. Try the version in the dev workspace first.

## From the command line

`volvel promote --tenant <slug> --workspace <slug> --preview` says what a promotion would do and changes nothing. It exits with 4 when a promotion to production would be refused for breaking changes without `--confirm-breaking`. See [Promote a version from the command line](../../../develop/how-to/cli/promote-a-version).
