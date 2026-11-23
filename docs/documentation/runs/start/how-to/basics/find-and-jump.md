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

## Second check, 2026-11-23

Maya Brooks, Fernhill Sandbox, 1440 px light and 390 px dark.
- `/` then **Run script…**: the picker listed the scripts; Backspace on the empty box went back to the list shown with nothing typed. `agent/clinic-day` with **Clinic** northside and **Run** made the run and opened its page (Succeeded, version 39).
- `>` with the first 8 characters of that run's ID listed that run and the runs that began in the same minute.
- **Start flow…** listed the manual flows. `flows-approve/discount` started and opened its run (Waiting for approval; it was left for its owner lane). `tut-approve`, a flow never deployed, was listed and refused with "The flow tut-approve was not found." (fault, recorded on the page).
- The Run dialog also asks **Start** (**Now**/**Later**) and **Priority**: the page now says so.
- The palette on the **Tenants** screen: only **Screens** and **Actions**. The search failure state was shown by answering the search request with an error: message, Request ID, **Try again**.
- 390 px dark: the header button opened the palette; the Run dialog and the picker fit.
Not run: keyboard-only from the first Tab (the shortcuts were pressed, the dialog's own focus order was not walked).
