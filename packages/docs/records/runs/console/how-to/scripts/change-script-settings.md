# Run log: console/how-to/scripts/change-script-settings.md

- Instance: http://localhost:8091, the throwaway instance seeded by `examples/fernhill/setup/setup.mjs`, commit `5ebf1c80` (branch phase-31-write-the-docs).
- Signed in as Maya Brooks (`maya.brooks@fernhill.example`, tenant admin), in Fernhill's Sandbox workspace, at 1440 px, light theme, with Playwright headless. No other width or theme was run, and no keyboard-only pass.
- Scripts made for the run are named `scr-greet` and `scr-broken` (the page uses `greet`). The steps were run in pieces, then the page was written from what was seen; a single end-to-end run of the finished text was not made.

## The steps as followed
- `scripts/scr-greet`, tab **Settings**: rows "Stops after 60 seconds" and "Tries again Never: a failed run is not tried again", **Change the settings**, "A change is kept as a draft, as in the editor. Open the code".
- **Change the settings**: the form had Give up after (seconds), Try again (times), Wait between tries (seconds), Wait longer after each failed try, the uses lists, Worker pool, Memory (MB), Runs at once, One lane for each value of, Tables, Data sources, Events, Connection groups, the failure fields. No What it does, no flow step, no schema.
- 90 and 2, **Save as a draft**: the tab said "Saved as a draft. It runs this way once it is deployed. Open the draft", "Stops after 90 seconds", "Tries again 2 times, 30 seconds apart, waiting longer each time".
- Editor of `scr-greet`, **Deploy**, **This change only**: toast "Deployed scr-greet as version 20." The list inspector then showed Timeout 90s, Retries 2.

## The page got wrong (and was corrected)
- A first draft listed a pool name with capitals as a refusal. The pool is chosen from a list, so it was removed.

## Not run
Lists of connections, secrets, tables; the lane key; "cannot be deployed alone"; production; a repository script; dark theme, 768 and 390 px, keyboard-only.

## Second check, 2026-11-23
- Walked by the second agent, 2026-11-23, on http://localhost:8091 as Maya Brooks in Fernhill's Sandbox: the scripts list with its inspector, the run dialog, the script's page, its Settings form and the editor, in dark and light at 768 and 390 px (no sideways scroll, nothing cut off) and by keyboard (g then s; Enter on Run opens the dialog with the focus in it and Esc closes it and returns the focus to Run; Ctrl+Enter; Enter on the Settings summary opens it).
- On a repository script (`messaging/send-sms`) the **Settings** tab shows **Change the settings**, where the code (`ownership !== "repository"`, the stored value being `code`) means to say "The repository holds this script: change its settings there." Product fault, reported; the page says only what is true of production.
- Still not run: lists of connections, secrets and tables, the lane key, "cannot be deployed alone", a production workspace.
