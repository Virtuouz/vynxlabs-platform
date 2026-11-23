---
title: Approvals
topic: operate-approvals
description: "Every control, state and permission of the Approvals screen: what waits for you, what waits for others, what was decided, deciding one or many, who may decide, and the page a mailed link opens."
subjects: [approvals]
moved_from:
  - operate/approvals
---

An approval is a flow step that waits for a person to say yes or no. The **Approvals** screen of a workspace lists the approvals of that workspace, in three views, and is where a person decides them. Deciding is also possible on the flow run's own page, from a link in the mail, and from an app that has an approvals widget.

The screen is reached from **Operate**, then **Approvals**. F1 (**Help for this page**) opens the help topic `operate-approvals`. The tenant-wide list, for approvals a flow surfaces to the whole tenant, is a separate screen: see [Approvals across workspaces](../../../../administer/reference/screens/approvals).

::screenshot{name=console/operate-approvals alt="The Approvals screen: three chips with counts, and a list with the question, how long it has waited, who decides, and Approve and Reject buttons on each row."}

## Controls

The description reads "Flows in this workspace that paused for a person's decision, the longest waiting first. Approving lets the flow go on. Rejecting fails the step: the flow takes its error path, or fails if it has none."

### The three chips

| Chip | Shows |
| --- | --- |
| **Waiting for you** | Approvals you may decide, the longest waiting first, with a count. The default. The overview's count of what waits for you and the **Decide** button open this view. |
| **Waiting for others** | Approvals of this workspace that you may not decide, read-only, with a count. The description reads "Waiting for people other than you. You can see them but not decide them: the step names who may, or your role does not include approving." |
| **Decided** | The last 100 approvals decided in this workspace. Approvals that timed out are not in it. |

The chip is kept in the address as `?show=` (`waiting`, `others` or `decided`).

### Waiting for you

| Column | Shows |
| --- | --- |
| **Decision** | The question (the step's title), the first fields of its detail, then the flow's path and the workspace. |
| **Waiting** | How long it has waited. |
| **Who decides** | Who the step names ("the Practice managers group", and so on) or "Anyone who may approve". |
| Buttons | **Approve** and **Reject**. |

- **Approve** asks "Approve “*title*”?" with **Note (optional)**, then says "Approved “*title*”. The flow goes on." with **Open the run**.
- **Reject** asks "Reject “*title*”?" with **Why is it rejected?**, which is required: **Reject** stays disabled until a reason is typed. It then says "Rejected “*title*”. Rejecting fails the step: the flow takes its error path, or fails if it has none." The server refuses a rejection without a reason on every route.
- Check rows for a batch: the bar says "N selected" with **Approve**, **Reject** and **Clear**. One note or reason is kept with every decision: "Note (optional), kept with each decision" or "Why are they rejected? Kept with each decision." The console sends decisions in slices of 100 and, when some fail, says how many were done and not done with a retry. A note or reason is up to 2,000 characters.
- Choosing a row opens its inspector (`?item=`): **Waiting since**, **Times out** (when the step has a time limit), **Who decides**, **Step**, **What it asks about** (the step's detail as JSON), **Open the run's graph**, and **Approve** and **Reject**. The command palette has **Approve…** and **Reject…** under **This approval**.

A title and detail are masked by the values the flow run was given.

### Waiting for others

Columns **Decision**, **Waiting**, **Who decides**, and **Open the run**. An empty view says "Nothing waits for anyone else". No decision can be made here.

### Decided

| Column | Shows |
| --- | --- |
| **Decision** | The title, **Approved** or **Declined**, the note or reason in quotation marks, and "decided from the mail" when it was. |
| **Flow** | The flow's path and the workspace. |
| **By** | Who decided: a member by email, or a service account by name. |
| **When** | How long ago, linking to the run. |

An empty view says "Nothing decided yet".

## Who may decide

A person may decide a step when they hold `approval:write` in the workspace and, if the step names approvers, belong to one of them: a member of one of its groups, or a holder of one of its roles. A step that names none is open to anyone with the permission. Nothing stops the person who started the flow from approving it, and a service account can decide only steps that name no approvers.

An approval step's fields in the flow editor are **What is being approved** (up to 200 characters), **Detail to show**, **Give up after** ("When nobody has decided by then, the step fails, and its error path is taken if it has one. Left empty, it waits as long as it takes."; up to 2,592,000 seconds, 30 days), **Who may decide** (**Groups**, named by key so renaming one does not change who may decide, and **Roles**, up to 20 of each; empty means anyone with the permission) and **Where it waits** (**This workspace** or **This workspace and the tenant**). Groups and roles are looked up when the wait begins; membership is checked again when someone decides.

The console has no delegation, no escalation and no reminders for an approval, and no setting that stops a requester approving their own request.

## The mailed link

When a flow reaches an approval step and the instance can send mail, each member who may decide it is sent a message with the subject "Approval needed: *title*" and a link of their own, to at most 50 people. If the instance cannot send mail, no message is sent and the approval waits on the Approvals screen.

The link opens `/approve/<token>` on the instance, with no sign-in: the link is the approver's own. Opening it decides nothing. The page shows the tenant and workspace, the title, "The flow *path* waits for a decision, since *time*", **What it is about** (the same masked detail as the screen), **Comment (needed to reject)**, **Approve** and **Reject**, and "Asked of *name*. This link is yours and works once, until *time*, or until someone decides." The link lasts 48 hours or until the step's time limit, whichever is first. The page says "Approved. Thank you, *name*." or "Rejected. Thank you, *name*.", with "The flow carries on." or the sentence about rejecting, "Your decision and your comment are recorded under your name.", and **Open the run**. A link already used, a step already decided, or a link past its time shows "Nothing to decide here" and "This link has been used, the approval was decided, or it ran out." with a link to the approvals in the console. Rejecting without a comment says "Say why it is rejected: whoever asked reads it." A link is limited to 30 requests a minute. The check of who may decide is made again when the link is used.

A draft run of a flow (a test run) is mailed too, with "[Test]" at the start of the subject and "a test run" on the page.

## States

| State | What the screen shows |
| --- | --- |
| Empty, **Waiting for you** | "Nothing is waiting for you": "When a flow pauses for a decision you may make, it appears here." |
| Empty, **Waiting for others** | "Nothing waits for anyone else" |
| Empty, **Decided** | "Nothing decided yet" |
| Error | The error with a retry |

## Permissions

| Action | Needs |
| --- | --- |
| See the lists | `approval:read` |
| **Approve** and **Reject** | `approval:write`, and the step's approvers if it names any |

## Related

- [Approve and reject](../../../how-to/operate/approve-and-reject)
- [The run page](run-page): decide a step from its flow run.
- [Runs](runs)
