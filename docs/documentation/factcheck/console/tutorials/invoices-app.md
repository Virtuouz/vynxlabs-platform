# Fact-check record: console/tutorials/invoices-app

Code as of commit `5ebf1c80`, 2026-11-23. Written by the page's writer; run 2026-11-23 (run log). "Checked by" for the rows below: second agent, 2026-11-24.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Fernhill has groups Billing and Practice managers; Maya is only in Practice managers, Rowan in both | `examples/fernhill/setup/setup.mjs:211-231` | writer | holds |
| Table source dialog "Where it reads from"; Display > Title; Data > Sorted by with "+ Then by" and "Created at, newest first" | `e2e/phase-28.spec.ts:691`, run | writer, run | holds |
| "When a row is clicked" > Open record detail makes a side sheet "Invoice detail" | `e2e/phase-28.spec.ts:2290-2310`, run | writer, run | holds |
| Row action editor: Says, Add a step > Update the record, Set another field, "Status becomes" | `e2e/phase-28.spec.ts:1370-1392`, run | writer, run | holds |
| WHO CAN RUN IT > Group, dialog Groups; "Only Billing can do this" | `e2e/phase-28.spec.ts:1394-1400`, run | writer, run | holds |
| "Checked on the server too: hiding the button is not what stops other people." | App Builder action editor text, run | writer, run | holds (text); the API refusal was not called |
| Form: Create a record, Table, modal "New invoice", button added to the table | `e2e/phase-28.spec.ts:2330-2345`, run | writer, run | holds |
| Publish check lists changes, "Try as Billing first", "Publish 6 changes" | run | writer, run | holds |
| New invoice defaults: Status unpaid, Issued on today | run; `examples/fernhill/src/model.ts:129-150` | writer, run | holds |
| Rowan's Mark paid sets status paid; Maya's button is disabled | run | writer, run | holds |
| Invoices need `data:read` to be seen in an app (Sam Reyes refused) | run | writer, run | holds |
| Step 1-3, 5, 6, 7, 8, 9: every label and sentence of the page, in one pass as `chk Invoices`/`chk-invoices` | instance walk | second agent, run | holds |
| Table's **Source** > **Invoices** is a choice; **Table** in the form dialog is already **Invoices** | instance walk (select value `invoices`) | second agent, run | corrected: page said choose it |
| Choosing **Open record detail** leaves its menu open until **Done** | instance walk | second agent, run | corrected: page now says press **Done** |
| A second press of **Row action** makes a second action with no steps, and the Publish check refuses it ("An action has no steps yet"); **Remove Action** deletes it | instance walk | second agent, run | added to step 6 |
| **Number** is unique: a second `TUT-001` shows "Another row already has this value." | instance walk, Rowan | second agent, run | added to step 11 |
| Cleanup: **Data**, **Tables**, `invoices`, **Filter by number**, check row, **Delete**, **Delete the row** | instance walk, Maya | second agent, run | holds, steps added to What you built |
| Maya: **Mark paid** disabled, hover "Only Billing can do this."; Rowan: works, row becomes `paid` | instance walk | second agent, run | holds |
| 390 px dark: the app shows rows as cards with **Mark paid** under each, no sideways scroll; **New invoice** form fits; the builder at 390 says "Wider than this window: scroll sideways" (page asks for a laptop-wide browser) | instance walk | second agent, run | holds |

Checked by: second agent, 2026-11-24.
