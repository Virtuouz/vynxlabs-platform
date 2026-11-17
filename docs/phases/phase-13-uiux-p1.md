# Phase 13: the debugging and authoring loop (UI/UX audit P1)

Status: Milestone 0 (plan) on branch `phase-13-uiux-p1`.
Last updated: 2026-11-16

The UI/UX audit ranks ten items as P1 in [09-prioritized-uiux-roadmap.md](../uiux/09-prioritized-uiux-roadmap.md). They cover the screens used every day: find a run, read the failure, reach the code, fix it, ship the fix. Today that loop takes 27 interactions, 11 page loads, two workspace switches and two re-finds of the same object ([04 §4](../uiux/04-workflow-journey-audit.md)). Each item was re-checked against `main` at `744293a`. All hold, apart from what phase 12 already fixed (keyboard rows, log paging, `Reconnecting`).

| What fails | What it looks like | Cause |
| --- | --- | --- |
| Runs list (P1-1) | About 10 runs fit on a screen. "Waiting for approval" overflows its column. There is no sort, no run ID, no row actions. "Cancel queued runs" ignores the filters and cancels flow steps too | A hand-rolled two-line table. The API's `target`, `to` and multi-tag filters are never sent, and the activity route has no sort |
| Flow run page (P1-2) | A failed flow run opens on "Choose a step". The banner doesn't say which step failed. Step input and flow input are never shown | Selection is component state. The graph is drawn from today's definition |
| Context continuity (P1-3) | From a production failure, the developer has to find the script again in dev. "version N" leads to the deployments list | No source at a version, no link between linked workspaces, a switcher that drops the object |
| Script editor (P1-4) | Code takes 39% of the screen. Test output is below the fold. The output tab resets on every run | A fixed `34rem` editor, Settings first, `key={testRun}` |
| Deploy and promote (P1-5) | Deploying leaves the editor and deploys every draft. Success ends in a notice that leads nowhere | No deploy in the editor. Notices instead of toasts with a next step |
| Logs (P1-6) | Search hides lines instead of finding them. No line numbers, links, copy or attempt separators. Every line is a DOM node | The viewer is a plain list at a fixed 28rem |
| Live state (P1-7) | Nothing says whether the page is current. A running run has no timer | The stream exposes only a boolean, and browsers do the reconnecting |
| Flow building (P1-8) | New steps land unconnected far to the right. Renaming a step silently breaks expressions. Problems can't be clicked | No insertion point. Rename touches only ids and edges |
| Scheduling (P1-9) | Three scheduling paths with three different zone defaults. A flow's schedule is a bare cron field | No entry from the object. No workspace zone |
| References (P1-10) | "Used by" is unlinked text with the rest in a tooltip. Connections, variables, secrets, events and approvals have no URL | No object pages |
| One list, URL state (P2-2, P2-6) | Six list implementations with four ways to open a row. Back never closes an inspector. Filters vanish on reload | Each screen keeps its own view state, written with `replaceState` |

**Exit criterion:** the Acceptance rows of P1-1 to P1-10, P2-2 and P2-6 in the roadmap pass. In short:
- 20 or more runs fit at 1440 × 900, with no overflowing cell;
- a failed flow run opens on its failed step's error;
- a failed production run reaches the dev editor, with its input loaded, in two interactions;
- code and its latest result are visible together;
- one draft deploys from the editor in two interactions;
- 50,000 log lines scroll smoothly, and `#L42` links work;
- a cut stream shows Reconnecting, then Offline;
- a rename rewrites references;
- a script is scheduled from its page in five interactions or fewer;
- every core entity has a URL;
- one list implementation remains;
- every screen's view survives reload and Back.

## Owner decisions

| Area | Decision |
| --- | --- |
| Shape | One branch, `phase-13-uiux-p1`, with sixteen milestones built one after another, one commit each |
| Foundations | All of P2-2 (every list on one `DataTable`) and P2-6 (URL state everywhere), plus `SplitPane`. P2-1 tokens and the P2-3 page header are not in scope |
| Script editor | The new layout replaces the old one outright, and pane sizes persist |
| Time zone | A new workspace time-zone setting, default `UTC`. Schedule forms default to it and always show it. Existing schedules are unchanged |
| Backend extras | Source maps for console-written scripts, testing a flow from a step, payload redaction, and object pages for connections, variables, secrets, events and approvals |

**Taken while planning:**
- **Redaction** happens on the server as payloads are read, so the API, the CLI and the console all see the same thing.
  - A value is masked when its schema marks it `writeOnly`, `format: "password"` or `x-secret`, or when its key is on a deny list (password, secret, token, API key, authorization, cookie, private key, client secret).
  - What is stored is untouched.
- **Overlap.** Each schedule kind keeps its own overlap default.
- **The kit.** Its `Table` and `LogViewer` stay compatible for tenant apps.

## Milestones

| # | Milestone | Audit |
| --- | --- | --- |
| 0 | Branch and this document | |
| 1 | URL state: `useUrlState`, push for opening and replace for filtering, scroll restored on Back | P2-6 |
| 2 | `DataTable`: grid keyboard model, sort, selection, row actions, density, states, virtualisation | P2-2 |
| 3 | Runs list on `DataTable`; activity sort, `scheduledFor`, output summary, filter-scoped bulk cancel | P1-1 |
| 4 | Every other list on `DataTable`, and URL state on every screen | P2-2, P2-6 |
| 5 | Live state: stream status, `LiveIndicator`, elapsed timers, waited and ran | P1-7 |
| 6 | LogViewer v2 | P1-6 |
| 7 | Payload redaction | P1-2 risk |
| 8 | Flow run page: failed step first, `?step=`, step input, the graph at the run's version | P1-2 |
| 9 | Source maps for console-written scripts | P1-4, P1-3 |
| 10 | Script editor as a workspace: `SplitPane`, test pane, Problems, ⌘S | P1-4 |
| 11 | Object pages and references as links | P1-10 |
| 12 | Context continuity: source at a version, edit in dev with the failed input, a switcher that keeps the object | P1-3 |
| 13 | Deploy and promote hand-offs | P1-5 |
| 14 | Flow building: connected insertion, script inputs, rename that rewrites, clickable problems, test from a step | P1-8 |
| 15 | Scheduling in context, and the workspace time zone | P1-9 |
| 16 | Changelog, docs, the whole e2e suite | |

Findings are recorded under each milestone as it lands.

## Findings

### Milestones 1–4: URL state, one table, the runs list

- **`useUrlState` and `useUrlParam`** (`router.tsx`) hold a screen's view state in the query. Opening an item pushes a history entry, so Back closes it; filtering replaces. Each history entry has a key, and the scroll of `main` and of each table comes back on Back and Forward. A query-only push never asks the navigation guard.
- **`DataTable`** (`kit/DataTable.tsx`) is the one list. `CollectionView`, `ListCollection` and `ListScreen` remain, as frames around it that load data and hold the inspector and the create dialog. The plan was to delete the first two. They are kept because they no longer draw a table of their own, and "one list implementation" (P2-2) is met by the table. `enforce.test.ts` fails on any other `<table>` or the kit's `Table` in the console. Two native tables are allowed, each with a `table-allowed:` reason: the roles permission matrix, which is a form, and the run chart's numbers for screen readers.
- **The runs list.** Activity sorts by `started` or `duration` with a keyset cursor for each order. Runs and flow runs gain `output_summary`, written by the control plane when a run ends and masked with `kernel/execution/redact.ts`, because masking follows the script's schema and the database doesn't know it. Runs that ended before migration `0062` have no summary.
- **The bulk cancel bug was real.** "Cancel queued runs" cancelled every queued script run in the workspace, flow steps included. With the list's filters it now cancels only what the list shows, never a flow's step. The bare request, an operator clearing a backlog, keeps its meaning.
- **Tests** reset the query string after each test (`testing.tsx`), since a screen's state now outlives a render in the address.

### Milestone 5: live state

- **The stream's status.** `stream.ts` now keeps `connecting`, `live`, `reconnecting` and `offline`, plus when it was last live. "Reconnecting" shows only after 3 s down, so a brief drop doesn't flicker. "Offline" shows after 30 s down, or as soon as the browser reports no network.
- **Polling vs the label.** The raw `connected` flag is kept apart from the status, so screens start polling the moment the stream drops while the label waits out the debounce.
- **Reconnecting.** The browser retries an `EventSource` by itself, but gives up for good on some failures (`readyState` CLOSED). The console then reopens the stream itself, with the same 1.5–30 s backoff as failed reads.
- **The shell header** carries `LiveIndicator`.
- **Lists that aren't live** say "Updated 14:02", from the read's `dataUpdatedAt`, which `useLoad` now exposes as `updatedAt`.
- **Running runs** show elapsed time that counts each second (`kit/Elapsed.tsx`). Run pages and the inspector say "waited X · ran Y", with the wait counted from `scheduledFor` when a run was delayed.

### Milestone 6: LogViewer v2

- **Finding.** Search now finds and steps through matches: Enter and Shift+Enter, a count, and the matches highlighted. "Only matching" turns it back into a filter. ⌘F inside the viewer focuses its search, because long logs draw only the lines in view, where the browser's own find can't reach.
- **Line numbers** count from the start of the whole log (`firstLine`), so a page that holds only the newest lines still numbers them truly. A number copies a `#L42` link, and opening that address scrolls to the line and marks it.
- **Reading.**
  - Copy works on a line, the selection, or every line shown.
  - Fields fold to one line and open in place.
  - A mark separates the attempts (the API always sent `attempt`; `LogLine` now has it).
  - Follow pauses when the reader scrolls up, and offers "Jump to latest".
  - Level chips with counts replace the minimum-level select.
- **Long logs.** Rows are virtualised past 500 lines (`@tanstack/react-virtual`, now a kit dependency). The console's window rose from 5,000 lines to 50,000.
- **Compatibility.** The viewer's default height grew from 28rem to `min(70vh, 48rem)`, and `fill` makes it fill a flex parent. Every existing prop still works, which matters to tenant apps.
- **Zero sizes.** A list that measures zero height draws a screenful with estimated row heights instead of nothing. Without this the measure loops, and it is what keeps the virtual lists testable in happy-dom. DataTable got the same guard.

### Milestone 7: payload redaction

- **Where it applies.** `kernel/execution/redact.ts` masks on read. It applies to `GET runs/:id` (input and output, following the script's schema at the run's bundle), `GET flow-runs/:id` (flow input and output, and each step's output, with a code step following its script's schema) and the runs list's output summary.
- **What is masked.** A value is masked when its schema marks it `writeOnly`, `format: "password"` or `x-secret`, or when its key names a secret (`password`, `token`, `apiKey`, `authorization`, `clientSecret`, and keys ending that way).
- **What is not.** What is stored, what workers are given, and what a run again or a retry uses are the real values. A `{stored}` pointer to a large payload is left as it is, and no route serves stored payloads to readers.
- **MCP tool results** (`routes/mcp.ts`) are not masked. They are the answer to a call the agent made, not a display of a past run.
- **Re-run dialogs** (`InputDialog`) leave masked values out of the form, name them, and require them again. Submitting anything still masked is refused.

### Milestone 8: the flow run page

- **No new column.** Every kind of step already keeps what it was given: a code step's run has its input, a sub-flow's child run has its own, a foreach keeps its items and an approval its detail. `GET flow-runs/:id` gathers each step's `input` from there and masks it. The planned `step_run.input` column was not needed.
- **More masking.** Step `detail` in the flow-run response, and the detail approvers see in the approvals list, are masked as well.
- **`GET flow-runs/:id/definition`** returns the flow at the run's version. `changed` compares it with the workspace's active version, both read from bundles with keys in a stable order: the resource table keeps bodies in its own normalised form, so comparing against it said "changed" every time.
- **The page** opens on the failed step, or else the running or waiting one, and keeps the chosen step in `?step=`. The banner reads "Failed at `b`: …" and links to the step. A step shows its input, a diagnosis from its run's insight, "Open script", and wait and run times. The flow's own input and output are shown, and the graph is drawn as the run ran it, with a note when the flow has changed since.

### Milestone 9: source maps for code written in the console

- **The map.** Compose builds the console's section with an external source map. The bundle gains an optional `consoleSources` field: the sources, that map, and the line where the compiled section starts. It is covered by the digest, and `schemas/bundle.schema.json` is regenerated.
- **Lookup.** `insight` maps a stack frame below that line against the console's map, and one above it against the repository's map as before. So a failed draft, a test run or a deployed console script now has a `location`.
- **Build errors on save** already reached the console as `file:line` in each issue's `path`. That shape is kept, since the console and existing clients read it, rather than a new structure.
- **Correction to Milestone 7.** It changed what `webhooks.test.ts` sees: a field named `token` now comes masked from `GET runs/:id`. The test now reads the stored input, which is what it means to check, and asserts that the token is masked when shown. It was missed because Milestone 7 ran only part of the suite. Since then the whole suite runs before every commit that touches the server.

### Milestone 10: the script editor as a workspace

- **Layout.** `kit/SplitPane.tsx` puts the code and a test pane side by side, filling the height under the header. The divider drags, or moves with the arrow keys (Shift for bigger steps, Home and End to the limits). Its size is kept per editor, and the panes stack below 1024 px.
- **Why 70%.** At 1440 × 900 the shell's rail and section navigation take about 280 px, so the code's share of the split has to be 70% to give it the 55% of the viewport the acceptance row asks for.
- **The test pane** holds the input form and Run, then Result, Problems and Runs tabs. Which pane tab and which run tab is chosen is kept in this browser, so a second run shows the same tab as the first. The run panel takes its tab from the editor, as `key={testRun}` still remounts it.
- **Settings** fold away above the code, closed for a script that exists.
- **`CodeEditor`.**
  - `onMarkers` reports Monaco's diagnostics.
  - `reveal` shows a line, in Monaco or in the fallback text box.
  - `onSave` binds ⌘S inside Monaco. The page also listens for ⌘S, so the browser never saves the page.
  - The fallback text box handles ⌘S and ⌘↵ itself.
- **Problems** lists Monaco's errors and warnings and the server's build errors (`file:line` from a refused save or test run), each one a button to its line.
- **Going to a failure.** A failed run whose insight has a location (Milestone 9) offers "Go to line N".
- **Runs** lists this script's latest runs, tests included.

### Milestone 11: object pages and references as links

- **New pages.** Connections, variables, secrets, events and scripts each have a page (`screens/ObjectPages.tsx`) in one `ObjectPage` frame: where it is, kind and name, actions, facts, and tabs whose choice is in the address. A connection or variable page reads the new `GET connection-bindings/*` and `GET variable-values/*`, which share the list routes' logic. A secret page reads the list, since there is no secret to return but its name and when it was set. An event page reads its declaration. A script page lists its runs, triggers and users, beside the editor.
- **Approvals** are addressable already: the queue keeps the open approval in `?item=` (Milestone 4), which is the inspector tier of 06 §6.3. They got no page of their own.
- **References.** `objectHref` gives every kind its home. `ReferenceList` lists everything that uses a thing, drafts included and marked (`references?drafts=true`), each a link, with an error state of its own: a failed read no longer says "Nothing deployed uses it". `UsedBy` in lists links each user and sends "and N more" to the page's Used by tab, never to a tooltip.
- **Links.** List names link to their pages, a script's inspector links its connections, tables, secrets and variables, and flows show the triggers that start them and what uses them. The palette opens the new pages, though a script still opens its editor.
- **`GET triggers?target=`** came here from Milestone 15, since the pages needed it.
- **Flaky test.** `portability.test.ts` failed once in a full run and passed alone and in the next full run. A queued run can be claimed between the test listing it and cancelling it. Not caused by this phase; noted for later.

### Milestone 12: context continuity

- **Server.**
  - `script-source/*` takes `?run=` or `?bundle=`. A script written in the console is returned as its own one file from the bundle's manifest, and the response names `bundleVersion`.
  - `flow-runs/:id/retry` now allows `from: failed` on another version (`bundle: active`, or `bundleId` as a promotion answers). It refuses, naming them, when steps it would keep are different or missing in that version. New input is still refused for a step retry.
  - `retry-plan?bundle=` reports the target version and `changed`.
  - `runs/:id/rerun` takes `bundleId`.
- **The loop.**
  - A script run's "version N" opens the script page's Source tab: the code as that run ran it, with the failing line selected (Milestone 9's location).
  - "Edit in dev" opens the linked dev workspace's editor with `?fromRun=`. The editor loads that run's input, masked values left to enter again, and says which version the other workspace runs.
  - A step run links to its flow run, opened on its step, and no longer offers a re-run the server refuses.
  - A failed flow run offers "Retry from the failed step on vN (deployed now)" when a newer version keeps the same kept steps.
- **Moving between workspaces.**
  - The switcher keeps the object and its view when the other workspace has it (one `GET resources/*`), otherwise the section, and a list keeps its filters.
  - "promotes to X" is a link.
  - Production notices on the code, flow and resource editors link to the same thing in the dev workspace (`useDevWorkspace`).
