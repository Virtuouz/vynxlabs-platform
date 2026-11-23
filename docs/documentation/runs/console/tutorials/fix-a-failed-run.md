# Run log: console/tutorials/fix-a-failed-run

- Instance `http://localhost:8091`, commit `5ebf1c80`, 2026-11-23. Maya Brooks, Fernhill Sandbox, Playwright headless, 1440 x 900, light. The stand-ins ran on `127.0.0.1:4020`. The script is Fernhill's own `reminders/send`; no tut- name was possible, so the runs are the walk's own runs of it.
- **Rework from the inventory's brief.** The brief said to teach retry from the failed step on a flow run, with the seeded failures in the production workspace `clinics`. Not done that way: (1) the only flow that texts after a visit, `appointments/after-visit`, catches a failed text on its error path and ends successfully; `billing/chase-unpaid` uses `continueOnError`; no seeded flow run fails on an outage. (2) An attempt to re-run the seeded failed run in `clinics` was stopped by the session's permission check as an action on a workspace that is not the walk's own; nothing was changed there. The tutorial therefore makes its own failure in the Sandbox with the outage switch, and uses a script run's **Re-run**, which is what a script run offers.
- Done in separate scripts in the order of the page (run well, outage on, run, outage off, find, compare, re-run).

## Seen

1. Scripts > `reminders/send`: "Not run yet", **Run**; dialog Start (Now, Later), Priority, "How to give it". Run: Succeeded "waited 173 ms · ran 1.9 s", version 37, log "A reminder was refused {"visit":"A-7296","reason":"That number cannot receive texts.","status":422}" (Warn) and "Reminders done {"due":51,"sent":50,"failed":1}".
2. `curl -X POST http://127.0.0.1:4020/control/outage -d '{"on":true}'` answered `{"outage":true}`.
3. Run again: Failed, "waited 40 ms · ran 523 ms", version 38 (another writer deployed in between), ATTEMPTS "#1 failed / nothing logged"; "Why it failed / TextLine answered 503: the gateway is down. 0 reminders went out first. / The service failed on its side (503). / Usually passing: run it again later, or ask the service's owner if it keeps failing."; "The script logged nothing."; "Since it last worked / It last succeeded 18s ago on v37. / Input: The same as the last success / Version: v37 then, v38 now / Took: 523 ms now, 1.9 s then / Compare the source". An `alerts/run-failed` run followed (the workspace's failure handler).
4. Outage off: `{"outage":false}`.
5. Overview: "8 runs failed in the last 24 hours" (several were other writers'), "Open the failed runs to see which step and which log line.", **Open failed runs** went to `.../runs?status=failed`; the row showed the 503 text.
7. **Compare the source** went to `.../runs/<id>/compare/<last success id>`: "Compare runs / reminders/send / This run, against the last run that succeeded before it. / This run d4c0fb2d / The last success 816b6a07 / The code is the same in both / Both runs used version 38. What differs is the input or the environment, not the code." (The compare used version 38 for both although the panel said v37 then; not explained, the page says only what the compare says when versions are equal.)
8. **Re-run** menu: "With the same input", "With other input…", "On the version deployed now". Choosing the first opens a confirm dialog "Run reminders/send again? / With the same input, on version 38, the one it ran." with **Cancel** and **Run again**. (Before the dialog was found, two clicks seemed to do nothing.) The new run: Succeeded, "Re-run of a run" link, version 38.
- Also seen in the failed list: Maya's own `tut-approve` run from the approval tutorial, "The step "approve" failed: Rejected: Over budget." (a rejected approval fails the flow run).

## Not run
Retry from the failed step (flow). The production workspace `clinics`. Versions 768/390 px, dark, keyboard.

## Product notes
- The "Since it last worked" panel said "v37 then, v38 now", while the comparison page said both runs used version 38. One of the two is wrong or means something else.
