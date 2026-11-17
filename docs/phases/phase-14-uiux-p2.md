# Phase 14: design-system consistency and information architecture (UI/UX audit P2)

Status: Milestones 0–3 built, on branch `phase-14-uiux-p2`, off `phase-13-uiux-p1`.
Last updated: 2026-11-16

The UI/UX audit ranks thirteen items as P2 in [09-prioritized-uiux-roadmap.md](../uiux/09-prioritized-uiux-roadmap.md). Phase 13 already built two of them: P2-2, one `DataTable` for every list, and P2-6, URL state on every screen. This phase does the other eleven. Each was re-checked against `phase-13-uiux-p1`.

| What fails | What it looks like | Cause |
| --- | --- | --- |
| Tokens (P2-1) | About 194 arbitrary type sizes, 46 hard-coded 4 px corners, unnamed shadows and z-index values | No spacing, elevation, layer, icon or motion tokens; nine type roles |
| Page headers (P2-3) | Eight header variants and seven kinds of back link. The shell names the section only to screen readers | Each screen draws its own |
| Load states (P2-4) | 40 bare "Loading…" lines. 82 error notices without Try again. Request IDs dropped. A proxy's HTML 502 breaks the client | No shared load state; `ApiError` keeps no request ID |
| Status (P2-5) | About 33 Badges show lifecycle state. Canceled and skipped share an icon. Five local state maps | No domain states in the one map |
| Forms (P2-7) | Field errors aren't linked to their fields. No required marks. Pages mix save models. Large configuration lives in modals. A mistyped secret name makes a new secret | Fields render errors as loose text; no SaveBar or SecretField |
| Feedback (P2-8) | About 90–100 of 170 writes confirm nothing. Pause and resume wait for the server | No toast title or link; no Button loading state |
| Data grid (P2-9) | Every cell is a tab stop. No sticky header, batch delete or CSV. Offset paging shifts | `Grid` predates the grid pattern |
| App Builder and Dashboards (P2-10) | One 2,118-line file. The canvas sits under 200 px of chrome. No undo. The device preview doesn't narrow the layout. Dashboards save differently | Two shells around one editor; viewport breakpoints in the renderer |
| Admin (P2-11) | Giving access starts from a role, not a person. A service account is spread over two pages. Audit search sees only loaded rows | No principal search; audit filters too narrow |
| Enforcement (P2-12) | Screenshots are taken but never compared. No axe. One lint rule | — |
| First run (P2-13) | An operator can't see inside the tenant they just made. A new workspace says "Nothing needs you here". Never-deployed scripts are missing from the scripts list | Grant-only access; no checklist; scripts route ignores drafts |

**Exit criterion:** the Acceptance rows of P2-1, 3, 4, 5, 7, 8, 9, 10, 11, 12 and 13 in the roadmap pass.

## Owner decisions

| Area | Decision |
| --- | --- |
| Shape | One branch, `phase-14-uiux-p2`, with thirteen milestones built one after another, one commit each |
| Tokens and tenant apps | They move together. The kit's new defaults reach tenant apps; a screenshot baseline is taken first, so each visible change is a reviewed diff. The changelog says what moved |
| Tenant creator | Creating a tenant offers "Make me a member, as tenant admin", checked by default |
| Docs and hints | Out of scope: no "Learn more" links, new concept hints or just-in-time help. A later phase does documentation. Empty states offer the console action only |
| Dashboards | Autosave like apps, with a visible Saved state and undo and redo. Sharing is the dashboard's publishing step |

## Milestones

| # | Milestone | Audit |
| --- | --- | --- |
| 0 | Branch and this document | |
| 1 | Baselines: compared screenshots of the console and tenant apps, axe | P2-12 |
| 2 | Token foundation v2, and the call sites moved onto it | P2-1 |
| 3 | Status system | P2-5 |
| 4 | LoadState and request IDs | P2-4 |
| 5 | One PageHeader and a breadcrumb | P2-3 |
| 6 | Feedback: Toast v2, Button loading, every write confirms, optimistic pause | P2-8 |
| 7 | Forms: linked errors, required marks, SecretField, one save model per page, configuration out of modals | P2-7 |
| 8 | Data grid | P2-9 |
| 9 | App Builder and Dashboards: split, one editor shell, undo and redo, publish summary, container queries | P2-10 |
| 10 | Admin: give access from the person, one service-account page, audit search | P2-11 |
| 11 | First run and empty states | P2-13 |
| 12 | Enforcement rules, axe everywhere, keyboard journeys, kit sheet | P2-12 |
| 13 | Changelog, docs, the whole e2e suite | |

Findings are recorded under each milestone as it lands.

## Findings

### Milestone 1: baselines before anything moves

- **Compared pictures.** `e2e/redesign.spec.ts` compares every console screen with a reviewed picture (`toHaveScreenshot`), at three widths and in both themes: 90 pictures. The new `e2e/tenant-apps.spec.ts` does the same for an app the platform serves to a tenant's people, built through the API and shared anonymously: 6 pictures. They live in `e2e/snapshots/`.
- **What is masked.** Times, IDs, values set in mono and anything marked `data-volatile`. The spec's product and tenant names are now fixed, so they no longer carry the run's stamp. Before each picture the mouse is parked and the page settles: the first stability run caught a hover and a button mid-load. Two compare runs in a row then passed unchanged.
- **Not compared.** Screens that list the whole instance (tenants, audit, workers, API keys) change with every other spec, so they are checked for fit and axe only.
- **Fixed in passing.** The spec's "data" screen was a 404; it is now `tables`.
- **axe**, run with `@axe-core/playwright` on desktop/light screens and in the kit's component tests (`axe-core`), fails on serious and critical problems. Colour contrast is left to the token contrast test. It found two:
  - The "promotes to" link, added in phase 13, sat in muted text marked only by colour. It is now underlined.
  - A widget's scrolling body in served apps couldn't be reached by keyboard. It now takes focus, with a ring.
- **CI.** The pictures were made on this machine's Linux Chromium with its system fonts. If CI's runner draws text differently, its first run will show it, and its `actual` pictures (kept in the uploaded results) become the baseline.

### Milestone 2: token foundation v2

- **Tokens** (`packages/ui/src/tokens.css`): eleven type roles from 07 §7.3, `rounded-inner` and `rounded-overlay`, panels at 8 px, three shadows (overlay, modal, drag) deeper in dark, six layer utilities, three motion durations, a prose measure and a control height. Brand tokens are unchanged apart from the panel radius. The values a brand doesn't set (shadow depth, control height) live on `html`, apart from the `:root` blocks, so Branding's copy of the brand tokens and its test still match.
- **Density.** A control's height is one variable, `--vx-control-height`: 36 px in tenant apps, and the console sets 32 px for itself in `styles.css`. Buttons, inputs, selects and the combobox read it as `h-control`, so no call site passes a size for the common case.
- **Migration.** A codemod (token-boundary matches inside string literals, prefix-aware) moved about 450 values across 89 files of the console, the kit and the renderer:
  - type: 147 arbitrary 13 px values, 39 of 12 and 12.5 px, and the rest;
  - 28 hard-coded small corners;
  - 10 shadows and 9 z-index values;
  - 37 retired spacing steps;
  - 24 prose widths onto one measure;
  - 57 icon sizes onto 12, 14, 16 and 20.

  The stroke is set once, by a `LucideProvider` at the console's root. The examples are tenant code and keep plain Tailwind. A few local `z-10` values stay, where they stack siblings inside a canvas or chart.
- **Found on the way.**
  - The first codemod run collapsed runs of spaces inside every template literal, which would have flattened the indentation of the script starters. It was reverted and rerun so that it changes only the classes it replaces.
  - `biome --write` on a file that didn't parse stripped JSX braces (`items={[` became `items=[`). They were restored by hand.
  - Tailwind's preflight already zeroes margins, so the base reset 07 asks for exists. The 294 `m-0` are redundant but harmless.
- **Pictures.** 92 of the 96 changed, all as intended: 20 px titles, 32 px controls, 8 px corners, 12 px meta and lighter icons. The served app changed only in line heights and corners. Two compare runs then passed unchanged. `snap` now asserts softly, so one run reports every screen that differs.

### Milestone 3: status system

- **One map** (`kit/status.tsx`). `STATES` holds every state the console shows, from 08 §3.11–3.12:
  - run states;
  - waiting, approved and declined;
  - lifecycle: not saved, draft, unsaved changes, deployed, from the repository, retired, older version;
  - a branch against the workspace: not pushed, in sync, ahead, behind, conflict, last sync failed;
  - availability: active, invited, suspended, disabled, revoked, expired, ended;
  - a switch: on, off, paused;
  - health: OK, reachable or not, not checked, verified or not, bound or not, not connected, posted or not, allowed or denied;
  - notes.
  
  Each state has one word, icon and tone, and `State` is derived from the map, so a missing one fails to compile.
- **Run states, corrected:**
  - Canceled has `CircleSlash`, distinct from Skipped.
  - Running is a `LoaderCircle` that turns slowly, the one looping mark, and not under reduced motion.
  - A run or step waiting for a time reads "Waiting until {time}" when the console has the time.
  - A value the console doesn't know shows as the server wrote it, not as "Unknown".
  - The duplicate `cancelled` key is gone.
- **Replaced:**
  - The five local maps (`Authoring` ×2, `ResourceEditor`, `FlowEditor`, `Git`).
  - About 45 state `Badge`s. `Badge` stays only for counts ("+3 more") and in the branding preview of tenant components.
  - 16 `StatePill`s whose state contradicted its words: `failed` for "No", `running` for "Listening" and "Triggers are running", `paused` for "Suspended", `ok` for "Active", `queued` for "not checked yet".
  - Five `Tag tone="production"` that didn't mean production: workspace paused is a state, and an operator's action is a new `attention` tag.
  - A resource's kind, a flow node's type and an audit verb are `Tag`s, since they are fixed when made. "End users can hold it" and a dashboard's audience are plain text.
- **Runs filters.** "Waiting for approval" and "Waiting for a time" are separate chips. The server already took both states. `?status=waiting` from older links still works.
- **Server.** Activity rows have `wakeAt`: the earliest waiting step's time, so the list can say until when.
- **Found.** Milestone 2 broke `apps.test.ts`, which reads the kit's stylesheet by position and keeps the server's own copy of the brand values. Only the console's tests ran for that commit. Here, the non-brand block moved after `@theme inline` and the server's panel radius became 8 px. The whole suite has run since, as the plan says.
- **Test.** `kit/status.test.tsx` is table-driven, asserting word, icon and tone for each state. It also checks that canceled and skipped differ, that no two run states share a mark, that an unknown value shows verbatim, and "Waiting until".
