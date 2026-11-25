# Fact-check record: develop/explanation/operate/failure-alerts.md

Lines are current at commit `5ebf1c80` (branch phase-31-write-the-docs). Paths are under the repository root. Written by the writer; "Checked by" is for the second agent.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Alerted: final failure of a script run; flow run failure, not a sub-flow's; source runs. | apps/control-plane/src/kernel/execution/runs.ts:728-738; kernel/flows/engine.ts:472-480; kernel/execution/triggers.ts:715-726,875-890 | writer, read from the code 2026-11-23; second agent, 2026-11-23 (see the second check below) | holds as read |
| Handler runs do not alert. | apps/control-plane/src/kernel/execution/alerts.ts:62 | writer, read from the code 2026-11-23; second agent, 2026-11-23 (see the second check below) | holds as read |
| onFailure replaces the default; empty onFailure leaves it. | apps/control-plane/src/kernel/execution/alerts.ts:118-126 | writer, read from the code 2026-11-23; second agent, 2026-11-23 (see the second check below) | holds as read |
| Handler input and trigger 'alert'. | apps/control-plane/src/kernel/execution/alerts.ts:152-166; apps/console/src/kit/starts.ts:13 | writer, read from the code 2026-11-23; second agent, 2026-11-23 (see the second check below) | holds as read |
| Post payload; worker pool. | apps/control-plane/src/kernel/execution/alerts.ts:176-203 | writer, read from the code 2026-11-23; second agent, 2026-11-23 (see the second check below) | holds as read |
| Ten-minute window, counted on the first alert, message '(and N more failures since the last alert)'. | apps/control-plane/src/kernel/execution/alerts.ts:131-141,217-260 | writer, read from the code 2026-11-23; second agent, 2026-11-23 (see the second check below) | holds as read |

## Second check (2026-11-23)

Checked by: second agent, 2026-11-23. kernel/execution/alerts.ts read whole: handler wins over the default as a whole, an onFailure naming nothing leaves the default, a handler's own failure does not alert, ten minutes (ALERT_WINDOW_MS), "(and N more failures since the last alert)", the post's text and run object, the pool of the post. Run on the instance: two failures of one script, one alert, "+1 more", a flow failure alerted, the post reached a local address.

| Claim | Source | Result |
| --- | --- | --- |
| New section "Doing more than the default": platform/run-failed published at a last failure; the event trigger example (moved here from the removed platform events page); a failing filter records a refusal shown as Last refused. | kernel/execution/runs.ts:596-690; kernel/flows/events.ts:183-214; packages/sdk/src/index.ts:720-745 | holds as read |
| Link to the generated Platform events page. | docs:check | done |

## Phase 34, A7 (YAML first), 2026-11-24

Commit `d619bfbd` plus the working tree. Written by the A7 writer; second agent checked 2026-11-24 (a7r). Run on the throwaway instance of lane a7 (http://localhost:8712, Fernhill seeded).

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Event trigger file shape. | run: `volvel convert` output; deployed to `walk6` | writer, 2026-11-24 | holds as run |

### Second check (a7r), 2026-11-24, second agent

Lane a7r build (a7 merged), throwaway instance http://localhost:8722 (database a7r34, Fernhill seeded), lane CLI `packages/cli/dist/bin.js`. `pnpm docs:check` passes. The trigger file validates and builds with a script at the path it names.
