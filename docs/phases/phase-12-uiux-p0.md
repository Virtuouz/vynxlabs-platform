# Phase 12: trust and access (UI/UX audit P0)

Status: milestones 0–9 built on branch `phase-12-uiux-p0`.
Last updated: 2026-11-16

The UI/UX audit (`docs/uiux/`) ranks ten defects as P0 in [09-prioritized-uiux-roadmap.md](../uiux/09-prioritized-uiux-roadmap.md). Each was checked against the code at `caa1d1d` before this phase began, and each holds:

| What fails | What it looks like | Cause |
| --- | --- | --- |
| Crash containment (P0-1) | One unknown run state or a summary without `failedRuns` empties the whole console. Pages outside a workspace request `/api/v1null` | No error boundary. `StatePill` indexes `STATES` without a fallback. `useLoad`'s `reload` ignores a null path |
| Contrast (P0-2) | Table headers, hints and navigation labels fall below 4.5:1 in the light theme. No input boundary reaches 3:1 | Token values. No control-boundary token. Nothing checks branding |
| Keyboard reach (P0-3) | A run can't be opened from the runs list by keyboard. The docked inspector never takes or returns focus and ignores `Esc` | Rows are click-only. The inspector is a plain `aside` |
| Unsaved work (P0-4) | A click on the rail discards a script. A failing flow autosave retries every 1.5 s forever | No navigation guard and no `beforeunload`. Flow autosave waits for the first manual save and has no backoff |
| Run data (P0-5) | A finished run shows its first 500 log lines. One failed poll replaces the run page with an error. `?run=<flow run>` fails on reload | One logs page per event. The error is never cleared. Kind is decided from memory |
| Truthful interface (P0-6) | The shortcut sheet lists `j k`, which does nothing. A failed source test shows as success. A new script opens with an error on line 1 | Stale copy and stubs. Editor lifetime tied to the path |
| Orientation (P0-7) | Every tab has the same title. Focus stays on the old page. Error toasts vanish after 5 s | One title. No skip link or focus move. One toast duration and role |
| Non-drag flow building (P0-8) | Steps can be connected only by dragging between small handles | No connection controls outside the canvas |
| Safe destruction (P0-9) | A widget is removed and autosaved with no undo. "Stop sharing" also removes table bindings, unasked | No confirmation or undo. Confirmations don't list what is affected |
| One-time secrets (P0-10) | New API keys and worker credentials have no Copy. The worker command has placeholders | No shared one-time secret display |

**Exit criterion:** the Acceptance rows of P0-1 to P0-10 in the roadmap pass. In short:
- no screen can take the shell down;
- the token contrast test passes for both themes;
- a run can be opened, read and closed by keyboard;
- no editor loses changes on navigation or reload;
- logs past 500 lines show;
- the shortcut sheet lists only what works;
- every route has its own title;
- a flow can be built by keyboard;
- every destructive action confirms with what it affects or offers undo;
- every shown-once value has Copy.

## Owner decisions

| Area | Decision |
| --- | --- |
| Shape | One branch, `phase-12-uiux-p0`, in eleven milestones. One commit each |
| Contrast tokens | The new values go into the kit's defaults, so tenant apps get them too. Noted in the changelog for tenant developers. Themes that set these tokens keep their values |
| Unsaved work | A navigation guard and `beforeunload`. Script and resource drafts autosave about 3 s after the last edit once they exist as drafts, with a local recovery copy before that (see Milestone 8) |
| Branding contrast | Warn only. The branding editors show the ratio and a warning. Saving is still allowed, and the server is unchanged |

## Milestones

| # | Milestone | Roadmap |
| --- | --- | --- |
| 0 | This document | |
| 1 | Crash containment: error boundaries, an `unknown` state, no request to a null path | P0-1 |
| 2 | Truthful interface: the shortcut sheet, the failed-test toast, the Dashboards copy, the editor stub and lifetime, ⌘↵ in the editor, the `promote` variant | P0-6 |
| 3 | Orientation: titles per route, a skip link, focus on navigation, error toasts that stay, run state announced | P0-7 |
| 4 | Run data: logs past 500 lines, errors that clear, flow runs that keep polling, `?run=` by kind | P0-5 |
| 5 | Keyboard reach: runs rows, the docked inspector, row semantics, a visible dialog close | P0-3 |
| 6 | One-time secrets: one component with Copy and a close guard, and a worker command filled in | P0-10 |
| 7 | Safe destruction: undo for widgets, confirmations that name what they affect, type-to-confirm for purge, a create dialog that resets | P0-9 |
| 8 | Unsaved work: a navigation guard, draft autosave, and flow autosave with backoff | P0-4 |
| 9 | Contrast: token values, `line-control`, a contrast test, and a warning in the branding editors | P0-2 |
| 10 | Non-drag flow building: connection pickers, a step outline, larger handles, named edges, visible focus | P0-8 |

## Findings

Recorded per milestone as each lands.

### Milestone 1

**Boundaries sit where a failure should stop:**
- around the work surface, keyed on the path, so moving to another page starts clean;
- around each inspector's body, in both its docked and sheet forms;
- around the command palette and the shortcut list;
- around the whole console, as a last resort, inside the providers.

The navigation is outside the page's boundary, so a broken page can always be left.

**There is no route for client errors yet.** A caught error goes to the browser console. Sending it to the server log, as the roadmap suggests, needs a route, and is left for P2-4 with the request ID.

**`unknown` is a state of its own,** with a neutral icon and the word "Unknown". It is not "Note", which is what `stateOf` gave before. `StatePill` and `stateLabel` fall back to it for any value they don't know, so callers that pass the server's value straight through are covered without changes.

**The same missing-count crash was in two more places** than the audit found, the tenant and workspace overviews. `failedRuns` is now optional in the type, so the compiler finds any new use.

**`/api/v1null` came from TanStack Query.** `refetch()` runs even when a query is switched off. `useLoad`'s `reload` now does nothing without a path. The test reproduces the request without the fix.

### Milestone 2

**The three editor defects the audit inferred were checked in a browser,** by running the new `e2e/script-editor.spec.ts` against the console before and after the change:

| Audit claim | Before | After |
| --- | --- | --- |
| A new script opens with an error | One error squiggle on the starter | None |
| ⌘↵ is swallowed in the editor | Worse than inferred: nothing was saved or run, and Monaco inserted a blank line | Saves, runs, and shows the run beside the code |
| The first "Save and run" loses its result | Shown by a unit test: the run starts, its panel never appears | The panel appears, and the editor is the same one |
| Typing a path recreates the editor | It was recreated on every keystroke, but undo survived: Monaco restores a model's history when one is recreated at the same address | Not recreated. The label is updated in place |

**The editor now loads the SDK's own declarations,** not a hand-written stub, plus zod's, which the SDK hands scripts as `z`. The stub had also drifted in a way the audit didn't find: the poll source starter failed on `PollResult` and `PollTick`. Zod's declarations add about 245 KB to the editor's lazy chunk. Nothing else loads them.

**The editor's library is `es2023` plus `webworker`.** A script runs in Node, which has `fetch`, `URL` and `AbortSignal` but no `window` or `document`. The web worker library is the closest match Monaco ships. With `es2023` alone, the connector starter, and any script that calls `fetch`, showed errors.

**Milestone 1's page boundary was remounting the page on every address change,** because it was keyed on the path. That undid the first-save fix in the real console, though not in the unit test, which renders the screen without the shell. The e2e run found it. The boundary now clears a failure when the address changes and leaves a working page mounted.

**A new script's first save keeps its editor.** The address still changes from `…/new` to `…/edit/<path>`, but `useEditorKey` keeps the same key for that one step. The editor doesn't read back the draft it just saved.

**The flow editor remounts on its first save in the same way** (`FlowEditor.tsx:690`). It is left for Milestone 8, where flow autosave starts from the first change and would make it visible.

**A console rebuild needs an instance restart:** the static file server only knows the files that were there when it started.

### Milestone 3

**A tab's title is built by the shell** from what it already knows, joined with " · ": what is open, the section, the workspace or tenant, and the product. For example "orders/sync · Scripts · Dev · Vynxlabs".
- An editor's object comes from its address.
- A screen that shows something the address doesn't name, a run, says so with `useTitleObject`. This is a small store the shell reads, so no prop has to pass through every screen.
- The sign-in page keeps the product's name alone.

**Focus moves to the new page's heading only on a new page or on Back and Forward,** never on a `replace`. The router now records which of the three each change was.
- A `replace` is the same page refining its address: a filter, or a new script's first save. Moving focus then would pull it out of the editor the person is typing in.
- The e2e test checks that focus stays in the code after ⌘↵.

**The skip link is a plain `href="#main"`,** with `<main tabIndex={-1}>`. The browser moves focus by itself, and the router ignores a change that leaves the path the same. No script is needed.

**Toasts changed in the kit, so tenant apps get the same behaviour,** as noted in the changelog:
- A failure is `role="alert"` and stays until dismissed.
- Other toasts are read from one polite live region the provider keeps on the page, and the toasts themselves have no role. Live regions with a role would also have broken the console tests that find a screen's own `role="status"` line.
- Pointing at the stack, or focusing into it, holds every timer. Each resumes with the time it had left.
- A repeated message restarts the one shown rather than stacking, so persistent errors from a retry loop don't pile up.
- An optional action, which Milestone 7's Undo uses, doubles the time a toast stays.

**A run's state change is announced, but not its first showing.** This applies on the run page, the runs inspector and a flow's run view. Opening a run doesn't repeat what is already on the screen.

### Milestone 4

**The 500-line cut was confirmed in a browser** by the new `e2e/run-logs.spec.ts` against the old console. A finished 1,200-line run opened from the runs list said "500 lines". The run page itself showed all 1,200, which suggests the stream hadn't connected yet when it first read, so it polled, and polling does read every page. Once the stream is connected, a finished run gets no more events, so it never asked again.

**A run's log is now read to the end, a page of 1,000 at a time,** inside the one-read-at-a-time loop. A run with 12,000 lines takes 12 requests.

**The page keeps the newest 5,000 lines.** The log viewer draws every line, and isn't virtualised until P1-6. What went wrong is usually near the end, so the oldest lines are left out first.
- A note above the log says how many lines are not shown.
- "Download the whole log", and the viewer's own Download button, read every page again and save them all, in the same format the viewer's download already used (`logText` in the kit).

**A failed read no longer replaces a run's page:**
- `error` is now only for a run that could not be shown at all.
- Once shown, a failed read keeps the run and says "Reconnecting…".
- Reads are tried again after 1.5, 3, 6, 12, then 30 s, whether or not the stream is up, since no event may come.
- A run never shown is tried again only for errors that may pass: 5xx, 408 and 429.

This applies to the run page, the runs inspector, a flow's run view and a flow step's log.

**`?run=` finds the run's kind by its ID** through the activity route, the same one the list uses, when the run isn't on the list's first page.
- While it looks, the inspector says "Loading…" instead of guessing a script run.
- When nothing matches, it says so.
- The old code also headed the panel "Run" instead of its path.

**A test that clicked a download link sent happy-dom's window to `about:blank`,** and every later test in the file lost its address. Tests that download now stub the anchor's `click`.

### Milestone 5

**A runs row takes focus and opens on Enter or Space,** like `CollectionView`'s rows. Keys pressed on a link or a tag inside the row are left to them. The row keeps its link to the run's full page.

**The chosen row is `aria-current`, in the runs list and in `CollectionView`.** `aria-selected` is only valid inside a grid, list box or tab list, and these are plain tables. Arrow-key movement between rows waits for one `DataTable` (P2-2).

**The docked inspector now behaves like the sheet it becomes on narrower screens:**
- It takes focus to its heading when it opens.
- It closes on Esc, unless a dialog, menu or list box is open above it.
- It gives focus back to whatever last had it outside: the row that opened it, as the e2e test checks.

**Each choice of a run moves focus to the inspector, even the run already open.** The e2e test found that pressing Enter on the open run's row left focus on the row. The inspector takes a `subject`, and the runs list counts choices into it. Other inspectors move focus only when they open.

**`Dialog` has a visible close button,** as `SideSheet` already had. Closing a confirmation that way answers no.

### Milestone 6

**One `OneTimeSecret` shows every value seen only once:** a new API key or service account key, a worker credential, and a SCIM token.
- It shows the value, and a Copy button.
- Done takes it away. If nothing was copied, Done asks first, because a lost value means making a new one.
- `ListScreen` and `ListCollection` now hand `afterCreate` a `dismiss` so the notice can be closed. It used to stay until the page was left.

**A new worker credential comes with the whole command,** `platform-worker --url <address> --token <credential>`, ready to copy. `GET /instance` now returns `publicUrl`, the address the operator set in `PUBLIC_URL`. The console falls back to its own address. The list's description names the address too.

**Milestone 5 went in with one lint error** (a handler named `escape`, which shadows a browser global). It is fixed here, and lint is checked before each commit from now on.

**The queue panel crashed when a queue answer had no `tasks`.** The new test's mock found it. It now counts none.

### Milestone 7

**Removing a widget can be undone.** The toast after it offers Undo for ten seconds, longer while pointed at. Undo puts the widget back where it was, with the widgets that followed it, and autosave saves it again. Undo through the builder's history waits for P2-10.

**"Stop sharing" asks first,** naming the app, the person or group, and how many of the app's tables their access goes from too.

**Unbinding a connection and deleting a secret name what uses it,** from the references the list already loaded: "Used by 3: billing/charge, billing/refund and orders/sync." `RemoveButton` takes `affected`.

**"Delete for good" on a retired table or column asks for its name to be typed.** `RemoveButton` takes `typeToConfirm`.

**A create dialog forgets what was typed when it is cancelled,** passwords included.

**A field can make the person choose** (`pick`), instead of taking the first option. Create workspace uses it for the type, which cannot be changed afterwards, and lists Production first, as the empty list suggests.

### Milestone 8

**The router holds the page while a screen has changes not saved:**
- Each editor registers with `useNavigationGuard(dirty, message)`.
- `navigate()`, which every link goes through, asks in the console's own dialog first.
- Back and Forward have already moved the address when the browser says so. The router puts the page's own address back before any screen sees the change, then asks.
- Closing or reloading the tab gets the browser's own prompt (`beforeunload`), registered only while there are changes, so the reloads in the e2e tests stay quiet.
- A `replace` never asks: it is the same page refining its address. That includes a first save from `…/new` to `…/edit/<path>`.
- Until the console's dialog is mounted, nobody is held. The repository allows no browser dialogs.

**Autosave starts once something is a draft, not once a path is typed.** This differs from the plan. A new script whose path is typed one letter at a time would have saved a draft at "orders/s", then "orders/sy", and so on, leaving drafts behind.
- Something new waits for its first Save. Until then it is held by the guard, and, for scripts and resources, by a copy kept in this browser.
- The editor offers that copy back the next time a new one is opened.
- Saved drafts, and deployed resources being edited, save themselves 3 s after the last change.
- A failed autosave is tried again only after the next change, not in a loop.

**The flow editor's autosave backs off and gives up after five tries,** waiting 1.5 s, then 1.5, 3, 6 and 12 s between tries. While it retries it says "Could not save. Trying again…". After that it says "Could not save." with Retry, where it used to say "Saving…" forever and try every 1.5 s. The e2e test cuts the connection to see it, checks that leaving asks first, and sees it catch up once back online.

**The flow editor no longer remounts on its first save,** for the same reason as the script editor in Milestone 2. It keeps its undo history.

### Milestone 9

**The kit's values are those in `docs/uiux/07-design-system-specification.md` §7.4:**
- in the light theme, `ink-muted`, `ink-subtle`, `attention` and `success` are darker;
- in the dark theme, `ink-subtle` is lighter.

They are in the kit's defaults, so tenant apps and portals get them too, as the owner chose. A theme that sets a token keeps its value.

**`line-control` is a token of its own,** registered in the five places a token lives: the stylesheet, the manifest's list, the console's branding list and kit values, the control plane's sign-in defaults, and the generated theme schema. The existing tests keep them in step.
- It draws the edge of inputs, selects, combobox fields, the grid's cell inputs, the log viewer's controls, icon buttons and secondary buttons.
- Panels and dividers keep `line`.
- Checkboxes are the browser's own, whose edge is already dark enough.

**A test reads the colors straight from `tokens.css`** and checks every pair in §7.4 for both themes, plus the status words on their soft backgrounds: text at 4.5:1, control edges at 3:1. It fails on the old values.

**`contrastRatio` is in the kit.** The branding preview lists every checked pair under its threshold, for the console's branding and a tenant's. It is a warning only: saving is not refused, as the owner chose.

**The redesign e2e test passes at every width in both themes** with the new values.

