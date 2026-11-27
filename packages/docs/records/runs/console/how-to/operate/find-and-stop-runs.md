# Run log: console/how-to/operate/find-and-stop-runs.md

- Instance: http://localhost:8091, the throwaway instance seeded by `examples/fernhill/setup/setup.mjs`, commit `5ebf1c80` (branch phase-31-write-the-docs).
- Signed in as Maya Brooks (`maya.brooks@fernhill.example`, tenant admin), in Fernhill's Sandbox workspace, at 1440 px, light theme, Playwright headless. No other width, no dark theme, no keyboard-only pass, no reload test.
- Other writers share the Sandbox, so its Runs list holds runs that are not mine.

## The steps as followed
1. Started `inventory/check` later (Start: Later, two hours ahead, Priority 5) from the script's **Run** dialog. The run page read "Waiting until 16:25:00".
2. **Operate**, **Runs**, `?status=waiting_time`: the chip **Waiting for a time** counted it; **Cancel by age…** was offered. Its dialog read **Cancel runs by age**, **Which runs** (Flow runs that are going / Script runs, queued and going), **Started more than this long ago** with **Amount** and **Unit**, "Counted from when each run was started.", and the sentence about flow runs, with **Keep them** and **Continue** (disabled until an amount).
3. The row's **Actions** menu: Open, Cancel, Only runs of inventory/check, Copy the run ID, Copy a link to it. **Cancel** asked "Cancel this run of inventory/check?" and "The run stops where it is." with **Keep it** and **Cancel the run**; the run left the chip and the **Canceled** count went to 1.
4. **Search** `inventory/check`: the address got `?q=inventory%2Fcheck`. **When**, **Between…**: **From** and **To** fields appeared, `from` in the address. **To** set to 2020-01-01: "The end is before the start." shown.
5. The run page of the waiting run showed **Re-run** and **Edit with this input** and no **Cancel run**.

## The page got wrong (and was corrected)
- Nothing the page said was changed by the run. The page's note that a run waiting for a time has no Cancel run on its page was added after step 5.

## Not run by the writer
**Cancel N queued** (no queued run was left to count), a confirmed **Cancel by age** (only the dialog was opened), the checked-row **Cancel** bar, **Saved views**, a flow run's cancel, **Load more**, the failure dialog "N done, M not done", the 10,000 limit, a person without `run:write`, 768 and 390 px, dark.

## Second check (2026-11-23)

- Instance: http://localhost:8091, the throwaway instance (MAIL_CAPTURE_DIR set, so mail is read from its folder). Everything below ran in a workspace of my own: Operate check (a dev workspace) and Operate check live (a production workspace linked to it), in Fernhill's tenant, with scripts, flows, triggers, a secret and an HTTP connection of mine (deployed by the CLI from a repository of my own; the connection pointed to a listener of mine on localhost). Signed in as Maya Brooks, and as Devi Shah (not in the Practice managers group) where a second person was needed. Playwright, headless.

- **Cancel N queued**: six runs of a script that runs one at a time left five queued. The button read "Cancel 5 queued"; its question gave "Every queued script run from the last 24 hours is canceled, whether or not this page has loaded it. …"; **Cancel queued runs** moved the count from Queued 5 to 0 and Canceled to 5.
- A confirmed **Cancel by age…** (own runs only, searched `opchk/slow`): **Which runs** Script runs, **Amount** 5 **seconds**, **Continue**, the warning "This cancels every script run started more than 5 seconds ago that has not finished. It cannot be undone.", **Cancel runs older than 5 seconds**: all nine runs of the script (the one going and the queued ones) were canceled. The same for **Flow runs that are going**: "1 flow run canceled."
- Checked-row bar: two checked, "2 selected", **Cancel**, "Cancel 2 runs?" and the run list; confirmed. **Run again** on two canceled rows: "Run 2 runs again?"; confirmed; two new queued runs.
- **Load more**: 112 quick runs; the page held 100, **Load more** added the rest.
- **Saved views**: **Save this view…** named "opchk hooks"; the menu then offered **Rename “opchk hooks”…** and **Delete “opchk hooks”**.
- A run set for later: its page offers no **Cancel run** (the page says so; fault listed).
- 390 and 768 px, light and dark: no horizontal scroll; the toolbar wraps. Reload keeps the filters.

Still not run: the 10,000 limit, the dialog "N done, M not done", 768 px and keyboard on the batch bar.
