# Run log: start/how-to/basics/find-and-jump.md

- Instance: http://localhost:8091, the throwaway instance seeded by `examples/fernhill/setup/setup.mjs`, commit `5ebf1c80` (branch phase-31-write-the-docs), 2026-11-24. Playwright, headless Chromium.
- Signed in as Maya Brooks, in Fernhill's Sandbox workspace, 1440 px, light, with the key chord `Ctrl+K` (Linux). No phone width or dark theme pass.
- Pins were made and removed in the same run, so Maya's pins are as they were.

## The steps as followed
- `Ctrl+K`: the dialog **Go to** with the placeholder "Find anything. > runs, # resources, / actions, @ people". With nothing typed: **Recent** (the last 8, with a Ctrl+P hint and "Ctrl+Enter Run again" on a run), **Screens** (12), **Actions** (4).
- "visit": **This workspace** listed tables and apps and flows and a query by what they were; **Other workspaces** followed. The line under a result read "Table · sandbox · {description}".
- `/`: **Actions**: Run script…, Start flow…, New script, New flow, Pause trigger…, Resume trigger…, Copy workspace ID, Switch workspace…, Switch to dark theme, Open the API description, Help for this page, Keyboard shortcuts.
- `@maya`: **People**: a member and an end user. `#appointments`: **This workspace**: the table, a script, an event.
- Ctrl+P on the table: notice "appointments is pinned to the palette."; reopened: **Pinned** first, with "Ctrl+P Unpin". Ctrl+P again: "appointments is unpinned."
- "xqzzzz": "Nothing matches “xqzzzz”."

## The page got wrong (and was corrected)
- Nothing in the parts that were run. The second action's label ("Run again") was read on a run in the list; Run and Start for scripts and flows are from the code.

## Not run
- **Run script…** and **Start flow…** to the end (nothing was started), `>` with a run ID, "The search failed", the palette outside a tenant, and the phone width.
