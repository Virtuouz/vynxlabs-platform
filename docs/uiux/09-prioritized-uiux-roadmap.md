# 9. Prioritized UI/UX roadmap

This document turns the audit into ordered work. It lists 48 recommendations in five priority levels, with quick wins and architectural work separated, and a sequencing section at the end. Nothing here is implemented.

The findings behind each item are in documents 02 to 05. The standards each item builds are in [07-design-system-specification.md](07-design-system-specification.md) and [08-component-pattern-library.md](08-component-pattern-library.md). Screen IDs such as `WS-RUNS` are defined in [01-current-product-ui-map.md](01-current-product-ui-map.md). Journey IDs such as J12 are defined in [04-workflow-journey-audit.md](04-workflow-journey-audit.md).

Paths are relative to `apps/console/src` unless they start with `packages/` or `apps/`. Evidence labels: **Verified** (code at `e737382`), **Observed (mocked API)**, **Inferred** (must be confirmed first).

## Main points

- **P0 is about trust and access, not appearance.** Ten items: the console can blank itself, lose unsaved work, hide log lines, advertise things that do not exist, and shut keyboard users out of its most-used list and its flow canvas.
- **P1 is the debugging and authoring loop.** Ten items that take the failure-to-fix journey from 27 interactions and two re-finds of the object to about 10 with none.
- **P2 is one system in place of several.** Thirteen items. The list primitive (P2-2) and URL state (P2-6) are the two that most other work waits on.
- **P3 and P4 come last on purpose.** Keyboard chords, saved views and visual refinement are worth little on top of six list implementations.
- **Twenty-two quick wins** can ship before any architectural work and remove most P0 risk.
- No item rewrites working functionality. Each either fixes a defect, adds a link or a state, or replaces duplicated UI with one standard.

## How to read an item

| Field | Meaning |
| --- | --- |
| Affects | Screen IDs and components |
| Problem and evidence | What is wrong today, with a reference |
| Change | What to build |
| User benefit | Why it improves the workflow |
| Complexity | S: up to 2 days. M: up to 1 week. L: up to 3 weeks. XL: more. One engineer, including tests |
| Depends on | Other roadmap items or backend work |
| Risks | What could go wrong |
| Acceptance | Checks that must pass |
| Metric | The measure in [10-validation-plan.md](10-validation-plan.md) expected to move |

Complexity is an estimate from reading the code. It is not a commitment.

## Summary table

| ID | Recommendation | Complexity | Type |
| --- | --- | --- | --- |
| P0-1 | Crash containment | S | Quick win |
| P0-2 | Contrast tokens and branding check | M | Quick win (tokens), then M |
| P0-3 | Keyboard reach for rows and the inspector | M | Quick win (Runs rows), then M |
| P0-4 | Protect unsaved work | M | Architectural (router guard) |
| P0-5 | Run-data correctness | M | Quick win |
| P0-6 | Truthful interface | S | Quick win |
| P0-7 | Orientation for assistive technology | M | Quick win |
| P0-8 | Non-drag flow building | L | Architectural |
| P0-9 | Safe destruction | M | Quick win |
| P0-10 | One-time secrets | S | Quick win |
| P1-1 | Runs list | L | Depends on P2-2 |
| P1-2 | Flow run page | M | Quick win (auto-select), then M |
| P1-3 | Context continuity | L | Architectural |
| P1-4 | Script editor as a workspace | L | Architectural |
| P1-5 | Deploy and promote hand-offs | M | |
| P1-6 | LogViewer v2 | L | |
| P1-7 | Live state made explicit | M | |
| P1-8 | Flow building friction | L | |
| P1-9 | Scheduling in context | M | |
| P1-10 | References as links | L | Architectural (object URLs) |
| P2-1 | Token foundation v2 | M | Architectural |
| P2-2 | One DataTable | XL | Architectural |
| P2-3 | One PageHeader and Breadcrumb | M | Architectural |
| P2-4 | LoadState | M | Architectural |
| P2-5 | Status system | S | Quick win |
| P2-6 | URL state | L | Architectural |
| P2-7 | Forms | L | Architectural |
| P2-8 | Feedback | M | Architectural |
| P2-9 | Data grid | L | |
| P2-10 | App Builder and Dashboards | XL | |
| P2-11 | Admin information architecture | L | |
| P2-12 | Enforcement | M | Architectural |
| P2-13 | First run and empty states | M | |
| P3-1 | Keyboard system | L | Architectural |
| P3-2 | Command palette v2 | M | |
| P3-3 | Multi-select and batch actions | M | |
| P3-4 | Saved views, columns, density | L | |
| P3-5 | Resizable, persisted workspaces | M | |
| P3-6 | Flow canvas power tools | M | |
| P3-7 | Run comparison | L | |
| P3-8 | Wide-screen layouts | M | |
| P4-1 | Page chrome diet | S | |
| P4-2 | Fewer boxes | M | |
| P4-3 | Icons | S | |
| P4-4 | Motion | S | |
| P4-5 | Production signal | S | |
| P4-6 | Data formatting | S | |
| P4-7 | Truncation and overflow polish | S | |

---

## P0. Foundational usability and accessibility defects

These are defects. A user can lose work, be misled, or be unable to operate a core screen. They come before any redesign.

### P0-1. Crash containment

| Field | |
| --- | --- |
| Affects | `SH-SHELL`, every screen. `App.tsx`, `Shell.tsx`, `kit/status.tsx` |
| Problem and evidence | There is no error boundary anywhere. A run whose state is not in the `STATES` map throws in `StatePill` (`kit/status.tsx:79`) and the whole console becomes an empty page with no shell and no message. A summary response without `failedRuns` does the same at `Shell.tsx:132` and `:649`. **Observed (mocked API)**, O1. Separately, the shell requests `GET /api/v1null` on every navigation outside a workspace, because `Shell.tsx:500-503` reloads a query whose path is `null`. **Observed**, O2 |
| Change | An error boundary around the work surface, the inspector and each overlay, so the shell survives. The fallback names what failed, shows the request ID, and offers Reload and Go back. `StatePill` falls back to an explicit `unknown` state. `useLoad`'s `reload` does nothing when the path is `null` |
| User benefit | One bad response or one new server state no longer takes the whole tool away during an incident, which is exactly when the console is needed |
| Complexity | S |
| Depends on | Nothing |
| Risks | A boundary can hide a bug that used to be obvious. Report caught errors to the server log |
| Acceptance | A test renders each top-level screen with one malformed response and asserts the shell and a recovery message are present. An unknown run state renders as "Unknown" with a neutral icon. No request to a path containing `null` is made on any route in the e2e walk |
| Metric | Severe task failure rate. Blank-page count in the e2e walk: 0 |

### P0-2. Contrast tokens and branding check

| Field | |
| --- | --- |
| Affects | Every screen. `packages/ui/src/tokens.css`, `TN-BRANDING`, `IN-BRANDING` |
| Problem and evidence | In the light theme `ink-subtle` is 4.19:1 on canvas, 3.96 on structure and 3.85 on sunken. It is used 134 times, mostly on those backgrounds, for table headers and navigation labels. `attention` is 4.07 to 4.47 on four backgrounds. Placeholders are 3.04. No border reaches 3:1, so every input boundary fails WCAG 1.4.11. Nothing checks the contrast of instance or tenant branding. **Verified**, 05 |
| Change | The seven token values in 07 §7.4, the new `line-control` token on input, checkbox and unfilled-button boundaries, and a live contrast check on both branding screens that refuses a failing pair |
| User benefit | Table headers, hints and navigation labels become readable for users with low vision and on poor displays. A brand colour can no longer make the console unreadable |
| Complexity | M. The token change is S. `line-control` touches each control. The branding check is S to M |
| Depends on | Nothing. Do before P2-1 so later work is tested against final colours |
| Risks | Instances that override these tokens keep their own values. Tenant apps share the tokens, so their look shifts slightly. Announce it in the changelog |
| Acceptance | A unit test computes every pair in 07 §7.4 for both themes: text at 4.5:1 or better, control boundaries at 3:1 or better. Saving branding with a failing pair is refused with the ratio shown |
| Metric | WCAG 2.2 AA critical and serious failures. axe colour-contrast violations: 0 |

### P0-3. Keyboard reach for rows and the inspector

| Field | |
| --- | --- |
| Affects | `WS-RUNS` first, then every list. `screens/Runs.tsx`, `kit/CollectionView.tsx`, `kit/layout.tsx` (`Inspector`) |
| Problem and evidence | Runs rows open the inspector on click only. They have no `tabIndex` and no key handler (`screens/Runs.tsx:392-396`), so a keyboard user cannot open a run from the product's most-used list. The docked `Inspector` (`kit/layout.tsx:85-140`, 13 uses) never takes focus, never returns it, and does not close on `Esc`, although its narrow-width sheet form does all three. `CollectionView` rows have `tabIndex` but no role, with `aria-selected` on a `tr`. **Verified**, 05 |
| Change | Runs rows get the same keyboard behaviour as `CollectionView` rows now, and a real link to the run page on the path. The docked inspector focuses its heading on open, closes on `Esc`, and returns focus to the row. Row semantics are corrected in `CollectionView`. `Dialog` gains a visible close control, which the full-screen palette on phones lacks today (05, A11Y-11) |
| User benefit | Keyboard and screen-reader users can do the product's central task. Everyone gains `Esc` to close |
| Complexity | M |
| Depends on | Nothing. P2-2 later replaces the implementation and must keep the behaviour |
| Risks | `Esc` inside the inspector must not also close a menu or dialog above it |
| Acceptance | An e2e test opens the first failed run, reads its error and closes the inspector using the keyboard only. Focus returns to the row that opened it |
| Metric | Core actions keyboard-accessible. J10 and J11 completable by keyboard |

### P0-4. Protect unsaved work

| Field | |
| --- | --- |
| Affects | `WS-SCRIPT-EDITOR`, the resource editor, `WS-FLOW-EDITOR`, `WS-APP-BUILDER`, every explicit-save form. `router.tsx`, `screens/Authoring.tsx`, `screens/ResourceEditor.tsx`, `screens/FlowEditor.tsx` |
| Problem and evidence | The script editor and the resource editor have no autosave and no guard. There is no `beforeunload` handler and no route blocker in the repository, so a click on the rail discards the code. The flow editor autosaves after 1.5 s, but only once it has been saved by hand (`screens/FlowEditor.tsx:703`), and it retries every 1.5 s without limit on a persistent failure (`:702-706`). **Verified**, 03 part A |
| Change | A navigation guard in the router that any screen can register with while it has unsaved changes, plus `beforeunload`. Draft autosave in the script and resource editors once a path is set, and a local recovery copy before that. Flow autosave from the first change, with backoff and a visible "Could not save. Retry" state |
| User benefit | Work is never lost by a misclick. The save state is always visible |
| Complexity | M |
| Depends on | Nothing. P2-7's `SaveBar` later shares the dirty model |
| Risks | Autosaving a script that does not compile must not affect what runs. Drafts are already separate from deployments, so this holds. A guard that fires too often is ignored: register only while changes exist |
| Acceptance | Leaving any editor with unsaved changes by link, Back, reload or tab close prompts or has already saved. An offline autosave shows a failed state and stops retrying after a bounded number of attempts |
| Metric | Errors and backtracking in J1 to J9. Reports of lost work: 0 |

### P0-5. Run-data correctness

| Field | |
| --- | --- |
| Affects | `WS-RUN-SCRIPT`, `WS-RUN-FLOW`, `WS-RUNS`. `screens/Execution.tsx` (`useLiveRun`), `screens/Flows.tsx` (`useFlowRunLive`), `screens/Runs.tsx` |
| Problem and evidence | Three defects. (1) The logs API pages at 500 lines (`apps/control-plane/src/routes/execution.ts:1328,1368`) and `useLiveRun` fetches one page per stream event (`screens/Execution.tsx:371-409`), so a finished run with more than 500 lines shows only the first 500, labelled "500 lines". (2) `useLiveRun` never clears its `error` (`screens/Execution.tsx:382`), so one failed poll replaces the whole run page with a red notice (`screens/RunPage.tsx:161`), and `useFlowRunLive` stops polling after one failed read (`screens/Flows.tsx:600`). (3) The runs inspector decides between a script run and a flow run from in-memory state (`screens/Runs.tsx:295-299`), so reloading or sharing `?run=<flow run id>` shows an error. **Verified**, 03 part B. Defect 1 should be confirmed on a seeded instance |
| Change | Page through logs until done, and state truncation if a cap is kept. Clear the error on the next successful read, and show a transient failure as a small "Reconnecting" state beside content that stays visible. Resolve the run kind from the server on a deep link |
| User benefit | The log a user reads is the whole log. A network blip does not erase the evidence on screen. A shared link opens what was shared |
| Complexity | M |
| Depends on | Nothing |
| Risks | Fetching very long logs at once. Page on demand with a "Load earlier lines" control until P1-6 adds virtualisation |
| Acceptance | A run with 1,200 log lines shows 1,200, or says "showing the last N of 1,200". A simulated failed poll leaves the run visible with a reconnecting indicator, and recovers. `?run=` with a flow run ID opens after reload |
| Metric | Task success on J11 and J17. Severe failure rate |

### P0-6. Truthful interface

| Field | |
| --- | --- |
| Affects | `SH-PALETTE`, data sources, dashboards, `WS-SCRIPT-EDITOR`, `WS-SETTINGS` |
| Problem and evidence | (1) The shortcut sheet lists "`j k` — Move through a list" (`kit/CommandPalette.tsx:744`). No handler exists. **Verified**. (2) A failed data-source test is announced with `notify.success` (`screens/Data.tsx:1068-1072`). **Verified**. (3) Dashboards says "saved as you make it" (`screens/Dashboards.tsx:62`) and needs a manual Save. **Verified**. (4) A new script's starter imports `z`, which Monaco's stub types do not export (`editor/monaco.ts:39-41`), so line 1 shows an error before the user types. **Observed**, O8. (5) The first "Save and run" of a new script remounts the editor (`key={rest}`, `screens/Tenant.tsx:520`), so the result panel likely never appears. **Inferred**. (6) Monaco is recreated on every keystroke in the Path field (`editor/CodeEditor.tsx:99`). **Inferred**. (7) ⌘↵ is a window listener and is probably swallowed while the editor has focus. **Inferred**. (8) The `promote` button variant is defined and unused (`screens/Environments.tsx:481`). **Verified** |
| Change | Remove the `j k` line until P3-1 implements it. Use the danger tone for a failed test. Correct the Dashboards copy or make it true. Export `z` from the stub. Keep the editor mounted across the first save. Decouple Monaco's lifetime from the path label. Register ⌘↵ as a Monaco action |
| User benefit | A user can trust what the interface says. A first-time author's first minute is not an error squiggle and a vanished result |
| Complexity | S. Each is small. Items 5 to 7 need confirming on a running instance first |
| Depends on | Nothing |
| Risks | None beyond regression in the editor's mount logic |
| Acceptance | The shortcut sheet lists only shortcuts that a test triggers. A new script opens with zero diagnostics. An e2e test creates a script, presses ⌘↵ with focus in the code, and sees the result |
| Metric | J1 to J5 success rate and time. Errors on first use |

### P0-7. Orientation for assistive technology

| Field | |
| --- | --- |
| Affects | `SH-SHELL`, every route. `kit/brand.tsx`, `router.tsx`, `Shell.tsx`, `packages/ui/src/Toast.tsx` |
| Problem and evidence | `document.title` is set once to the product name (`kit/brand.tsx:44`), so every tab and history entry reads the same. **Observed**, O11. There is no skip link, and eight tab stops precede content. **Observed**, O11. Focus does not move on route change (`router.tsx:6-10`). Toasts, including API errors, disappear after 5 s with `role="status"` and cannot be paused (`packages/ui/src/Toast.tsx:35,56-59,84`). Run state changes and 45 "Loading…" states are not announced. **Verified**, 05 |
| Change | A title per route in the form "Object · Section · Workspace · Product". A skip link as the first tab stop. Focus to the `h1` on navigation. Error toasts use `role="alert"` and stay until dismissed. Other toasts pause on hover and focus. A polite live region announces run state changes on run pages |
| User benefit | Screen-reader users know where they are after every navigation. Everyone gains useful tab titles and history entries, and errors that do not vanish while being read |
| Complexity | M |
| Depends on | Nothing. P2-8 later rebuilds Toast and keeps these rules |
| Risks | Moving focus on every query-string change would be disruptive. Move it on path changes only |
| Acceptance | Each route in the e2e walk has a distinct title. The first Tab on any page reaches the skip link. After navigation, focus is on the `h1`. An error toast is still present after 30 s |
| Metric | WCAG failures for 2.4.1, 2.4.2, 2.4.3, 2.2.1 and 4.1.3: 0 |

### P0-8. Non-drag flow building

| Field | |
| --- | --- |
| Affects | `WS-FLOW-EDITOR`, the read-only flow graph. `screens/FlowEditor.tsx`, `FlowGraph.tsx` |
| Problem and evidence | Steps can be connected only by dragging between handles (`screens/FlowEditor.tsx:236,248-261,1067`). The inspector has no "goes to" control. Error paths and branch cases are also drag-only. This fails WCAG 2.5.7 and 2.1.1, and it is the audit's one critical accessibility finding. Handles are 6 × 6 px. Read-only graph nodes are focusable but remove their outline inline (`FlowGraph.tsx:250`), so focus is invisible. Edges have no accessible name, and there is no list of steps outside the canvas. **Verified**, 05 |
| Change | In the step inspector: "Then go to" and "On failure go to" pickers, and add, remove and reorder for branch cases. A step outline panel that lists steps in order, selects on `Enter`, and mirrors the canvas. Handles with a 24 px hit area. A drawn focus ring on nodes. Accessible names on edges. The inspector scrolls inside its own region when stacked, so it is not clipped below 1024 px or at high zoom (05, A11Y-10, to confirm at run time) |
| User benefit | A flow can be built and edited entirely from the keyboard. Pointer users gain a faster way to wire a long flow than dragging across the canvas |
| Complexity | L |
| Depends on | Nothing. P1-8 builds on the same inspector controls |
| Risks | Two ways to edit the same graph must stay in step. Route both through the existing history module so undo covers them |
| Acceptance | A keyboard-only e2e test builds a three-step flow with one error path, saves it and tests it. axe reports no violations on the editor. Handles measure 24 px or more |
| Metric | Core actions keyboard-accessible. WCAG critical failures: 0. J7 and J8 time |

### P0-9. Safe destruction

| Field | |
| --- | --- |
| Affects | `WS-APP-BUILDER`, `WS-APPS`, `WS-CONNECTIONS`, `WS-SECRETS`, `WS-TABLES`, `ListScreen.tsx` (`CreateDialog`) |
| Problem and evidence | "Remove this widget" has no confirmation and autosaves (`screens/Interfaces.tsx:1200-1204, 1434-1445`), and the builder has no undo. "Stop sharing" has no confirmation and also removes the group's table bindings (`screens/Apps.tsx:195-216`). Unbind and Delete secret confirmations do not list what uses the thing, although the data is already loaded (`screens/Execution.tsx:635`, `screens/Tenant.tsx:706`). "Delete for good" on a table uses a plain confirmation (`screens/Data.tsx:668-674`). `CreateDialog` keeps typed values, including passwords, after Cancel, and silently defaults selects: "Create workspace" defaults to Dev. **Verified**, 03 parts B and C |
| Change | Undo for widget removal, as a toast action now and through history in P2-10. A confirmation for "Stop sharing" that names the bindings removed. Every destructive confirmation lists what is affected, from the references already loaded. Type-to-confirm for irreversible data deletion. `CreateDialog` resets on close and requires an explicit choice where a wrong default is costly |
| User benefit | Users see the blast radius before they act, and a slip in the builder is recoverable |
| Complexity | M |
| Depends on | P1-10 improves the reference lists. This item can use today's data |
| Risks | Too many confirmations train users to click through. Confirm only what cannot be undone, and prefer undo |
| Acceptance | Each destructive action either offers undo or shows a confirmation naming the affected objects with counts. Reopening a cancelled create dialog shows empty fields |
| Metric | Errors and severe failures in J18, J19, J26 and J27 |

### P0-10. One-time secrets

| Field | |
| --- | --- |
| Affects | `AC-APIKEYS`, `TN-SERVICE-ACCOUNTS`, `TN-WORKERS`. `screens/Account.tsx`, `screens/Execution.tsx` |
| Problem and evidence | New API keys and new worker credentials are shown once with no Copy button (`screens/Account.tsx:51-56`, `screens/Execution.tsx:1081-1088`), while SCIM tokens and recovery codes have one. The worker start command is a sentence with placeholders, `platform-worker --url <this instance> --token <credential>` (`screens/Execution.tsx:1037`), so the address and token are typed in by hand. **Verified**, 03 part C |
| Change | One `OneTimeSecret` component (08): the value in mono, Copy, a "shown once" statement, and a confirmation before closing if it has not been copied. The worker command is a copyable block with the instance address and credential filled in |
| User benefit | The one moment a secret is visible is the moment it is easiest to copy correctly |
| Complexity | S |
| Depends on | Nothing |
| Risks | None |
| Acceptance | Every shown-once value has Copy and a close guard. The worker command pastes and runs unchanged |
| Metric | J21c and J21f time and errors |

---

## P1. High-frequency workflow improvements

These are the screens and journeys developers and operators use daily: finding a run, reading a failure, getting to the code, fixing it, and shipping the fix.

### P1-1. Runs list

| Field | |
| --- | --- |
| Affects | `WS-RUNS`. `screens/Runs.tsx` |
| Problem and evidence | Rows are 57 px, or 82 px with a tag, in a hand-rolled table (`screens/Runs.tsx:316-339, 397-435`). The first row starts 282 px down the page, and about 10 rows fit in 900 px. "Waiting for approval" overflows the Status column into the next. The second line repeats "Script · attempt 1 of 3" on every row. **Observed**, O3 to O5. There is no sort, no run ID in the row, no row actions and no multi-select. The API's `target`, `from`/`to` and multi-tag filters are never sent (`screens/Runs.tsx:132-137`). "Cancel queued runs" ignores the current filters. "Started" shows the received time. Loaded pages and scroll position are lost on Back. **Verified**, 03 part B |
| Change | Single-line rows at standard density. Columns in priority order: State, Target with a kind icon, Result (error summary or output summary), Trigger, Started, Duration, Attempt when above 1, Run ID. One toolbar row: search, state chips, kind and period as menus, target filter, tags. Sort by started and duration. A sticky header. Row actions: open, re-run, cancel, copy ID, copy link. Everything in the URL. Built on `DataTable` |
| User benefit | Two to three times as many runs on screen, with the reason for each failure readable without opening it. Operators see patterns such as "everything from one trigger since 14:00" at a glance |
| Complexity | L |
| Depends on | P2-2 (`DataTable`), P2-6 (URL state), P0-3 |
| Risks | Users of the two-line layout lose the visible attempt count on every row. Show it only when above 1, and keep comfortable density as an option |
| Acceptance | At 1440 × 900, 20 or more rows are visible. No cell overflows its column at 1280 px or wider. Every filter survives reload and Back. The list is operable by keyboard |
| Metric | Time on task for J10, J15 and J16. Interactions to reach a failed run's error: 2 → 1, because it is in the row |

### P1-2. Flow run page

| Field | |
| --- | --- |
| Affects | `WS-RUN-FLOW`. `screens/Flows.tsx` (`FlowRunView`), `screens/RunPage.tsx` |
| Problem and evidence | The failed step is not selected on open. The banner reads "The flow failed." and neither names nor links to the step (`screens/Flows.tsx:679`). The page says "Choose a step to see what it produced." **Observed**, O7. The selected step is not in the URL (`:628`). Flow input and output are never shown. Step input is never shown. Step errors get no diagnosis. The graph overlays the current definition, not the run's version (`:629`, **Inferred** risk). The step panel is in a pre-redesign visual style. **Verified**, 03 part B |
| Change | Open with the failed step selected, or the running or waiting step. Put the step in the URL as `?step=`. The header reads "Failed at `place_order`: The supplier refused." and links to that step. The step panel shows input, output or error, logs, timing split into wait and run, and "Open script". The page shows flow input and output. The graph is drawn from the run's bundle version |
| User benefit | Opening a failed flow run answers "what failed, where and why" with no further click. A link to a failed step can be pasted into a ticket |
| Complexity | M. Auto-selection and the banner are a quick win. Step input needs the API to return it |
| Depends on | Backend: step input in the flow-run response. The run's version of the flow definition |
| Risks | Step input may be large or sensitive. Apply the same redaction as run input |
| Acceptance | Opening a failed flow run shows the failed step's error with zero clicks. Reloading with `?step=` restores the selection. The graph matches the run's version when the flow has changed since |
| Metric | J11: 5–6 interactions with one Back → 1. Time on task for J11 |

### P1-3. Context continuity

| Field | |
| --- | --- |
| Affects | `WS-RUN-SCRIPT`, `WS-RUN-FLOW`, `WS-SCRIPT-EDITOR`, `WS-FLOW-EDITOR`, `WS-SCRIPTS`, `WS-FLOWS`, `SH-SHELL` |
| Problem and evidence | From a production failure to a fix, the user re-finds the object. "version N" on a run links to the generic deployments list, not the source at that version (`screens/RunPage.tsx:113`). The read-only notice in production has no link to the dev workspace (`screens/Authoring.tsx:681`). Switching workspace keeps only the section and drops the object and the query (`Shell.tsx:766-769`). "promotes to X" in the header is plain text (`Shell.tsx:783-785`). A step's script run does not link back to its parent flow run. "Retry from the failed step" always runs the run's original version (`screens/RunPage.tsx:485-492`), so after a fix is promoted the only option that uses it re-runs every step from the start (`:494-504`). The whole loop costs 27 interactions, 11 page loads, two workspace switches and two re-finds. **Verified**, 04 §4 |
| Change | On a run: "View source at v4", read-only at the run's version with the failing line marked when the error has a location, and "Edit in dev", which opens the same path in the linked dev workspace's editor with the failed run's input loaded into the test pane. On any script, flow or trigger: a control that opens the same object in the linked workspace. The workspace switcher keeps the object when it exists there. Step runs link to their parent flow run |
| User benefit | The developer goes from "it failed in production" to "I am editing the code with the failing input" in two clicks, without searching for the script by name |
| Complexity | L |
| Depends on | Backend: source by bundle version (bundles carry sources since phase 8). P2-6 for carrying state in the URL |
| Risks | The dev workspace's draft may differ from what failed in production. Show "You are editing the draft. Production runs v4." with a diff link |
| Acceptance | From a failed production script run, reaching the dev editor with the failed input loaded takes 2 interactions and no typing. From a failed flow step, 3 |
| Metric | Production failure to actionable debugging context: 2 navigational transitions or fewer. Repeated object lookups in the loop: 1 → 0 |

### P1-4. Script editor as a workspace

| Field | |
| --- | --- |
| Affects | `WS-SCRIPT-EDITOR`, the extensions editor. `screens/Authoring.tsx`, `editor/CodeEditor.tsx` |
| Problem and evidence | Code gets about 39% of a 1440 × 900 viewport, at a fixed 34rem height (`screens/Authoring.tsx:708`). The Settings tab opens first. Test output renders below the fold (`:726`), so code and output are never visible together. The output tab resets on every run (`key={testRun}`, `:738`), so each debug iteration costs two clicks and two scrolls. Nothing is resizable. Monaco diagnostics show only as squiggles. There is no ⌘S. The input schema is a JSON textarea. **Verified**, 03 part A; **Observed**, O8 |
| Change | A full-height two-pane layout with a draggable, persisted divider. Left: code. Right: a test pane with input as a schema form, Run, and tabs for Result, Logs and Problems that keep their selection between runs. Settings move to a collapsible panel. Problems are a clickable list with a count in the tab. ⌘S saves and ⌘↵ runs, registered inside Monaco. A run error with a location jumps to the line. A "Runs" tab lists recent runs of this script |
| User benefit | The edit-run-read cycle happens in one view with no scrolling. This is the product's primary authoring loop |
| Complexity | L |
| Depends on | P0-4, P0-6, `SplitPane` from 08. Backend: error locations mapped through the source map for line jumps |
| Risks | A layout change to the most-used editor. Ship behind a preference for one release and compare task times |
| Acceptance | At 1440 × 900 the code pane is at least 55% of the viewport, and code and the latest result are visible together. A debug iteration is one key chord. Pane sizes survive reload |
| Metric | J3 to J5: clicks per debug iteration 2 → 0, scrolls 2 → 0. Time on task for J1 to J5 at least 20% lower |

### P1-5. Deploy and promote hand-offs

| Field | |
| --- | --- |
| Affects | `WS-SCRIPT-EDITOR`, `WS-FLOW-EDITOR`, `WS-RELEASE`, promotion. `screens/Release.tsx`, `screens/Promotion.tsx` |
| Problem and evidence | Deploying leaves the editor for Release and deploys every draft at once (`screens/Release.tsx:357`). Deploy and promote success are inline notices with no next step (`:158`, `:557`). The Promote step is not in the URL (`:117`). After a fix, getting a new production run takes a second workspace switch and a manual re-run. **Verified**, 04 |
| Change | A "Deploy" control in the editor header with two choices: this change only, or review all drafts. A success message that links forward: "Deployed as v5. Promote to Clinics" and then "Promoted. Re-run the failed run on v5". The release step in the URL |
| User benefit | Shipping a one-line fix does not require understanding the whole release screen, and each success leads to the next action |
| Complexity | M |
| Depends on | P2-8 (toasts with actions). Backend: deploying a subset of drafts, if not already supported |
| Risks | Deploying one draft may leave it inconsistent with other drafts it depends on. Run the same validation as a full deploy and name the conflicts |
| Acceptance | From a saved draft, deploying it to dev takes 2 interactions without leaving the editor. Each success state offers the next step as a link |
| Metric | The continuity loop in 04 §4: 27 interactions → 10 or fewer |

### P1-6. LogViewer v2

| Field | |
| --- | --- |
| Affects | `WS-RUN-SCRIPT`, `WS-RUN-FLOW`, the flow test panel. `packages/ui/src/LogViewer.tsx` |
| Problem and evidence | The viewer has search as a filter, a minimum level, wrap, follow and download. It lacks match highlighting with next and previous, copy, line numbers, expandable structured fields, attempt separators (the API sends `attempt` and the UI drops it), virtualisation, and a follow mode that pauses on scroll. Its height is fixed at 28rem. **Verified**, 03 part B |
| Change | Fill the available height. Virtualise rows. Search highlights matches with a count and next and previous (`Enter`, `Shift+Enter`), with a toggle to filter. Line numbers, and a link to a line as `#L42`. Copy a line, a selection, or all. Structured fields collapse to one line and expand in place. A separator between attempts. Follow pauses on scroll up and offers "Jump to latest". Level filter as chips with counts |
| User benefit | Logs are the main evidence in debugging. A user can find the error among thousands of lines, keep context around it, and send a colleague the exact line |
| Complexity | L |
| Depends on | P0-5. The kit default stays compatible for tenant apps |
| Risks | Virtualisation breaks browser find. The viewer's own search must be good enough, and ⌘F inside it should focus that search |
| Acceptance | 50,000 lines scroll smoothly. Search steps through matches. A URL with `#L42` opens scrolled to that line. Everything is keyboard-operable |
| Metric | Time on task for J17. SEQ for J11 and J17 |

### P1-7. Live state made explicit

| Field | |
| --- | --- |
| Affects | `SH-SHELL`, `WS-RUNS`, run pages, `WS-OVERVIEW`, `TN-APPROVALS`. `stream.ts`, `screens/Execution.tsx` |
| Problem and evidence | The only connection indicator is "Live" or "Live · updates every 5s" in the runs header, shown only while a live row is loaded (`screens/Runs.tsx:215-220`). No screen shows reconnecting, stale, or last-updated. Running runs have no elapsed timer (`screens/Execution.tsx:59`). Queue wait is not computed. Reconnection is left to the browser (`stream.ts:61-120`). **Verified**, 01 and 03 part B |
| Change | A `LiveIndicator` in the shell header with three states: Live, Reconnecting, and Offline with "last updated 14:02". A running run shows elapsed time that counts. Run pages split time into "waited 2.1 s · ran 3.0 s". Lists show when they were last refreshed while not live |
| User benefit | The user always knows whether what they see is current. "Is it stuck or just slow" is answered by a moving timer |
| Complexity | M |
| Depends on | Nothing |
| Risks | A header indicator that flickers on brief drops. Debounce the reconnecting state by a few seconds |
| Acceptance | Cutting the stream in a test shows Reconnecting, then Offline with a time, and returns to Live on recovery. A running run's timer advances each second |
| Metric | SEQ on J10. Hesitation points related to staleness in usability sessions |

### P1-8. Flow building friction

| Field | |
| --- | --- |
| Affects | `WS-FLOW-EDITOR`, the flow test panel. `screens/FlowEditor.tsx`, `screens/FlowSteps.tsx` |
| Problem and evidence | New steps land unconnected at the far right (`screens/FlowEditor.tsx:572-585`). Plain scripts are not in the palette, and a script step's input is one free-text expression although the script's schema is already loaded (`:1271-1277` against `:412`). Renaming a step does not rewrite expressions that refer to it (`:603-621`). Problems are a count and a full-width notice whose items cannot be clicked (`:946-954`). A flow with a non-manual trigger or with no draft cannot be tested without changing it (`:732-738`). "Test part of the flow" does not exist. Step logs require leaving the editor. Fit-to-view re-runs on every add and on every test toggle. **Verified**, 03 part A |
| Change | Add a step after the selected one, already connected. Scripts searchable in the palette. A script step's inputs rendered as a schema form, each field accepting a value or an expression. Rename rewrites references and says how many. Problems are a list that selects the step and focuses the field. "Test from this step" with the previous run's outputs as inputs. Step logs inside the test panel. Fit only on open and on request |
| User benefit | Building a flow from three scripts drops from 15 interactions (11 clicks, 3 drags and 1 field) to roughly 8 with no drags, and a rename can no longer silently break a flow |
| Complexity | L |
| Depends on | P0-8 shares the inspector's connection controls. Backend: starting a test run from a step with supplied upstream outputs |
| Risks | Rewriting expressions must be exact. Parse them. Do not use text replacement |
| Acceptance | Adding a script step after a selected step produces a connected step with a form for its inputs. Renaming a step referenced twice updates both. Clicking a problem focuses its field |
| Metric | J7 to J9 interactions and time. Errors caused by a broken reference: 0 |

### P1-9. Scheduling in context

| Field | |
| --- | --- |
| Affects | `WS-SCRIPTS`, `WS-FLOW-VIEW`, `WS-TRIGGERS`, the resource editor, `WS-FLOW-EDITOR`. `screens/ScheduleForm.tsx` |
| Problem and evidence | There is no entry point from a script or a flow, so the target is picked again: 9 interactions plus the form's fields, 2 to 3 pages and one sheet. Three scheduling paths differ. The sheet defaults to the browser's time zone, the resource page to UTC (`screens/ResourceEditor.tsx:72`), and the flow's schedule trigger is a bare cron field with no zone and no preview (`screens/FlowEditor.tsx:1138-1148`). **Verified**, 04 J20 |
| Change | "Add trigger" on a script or flow, with the target filled in. One schedule form used in all three places: presets, cron with validation, an explicit time zone that defaults to the workspace's zone, the next five run times, and an overlap policy where supported. The object's page lists its triggers with pause and fire-now |
| User benefit | Scheduling is done from the thing being scheduled, and the same input always produces the same schedule |
| Complexity | M |
| Depends on | A workspace time-zone setting, if one is added. Otherwise the browser's zone with the zone always shown |
| Risks | Changing the default zone on the resource page changes behaviour for people used to UTC. Show the zone prominently and do not migrate existing schedules |
| Acceptance | Scheduling a script from its page takes 5 interactions or fewer on one page. All three entry points render the same form and produce the same trigger for the same input |
| Metric | J20: 9 interactions plus fields and 2–3 pages → 5 or fewer and 1 page |

### P1-10. References as links

| Field | |
| --- | --- |
| Affects | `WS-CONNECTIONS`, `WS-SECRETS`, `WS-VARIABLES`, `WS-SCRIPTS`, `WS-FLOWS`, `WS-TRIGGERS`, `WS-EVENTS`, `TN-APPROVALS`. `kit/references.tsx` |
| Problem and evidence | "Used by" shows unlinked text and puts the full list in a `title` tooltip (`kit/references.tsx:19-30`), which is unreachable by keyboard and on touch. A script does not link to its runs or its triggers. A flow step does not link to its script. Connections, variables, secrets, events and approvals have no URL of their own, so palette results for them open only the list. **Verified**, 01 link matrix |
| Change | An object page or addressable inspector for every entity (06 §6.3). A `ReferenceList` component: each user of a thing as a link with its kind and workspace, the full list in a panel, never in a tooltip. On a script or flow: tabs or links for Runs, Triggers and Used by. Every path, ID, version, connection name and trigger name shown anywhere is a link to its home |
| User benefit | "Where is this used" and "what runs this" are one click with a complete, navigable answer. Links can be shared for every object |
| Complexity | L |
| Depends on | P2-6 for inspector URLs. P2-3 for the page header |
| Risks | Many new routes. Keep one pattern so they are cheap |
| Acceptance | Every entity in the entity list of 01 has a URL that opens it. Every "Used by" entry is a link. The link matrix in 01 has no "missing" cell among the core entities |
| Metric | J19: 2 clicks to a truncated, unlinked answer → 1 click to a complete, linked one. Unnecessary navigation across journeys |

---

## P2. Design-system consistency and information architecture

This level replaces several implementations of each pattern with one. It is where most of the long-term gain is, and it is what makes P3 and P4 cheap.

### P2-1. Token foundation v2

| Field | |
| --- | --- |
| Affects | Everything. `packages/ui/src/tokens.css`, `apps/console/src/styles.css` |
| Problem and evidence | Sixteen spacing steps with 22 distinct gap values. 187 arbitrary type sizes, with no role for 13 px or 16 px. Four input heights. A hard-coded 4 px radius in 17 places. Unnamed shadows and z-index values. **Verified**, 02 |
| Change | The tokens in 07: spacing scale, ten type roles, three control heights with a console density context, radius, elevation, layer, icon and motion tokens, and a base reset for paragraph and heading margins |
| User benefit | Indirect but large: toolbars that align, text sizes that mean something, and screens that look related because they are |
| Complexity | M for the tokens. The replacement of call sites is mechanical and can be done by codemod, screen by screen |
| Depends on | P0-2, so that colour values are final |
| Risks | A sweeping visual change. Use visual regression (P2-12) and migrate one area at a time. The kit's defaults for tenant apps must not move |
| Acceptance | No arbitrary type size, spacing, radius, shadow or z-index remains in `apps/console/src` or `packages/ui/src` outside the motif files. Tenant app screenshots are unchanged |
| Metric | Design-system consistency score per screen. Audit rubric totals |

### P2-2. One DataTable

| Field | |
| --- | --- |
| Affects | Every list: about 50 call sites. `ListScreen.tsx`, `kit/ListCollection.tsx`, `kit/CollectionView.tsx`, `packages/ui/src/Table.tsx`, hand-rolled tables in Runs, Roles, RowRules and Execution |
| Problem and evidence | Six list implementations: `ListScreen` 13 uses, ui `Table` used directly 14, `CollectionView` 16, `ListCollection` 3, `Grid` 1, and five hand-rolled tables. Only `ListScreen` offers retry. Only `CollectionView` has selection and keyboard support. `Pagination` has no consumer. Rows range from 31 to 57 px. A user meets four "open a row" behaviours across four admin screens. **Verified**, 02 and 03 part C |
| Change | The `DataTable` in 08, built from `CollectionView`, which is the closest today. One behaviour for density, column priority, sort, selection, row actions, keyboard, paging, and loading, empty and error states, with view state in the URL. Migrate in order of traffic: Runs, then the workbench lists, then admin lists |
| User benefit | A list is learned once. Keyboard users get one model everywhere. Batch actions and saved views later have one home |
| Complexity | XL in total. The component is L. The migration is incremental |
| Depends on | P2-1, P2-4, P2-6 |
| Risks | The largest refactor in this plan. Keep old and new side by side, migrate one screen per change, and compare screenshots. `ListScreen`'s create dialog becomes a separate concern |
| Acceptance | One list implementation remains outside `Grid`. A lint rule rejects raw `<table>` in screens. Every list has the same keyboard model and the same three states |
| Metric | Design-system consistency. Keyboard-accessible core actions. Time on task for list-heavy journeys |

### P2-3. One PageHeader and Breadcrumb

| Field | |
| --- | --- |
| Affects | Every screen. `kit/layout.tsx` (`PageHeader`), `ListScreen.tsx` (`Page`), `Shell.tsx` |
| Problem and evidence | Seven page-header variants and six back patterns. Three neighbouring screens show "Runs › r1", "All scripts" and "Flows /". **Observed**, O10. Inside a workspace the section name in the shell header is screen-reader-only (`Shell.tsx:788`). `FlowView` still uses the pre-redesign `Page` with an "All flows" link (`screens/Flows.tsx:381,409`). **Verified**, 02 |
| Change | One `PageHeader` with two forms: list (title, count, primary action, toolbar) and object (state plus name, actions, meta line, tabs). One `Breadcrumb` in the shell header showing Workspace › Section › Object. Back links inside pages are removed |
| User benefit | "Where am I and how do I get back" has one answer on every screen |
| Complexity | M |
| Depends on | P2-1 |
| Risks | Editors have custom toolbars. They keep them and use the shared breadcrumb |
| Acceptance | One header component is used by every screen. The shell breadcrumb is visible on every workspace and tenant route. No in-page back link remains |
| Metric | Information architecture score. Backtracks in journeys |

### P2-4. LoadState

| Field | |
| --- | --- |
| Affects | Every screen that loads data |
| Problem and evidence | 37 bare "Loading…" paragraphs, some rendering `null` instead. `Skeleton` exists and the console never uses it. Of 112 danger notices, 9 offer a retry. The client drops the server's request ID (`api.ts:5-24`). `CollectionView` errors have no retry. `ConnectionGroups` once rendered nothing when empty. **Verified**, 02 |
| Change | One `LoadState` wrapper: skeletons shaped like the content after a delay, an error state with what failed, Retry and the request ID with copy, and an empty state with the primary action. `ApiError` keeps the request ID |
| User benefit | Loading looks like what is coming. An error can be retried in place and reported with an ID that support can find |
| Complexity | M |
| Depends on | Nothing. Adopted through P2-2 for lists |
| Risks | Skeleton flashes on fast loads. Delay them by about 300 ms |
| Acceptance | No bare "Loading…" paragraph remains outside code-split fallbacks. Every load error offers Retry and shows a request ID |
| Metric | Error recovery score. Perceived performance ratings |

### P2-5. Status system

| Field | |
| --- | --- |
| Affects | Every screen that shows state. `kit/status.tsx`, `packages/ui/src/Badge.tsx` |
| Problem and evidence | `StatePill` (63 uses), `Badge` (48) and `Tag` (47) all carry lifecycle state. Draft and Deployed are a `Badge` in the script and resource editors and a `Tag` in the flow editor. "Active" is teal in `screens/Account.tsx:46` and green in `screens/Members.tsx:196`. The state map is copied four times. Canceled and skipped look identical. The "Waiting" chip merges approval waits and time waits. **Verified**, 02 |
| Change | The rule in 08: `StatePill` for lifecycle state, `Tag` for classification, a count badge for counts only. One state map, with an `unknown` state. Distinct icons for canceled and skipped. Separate filter chips for the two kinds of waiting |
| User benefit | The same state looks the same everywhere, so it is recognised and not re-read |
| Complexity | S to M. Mostly replacement |
| Depends on | P0-1 for `unknown` |
| Risks | None |
| Acceptance | No `Badge` renders a lifecycle state. One state map exists. A test asserts each state's icon, word and colour |
| Metric | Feedback and system state score. Design-system consistency |

### P2-6. URL state

| Field | |
| --- | --- |
| Affects | Every screen with filters, tabs, steps or a selection. `router.tsx` |
| Problem and evidence | Only Runs and the selected trigger keep view state in the URL. Filters, tabs, search and selection on Flows, Scripts, Events, Approvals, Release, Tables, Audit, Members and Apps are component state. A reload in the middle of SSO setup returns to the list. Every query-state write uses `replaceState` (`router.tsx:48`), so Back never closes an inspector or undoes a filter. There is no scroll restoration. **Verified**, 01 |
| Change | A small typed helper over `useQueryValue` for tabs, steps, filters, search, sort and selection. Opening an object or inspector pushes a history entry. Changing a filter replaces. Scroll position and loaded pages are restored on Back |
| User benefit | Any view can be shared, bookmarked or reloaded. Back does what users expect |
| Complexity | L. The helper is S. Adoption is per screen |
| Depends on | Nothing. Best done with P2-2, so lists get it for free |
| Risks | Long URLs. Keep parameter names short and omit defaults |
| Acceptance | For each screen, reloading reproduces the view. Back closes an open inspector before leaving the screen |
| Metric | Context switches and backtracks. Repeated object lookups |

### P2-7. Forms

| Field | |
| --- | --- |
| Affects | Every form. `packages/ui/src/Fields.tsx`, `Form.tsx`, `ListScreen.tsx` (`CreateDialog`), settings screens |
| Problem and evidence | Field errors are not linked with `aria-describedby` (`packages/ui/src/Fields.tsx:20-23`), and required fields are not marked. Invalid fields get red text and no border. The save model is mixed even within one page: Branding autosaves a checkbox, needs an explicit save for the theme, and uploads the logo immediately. Dirty state shows only as a disabled Save in four places. Role editing, group membership and end-user attributes are configuration inside modals. **Verified**, 03 part C and 05 |
| Change | `FormField` with linked errors, required marks and an invalid border. One save model per surface, stated in the UI: explicit save with a dirty-aware `SaveBar`, or autosave with a visible "Saved" state. Never both on one page. Configuration moves from modals to drawers or pages. `SecretField` for write-only values |
| User benefit | Users know whether their change is saved and what is wrong with a field. Screen-reader users hear the error with the field |
| Complexity | L |
| Depends on | P0-4 for the dirty model. P2-1 |
| Risks | Changing save behaviour on settings screens surprises existing users. Prefer explicit save with a clear bar |
| Acceptance | Every field error is announced with its field. Every page has one save model and shows its state. No configuration with more than three fields lives in a modal |
| Metric | Errors in J18 and J21. Accessibility failures for 3.3.1 and 3.3.2 |

### P2-8. Feedback

| Field | |
| --- | --- |
| Affects | Every write action. `packages/ui/src/Toast.tsx`, `ask.tsx`, `packages/ui/src/Button.tsx` |
| Problem and evidence | Toasts are text-only with no link, action or undo. Only 12 of 40 files that perform writes ever show a success toast, and most other writes show nothing. Buttons have no loading state: 72 `disabled={busy}` sites, of which 5 change the label. There is no pressed style. There are no optimistic updates, and any write invalidates the whole tenant's reads (`api.ts:83-89`). **Verified**, 01 and 02 |
| Change | Toast v2: a title, an optional link to the result, an optional action such as Undo, persistent errors, and the roles from P0-7. A `loading` state on `Button`. A rule that every write confirms itself, either in place (the row updates, the state changes) or with a toast that names the result. Optimistic updates for reversible toggles such as pause and resume |
| User benefit | The user always knows an action worked and can go straight to what it produced |
| Complexity | M |
| Depends on | P0-7 |
| Risks | Toast fatigue. Prefer in-place confirmation and use toasts when the result is elsewhere |
| Acceptance | Every write in the e2e walk produces visible confirmation within 1 s. Create actions link to what was created |
| Metric | Feedback and system state score. SEQ across journeys |

### P2-9. Data grid

| Field | |
| --- | --- |
| Affects | `WS-TABLE-ROWS`, data source browsing. `packages/ui/src/Grid.tsx`, `screens/Data.tsx` |
| Problem and evidence | `Grid` is a table of buttons (`packages/ui/src/Grid.tsx:146-158`): no cell navigation, every cell a tab stop, commit on blur, no undo. Rows are about 41 px, and "Compact" reaches only about 37 px (`screens/Data.tsx:188`). Filters refetch on every keystroke (`:208-212`). The header is not sticky. `id` and timestamps are the last columns (`:578-582`). Sort, filter and page are not in the URL. There is no multi-select. The row sheet is modal and read-only (`:281-312`). A double click on Next may push the same cursor twice (`:270-275`, **Inferred**). **Verified**, 03 part B |
| Change | A grid following the WAI-ARIA grid pattern: arrow keys between cells, `Enter` or `F2` to edit, `Esc` to cancel, one tab stop. A sticky header and a pinned identifier column. Debounced filters. 28 px compact rows. URL state. Row selection with batch delete. An editable, non-modal row inspector. CSV export |
| User benefit | Browsing and correcting table data works like a spreadsheet, which is what users expect of a grid |
| Complexity | L |
| Depends on | P2-1, P2-6. The kit default stays compatible for tenant apps |
| Risks | Tenant apps use `Grid`. Add the new behaviour as opt-in until they are checked |
| Acceptance | The grid passes the ARIA grid keyboard tests. Editing a cell and pressing `Esc` restores it. 10,000 rows page without layout shift |
| Metric | J25 time and interactions. Accessibility failures on tables |

### P2-10. App Builder and Dashboards

| Field | |
| --- | --- |
| Affects | `WS-APP-BUILDER`, dashboards. `screens/Interfaces.tsx`, `screens/Dashboards.tsx` |
| Problem and evidence | About 200 px of chrome sits above the canvas. The widget palette is below the canvas (`screens/Interfaces.tsx:1399-1410`). The inspector is a fixed 320 px and drops under everything below 1280 px (`:1312, 1414`). Nothing is resizable. There is no outline of the page's widgets. There is no undo, although `kit/history.ts` exists and the flow editor uses it. Publish deploys with no summary (`:1683-1706`). "Not saved" is muted grey text (`:1737`). The phone and tablet preview narrows the wrapper while the layout uses viewport breakpoints, so it is not what a phone shows (`packages/screens/src/Renderer.tsx:854, 869`, **Inferred**). Dashboards and the App Builder are two copies of one editor with different save models. **Verified**, 03 part B |
| Change | A canvas-first layout: palette and outline on the left, canvas in the centre, a resizable inspector on the right, one toolbar. Undo and redo through the existing history module. A publish dialog that summarises what changes for whom. A visible save state. A device preview that uses container queries or an iframe. One editor component for both apps and dashboards, with the difference expressed as the publishing step |
| User benefit | The page being built is the largest thing on screen, mistakes are reversible, and what is published is known beforehand |
| Complexity | XL |
| Depends on | P0-9, P3-5 (`SplitPane`), P2-7. The 2,092-line `Interfaces.tsx` should be split as part of this |
| Risks | The largest single-screen change. Do it after the editor patterns are proven on the script editor (P1-4) |
| Acceptance | The canvas is at least 60% of the viewport at 1440 × 900. Every edit can be undone. Publish shows a summary. The device preview matches a real device at the same width |
| Metric | J26 interactions (14–18 today) and time. Errors in the builder |

### P2-11. Admin information architecture

| Field | |
| --- | --- |
| Affects | `TN-MEMBERS`, `TN-ACCESS`, `TN-SERVICE-ACCOUNTS`, `TN-SSO`, `TN-DOMAINS`, `TN-AUDIT`, `TN-WORKERS` |
| Problem and evidence | Adding a member grants nothing. The role is given on another tab through a native select that mixes up to several hundred principals. Service accounts are split between an inspector and a detail page that never shows the account's name and cannot grant access. The SSO provider and its six tabs, the Domains sheet, and every audit filter are component state. Audit search and its kind chips filter only the 50 loaded rows, targets show as IDs, and there is no actor or target facet, permalink or export, so "who changed X" can silently miss. Worker pools are cards (`screens/Execution.tsx:951`). **Verified**, 03 part C |
| Change | "Give access" that starts from the person: choose the principal, the role and the scope in one step, offered at the end of "Add member". One service-account page with identity, keys, access and agent tools. SSO, Domains and audit state in the URL. Server-side audit search with actor, action, target and time facets, linked target names, a permalink per entry and CSV export. Worker pools as a table |
| User benefit | Access is granted where the person is added. An audit question gets a complete answer |
| Complexity | L |
| Depends on | P2-2, P2-6, P1-10. Backend: audit search and facets |
| Risks | Audit search over a partitioned log needs indexes. Check with the retention design in `docs/evolution` |
| Acceptance | Adding a member with a role in one workspace takes one flow on one screen. An audit search for an object returns every entry in the retention period, not only the loaded page |
| Metric | J21a, J21c, J21e and J21g interactions and success rate |

### P2-12. Enforcement

| Field | |
| --- | --- |
| Affects | The build, CI, `IN-KIT`. `biome.json`, `e2e/redesign.spec.ts`, `screens/KitSheet.tsx` |
| Problem and evidence | Biome's `noAlert` works, a test keeps token copies in step, and e2e checks horizontal overflow at three widths in both themes. Nothing checks type sizes, component choice, contrast, control sizes or unused exports. E2E takes screenshots without comparing them, and its "data" entry lands on the 404 page (`e2e/redesign.spec.ts:147`). No axe or other automated accessibility check exists. `KitSheet` documents only the console kit. `text-[13px]` grew from 87 to 101 uses in the console since the last audit. **Verified**, 02 and 05 |
| Change | The checks in 07 §7.14: lint rules for sizes and primitives, a token contrast test, screenshot comparison in e2e, axe in component and e2e tests, keyboard-path e2e tests for the core journeys, and a kit sheet that renders every component in every state and density |
| User benefit | Indirect: the consistency gained by this plan does not erode |
| Complexity | M |
| Depends on | P2-1 for the rules to be satisfiable. Add the rules as warnings first, then as errors per directory as each is migrated |
| Risks | Flaky screenshot tests. Use the mocked-API harness from this audit for deterministic data |
| Acceptance | CI fails on an arbitrary type size, a raw `<table>` in a screen, a contrast regression, an axe violation, or an unintended visual change |
| Metric | Design-system consistency over time. WCAG failures: 0 and staying 0 |

### P2-13. First run and empty states

| Field | |
| --- | --- |
| Affects | `IN-TENANTS`, `SH-GATE`, `TN-WORKSPACES`, `WS-OVERVIEW`, `WS-SCRIPTS`, `WS-FLOWS`, every empty state |
| Problem and evidence | A tenant's creator is not made a member (`apps/control-plane/src/routes/tenants.ts:168-203`), so the operator meets the access-grant gate on a tenant they just created. From there it takes two workspace dialogs, an implicit worker requirement and no templates: about 31 interactions to a first run, with no checklist. Never-deployed draft scripts appear absent from the Scripts list (**Inferred**). There is no Tooltip component and no link to documentation anywhere in the console. **Verified**, 03 part C and J21i |
| Change | Offer the creator membership or an automatic setup grant. A first-run checklist on the workspace overview that reflects real state: workspace, worker online, first script, first run, first deploy. Two or three starter templates for scripts and flows that run unchanged. Drafts shown in lists with a Draft tag. Empty states that offer the console action and the CLI command. "Learn more" links to the docs beside complex concepts |
| User benefit | A new operator reaches a first successful run in minutes without reading the README |
| Complexity | M |
| Depends on | P3-1's Tooltip is helpful and not required. Backend: the membership change is a product decision for the owner |
| Risks | Auto-membership changes the operator-access model, which is deliberately strict. A time-limited setup grant keeps the model |
| Acceptance | On a fresh instance, a first successful script run takes 12 interactions or fewer with no documentation. The checklist updates as each step completes |
| Metric | J21i: about 31 interactions → 12 or fewer. First-run completion rate |

---

## P3. Advanced expert efficiency

These make experienced users faster. They assume the P2 foundations, because a keyboard model or a saved view is only worth building once.

### P3-1. Keyboard system

| Field | |
| --- | --- |
| Affects | Every screen. A new shortcut registry, `kit/CommandPalette.tsx`, a new Tooltip |
| Problem and evidence | Implemented shortcuts are few: ⌘K, `?`, ⌘↵ in the script editor, ⌘Z and its variants in the flow editor, Enter and Space on rows and nodes, and arrows on tabs. There is no ⌘S, no go-to chord and no list movement. The `?` sheet is not reachable from visible UI. `?` is a single-key shortcut with no way to turn it off (WCAG 2.1.4). ⌘K overrides Monaco's chord prefix. There is no Tooltip component: about 77 native `title` attributes stand in. **Verified**, 01 keyboard table |
| Change | One registry that declares each shortcut with its scope, keys and label, and drives the handlers, the sheet, menu hints and tooltips. List movement: `j`/`k` and arrows, `Enter` to open, `Esc` to close, `x` to select, `/` to focus search. Go-to chords: `g r` runs, `g f` flows, `g s` scripts, `g t` triggers, `g o` overview. ⌘S in editors. A Tooltip component that shows the label and the shortcut. The sheet in the account menu. A setting to turn off single-key shortcuts |
| User benefit | Frequent paths cost a keystroke, and the interface teaches the keys where the actions are |
| Complexity | L |
| Depends on | P2-2, so list movement is built once. P0-6 has already removed the false `j k` claim |
| Risks | Single-key shortcuts firing while typing. The registry ignores them when focus is in an editable element |
| Acceptance | Every shortcut in the sheet has a test. Every action with a shortcut shows it in its tooltip or menu item. Single-key shortcuts can be turned off |
| Metric | Core actions keyboard-accessible: 90% or more. Keyboard usage share. Time on high-frequency tasks |

### P3-2. Command palette v2

| Field | |
| --- | --- |
| Affects | `SH-PALETTE`. `kit/CommandPalette.tsx` |
| Problem and evidence | The palette searches nine resource kinds, runs by ID or tag and people, and runs eight to ten actions. It has no loading state, and a search error reads as "Nothing matches" (`kit/CommandPalette.tsx:234-253,645-648`). It has no commands for the open object, no pins, and no deploy, promote, cancel or approve. Results for connections, events, apps and people open only their list (`:127-147`). An empty query lists screens first. **Observed**, O14. On phones it is full-screen with no close button. **Verified**, 01 |
| Change | Empty query: commands for the open object, then recent and pinned objects, then go-to. Results grouped by kind, each opening its object. Loading and error rows. Release and approval actions with confirmation. Each row shows its shortcut. A close button on narrow widths |
| User benefit | The palette becomes the fastest route to both any object and any action on the current one |
| Complexity | M |
| Depends on | P1-10 for object URLs. P3-1 for the registry |
| Risks | Destructive actions in a palette. Confirm them with the standard dialog |
| Acceptance | With a run open, "Re-run" is the first result on an empty query. Every result opens an object. A failed search says so |
| Metric | Interactions to reach a known object. Palette usage share |

### P3-3. Multi-select and batch actions

| Field | |
| --- | --- |
| Affects | `WS-RUNS`, `TN-APPROVALS`, `WS-TRIGGERS`, `WS-RELEASE` drafts, `WS-TABLE-ROWS` |
| Problem and evidence | The one bulk action is "Cancel queued runs", which ignores the current filters. No list supports selecting several rows. **Verified**, 03 part B |
| Change | A checkbox column and `x`, `Shift`-click and `Shift`-arrow selection in `DataTable`, with a batch bar: Runs (cancel, re-run), Approvals (approve or reject with one comment), Triggers (pause, resume), Drafts (discard), table rows (delete). "Select all matching the filter" where the server supports it |
| User benefit | An incident that needs forty runs cancelled or re-run takes one action |
| Complexity | M per screen once `DataTable` has selection |
| Depends on | P2-2. Backend: batch endpoints or bounded client-side fan-out |
| Risks | Batch destructive actions. Confirm with the count and a sample |
| Acceptance | Selecting 25 runs and re-running them takes 3 interactions and reports per-item results |
| Metric | Time on batch tasks. Interaction count |

### P3-4. Saved views, columns and density

| Field | |
| --- | --- |
| Affects | `WS-RUNS`, `TN-AUDIT`, `WS-EVENTS`, `WS-TABLE-ROWS` |
| Problem and evidence | No list has saved filters, column choice or a density setting. Recents are stored on the server. Nothing else is. **Verified**, 01 |
| Change | Named views per list (filters, sort, columns), private by default and shareable by link. Show, hide and reorder columns from a menu, with keyboard reordering. A compact or standard density preference per user |
| User benefit | "Failed in the last day from the billing triggers" is one click every morning |
| Complexity | L |
| Depends on | P2-2, P2-6. Backend: storing views with user preferences |
| Risks | Preference writes must not be audited as changes. `docs/evolution` already separates preferences from audited writes |
| Acceptance | A saved view restores filters, sort and columns. Its link opens the same view for another member |
| Metric | Time on J15 and J16 for returning users |

### P3-5. Resizable, persisted workspaces

| Field | |
| --- | --- |
| Affects | `WS-SCRIPT-EDITOR`, `WS-FLOW-EDITOR`, `WS-APP-BUILDER`, run pages, list plus inspector |
| Problem and evidence | Nothing is resizable or collapsible. Panel state, the selected step, the canvas viewport, the Settings or Try it tab and filters are not persisted. Only node positions are. **Verified**, 03 part A |
| Change | The `SplitPane` in 08: drag and keyboard resize, double-click to reset, collapse, sizes stored per user and screen. Remember the last tab and selection per object for the session |
| User benefit | Each user sets the proportions that fit their screen once |
| Complexity | M |
| Depends on | Introduced by P1-4. This item extends it to the other workspaces |
| Risks | A pane dragged too small to find. Enforce minimum sizes and a reset |
| Acceptance | Pane sizes survive reload on each workspace screen. Every divider is operable by keyboard |
| Metric | SEQ on editor journeys |

### P3-6. Flow canvas power tools

| Field | |
| --- | --- |
| Affects | `WS-FLOW-EDITOR` |
| Problem and evidence | There is no copy, paste or duplicate, no context menu, and no bulk action. The inspector shows only the first of several selected nodes. Branch cases cannot be reordered. **Verified**, 03 part A |
| Change | Duplicate (⌘D), copy and paste within and between flows, a context menu on nodes and on the canvas, delete and move for a multi-selection, and reordering of branch cases |
| User benefit | Repetitive flow building is faster |
| Complexity | M |
| Depends on | P0-8, P1-8 |
| Risks | Pasted steps with colliding names. Rename with a suffix and rewrite internal references |
| Acceptance | Duplicating a step produces a valid, uniquely named step in one action, covered by undo |
| Metric | J7 and J8 time for experienced users |

### P3-7. Run comparison

| Field | |
| --- | --- |
| Affects | `WS-RUN-SCRIPT`, `WS-RUN-FLOW` |
| Problem and evidence | A run page does not say what changed since the last successful run. Of the eleven questions a run page should answer, this is the one answered nowhere. **Verified**, 03 part B |
| Change | On a failed run: "Last succeeded 2 h ago on v3" with a comparison of version, input, duration and, where the version differs, a source diff. A link to that run |
| User benefit | The most common cause of a new failure, a change, is shown, not hunted for |
| Complexity | L |
| Depends on | P1-3 for source at a version. Backend: previous successful run of the same target |
| Risks | Misleading when the input differs. Show input differences first |
| Acceptance | A failed run whose previous success was on another version shows the version change and a diff link |
| Metric | Time on J11 and J12. SEQ |

### P3-8. Wide-screen layouts

| Field | |
| --- | --- |
| Affects | `WS-RUNS`, run pages, `WS-OVERVIEW`, lists with an inspector |
| Problem and evidence | At 2200 px the runs list's "What" column is about 1240 px wide and mostly empty. **Observed**, O3. Workbenches have no cap and pages share one 1440 px cap. **Verified**, 02 |
| Change | From 1920 px: list and detail side by side, a three-pane run page (steps, logs, input and output), and an overview that uses a third column. No column grows past its content |
| User benefit | Developers on large monitors see more of the system at once |
| Complexity | M |
| Depends on | P2-2, P3-5 |
| Risks | Layouts to test. Limit to the screens listed |
| Acceptance | At 2200 × 1100 no column is more than twice its content width, and the run page shows logs and input together |
| Metric | Density scores. Ratings from users on wide screens |

---

## P4. Visual refinement and micro-polish

These are last because their value depends on everything above. Several become nearly free once the tokens and components exist.

### P4-1. Page chrome diet

| Field | |
| --- | --- |
| Affects | Every workbench |
| Problem and evidence | On Runs, the first row starts 282 px down: a 26 px title, a description sentence, a row of labelled controls and a row of chips. On a phone, 480 px precede the first row. **Observed**, O3 and O15 |
| Change | 20 px titles. Descriptions behind a help control after first view. Filters on one toolbar row. Field labels inside the toolbar as placeholders with accessible names |
| User benefit | More of the screen shows data |
| Complexity | S, once P2-3 exists |
| Depends on | P2-1, P2-3 |
| Risks | New users lose the explanatory sentence. Keep it in the empty state and behind the help control |
| Acceptance | On each workbench at 1440 × 900 the first data row starts within 160 px of the top |
| Metric | Density and hierarchy scores |

### P4-2. Fewer boxes

| Field | |
| --- | --- |
| Affects | Settings, SSO, release, account, flow view |
| Problem and evidence | About 35 nested bordered boxes, mostly a `Notice` inside a panel. The worst is `screens/SingleSignOn.tsx:372-411`. Workspace settings has four single-sentence cards, one under a label that repeats its heading. **Verified**, 02; **Observed**, O13 |
| Change | The containment rules in 07 §7.5: no panel in a panel, borderless notices inside panels, settings as rows |
| User benefit | Less visual noise, with grouping still clear |
| Complexity | M |
| Depends on | P2-1 |
| Risks | Groups that read as merged. Check each screen against the spacing rule |
| Acceptance | The nesting scan from the audit reports zero bordered containers inside bordered containers, outside theme previews |
| Metric | Visual craft score |

### P4-3. Icons

| Field | |
| --- | --- |
| Affects | Everything. `packages/ui` |
| Problem and evidence | Seven icon sizes between 12 and 18 px. Stroke 1.75 in five places and 2 elsewhere. Text glyphs in the kit. **Verified**, 02 |
| Change | Three sizes, one stroke through a wrapper, lucide icons in the kit |
| User benefit | A more even texture, and close and check marks that match across kit and console |
| Complexity | S |
| Depends on | P2-1 |
| Risks | Tenant apps see the kit's glyphs change to icons. Low |
| Acceptance | Only sizes 14, 16 and 20 are used outside the brand mark and motifs |
| Metric | Visual craft score |

### P4-4. Motion

| Field | |
| --- | --- |
| Affects | Overlays, the running state, live rows |
| Problem and evidence | One transition exists in the product. Overlays appear abruptly. Running has no motion. **Verified**, 02 |
| Change | The four motion tokens in 07 §7.10, a rotating running indicator, and a fade for rows that arrive live |
| User benefit | Overlays show where they came from, and a running run looks alive |
| Complexity | S |
| Depends on | P2-1 |
| Risks | Motion that slows experts. Keep it under 240 ms and never block input |
| Acceptance | Every transition uses a token. All are absent under reduced motion |
| Metric | Visual craft score. No increase in time on task |

### P4-5. Production signal

| Field | |
| --- | --- |
| Affects | `SH-SHELL`, the workspace switcher, tags |
| Problem and evidence | Production is a 10.5 px amber tag (`Shell.tsx:772`, `kit/status.tsx:126-131`). The same amber marks "Paused" and "Instance · operator". "promotes to X" is plain text. **Verified**, 01 |
| Change | Three agreeing marks for production: the header tag, the switcher entry, and a thin amber rule under the header. "Instance · operator" becomes a neutral tag |
| User benefit | Nobody acts in production believing it is dev |
| Complexity | S |
| Depends on | P0-2 for the amber value |
| Risks | Over-signalling. One rule, one tag |
| Acceptance | In a usability test, every participant states the environment correctly when asked without scrolling |
| Metric | Wrong-environment errors: 0 |

### P4-6. Data formatting

| Field | |
| --- | --- |
| Affects | Every screen showing times, durations or IDs |
| Problem and evidence | Durations are formatted in five places with different results ("1.2s" and "1.2 s"). Dates in six. A `code` helper is pasted into six files. Run page timestamps wrap onto two lines. "Took" renders with a wide gap before the unit. **Verified**, 02; **Observed**, O5 and O6 |
| Change | The formatting module in 07 §7.3, an `Identifier` component with copy, and right-aligned numeric columns |
| User benefit | Values can be compared down a column and copied reliably |
| Complexity | S |
| Depends on | Nothing |
| Risks | None |
| Acceptance | One module formats every duration and time. No timestamp wraps at 1280 px or wider |
| Metric | Data readability score |

### P4-7. Truncation and overflow polish

| Field | |
| --- | --- |
| Affects | Lists at narrow widths, long paths, status columns |
| Problem and evidence | Paths wrap mid-word on phones ("billing/record-p / ayment") and error text truncates to "The SMS gateway …". "Waiting for approval" overdraws the next column. **Observed**, O4 and O15 |
| Change | Middle truncation for paths and IDs, end truncation for prose, the full value on hover and focus, and columns sized to their longest label |
| User benefit | Identifiers stay recognisable when space is short |
| Complexity | S |
| Depends on | P2-2 |
| Risks | None |
| Acceptance | No text overdraws another element at 390, 768, 1280 and 1440 px in the e2e walk |
| Metric | Visual craft and readability scores |

---

## Quick wins

These need no new architecture and can ship first, in any order. Together they remove most P0 risk and several daily irritations.

| # | Quick win | From | Size |
| --- | --- | --- | --- |
| 1 | Error boundary around the work surface, and an `unknown` state | P0-1 | S |
| 2 | Stop the `/api/v1null` request | P0-1 | S |
| 3 | Change the seven contrast token values | P0-2 | S |
| 4 | Make Runs rows keyboard-operable and linked | P0-3 | S |
| 5 | `Esc` and focus handling on the docked inspector | P0-3 | S |
| 6 | `beforeunload` and a router guard on the script and resource editors | P0-4 | S |
| 7 | Clear the sticky error in `useLiveRun` and keep polling flow runs | P0-5 | S |
| 8 | Page through logs past 500 lines | P0-5 | S |
| 9 | Resolve the run kind on a `?run=` deep link | P0-5 | S |
| 10 | Remove the `j k` line from the shortcut sheet | P0-6 | S |
| 11 | Danger tone for a failed data-source test. Correct the Dashboards copy | P0-6 | S |
| 12 | Export `z` from the editor's type stub | P0-6 | S |
| 13 | Per-route `document.title` | P0-7 | S |
| 14 | Skip link, and focus to the `h1` on navigation | P0-7 | S |
| 15 | Error toasts persist and use `role="alert"` | P0-7 | S |
| 16 | Visible focus on read-only graph nodes | P0-8 | S |
| 17 | Confirmation for "Stop sharing". Undo toast for "Remove this widget" | P0-9 | S |
| 18 | Copy on new API keys and worker credentials | P0-10 | S |
| 19 | Select the failed step when a flow run opens, and name it in the banner | P1-2 | S |
| 20 | Link "version N" on a run, and link the production read-only notice to dev | P1-3 | S |
| 21 | Size the runs Status column to "Waiting for approval" | P4-7 | S |
| 22 | One state map, and no `Badge` for state in the editors | P2-5 | S |

## Architectural work

These change shared structure. Each should have a short design note before work starts, because other items build on them.

| Item | Why it is architectural | Unblocks |
| --- | --- | --- |
| P2-1 Token foundation | Changes every screen's sizes | Everything in P2 and P4 |
| P2-2 DataTable | Replaces six list implementations | P1-1, P3-1, P3-3, P3-4, P3-8, P4-7 |
| P2-6 URL state | Changes how every screen holds view state | P1-1, P1-3, P1-10, P2-11, P3-4 |
| P2-3 PageHeader and Breadcrumb | Changes every screen's frame | P1-10, P4-1 |
| P2-4 LoadState | Changes every screen's loading and error path | P2-2 |
| P2-8 Feedback | Changes how every write confirms | P1-5 |
| P0-4 Navigation guard | Adds a blocking hook to the router | P2-7 |
| P1-10 Object URLs | Adds routes for five entity kinds | P3-2 |
| P3-1 Shortcut registry | One source for handlers, hints and the sheet | P3-2, P3-6 |
| `SplitPane` (P1-4, P3-5) | A new layout primitive | P1-4, P2-10 |
| P2-12 Enforcement | Changes CI | Keeps all of the above |

## Sequencing

Five stages. Each ends in something that can be released and measured. Stage 0 comes first because it produces the baseline everything else is judged against.

```
Stage 0  Baseline            10-validation-plan: seeded instance, task timings, axe run, screenshots
   │
Stage 1  Trust               Quick wins 1–22  →  the rest of P0 (P0-4, P0-8, P0-9, branding check)
   │
Stage 2  Foundations         P2-1 tokens → P2-4 LoadState → P2-6 URL state → P2-2 DataTable (Runs first)
   │                         P2-3 header/breadcrumb · P2-5 status · P2-8 feedback · P2-12 enforcement
   │
Stage 3  The core loop       P1-1 runs list · P1-2 flow run · P1-6 logs · P1-7 live state
   │                         P1-4 script editor · P1-8 flow building · P1-9 scheduling
   │                         P1-10 references → P1-3 continuity → P1-5 hand-offs
   │
Stage 4  Breadth             P2-7 forms · P2-9 grid · P2-11 admin · P2-13 first run · P2-10 builder
   │                         migrate remaining lists to DataTable
   │
Stage 5  Expert and polish   P3-1 keyboard → P3-2 palette · P3-3 batch · P3-4 views · P3-5 panes
                             P3-6 canvas · P3-7 comparison · P3-8 wide · P4-1 … P4-7
```

### Why this order

1. **Baseline before change.** Without it, no later claim of improvement can be supported (10).
2. **Trust before polish.** A console that can blank itself or lose a script is not made better by a denser runs list.
3. **Foundations before the core loop,** but only the foundations the loop needs. `DataTable` is built for Runs first, so stage 3 can start while the remaining lists migrate in stage 4.
4. **The core loop before breadth.** Scripts, runs and flows are used daily. Admin screens are used weekly or less.
5. **Expert features last.** They are cheap on one list and one registry, and expensive on six lists.

### Dependencies at a glance

| Item | Waits on |
| --- | --- |
| P1-1 | P2-2, P2-6, P0-3 |
| P1-3 | P1-10, P2-6, source by version (backend) |
| P1-4 | P0-4, P0-6, `SplitPane` |
| P1-5 | P2-8 |
| P1-8 | P0-8 |
| P2-2 | P2-1, P2-4, P2-6 |
| P2-10 | P0-9, P1-4 (pattern), P3-5 |
| P2-11 | P2-2, P2-6, audit search (backend) |
| P3-1 | P2-2 |
| P3-2 | P1-10, P3-1 |
| P3-3, P3-4 | P2-2 |
| P4-* | P2-1 |

### Backend work this plan needs

The plan is a UI plan, and a few items need the API to return more. None changes the platform's model.

| Need | For |
| --- | --- |
| Step input in the flow-run response | P1-2 |
| Flow definition and script source at a bundle version | P1-2, P1-3, P3-7 |
| Error location mapped through the source map | P1-4 |
| Deploy a subset of drafts | P1-5 |
| Start a flow test from a step with supplied upstream outputs | P1-8 |
| Previous successful run of a target | P3-7 |
| Audit search with facets | P2-11 |
| Batch run and approval endpoints | P3-3 |
| Storage for saved views and density with user preferences | P3-4 |
| Request ID exposed to the client on errors | P2-4 |

## What should not change

Recommendations to leave alone are as much a part of the plan as changes. The full list is in [06-design-direction.md](06-design-direction.md) §6.1. In short: the colour roles, the shell's regions, the overviews' "Needs attention" pattern, state as icon plus word, the production read-only rule, the operator-access model, `SchemaForm`, the flow editor's undo model, the copy style, and Base UI under the kit.

## Risks to the plan as a whole

| Risk | Mitigation |
| --- | --- |
| A redesign applied everywhere at once, then partly reversed. Figma's account of UI3 is the warning cited in the research report | Stages that release separately. Old and new components side by side during migration |
| Scores from code review are wrong about what users find hard | Stage 0's usability sessions come first and may reorder P1 |
| Inferred defects that are not real | Each is marked. Confirm on a seeded instance before scheduling |
| The kit's defaults moving for tenant apps | Console density through its own theme layer. Screenshot tests on the example apps |
| Density gained at the cost of readability | Density applies to operational tables only, with a per-user preference, and is tested in sessions |
| The plan grows | P3 and P4 are optional until P0 to P2 targets in 10 are met |
