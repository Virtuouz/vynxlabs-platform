# Run log: console/how-to/releases/roll-back-a-version.md

- Instance: http://localhost:8091, the throwaway instance seeded by `examples/fernhill/setup/setup.mjs`, commit `14f7d5b9` (branch phase-31-write-the-docs). Playwright, headless, 1440 px, light theme. No other width or theme was run.
- Names made for this run start with `rel`: workspaces Rel dev (slug `rel-dev`, later renamed Rel dev two and back) and Rel prod (`rel-prod`, production, the target of Rel dev), a clone `rel-clone` (deleted again), variables `rel-greeting`, `rel-farewell`, `rel-region` and a connection `rel-courier`. Fernhill was not changed.
- Signed in as Maya Brooks.

## Steps as followed
1. Rel prod ran v2 (promoted). **Versions** listed v2 (Running in Rel dev and Rel prod) and v1 with **Roll back to this version**.
2. Pressed it. The dialog: "Roll back Rel prod to version 1?" and "Rel prod stops running what it runs now and starts running version 1 at once. Runs in progress there finish on the version they started with." with **Cancel** and **Roll back in production**.
3. Confirmed. The list then read, from the top: v1 "No message" "just now" Running in Rel prod; v2 "Promoted" Running in Rel dev with **Deploy this version**; v1 "Promoted" ... (the earlier v1 row, with the tag Running in Rel prod). The toast was not caught ("Reconnecting…" only). The code's text is "Version 1 is what runs here now."
4. Later a promotion of v2 put v2 on top again; the list grew by a row each time.

## What the run found that differs from the brief or the code
- The page was written from the code and the run agreed. The first version of the **The result** section said less about the new row at the top; it now says the list gains a row and keeps the old ones, as the run showed.

## Not run
- Rolling back in a dev workspace, **Not yet run here**, the suspected-rename question, an incompatible bundle, and the CLI command.
