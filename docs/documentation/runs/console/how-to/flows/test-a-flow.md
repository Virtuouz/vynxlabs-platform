# Run log: console/how-to/flows/test-a-flow

- Instance: the walk instance, `http://localhost:8091`, Fernhill seeded. Code at branch `phase-31-write-the-docs`, 2026-11-23. Signed in as Maya Brooks (`maya.brooks@fernhill.example`), tenant admin, workspace Sandbox, headless Chromium through Playwright, 1440 x 900, light. Flows were named `flows-…`. Scripts are in `/home/gplascencia/.local/share/volvel-walk/flows31/`.

## Steps as followed
Flow `flows-orders/handle`, opened in the editor.
1. **Test**: panel "Test the draft", **Build with all drafts**, input form with **As JSON**, **Run a test**.
2. **Run a test**: after a few seconds the panel said **Succeeded**, **Open the run**, and `start` 4 ms, `set` 7 ms.
3. Chose `set`: **Last test** with **Started**, **Took**, the output with **Copy**, and **Test from set** with its explanation.
4. **Test from set**, then **Run again**: both gave **Succeeded**.

## What the page got wrong, corrected
- It named an "Output of" label; the screen shows the output with **Copy**. It now says so.
- It did not mention **As JSON**. Added.
Not reached: "The flow changed since this test." (an edit that changed nothing did not show it), a refused test, and **Build with all drafts** turned on.
