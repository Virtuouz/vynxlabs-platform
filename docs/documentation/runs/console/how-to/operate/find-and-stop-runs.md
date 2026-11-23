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

## Not run
**Cancel N queued** (no queued run was left to count), a confirmed **Cancel by age** (only the dialog was opened), the checked-row **Cancel** bar, **Saved views**, a flow run's cancel, **Load more**, the failure dialog "N done, M not done", the 10,000 limit, a person without `run:write`, 768 and 390 px, dark.
