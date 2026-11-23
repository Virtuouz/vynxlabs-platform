# Run log: console/how-to/scripts/run-a-script.md

- Instance: http://localhost:8091, the throwaway instance seeded by `examples/fernhill/setup/setup.mjs`, commit `5ebf1c80` (branch phase-31-write-the-docs).
- Signed in as Maya Brooks (`maya.brooks@fernhill.example`, tenant admin), in Fernhill's Sandbox workspace, at 1440 px, light theme, with Playwright headless. No other width or theme was run, and no keyboard-only pass.
- Scripts made for the run are named `scr-greet` and `scr-broken` (the page uses `greet`). The steps were run in pieces, then the page was written from what was seen; a single end-to-end run of the finished text was not made.

## The steps as followed
- `scripts?item=scr-greet`: the inspector showed Script, path, "No description.", Timeout 60s, Retries 0, Managed in The console, the links, **Open editor**, **Run**, **Offer to an agent…**.
- **Run**: dialog "Run scr-greet" with **Start** (Now, Later), **Priority**, the sentence "A later run is listed as waiting until its time…", **Fields** / **JSON**, **Name**. Name `Jess`, **Run**: the run page opened, **Succeeded**, "waited 142 ms · ran 316 ms", "By hand", "version 7", **Re-run**, **Edit with this input**, Attempts "#1 succeeded", the log line, Input {"name":"Jess"}.
- **Re-run** menu: "With the same input", "With other input…", "On the version deployed now". **With the same input** asked "Run scr-greet again? With the same input, on version 7, the one it ran." with **Cancel** and **Run again**; the new run showed **Re-run of a run** beside its version and a trigger of "Re-run" in the list. **With other input…** opened "Run scr-greet again" with the form.
- With a draft present (a settings change) the dialog was titled "Run scr-greet, as deployed". **Start** Later with no time gave "Choose when it starts, or start it now." With **Starts at** five minutes ahead and priority 5 the run opened as "Waiting until 14:31:00"; its page had **Re-run** and **Edit with this input** and no **Cancel run**. In **Runs** the row's **Actions for …** menu had Open, Cancel, "Only runs of scr-greet", Copy the run ID, Copy a link to it; **Cancel** asked "Cancel this run of scr-greet? The run stops where it is." with **Keep it** and **Cancel the run**; the run then read **Canceled**.
- A priority of 500 was not seen to be refused: the time check came first. The text is from the code.

## The page got wrong (and was corrected)
- The inventory and the brief do not say a run set for later has no **Cancel run** on its page; the run showed it has none. The page says so and sends the reader to the **Runs** list.

## Not run
Cancel run on a running run (the script finishes in under a second), a masked input, a flow's step, a guest, dark theme, 768 and 390 px, keyboard-only.

## Second check, 2026-11-23
- Walked by the second agent, 2026-11-23, on http://localhost:8091 as Maya Brooks in Fernhill's Sandbox: the scripts list with its inspector, the run dialog, the script's page, its Settings form and the editor, in dark and light at 768 and 390 px (no sideways scroll, nothing cut off) and by keyboard (g then s; Enter on Run opens the dialog with the focus in it and Esc closes it and returns the focus to Run; Ctrl+Enter; Enter on the Settings summary opens it).
- A guest start was run through the API, since no app here lets a guest start a script: an anonymous binding of `agent_runner` was made (it landed at the whole workspace, by a mistake in the request, and was deleted at once; the bindings list held no anonymous binding afterwards). An unsigned POST to `runs` answered 403 "Sign in to start a script. A run started by someone who is not signed in cannot be read back." Before the binding it answered 401 "Sign in or send an API key." The page now says both.
- Still not run: Cancel run on a running run (the script ends in under a second), a masked input, a flow's step.
