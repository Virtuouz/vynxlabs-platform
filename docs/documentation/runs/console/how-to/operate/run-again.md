# Run log: console/how-to/operate/run-again.md

- Instance: http://localhost:8091, the throwaway instance seeded by `examples/fernhill/setup/setup.mjs`, commit `5ebf1c80` (branch phase-31-write-the-docs).
- Signed in as Maya Brooks (`maya.brooks@fernhill.example`, tenant admin), in Fernhill's Sandbox workspace, at 1440 px, light theme, Playwright headless. No other width, no dark theme, no keyboard-only pass, no reload test.
- Other writers share the Sandbox, so its Runs list holds runs that are not mine.

## The steps as followed
1. In **Runs**, searched `inventory/check`; the row menu offered Open, **Run again…**, Only runs of inventory/check, Copy the run ID, Copy a link to it. **Run again…** asked "Run inventory/check again?" with "With the same input, on version 7, the one it ran." and **Cancel**, **Run again**. **Run again** started a run.
2. Opened the new run: header "Re-run of a run", state Queued, **Cancel run**, **Re-run**, **Edit with this input**.
3. **Re-run**: With the same input, With other input…, On the version deployed now. **With other input…** opened **Run inventory/check again** with **How to give it**, **Fields** and **JSON**, **Cancel**, **Run again**.
4. On the failed flow run of `inventory/reorder`, **Re-run** listed: Retry from the failed step…, Retry from the failed step on v16 (deployed now)…, Again from the start, Again, with other input…, On another version…, On the version deployed now.
5. Script **Run** dialog: **Start** Now/Later, **Starts at**, **Priority**, the sentence "A later run is listed as waiting until its time, and starts then. A higher priority goes first when runs wait for a worker."

## The page got wrong (and was corrected)
- The brief says a script's connection reads Bound / Not bound; the screen says **Set up here** / **Not set up here**. The page uses the screen's words.

## Not run
The retry question's list ("Runs again:" and so on), **On another version…**, a checked-row **Run again**, a flow run again with other input, a run with a start time in the past ("Choose a time that has not passed." is from the code), a trigger source's run.
