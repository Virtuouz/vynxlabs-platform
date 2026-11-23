# Run log: start/how-to/basics/work-with-lists.md

- Instance: http://localhost:8091, the throwaway instance seeded by `examples/fernhill/setup/setup.mjs`, commit `5ebf1c80` (branch phase-31-write-the-docs), 2026-11-24. Playwright, headless Chromium.
- Signed in as Maya Brooks, in Fernhill's Sandbox workspace, **Runs**, 1440 px, light. No phone, dark or full keyboard pass.
- A view named `basics-failed` was made and deleted; row density was set to Comfortable and back to Compact. No run was canceled or run again.

## The steps as followed
- `g` then `r` from the overview opened **Runs** (address `/runs`).
- Toolbar: **Search** (placeholder "A path, a run ID, a tag or an error"), **Kind** ("Scripts and flows", "Scripts", "Flows"), **When** (Last hour, Last 24 hours, Last 7 days, Between…, Everything kept), then buttons All 22, Failed 5, Running 0, Waiting for approval 0, Waiting for a time 0, Queued 0, Succeeded 13, Canceled 4. The columns State, Target, Result, Trigger, Started, Duration, Attempt, Run ID, Actions.
- Started: first click gave `?sort=started&dir=asc` (aria-sort ascending), second `dir=desc`, third no sort in the address.
- **Columns**: the dialog listed Target, Result, Trigger, Started, Duration, Attempt, Run ID, then **Show every column** and **Done**; the first column (State) is not in it.
- **Row density**: Compact, Standard, Comfortable.
- **Saved views**: the menu offered "Save this view…" and "Copy a link to this view"; the prompt "Save this view" had **Name**; after **Save**: "Saved as “basics-failed”. Only you see it in this menu; its link opens it for anyone." The menu then listed the view, "Rename “basics-failed”…" and "Delete “basics-failed”". Delete asked "Delete the view “basics-failed”? Links to it still open the same list: the view is in the link."
- Checking two rows' boxes showed "2 selected / Cancel / Run again / Clear". **Clear** emptied it.

## The page got wrong (and was corrected)
- The first draft said "choose a Status" as if it were a list; it is a row of buttons with counts.

## Not run
- The keys j, k, x, Shift+J, Ctrl+A, the confirmation of Cancel and Run again, a batch with failures and 100-row groups, **Save over**, **Rename**, the Between… dates and the "Nothing matches" states.

## Second check, 2026-11-23

Maya Brooks, Fernhill Sandbox, **Runs**. 1440 px light for the keys and the batches; 390 px dark for the toolbar, the saved-views menu and the selection bar. I made 3, then 3, then 108 script runs set to start in an hour (the API, `startAfter`) so they could be canceled; they and a few earlier ones are now Canceled in the Sandbox, and 8 are still waiting for an hour on.
- Keys: Tab into the table, x, j, k, Space, Esc, Shift+J (three times: 4 selected), Ctrl+A (100 selected of 158), **Clear**.
- **Cancel** on 3 waiting runs: the question "Cancel 3 runs?", done. A run canceled by the API after it was checked: the batch said "2 done, 1 not done" with "The run already cancelled."; **Retry the one not done** (and "Retry the 2 not done" for two finished runs, still refused: they had succeeded).
- 100 rows checked and canceled: one request of 100. **Load more** to 110 rows, Ctrl+A, **Cancel**: two requests, 100 then 8, answers added.
- **Run again** on two finished runs: "Run 2 runs again?" with the text on the page; the Succeeded count rose.
- Saved views: saved, chose it, changed the filter and **Save over**, **Rename**, **Delete**; the notice and the questions as on the page.
- **Between…** shows **From** and **To**. A search with no result and a status with no runs both showed "Nothing matches these filters".
Not run: the **Row density** and **Columns** steps again (the writer ran them), and **Cancel by age…** itself.
