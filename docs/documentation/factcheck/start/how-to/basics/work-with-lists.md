# Fact-check record: start/how-to/basics/work-with-lists.md

Lines are current at commit `5ebf1c80` (branch phase-31-write-the-docs). Paths are under `apps/console/src` unless they start with `apps/control-plane`. Written by the writer; "Checked by" is for the second agent. "run" means seen on the throwaway instance, 2026-11-24, Maya Brooks, 1440 px, light.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Runs has Search (placeholder "A path, a run ID, a tag or an error"), Kind, When, Status. | `screens/Runs.tsx:767-837`; run | writer, run | holds as run |
| Kind: Scripts and flows, Scripts, Flows. When: Last hour, Last 24 hours, Last 7 days, Between…, Everything kept. | `screens/Runs.tsx:774-800`; run | writer, run | holds as run |
| Status buttons All, Failed, Running, Waiting for approval, Waiting for a time, Queued, Succeeded, Canceled, with counts. | `screens/Runs.tsx:837-847`; run | writer, run | holds as run |
| A chip "Stop showing only runs tagged …". | `screens/Runs.tsx:862` | writer | holds |
| Started and Duration sort: ▲, ▼, off; the address gains sort and dir. | `kit/DataTable.tsx:94-99`; `screens/Runs.tsx:218-221`; run | writer, run | holds as run |
| Columns dialog: check, move, Show every column, Done. | `kit/views.tsx:202-330`; run | writer, run | holds as run |
| Row density: Compact, Standard, Comfortable; Runs default Compact. | `kit/DataTable.tsx:700-714`; `screens/Runs.tsx:227`; run | writer, run | holds as run |
| Saved views: Save this view…, name prompt, notice, menu lists views, Rename, Delete, Copy a link. | `kit/views.tsx:86-175`; run | writer, run | holds as run |
| "Save over “{name}”" appears when the view shown differs from the last chosen. | `kit/views.tsx:152-154` | writer | holds (not run) |
| Delete asks "Delete the view “{name}”?" and the link still works. | `kit/views.tsx:130-133`; run | writer, run | holds as run |
| 50 views per list, name up to 80, state up to 16 KB, unique name. | `apps/control-plane/src/routes/preferences.ts:23,29,38` | writer | holds (limit not run) |
| Saved views belong to a member. | `routes/preferences.ts:41-52` | writer | holds |
| Selecting rows: checkbox, j/k + x/Space, Shift+J/K, Ctrl+A, bar "{n} selected" with Cancel, Run again, Clear. | `kit/DataTable.tsx:285-360,431-442`; `screens/Runs.tsx:1019-1040`; run ("2 selected / Cancel / Run again / Clear") | writer, run | holds as run |
| Cancel and Run again are offered when the person holds run:write or flow_run:write. | `screens/Runs.tsx:388,1020` | writer | holds |
| Cancel and Run again each ask first and name a few runs. | `screens/Runs.tsx:486-510` | writer | holds (not run: nothing was canceled) |
| A failing batch opens a dialog with the reason and Request ID and "Retry the {n} not done". | `kit/BatchResult.tsx:105-170` | writer | holds (not run) |
| More than 100 are sent in groups of 100. | `kit/BatchResult.tsx:21-40` | writer | holds |
| "Nothing matches these filters" / Clear filters; "Nothing matches" / "Try fewer or other words." | `kit/DataTable.tsx:402`; `kit/ListCollection.tsx:197` | writer | holds |
| j, k, x off when single keys are off. | `kit/DataTable.tsx:289-291` | writer | holds |

## Second check

Checked by: second agent, 2026-11-23. Rows re-read against `screens/Runs.tsx`, `kit/DataTable.tsx`, `kit/views.tsx`, `kit/BatchResult.tsx`, `routes/preferences.ts`; run in Fernhill's Sandbox as Maya Brooks at 1440 px light and at 390 px dark.

| Claim | Source / run | Result |
| --- | --- | --- |
| The keys j, k, x, Space, Shift+J, Ctrl+A and Esc. After Tab reaches the table (it took 41 presses from the page start), x and Space check the row, j moves, Shift+J checks as it goes (4 selected after 3), Ctrl+A checks every row shown (100 of 158), Esc and **Clear** uncheck. | `kit/DataTable.tsx:283-360`; run | holds as run |
| **Cancel** asks "Cancel {n} runs?" with the first names and "Runs that have finished are left as they are."; **Run again** asks "Run {n} runs again?" with the text on the page; both done. | `screens/Runs.tsx:486-510`; run | holds as run; titles added |
| A batch that partly fails: dialog **Canceling runs**, "2 done, 1 not done.", the script path, the reason ("The run already cancelled."), "Request ID", **Close** and **Retry the one not done**; with several: "Retry the 2 not done". Retry sends only those. | `kit/BatchResult.tsx:105-170`; run | corrected (singular wording and the dialog's title added) |
| Cancel on runs that had finished is listed as not done ("The run already succeeded.", "The flow run already succeeded."), although the question says they are "left as they are". | `screens/Runs.tsx:486-492`; run | fault fixed (fc item 12): `BatchResult.tsx` `leftAlone` counts them as "left alone because they had finished" and does not list them as not done, confirmed in the code; the page now says so |
| Runs shows 100 rows (the first page) and **Load more**; with Load more 110 rows were checked; the batch was sent as [100, 8]; the answers were added ("0 done, 110 not done"). | `screens/Runs.tsx:315,1061`; `kit/BatchResult.tsx:21-40`; run | holds as run; **Load more** added to the page |
| Saved views: the menu offered **Save this view…** and **Copy a link to this view**; after saving, the view is listed and its name is on the button; **Save over “{name}”** appears when the filters differ from the view last chosen, and the notice reads "“{name}” now shows this."; **Rename “{name}”…** and **Delete “{name}”** appear only while that view is the one showing; Delete asks "Delete the view “{name}”?" with "Links to it still open the same list: the view is in the link."; the menu then lists no view. | `kit/views.tsx:86-175`; run | holds as run; page made exact |
| **Between…** adds **From** and **To**. | `screens/Runs.tsx` (When); run | corrected (added) |
| A search that finds nothing on Runs reads "Nothing matches these filters" / "Change or clear the filters to see more." with **Clear filters**; the other wording ("Nothing matches" / "Try fewer or other words.") is the lists that use `ListCollection`. | `kit/DataTable.tsx:402`; `kit/ListCollection.tsx:197`; run | corrected |
| **Cancel by age…** and **Cancel {n} queued** are on the Runs toolbar. | `screens/Runs.tsx:866-882`; `screens/CancelOlder.tsx` | added to the page (not run: they cancel by rule) |
| 390 px dark: the toolbar wraps, the bar "2 selected / Cancel / Run again / Clear" fits, the saved-views menu opens. | run | holds as run |
