---
title: Ask for a promotion, and decide one
description: "Ask the people who may promote to send your version to production, withdraw the request, and decide a request as someone who may promote."
subjects: [promotion]
---

## Ask for a promotion, and decide one

By the end a version you built is promoted, or you know why it was not. A person who may not promote asks, and a person who may promote decides.

## Before you start

- To ask: `deployment:read` in the dev workspace and in the workspace it promotes to. You may not hold `promotion:write` there. If you do, the console promotes for you and there is nobody to ask.
- To decide: `promotion:write` in the workspace promoted to. The built-in role Deployer has it. See the [permissions reference](../../../administer/reference/permissions).
- The dev workspace runs the version you want, and it is linked to the target.

## Ask

:::steps
1. Open **Operate**, then **Deploy**, and go to the step **Promote**. A section **Promoting to *name*** says "You may not promote to *name* yourself."
2. In **A note for whoever decides (optional)**, say what the version does.
3. Press **Request promotion of v*N***.
:::

The section then shows **Waiting**: "Asked … ago by *you* for v*N*." If the dev workspace deploys again, the line adds "*Workspace* has moved on to v*N* since." You may press **Withdraw the request** while it waits. It acts at once, with no question, and the form comes back. Only the person who asked can withdraw it.

If you ask again, the new request replaces the pending one for the same two workspaces.

## Decide

:::steps
1. Open the tenant's **Overview**. The section **Promotion requests** lists what waits for you: who asks, which version, from where to where, when, and the note.
2. Press **Review**. The sheet shows what the version would change.
3. To promote, press **Promote** and confirm "Promote v*N* to *name*?". It promotes the version that was asked for, even if the workspace has moved on. Someone who opens the **Promote** step instead sees "*Name* asked for v*N* to be promoted. Promoting here sends v*N*; the request is decided from the tenant's overview."
4. To refuse, press **Decline…**, give a reason, and press **Decline**. The reason is required.
:::

## The result

For a promotion, "*Name* now runs v*N*." and the target's **Versions** lists it. The person who asked sees **Promoted** with "v*N*, by *name* …". For a decline, they see **Declined**, who declined, and your reason as a quotation. A request is then closed: to try again, they ask again.

## If it does not work

- **There is no form to ask, and a button to promote.** You hold `promotion:write`.
- **The section "Promotion requests" is missing.** You hold no `promotion:write` in a target that has a pending request.
- **"*Workspace* has deployed v*N* since."** The sheet says what it promotes: v*N*, what was asked for. To send the newer version, promote from the workspace's **Promote** step.
- **Promote is disabled in the sheet.** The promotion would be refused. The sheet says why, as the **Promote** step does. See [Why a deploy or promotion is refused](../../../develop/reference/releases/refusals).
