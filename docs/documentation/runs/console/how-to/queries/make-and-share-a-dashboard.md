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

## Second run, 2026-11-23 (second agent)
- Instance http://localhost:8091 at commit `87000022`, headless Chromium. Done in a tenant of the checker's own, `qry31chk` (workspace Sandbox, dev): Ann Qry (`tenant_admin`), Vic Qry (`viewer`), Wes Qry (`app_maintainer`), a table `visits`, a data source on the local Postgres. Fernhill's people and data were not used.
- Choosing groups: Share listed Floor staff and Front desk; picking Floor staff saved at once and the line read "Yours. Seen by: floor staff." (the name is written in lower case: a product fault, noted on the page). Ticking everyone hid the group list.
- The 20-dashboard limit: 20 made through the API, the 21st refused 409 "A member can keep 20 dashboards in a workspace. Delete one first."; in the dialog the same text. A 101-character name: "Use at most 100 characters. This is 101." and the button off (page corrected).
- `dashboard:read` only (Vic): the list says "You can see this workspace's dashboards, not change it. It needs dashboard:write." and, with nothing of his own, "Making one takes the dashboard:write permission…"; a dashboard shared with everyone showed "Ann Qry's, shared with you. You see the rows you may read." with no Share, Edit or menu.
- Refresh by timer: Refreshes set to Every minute; a row added through the API; 80 s later "Last refreshed" had moved a minute and the Stat read 4 instead of 3.
- Reload after editing: kept Every minute and the Stat. Keyboard: the key A opens Add to page; "Stat" and Enter places it.
- 390 px and dark: dashboard, list, Share, editor. At 390 px the editor's toolbar is behind "More: undo, redo and the screen size" and the canvas scrolls sideways within itself; no page overflow.
- Not run: download of a file in this tenant (done in the first run on Fernhill).
