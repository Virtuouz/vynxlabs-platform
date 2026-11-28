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
8. **Withdrawn by decision 0008** (0.7.0): a code app is sandboxed and acts with a token that never has the member's own standing, so approvals are decided in an app at every address. As it stood: **Decided only where no app written as code can run.** An app's cookie is per tenant and per host, and an app written as code runs its own JavaScript at the address it is served at, with whatever that address's cookie allows (`kernel/apps/front.ts`, `hosts.ts`). Such an app, opened by a manager, could post to `page-approvals` with their session, or frame the page and press the button; a token, a Referer or an Origin check cannot help inside one origin. So a decision is accepted only at an address where no app written as code can run, and everywhere else the widget shows the requests and sends the person to the console. The rule is one function, `Hosts.runsCodeApps(place)`, next to the code that decides what is served (`front.ts` uses it to refuse a code app on the console's address), so the two cannot drift:
   - the shared apps address (`apps`) serves every tenant's code apps: **yes**;
   - a tenant's own hostname (`domain`) serves that tenant's code apps, whether one is deployed yet or not: **yes**. It reads no database, so deploying one later changes nothing;
   - the console's own address (`main`, and any name the instance is reached by that is not registered) serves none, except when the operator knowingly set `APPS_ON_CONSOLE_ADDRESS` and there is no second address: **no**, or **yes** then;
   - anything not recognised is a **yes**: it fails closed.

   The decide route answers 403 `decide_in_console` ("Decide this in Volvel, not in an app: open it at …") before it looks at the step. The read answers as before, with `decideIn: { console, name }` on the whole answer (the console's address of the workspace's approvals, and the instance's own product name from its branding), and the widget draws one button, "Decide in {name}", opening it in a new tab; the list reads again when the person returns to the window. The rule is by address, not by principal: a console session at an address where code apps may run is refused too. The builder's canvas and preview are at the console's address and are unaffected. The Publish check warns that approvals are decided in the console when the instance serves apps at their own address.

## Consequences

- An app may put a manager's queue where the manager works, with no new permission handed to anyone who is not already allowed to decide.
- Whoever may decide in the console may decide here; whoever may not, cannot. A reader who may not decide sees the requests, with the buttons greyed and why.
- A flow that is renamed or deleted is followed like any reference to a flow: the workspace's references list the widget, and `resolveKeyReferences` rewrites a flow named by its key.
- The detail of a step is stored as JSON, whose keys the database keeps in its own order, so "the first four" are not always the first four the flow wrote. A widget that cares names its fields.

## Questions the rule raises

- **A session made at one host, replayed at another.** `appPrincipal` accepts an app session only at the host it was made at (`session.host`), so a code app at one address cannot use a session made at another. It can still use the sessions of its own address, which is the case rule 8 closes.
- **A tenant's own hostname.** It serves that tenant's apps, code included, so it is a "yes": the widget there shows requests and sends people to the console. The shared apps address also holds the cookies of several tenants side by side (one cookie per tenant): another tenant's code app at the same address can send this tenant's cookie too, which is a second reason it is a "yes".
- **Docs apps with authored HTML.** Pages are served under a policy with `script-src 'self'` and no inline script, and the only script is the platform's own `docs.js`, so authored HTML runs nothing of its own. A docs app is not a code app, and it holds no Approvals widget.
- **The Text widget's Markdown.** It is rendered without raw HTML, so it cannot add a script or a form to a page that holds an Approvals widget. App pages made from widgets run the platform's own bundle only (`script-src 'self'`).

## Alternatives

- **Make `approval` app-facing.** Rejected: it would give an end user, or a member signed in to apps only, an approval's standing through a role bound too widely.
- **Let the page decide through the existing approvals route.** Rejected: that route cannot say which widget, flows or fields the person was shown, and the browser would hold a permission the app does not grant.
- **A per-decision token (CSRF-style) or checking Origin and Referer.** Rejected: the script of a code app is of the same origin and reads and sends whatever the page does.
- **Decide by the app's own record: only where a code app is deployed now.** Rejected: a deploy later would open a window, and the answer would depend on the database. The rule asks what can be served at the address, not what is.
- **Decide as the app.** Rejected: the audit would not say who decided, and an approval is a person's.
