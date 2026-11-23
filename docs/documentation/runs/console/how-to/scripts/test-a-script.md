# Run log: console/how-to/scripts/test-a-script.md

- Instance: http://localhost:8091, the throwaway instance seeded by `examples/fernhill/setup/setup.mjs`, commit `5ebf1c80` (branch phase-31-write-the-docs).
- Signed in as Maya Brooks (`maya.brooks@fernhill.example`, tenant admin), in Fernhill's Sandbox workspace, at 1440 px, light theme, with Playwright headless. No other width or theme was run, and no keyboard-only pass.
- Scripts made for the run are named `scr-greet` and `scr-broken` (the page uses `greet`). The steps were run in pieces, then the page was written from what was seen; a single end-to-end run of the finished text was not made.

## The steps as followed
- **New script** opened `scripts/new`: header "New script", pill "Not saved", **Save draft**, **Path**, **Start from** with three starters, the **Settings** disclosure open, the code, and the test pane with "How to give it: Fields, JSON", **Name**, **Save and run**, **Build with all drafts**, tabs **Result**, **Problems**, **Runs**, and "Run the draft to see what it returns, and its log, here."
- Path `scr-greet`, **Save draft**: the address became `scripts/edit/scr-greet`, pills "Draft", buttons **Name and path**, **Discard draft**, **Save draft**, **Deploy**. The input field was then **Name** marked required, and the button read **Run the draft**.
- Name `Rowan`, **Run the draft**: **Result** showed Succeeded, "waited 258 ms · ran 354 ms", **Open full view**, tabs Logs / Input and output / Details, one INFO line "Started" with {"by":"manual"}, and "EVENTS IT PUBLISHED None." The **Runs** tab listed the run ("8s ago · test", 354 ms). **Problems** said "No problems found."
- A script `scr-broken` with `throw new Error("Nope")` on line 2: **Save and run** gave **Failed**, **Why it failed**, "Nope", **Go to line 2**.
- A script whose code had an extra brace: **Problems (2)** listed "2:11 Type 'string' is not assignable to type 'number'." and "6:1 Declaration or statement expected."; **Save and run** was refused with "The code written in the console does not build. scr-broken.script.ts:6: Unexpected "}" Request ID …" and a "What does this mean?" link, and **Problems (3)** then counted the build error.
- **Build with all drafts** was seen and not run. "Edit with this input" was seen on a run page (its button reads **Edit with this input** in a dev workspace) and not followed. The tenant switch (`console_code_off`) was not turned off.

## The page got wrong (and was corrected)
- A first draft said a test run is listed in the workspace's Runs list, marked as a test. Only the script's **Runs** tab was seen to mark "· test"; the page says only that.

## Not run
Dark theme, 768 and 390 px, keyboard-only, a second person's draft, the console switch.
