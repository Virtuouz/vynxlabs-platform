# Fact-check record: console/tutorials/invoices-app

Code as of commit `5ebf1c80`, 2026-11-23. Written by the page's writer; run 2026-11-23 (run log). "Checked by" is left for the second agent.

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
