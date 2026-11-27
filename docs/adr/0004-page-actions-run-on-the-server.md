# Decision 0004: a page's actions run on the server

Status: **accepted** by the owner, 2026-11-21 (phase 25 owner decision 2). The grant decided 2026-11-21 (phase 26 owner decision 1): **the action is the grant.** Built in phase 26.
Date: 2026-11-21.
Prompted by: the redesign boards, where a button's action is a list of steps ("Ask to confirm, Update the record, Run a workflow, Show a message"), and S9.

## Summary

A page's actions are steps written in the page's body. The browser asks the server to run *action N of widget W on page P for record R*; the server reads the steps from the **deployed** body, checks each one against the person's permissions and the action's conditions, and runs them. The browser never sends what to change.

## Context

| Fact | Evidence |
|---|---|
| Actions today only start a script or a flow | `packages/manifest/src/interface.ts:135`, `packages/screens/src/actions.tsx` |
| Their input mapping, `enabledWhen` and confirmation exist only in the browser | `actions.tsx`; the start routes check only `run:write` / `flow_run:write` (`routes/execution.ts:1194`, `routes/flows.ts:740`) |
| So anyone holding `run:write` on a script may start it with any input, whatever the page says | the same |
| A record update from the browser would go through the rows API, where `data:write` on the table allows changing any column | `routes/data.ts` |

A button that "marks this invoice paid" would, in the browser, need `data:write` on invoices, and with it the person could set any column of any invoice their row policy lets them see. The page would only be suggesting what to do.

## Decision

1. **The endpoint.** `POST …/pages/interface/:path/widgets/:widget/events/:event` with `{ page, record?, inputs? }`. `inputs` is only the values a step asks the person for (a reason, a date), each checked against the step's schema.
2. **The steps come from the deployed body**, read by the path of the app being served; in the builder, from the draft, and only for someone who may edit it.
3. **Each step is checked as its own operation, as the person:**
   - *update / create / delete a record*: `data:write` on the table, the row policy (the record must be one the person can read), and only the fields the step names, set to the values the step names (a constant, today, now, the current user, or a value the step asked for);
   - *start a flow or script*: `flow_run:write` / `run:write` on the target, with the input the step maps;
   - *open a page, show a message*: nothing to check; returned to the browser to do.
4. **Conditions are checked again on the server** ("can be pressed when Status is Unpaid"), against the record as it is now, inside the same transaction as the update.
5. **Steps run in order and stop at the first failure.** Record changes in one action are one transaction; a flow started is not undone if a later step fails, so a start step is placed last unless the builder says otherwise, and the builder warns.
6. **Audit**: a record change is audited as any write is, with the app, page and action named.

The old script/flow action becomes the "Start a flow" and "Run a script" steps; it does not survive as its own path (decision 0006).

## Consequences

- **The action is the grant** (owner, 2026-11-21). Whoever may open the app may run the actions its deployed pages hold. An action changes only the fields it names, to the values it names, on rows the person's row policy lets them read, and its conditions are checked on the server against the record as it is. It needs no `data:write` or `flow_run:write` of the person: it is like a stored procedure, and the page that is deployed, reviewed by whoever promotes it, is what grants. A draft's actions are run only by someone who may edit the interface.
- So a front-desk end user marks an invoice paid without being able to edit invoices through the API, and the API offers nothing a page did not say.
- Confirmation, conditions and messages are drawn by the browser from the same body; the server is the authority.
- Phase 26 must test: an action can't be run on a record the person can't read; a step can't set a field it doesn't name; a condition false on the server refuses; a draft's action can't be run by an end user.

## Alternatives

- **Run the steps in the browser** over the rows and run APIs. Simpler; but nothing limits which fields a button may change, and today's gap stays. Rejected by the owner.
- **Compile each action into a flow.** Reuses the flow engine, but makes every button a flow run (slow, noisy in the runs list) and puts a second engine's semantics on a page.
