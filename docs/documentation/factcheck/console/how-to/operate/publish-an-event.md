# Fact-check record: console/how-to/operate/publish-an-event.md

Lines are current at commit `5ebf1c80` (branch phase-31-write-the-docs). Paths are under the repository root. Written by the writer; "Checked by" is for the second agent.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Dialog steps and notices. | apps/console/src/screens/PublishEvent.tsx:35-130 | writer, run on the instance 2026-11-23; second agent, 2026-11-23 (see the second check below) | holds as run |
| Production confirm. | apps/console/src/screens/PublishEvent.tsx:60-71 | writer, read from the code 2026-11-23; second agent, 2026-11-23 (see the second check below) | holds as read |
| Publish it on an event's own page. | apps/console/src/screens/ObjectPages.tsx:395-420 | writer, read from the code 2026-11-23; second agent, 2026-11-23 (see the second check below) | holds as read |
| Events list row: From The API. | apps/console/src/screens/Operate.tsx:791-795 | writer, run on the instance 2026-11-23; second agent, 2026-11-23 (see the second check below) | holds as run |
| Listeners paused wording. | apps/console/src/screens/Operate.tsx:897-901,969-974 | writer, run on the instance 2026-11-23; second agent, 2026-11-23 (see the second check below) | holds as run |

## Second check (2026-11-23)

Checked by: second agent, 2026-11-23. Run in a workspace of my own (Operate check, a dev workspace in Fernhill's tenant, with scripts, flows and triggers of mine deployed by the CLI, and a production workspace linked to it) (dev and production): the dialog, the JSON view, a refused payload, an event's own page, the production question.

| Claim | Source | Result |
| --- | --- | --- |
| A refused value in the JSON view is shown as "/count: Enter a number." | run | corrected: added to step 3 |
| Production: "Publish opchk/pinged in production?", "Every trigger that listens for it starts its work now, with real data.", Publish in production. | run | holds as run |
| Link to the platform events points to the generated page. | docs:check | done |

## Phase 34, A7 (YAML first), 2026-11-24

Commit `d619bfbd` plus the working tree. Written by the A7 writer; second agent checked 2026-11-24 (a7r). Run on the throwaway instance of lane a7 (http://localhost:8712, Fernhill seeded).

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| An event is a file or `defineEvent`. | `schemas/files/event.v1.schema.json` | writer, 2026-11-24 | holds as read |

### Second check (a7r), 2026-11-24, second agent

Lane a7r build, `pnpm docs:check` passes. Second agent, 2026-11-24. The quoted strings are in `apps/console/src/screens/PublishEvent.tsx` as written (a8 is changing the empty-state copy; the quote follows the current build). `<path>.event.yaml` validates (`event.v1`); a converted event file was written by `volvel convert` on higher-ed-devices.
