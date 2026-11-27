# Fact-check record: console/tutorials/fix-a-failed-run

Code as of commit `5ebf1c80`, 2026-11-23. Written by the page's writer; run 2026-11-23 (run log). "Checked by" for the rows below: second agent, 2026-11-24.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| `POST /control/outage {"on":true}` makes TextLine answer 503 | `examples/fernhill/stand-ins/server.mjs:7,92` | writer, run | holds |
| The stand-ins answer at `127.0.0.1:4020` | `examples/fernhill/setup/setup.mjs:23` | writer | holds |
| Re-run menu: With the same input / With other input… / On the version deployed now | `apps/console/src/screens/RunPage.tsx:415-420` | writer, run | holds |
| Re-run asks "Run <script> again?" with text "With the same input, on version N, the one it ran." and button **Run again** | `apps/console/src/screens/runAgain.ts:42-49` | writer, run | holds |
| A re-run is a new run with a "Re-run of a run" link | `RunPage.tsx:383` | writer, run | holds |
| Flow runs offer Retry from the failed step; script runs offer Re-run | `RunPage.tsx:754-761`, `runAgain.ts:57-78` | writer | holds (flow side not run) |
| "Why it failed" and the 503 explanation | run | writer, run | holds |
| "Since it last worked" lists Input, Version, Took and Compare the source | run; `apps/console/src/screens/RunCompare.tsx` | writer, run | holds |
| Overview's "Open failed runs" opens runs narrowed to failed | run | writer, run | holds |
| Starting and re-running needs `run:write` | `packages/docs/generated` permissions: "Start a script and cancel a run" | writer | holds |
| Steps 1-8 in one pass (outage on, failed run, outage off, Overview, failed list, run page, re-run) | instance walk | second agent, run | holds except below |
| Pressing a row in the failed runs list opens a side panel ("Why it failed", **Open full view**), not the run page | instance walk; Runs list | second agent, run | corrected: step 5 names the panel and **Open full view** |
| Several `reminders/send` rows share the 503 result: the newest is first | instance walk | second agent, run | corrected: step 5 says top row |
| **Compare the source** shows only when the version changed; a same-version failure reads Version "The same, v54" and has no button | `RunCompare.tsx:96-116`; instance walk | second agent, run | corrected: step 7 rewritten; compare page removed from What you built. fault fixed (fb/fc): compare page names both versions, not reached here |
| Re-run, menu, dialog "Run reminders/send again? / With the same input, on version 54, the one it ran.", **Run again**, new run Succeeded with "Re-run of a run" | instance walk | second agent, run | holds |

Checked by: second agent, 2026-11-24.
