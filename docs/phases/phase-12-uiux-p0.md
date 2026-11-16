# Phase 12: trust and access (UI/UX audit P0)

Status: milestone 0 (this document). Nothing built yet.
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
| Unsaved work | A navigation guard and `beforeunload`. Script and resource drafts autosave about 3 s after the last edit once a path is set, with a local recovery copy before that |
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
