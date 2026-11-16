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
