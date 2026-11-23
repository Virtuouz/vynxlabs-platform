# Inventory: flows

Read from the code at `270e509` on 2026-11-22. A report, not checked prose: what it calls a bug is settled in [the findings](../findings/README.md).

Scope: HEAD 270e509. Abbreviations: FE = `apps/console/src/screens/FlowEditor.tsx`; FS = `FlowSteps.tsx`, FL = `Flows.tsx`, RP = `RunPage.tsx` and SF = `ScheduleForm.tsx` (same folder); ENG = `apps/control-plane/src/kernel/flows/engine.ts`; RT = `apps/control-plane/src/routes/flows.ts`; MF = `packages/manifest/src/flow.ts`; SDK = `packages/sdk/src/index.ts`; SCH = `schemas/kinds/flow.v1.schema.json`. [ran] = I executed it, read-only.

## A. Pages (under packages/docs/content)
1. `build/flows.md` (existing stub, `build-flows`): list and one flow's page.
2. `build/flow-editor.md` (existing stub, `build-flows-editor`): canvas, inspector, saving, test.
3. `build/flow-steps.md` (new): every step and core node.
4. `build/flow-starts.md` (new): the five triggers.
5. `build/flow-expressions.md` (new): CEL reference.
6. `build/flow-behavior.md` (new): branching, parallel, join, errors, retries, durability, limits.
7. `operate/flow-runs.md` (new): run page and retry. F1 there currently opens `operate-runs`, so it needs a section in or link from `operate/runs.md`.
8. `build/flows-in-code.md` (new): defineFlow, YAML, API, CLI, MCP.

Topics are mapped in `apps/console/src/nav.ts:112,294`. New pages need adding to `build/index.md`.

## B. Per page

**1 Flows** (FL:78-586)
- List: "New flow" (dev only), "Find by path or purpose". Chips: All, Failed today, Waiting, Drafted. Columns: Flow, Started by, Steps, Last run, State (vN / Draft / Removing). Head note: "N runs are waiting for a person. Decide".
- Inspector: Open, Edit, Remove / Discard draft / Keep this flow. Repository-owned: "Managed in the repository: the flow is removed there."
- Empty states differ for dev and production (242-245).
- Flow page: Edit, Offer to an agent, **Start flow** (the last two only with a manual trigger; form drawn from its schema). Drag, or arrow keys (16 px), to arrange: "Arrangement saved. The flow itself is unchanged." (needs `flow:write`).
- Sections: How it starts; Recent runs (20); "Schedules and triggers that start it" ("Add a schedule"); Used by.
- Webhook address only with `trigger:write`.
- Shortcut `g f`. Palette: Start…, Edit the flow, See its runs.
- Permissions: `flow:read`; `flow_run:write` to start, grantable on a single flow (RT:734-761); `flow_run:read`.

**2 Editor** (dev workspaces only; production shows a notice)
- New: Path (e.g. `orders/handle`), Start from: "Started by hand" / "Decide, then answer". Starters are disabled after the first change.
- Header: state pill, "N to fix", save status (Not saved / Saving… / Draft saved … ago / Could not save. Trying again… / Could not save. + Retry), Tidy up, Undo, Redo, Test, Name and path, Discard draft/Remove, Save draft, Deploy ("This change only" / "Review all drafts").
- Autosave 1.5 s after a change once saved the first time. Retries at 1.5/3/6/12 s, gives up after five failures (FE:1091-1112). Undo holds 100 steps; same-field typing within 1 s merges (`kit/history.ts`).
- "To fix" list: each item jumps to its field. Advisory only (FE:392-496).
- Add step: "Find a step"; groups Starts, Steps, Logic (FE:96-208), then Core, the workspace's own nodes (own category or "This workspace's"), "Scripts". A new step goes after the chosen one and takes over its next connection; after a Branch or Fail it stands alone (FE:742-771).
- Canvas: drag from a dot; red dot = on error; zoom 0.2–1.5; minimap (hidden while testing); viewport kept per browser session. ⌘/Ctrl-click to choose several; ⌫ removes **without asking**. "Remove this step" asks.
- Right-click / Shift+F10 on a step: Duplicate, Copy, Rename…, Remove. On the canvas: Paste, Select every step, Fit the flow in view.
- Shortcuts: Mod+D, Mod+C/X/V, Mod+Z, Shift+Mod+Z or Ctrl+Y, Mod+S, F1 or Mod+/ (`kit/shortcuts.ts`).
- Paste suffixes taken names `_2`; references between pasted steps follow; connections to outside are dropped. The clipboard is JSON marked `volvelFlowSteps: 1`.
- Inspector: "Steps (N)" outline; Name (Enter renames and rewrites `steps.x` / `steps['x']`; unparseable expressions are left); step fields; "Where it goes next" (Then go to / Also go to / When <case>, go to / Otherwise, go to / On failure, go to); Remove this step. With several chosen: "N steps chosen", Duplicate, Remove. With none: "About this flow", "What it does".
- Expression field: plain text, no autocomplete. "Gives …" after 400 ms, 160 chars, against the last test, else the flow's newest run; "Run a test to see its value."; foreach: "For the first item."
- Test panel: Start from (if several triggers), "Run a test" / "Run again", step list, "Open the run", "The flow changed since this test." Chosen step: "Last test", log, output, **Test from <step>**.
- Permissions: save `resource:write`; test `run:write` + `flow_run:write`, plus `code:write` if any code is drafted (`routes/authoring.ts:1161-1262`); deploy `deployment:write`.
- There are no comments, frames, pinned data, or step disable.

**3 Steps** (FE:1461-1732; run ENG:718-875)

| UI label / `type` | Fields | Output and limits |
|---|---|---|
| Run a script / `script` | "Its input": Field by field / As one expression | Script output. 50 inputs, 20 grants per kind |
| Run a flow / `subflow` | "Which flow": Always the same one / Chosen by the data, from a list; "Flows it may start" (1–50) | Child output keyed by its last steps; depth 10 |
| Set values / `set` | Name, Expression | Object, 1–50 values |
| Answer the request / `respond` | Status 200–599, Body, Headers (20) | `{status, answered}`; 256 K characters; refused headers MF:132 |
| Branch / `branch` | Cases tried in order, else "otherwise" | `{case}`; 1–20 cases; must give a boolean |
| For each / `foreach` | Script, Or a flow, Items, Keep going when an item fails, Input | Ordered list; 1000 items; concurrency 1–20, default 1 |
| Join / `join` | none | null; needs 2+ incoming |
| Wait / `delay` | Seconds to wait | 1 s–30 days |
| Approval / `approval` | What is being approved (200), Detail to show, Where it waits | `{approved, comment, via?}`; timeout ≤30 days |
| Fail / `fail` | Message | Fails the step |

- **No console field** (YAML/API only): foreach `concurrency`, `flowFrom`/`allow`, `with`; approval `timeoutSeconds`, `approvers`; event `filter`; trigger `tags`; manual `input` schema; verify `signed`, `timestampHeader`, `toleranceSeconds`. Kept on edit, but lost if "It starts" is changed.
- Core nodes (`packages/nodes/src/index.ts`): HTTP request (60 s; GET sends no body; "Fail on an error status" on by default), Send email (SMTP; 60 s), Read rows (max 1000, default 50; output rows/count/row), Write a row (insert/update/delete), Publish an event (30 s). No retries on any.
- A step may reach only the connection/table/event picked in it (`with`); the script must declare `node.takes`.
- Approval mail: up to 50 people, links last 48 h or until timeout (`approvers.ts:248`, `approval-links.ts:19`). Groups match by key, then name, resolved when the wait starts. Decider also needs `approval:write`.

**4 Starts**: "By hand, or from another flow", "On a schedule", "When an event is published", "When its address is called", "When someone fills in its form".
- Schedule (SF:211): Often used presets, cron, Time zone (new = workspace's), next five times, "Skip a time while the run it started last is still going" (flow default skip; standalone schedule default allow), Trigger source (if a poll source exists).
- Webhook (FS:229): body / whole request; answered at once (202 `runId`) / by the flow (25 s, then 202; `x-flow-run` header); unchecked / signature / trigger source. 120/min (`routes/execution.ts:3291`); `idempotency-key` header; paused gives 503; bad signature 401. `respond: flow` excludes `source`.
- Form (FS:421): 1–30 questions, 7 types; text 500, email 320, textarea 5000 chars; reserved names website, key, return; "Anyone with the address" / "Only people signed in to the portal".
- Trigger source starts at most 100 per answer. 10 tags per trigger.

**5 Expressions**: CEL, `@marcbachmann/cel-js` 8.0.0, no custom functions except `string(timestamp)`. Limits: 250 ms, 64 MB, 2000 AST nodes, depth 64, 200 list/map literal entries, 16 arguments, 2000 characters in the manifest (preview 4000; `kernel/flows/expressions.ts:22-30`).
- Variables: `trigger`, `steps.<name>.output` (succeeded only), `steps.<name>.error.message`, `now`; in foreach `item`, `index`. **Event filters see only `event.name` and `event.payload`**; tags see only `trigger`.
- Operators [ran]: `+ - * / %`, comparisons, `&& || !`, `in`, `?:` (both branches same type), indexing.
- Macros: `has all exists exists_one map` (2- and 3-argument) `filter cel.bind`.
- Strings: startsWith endsWith contains lowerAscii upperAscii trim indexOf lastIndexOf substring matches split size; `list<string>.join`. No replace, sort, charAt, math, reverse, flatten, optional `.?`.
- Conversions: int uint double string bool bytes dyn type; bytes `.json .hex .string .base64 .at`.
- Time: `timestamp()`, `duration('336h')` (ns to h, **no d**), `getFullYear/getMonth/getDate/getDayOfMonth/getDayOfWeek/getDayOfYear/getHours/getMinutes/getSeconds/getMilliseconds`, most taking a zone (month and dayOfMonth are 0-based).

**6 Behavior**
- Several outgoing connections run in parallel. Any step but a Join starts on the **first** path to arrive, once. Join waits for paths that can still arrive (ENG:660-686).
- An unhandled failure cancels everything active and fails the run. Error path taken: step marked `handled`.
- Retries are the **script's** own (default 0); steps have no retry setting.
- State saved per step; sweep every 2 s, up to 200 runs, so waits are accurate to about 2 s.
- Runs and sub-flows are pinned to the starting bundle.
- Workspace concurrency (default 10, 1–1000) limits script runs only; no flow-run cap.
- 200 nodes, 1000 edges, no cycles. Event chain depth 10. Payload over 256 KB becomes `{stored, note}` in expressions.

**7 Run page** (FL:730-1084, RP:643-870)
- Tabs Timeline (Waiting for a worker / Running / Waiting on purpose) and Graph (drawn at the run's version). `?step=` and `?view=` in the address.
- Approve / Reject (reason required to reject). "Cancel flow run".
- Re-run menu: Retry from the failed step…; …on vN (deployed now)…; Again from the start; Again, with other input…; On the version deployed now. Copy as curl. Comparison with last success.
- Retry rules (RT:1016-1119, ENG:233): keeps succeeded, skipped and handled-failed steps and granted approvals; refused or pending ones are asked again; 409 if a kept step differs in the new version. Not for a sub-flow run or a running run. "From any step" exists only as Test from. Needs `flow_run:write`.

**8 Code**
- `defineFlow`, `trigger.*`, `step.*` (SDK:728-945). Edges: `["a","b",{when,error}]`.
- File `<path>.flow.yaml` with `schemaVersion: 1`, `body:`.
- Build checks: MF:284-452, `bundle-check.ts:311-395` (references, grants, sub-flow manual trigger, circular flows).
- API `/flow-runs`, `/retry-plan`, `/definition`, `/cancel` (bulk 10,000), `/expressions/value` (240/min). `volvel run <flow> --remote`. MCP: `start…` tool, waits 25 s, 200 tools.

## C. Gotchas
- JSON numbers are doubles: `trigger.n + 1` fails, `+ 1.0` works; `trigger.n % 2.0` fails, use `int()`; text + number needs `string()`; comparing with ints works; `7 / 2` is 3 [ran].
- Missing field is an error, so use `has()`. Unanswered optional form fields are absent.
- Flow output = last steps only, by name. A step with just an error path is **not** in it (ENG:1099-1115).
- Rejection/timeout text is in `steps.x.error.message`; output is readable only on approval.
- Draft tests run real scripts and mail approvers "[Test] Approval needed". They compose all drafts, so another broken draft blocks the test.
- Saving a repository flow's draft takes it over.
- Branch/Set/Wait/Join have no error dot though Branch and Set can fail; YAML allows an error edge from them.
- "Failed today" and "today" mean the last 24 hours.

## D. Docs wrong or missing
- Both build pages are 7-line stubs; the generated `kinds/flow.md` merges all step types into one table without limits.
- `docs/master-spec.md:434` (read-only graph) and `docs/phases/phase-3-events-flows.md:46` (drawn on current graph) are stale. README "phase 6" too.
- `docs/sdk-guide.md` has no flow section.
- Permission text: `flow_run:write` omits retry and test.
- SDK omits foreach/subflow `flowFrom`+`allow`, trigger `tags`, `layout`, though YAML accepts them.

## E. Likely bugs / questions
1. Starter "Decide, then answer" uses `input.amount`; runs fail "Unknown variable: input" [ran] (`starters.ts:107-109`). Its test only checks shape.
2. For each running only a flow cannot be saved: palette sets `script: ""`, which the schema refuses [ran] (FE:178). Choosing a script then clearing it should work around it (untested).
3. Any new Run a script / Run a flow / On an event step fails autosave until chosen ("The manifest is not valid."), though shown as merely "to fix".
4. Set values and Headers have **no Remove**; duplicate names merge (FE:2319).
5. Removing a case leaves its edge, invisible, refused at deploy (FE:2289).
6. Draft-only flow: its list link and Open go to a 404 (RT:577).
7. "waiting for a person" counts delays, loops, and sub-flows too (RT:465).
8. Editor flags foreach with `flowFrom` as missing a script or flow (FE:481).
9. Arrangement: flow page and run definition apply opposite precedence (RT:600, 972); the editor ignores saved arrangements.
10. Sub-flow run page offers Re-run, always refused 409.
11. FL's TRIGGER map lacks `form` and `retry`: raw words shown.
12. Form editor does not flag typed reserved names until deploy.

Ask: are console fields planned for concurrency, approvers, timeout, filter, and input schema? If so, hold those sections.

## F. Screenshots and examples
- Existing screenshots: none for flows. Wanted: list with inspector; editor with branch and approval; Add step open; expression "Gives"; test with Last test; run Timeline and Graph; retry dialog; form designer.
- Examples: `examples/fernhill/src/flows.ts` (reorder, chaseUnpaid, register, afterVisit), `examples/acme/src/*.ts` (`orders/handle`), `examples/higher-ed-devices/src/flows.ts`, `apps/control-plane/src/flows.test.ts:100-330` (join, loop, recover). No `.flow.yaml` example exists; write one.
