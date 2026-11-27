# S3: Full run page, re-run with edit, retry from failed step

Roadmap item (the 2026 roadmap, in volvel-internal): P1-1 and P1-2. Priority P1. Complexity M + M.

## Problem (verified and observed)

- **Script run detail** exists only in a 22–26 rem inspector (`apps/console/src/kit/layout.tsx:115`, `screens/Runs.tsx:275`). Logs wrap to about 20 characters a line.
- **The full-page `RunDetail`** (`screens/Execution.tsx:348`) is unused.
- **No links** from a run to its script, its version or its trigger.
- **Run again** re-posts the same input.
- **Flow runs** live on `/flow-runs/:id` in the older page style, with Cancel, Approve and Reject, and **no retry or re-run**.

## Design: the page

Route: `/t/:t/workspaces/:w/runs/:id`, for both kinds. The ID resolves to a script run or a flow run. `/flow-runs/:id` redirects here. The Runs list inspector keeps a compact summary with **Open full view** (Enter).

```
┌ Breadcrumb: Clinics › Runs › reminders/send · 01a1…c7e2 [copy]                     [Re-run ▾] [Cancel] ┐
│ ● Failed · 24 ms · attempt 2 of 3 · started by schedule reminders/hourly → · v1 → · worker pool default │
├──────────────────────┬──────────────────────────────────────────────────────────────────────────────────┤
│ Attempts / Steps     │  Why it failed  +  Suggested next step  (existing insight)                       │
│ ● 2 failed  24 ms    │  ─────────────────────────────────────────────────────────────────────────────── │
│ ● 1 failed  31 ms    │  Logs  (full width, LogViewer: search, level, follow, download)                  │
│                      │  ─────────────────────────────────────────────────────────────────────────────── │
│ [flow: Graph tab]    │  Input  |  Output  |  Uses (connection → binding page)  |  Tags                  │
└──────────────────────┴──────────────────────────────────────────────────────────────────────────────────┘
```

- **Flow runs:**
  - The left column lists steps in topological order, each with a StatePill and duration. Selecting one shows its input, output, error and the child script run's logs in place, with no navigation.
  - The graph is a tab that fits to view.
- **Every reference is a link:**
  - script or flow → its page at the run's bundle version (read-only source view);
  - trigger → Triggers row;
  - connection → Connections;
  - version → Release deployment;
  - handler run → its run.
- **Live:** subscribes to S5. Until S5 exists, it polls while the run is in progress, backing off to 15 s while waiting for a person or a delay.

## Design: re-run and retry

**API:**
- `POST W/runs/:id/rerun` takes `{ input?: object, bundle: "original" | "active" }` and creates a new script run with `trigger_type: "rerun"` and `trigger_detail.of = :id`.
- `POST W/flow-runs/:id/retry` takes `{ from: "failed" | "start", input?: object, bundle: "original" | "active" }`.
  - `from: "failed"` requires `bundle: "original"`. Node IDs may differ in another bundle.
  - **Engine:** `startFlowRun` (`kernel/flows/engine.ts:62`) accepts `seed: { fromFlowRunId }`. Inside the same transaction it copies the original's `step_run` rows that are `succeeded` or `skipped` and are **not** downstream of a failed node, with `detail.copied_from` set. Then `advance()` runs as normal. Granted approvals upstream of the failure are copied like any other succeeded step (owner decision, 2026-11-14), and the copy keeps who approved. Approvals that were pending or rejected are asked again.
  - **New column:** `flow_run.retry_of uuid null`.

**Permission:** the same as starting the target (`script:run` / `flow:run` style permissions already checked by `startRun`). Audit: `run.rerun` and `flow_run.retried`.

**Console:**
- **Re-run ▾** offers:
  - *Same input*
  - *Edit input…*, a SchemaForm prefilled from the run (S6)
  - *Retry from failed step*, for flows
- The dialog says which steps will run again, and whether the original or the active version will be used.
- After a re-run, the page navigates to the new run, with a "Retry of …" link back.

## Acceptance criteria

1. From the header failed-runs chip, a failed run's error and log line are visible in **3 clicks**, at 1440 px and at 390 px.
2. Logs show each line at full width; a 200-character JSON field wraps at no fewer than 80 characters at 1440 px.
3. The run page links the script at the run's version, the trigger and every used connection. No path or version is plain text.
4. Re-run with edited input creates a run with the new input and `trigger_detail.of`, visible as "Re-run of …".
5. **Flow retry from a failed step:**
   - Given `a → b(fail) → c`, it re-executes `b` and `c` only.
   - `a`'s step shows "copied from run …".
   - The new run is pinned to the original bundle.
6. A flow whose failure came after a granted approval does not ask again on retry, and the copied step shows who approved it. An approval that was pending or rejected is asked again.
7. `/flow-runs/:id` redirects. The unused `Triggers`, `Approvals` and `Events` components are deleted (P0-6).
8. Control-plane tests cover retry seeding (copied, re-run, granted-approval and rejected-approval cases). Console tests cover the Re-run menu.

## Dependencies

P0-1 (a retried attempt must not overlap a still-running "failed" one), P0-5 (state vocabulary), S6 for edit input, S5 for live updates.
