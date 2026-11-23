# Run log: console/how-to/queries/make-and-share-a-dashboard.md

- Instance: http://localhost:8091, the throwaway instance seeded by `examples/fernhill/setup/setup.mjs`, commit `14f7d5b9` (branch `phase-31-write-the-docs`).
- Signed in as Maya Brooks (`maya.brooks@fernhill.example`, tenant admin) in Fernhill's Sandbox workspace, at 1440 px, light theme, with Playwright headless. No other width or theme was run, and no keyboard-only pass.
- Everything made for this run starts `qry31`.

## The steps as followed
1. **Data > Dashboards**: **New dashboard** opened "New dashboard" with "It is yours alone until you choose to share it." and **Name**. Name `qry31 Clinic week`, **Make the dashboard**: the editor opened at `?edit=1` with "Saved.", Undo, Redo, **Refreshes** (Every 5 minutes), **Share**, ⋯, **Done**, "Nothing on this page yet", **Add to page**.
2. **Add to page** (also the key A): the groups Work with records (Table, List), Understand data (Stat, Chart, Pivot, Goal), Organize and explain (Section, Tabs, Search and filter, Text). Chose **Stat**, :kbd[Enter] placed it. Inspector tabs Data, Display, Actions, Rules. **Source** > **Where it reads from** with **Find a table or query**: tables, then saved queries (including the draft `qry31/visits-since`, shown as "Visits since") and **SQL written here**. Chose Appointments: **Value** "Count of rows" and 3,708 on the page.
3. Added a **Table**; its source list also held "loans in qry31-loans" with the hint "A table of a data source: listed as it is, not totalled." (the Stat's list did not). Chose it; the table showed Device, Borrower, Due, Returned for three loans.
4. **Done**: "Yours. Seen by: only you.", "Last refreshed 14:36:39 · Refreshes every 5 minutes", **Refresh now**.
5. ⋯: **Name and description…**, **Keep it as a resource of the workspace…**, **Delete…**. **Name and description…** with **What it is for** saved a description shown under the name.
6. **Share**: "Share qry31 Clinic week", **Show it to everyone in this workspace**, **Or show it to these groups** with Billing and Practice managers, **Done**. Ticking everyone saved at once; the line became "Yours. Seen by: everyone in this workspace."
7. The download button on a table is named "Download Table" and the menu has **Download as CSV** and **Download as a spreadsheet**; **Download as CSV** saved `table.csv`.
## What differed
- The brief said the sources picker shows `<source>/<table>`; the screen shows "<table> in <source>".
- The widgets of a new dashboard are called Stat and Table until renamed.
## Delete
- ⋯ > **Delete…** on the dashboard of Maya's own: "Delete qry31 Clinic week?" with "The dashboard is removed for you and for anyone it is shared with. No table and no row is touched." and **Delete**; the screen went back to the list.

## Not run
- Choosing groups. The 20-dashboard limit. A person with only `dashboard:read`. Refresh by timer. 390 px, dark and a reload after editing.
