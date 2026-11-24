# Run log: console/how-to/flows/retry-or-cancel-runs

- Instance: the walk instance, `http://localhost:8091`, Fernhill seeded. Code at branch `phase-31-write-the-docs`, 2026-11-23. Signed in as Maya Brooks (`maya.brooks@fernhill.example`), tenant admin, workspace Sandbox, headless Chromium through Playwright, 1440 x 900, light. Flows were named `flows-…`. Scripts are in `/home/gplascencia/.local/share/volvel-walk/flows31/`.

## Steps as followed
1. The failed run of `flows-approve/discount`: header showed **Re-run**. Menu: **Retry from the failed step…**, **Again from the start**, **Again, with other input…**, **On another version…**, **On the version deployed now**. (No "on vN (deployed now)" item: the run was on the deployed version.)
2. **On another version…**: dialog "Run flows-approve/discount on another version": **Version** list ("v21, 29s ago (deployed now)" …), **Run**: **From the failed step** or **Every step again, from the start**, **Cancel**, **Continue**. Cancelled out.
3. **Retry from the failed step…**: "Retry from the failed step?" "Runs again: approve. Kept as it was: nothing. On version 21, with the same input." **Cancel**, **Retry**. **Retry**: a new run opened, "Waiting for approval", with the link "Retry of a run".
4. **Cancel flow run**: "Cancel this flow run?" "Steps in progress are canceled too." **Keep running**, **Cancel flow run**. Toast "Canceling. Steps that are running are stopped." The run showed **Canceled**.
5. With nothing going, **Runs** has no **Cancel by age…**. With a run going it does: dialog "Cancel runs by age": **Which runs**, **Started more than this long ago** (**Amount**, **Unit**), **Keep them**, **Continue**. I pressed **Keep them**: the dialog would cancel every going flow run in the shared Sandbox.

## What the page got wrong, corrected
- The "on vN (deployed now)" item exists only when the version differs.
- **Cancel by age…** appears only while a run is going.
- The retry question and the **Retry** button were not quoted.
- The date and unit fields are **Amount** and **Unit**.
Not reached: **Cancel by age** confirmed, a retry on another version, a sub-flow run, a conflict refusal.

## Second check, 2026-11-23 (second agent)

On the walk instance, Maya Brooks, in a workspace of my own: Fernhill tenant, dev workspace `flows-check` (created with triggers running, so the shared Sandbox's paused triggers were not touched). Flows `flows-approve/mail`, `flows-hook/signed`, `flows-form/intake`, `flows-sched/tick`. Scripts in `/home/gplascencia/.local/share/volvel-walk/flows31/` (`h2.mjs` to `h15.mjs`, `w1.mjs`, `w2.mjs`).

Started `flows-approve/mail` and pressed **Cancel flow run**, then **Cancel flow run** in the dialog: the run ended **Canceled**. Read in the code: the retry refusals (routes/flows.ts:1230-1253). The run page was opened at 390 px, light and dark.
Not run: **Cancel by age** confirmed (it cancels every going run in the workspace), a retry on another version, a sub-flow run.
Fault noted: a canceled flow run publishes no `platform/flow-run-finished` although the generated events page says it is sent however the run ended.
