# Decision 0007: approvals are decided from an app, by a member as themselves

Status: **built** in phase 28 (the Approvals widget, `core/approvals`). Decided by the owner's brief, 2026-11-22: "Build the approvals widget inspired by the redesigned components", with the security contract below.
Date: 2026-11-22.
Prompted by: the owner's brief for the Approvals widget, and the research note behind it: select an item, its detail appears beside or over the queue, approve or reject, show a confirmation, advance to the next.

## Summary

A page of an app may hold an **Approvals** widget. It lists the approval steps of the workspace's flows that wait for a decision, and lets a member approve or reject one. It reads through the one `widget-data` endpoint and decides through one new route, `POST …/page-approvals`. Neither makes `approval` something an app grants: what decides is **the member's own standing**, the same as the approval mail's.

## Context

| Fact | Evidence |
|---|---|
| `approval` is not an app-facing permission, so an end user, and a member signed in to apps only, hold none whatever role they are bound to | `APP_FACING_KINDS`, `kernel/authorize.ts` (`appFacing`, `check`) |
| The console decides by `POST …/flow-runs/:id/approvals/:node`, which needs `approval:write` and then `isApprover` for the step's named approvers | `routes/flows.ts`, `kernel/flows/approvers.ts` |
| The mail asks only the members who may decide, by each member's own `check` without the app limit, refusing an operator's access grant and a suspended or disabled member | `approverMembers` |
| An app's actions are run by the server from the deployed page, with the draft only for someone who may edit it in a dev workspace | decision 0004, `routes/page-actions.ts`, `kernel/pages/locate.ts` |
| A widget's data is read by the server under the viewer's permissions; the view never calls the API | decision 0005 |

## Decision

1. **`approval` stays what it was.** `APP_FACING_KINDS`, `check` and the existing approvals routes are unchanged.
2. **The widget names what it shows, the page says so.** Its one data input has the source `{ approvals: { flows?: string[]; whose?: "mine" | "all" } }`. No flows is every flow of the workspace with an approval step. The manifest checks the flows exist (when the bundle or workspace knows them) and that only this widget reads it, on an app.
3. **Page-scoped, like page-actions.** Reading and deciding locate the widget in the **deployed** page body (the draft only for someone who may edit it in a dev workspace), and need what opening the page needs (`app:read` on an app that serves it, or `interface:read`). Reading rides `widget-data`; deciding is `POST /tenants/:t/workspaces/:w/page-approvals`, with the rate limit of page-actions and the same cookie and CSRF protections. A widget shown only to some groups (`rules.seenBy`) is held to on the server too: a member outside them is shown nothing, and refused a decision through it.
4. **A member only, as themselves.** Standing is `check(db, { type: "member", id }, "approval:read" | "approval:write", { tenantId, workspaceId })`, **without** the app limit of the request, and refused when it comes from an operator's access grant, or the member is suspended or disabled. For a step that names approvers, `isApprover` as well. An end user, a guest and a service account **read an empty list, with no counts and no titles, and decide nothing**.
5. **Reading.** A member sees only steps of the widget's flows, in the app's own workspace, for which they hold `approval:read`. With `whose: "mine"` they see only those they may decide. A step's detail is redacted as the approvals list redacts it; when the widget names fields, only those leave the server; when it names none, the first four. No secret and no raw step input beyond that is sent.
6. **Deciding.** The server re-reads the step inside the transaction, under the lock the engine takes to decide, and checks that it waits, belongs to a flow the widget lists, and to this workspace. Then it calls the same `decideApproval` in a `ctx.mutate`, with the same audit actions (`approval.approved`, `approval.rejected`) and, in the details, `{ via: "app", app, page, widget }`, then `kickFlow`. **The audit, not the browser, records who decided.** Someone else having decided it first is a 409 that says who and what. The comment is trimmed and at most 2,000 characters, and the widget's "Ask why" (never, when rejecting, always) is held to here as well as in the browser.
7. **The browser never calls the API from the view.** The host gives the view a `decide` capability, as it gives `act`. It is absent while the page is being built, so the buttons are inert there, and present in the console's preview and in the served runtime.

## Consequences

- An app may put a manager's queue where the manager works, with no new permission handed to anyone who is not already allowed to decide.
- Whoever may decide in the console may decide here; whoever may not, cannot. A reader who may not decide sees the requests, with the buttons greyed and why.
- A flow that is renamed or deleted is followed like any reference to a flow: the workspace's references list the widget, and `resolveKeyReferences` rewrites a flow named by its key.
- The detail of a step is stored as JSON, whose keys the database keeps in its own order, so "the first four" are not always the first four the flow wrote. A widget that cares names its fields.

## Alternatives

- **Make `approval` app-facing.** Rejected: it would give an end user, or a member signed in to apps only, an approval's standing through a role bound too widely.
- **Let the page decide through the existing approvals route.** Rejected: that route cannot say which widget, flows or fields the person was shown, and the browser would hold a permission the app does not grant.
- **Decide as the app.** Rejected: the audit would not say who decided, and an approval is a person's.
