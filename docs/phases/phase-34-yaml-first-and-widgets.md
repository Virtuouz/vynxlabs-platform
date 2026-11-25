# Phase 34: definitions are YAML first, and developers write their own widgets

Status: built, awaiting the owner's review, on branch `phase-34-yaml-first-and-widgets`, off `main` (phases 29 to 33 merged, PR #19).
Last updated: 2026-11-25

The owner (2026-11-24), on console- and repository-managed tables: "definitions don't need logic or the capabilities of js and thus it makes sense to just use yaml at which point almost anything that is defined should be yaml based over js based", then "yaml first with it as the default, but definitions retained for complex use cases at which point repository managed vs console would make sense. Additionally incorporate finishing building out the feature that allows developers to define and use their own custom widgets". The plan is `~/.claude/plans/i-would-like-to-fuzzy-meteor-of-45518b7f-b8fc-41f4-9613-9ba4253edadd.md`.

**Exit criterion.** On `examples/fernhill`, now YAML first, in a browser and a terminal:

- a developer starts a repository with `volvel init` and finds its tables, schedules and access as YAML files, with scripts in TypeScript typed by name (`ctx.table("visits")` knows its columns), in their editor and in the console's script editor;
- a table defined in YAML is changed in the console, and a repository deploy then refuses with the paths the console changed; `volvel pull` brings them in and the deploy passes; `--force` overrides, recorded in the audit log;
- a table defined in TypeScript (`defineTable`) is taken over on its Definition tab, and a deploy that still defines it takes it back;
- `volvel convert` turns an example's declarative TypeScript into YAML and says what it left and why;
- a developer writes a widget in the repository, previews it with `volvel dev`, deploys it, and a member places it from Add to page, sets it in the inspector and publishes; it draws in an app and on a dashboard inside a sandboxed frame that cannot fetch, read a cookie or send an event it does not declare;
- every page about these is written YAML first and checked.

## Owner decisions

| Area | Decision |
|---|---|
| Form | YAML first and the default; TypeScript definitions kept for complex cases (composition, shared values, generated families) |
| A repository deploy after console edits | Refused: pull first; `--force` overrides on purpose (2026-11-24) |
| Examples | Fernhill and acme YAML first; higher-ed-devices stays the example of definitions in code |
| Widget authoring | In a repository only, previewed with `volvel dev`; no widget editor in the console |
| Widget safety | Decision 0005 as designed: a sandboxed frame, no network, no cookies, data only through declared inputs read by the server under the viewer's rules, events out only as declared |
| A widget's event wired to a write | Confirmed first (2026-11-24): an action that changes anything, wired to a tenant widget's event, runs only after a confirmation the page draws outside the frame, because the frame can send an event without a click. Filter, select and navigate run at once |
| Agents | Sonnet, up to 20 at once |
| Stops | After A2, A3, B3 and B4 (pull first, typed scripts, a tenant widget in its frame), and at the end |

## Milestones

| # | Milestone |
|---|---|
| A1 | One source for both forms: SDK input types generated from the kind schemas; a parity test; binding→role checked at build |
| A2 | Shared ownership ("Files" and "Code") and "pull first" |
| A3 | Types generated from the definitions, in the repository and in the console's script editor |
| A4 | `volvel convert` |
| A5 | YAML by default: `volvel init`, Fernhill and acme |
| A6 | Take-over for tables, as for other resources |
| A7 | Documentation, YAML first |
| B1 | The `widget` kind, `defineWidget` in a repository, `@volvel/widget-frame` |
| B2 | Build, deploy and pin a widget's version |
| B3 | Tenant widgets in the builder, the runtime and the checker |
| B4 | The sandboxed frame and its protocol |
| B5 | `volvel dev` for widgets |
| B6 | Documentation, and a Fernhill widget |

## Findings

Each lane's record is in `docs/documentation/fixed/p34-<lane>.md`, and the final walks are in `docs/documentation/walks/p34-w1.md`, `p34-w2.md` and `p34-w3.md`.

**Built.** A1 to A7 and B1 to B6, with follow-up lanes a8, a9, a7r, b4r and b7. The exit criterion was walked on a throwaway Fernhill instance, with one change. Fernhill now has no table in code, so a code table's take-over was walked on `examples/higher-ed-devices`, which stays the example of definitions in code.

**Found by the lanes and fixed.**
- **Data loss (a7r, fixed in a9).** After a take-over, `volvel pull` recorded the table as in step without writing its file, so the next deploy silently retired the console's column. Now a pull records the basis only for what it wrote or found identical. A take-over's basis is the code's hash, and a deploy that still defines a taken-over resource is refused as defined twice.
- **The widget frame's security review (b4r).**
  - A frame could leak its data by navigating itself to an outside address. The console now carries `frame-src` limited to the instance's own addresses.
  - A pattern in a payload schema could freeze the page (ReDoS).
  - Inherited names passed the payload check.
  - A bundle could set a file's content type.
  - Error answers lacked the content policy.
  - All five are fixed. The browser suite tries six ways of leaking by navigation.
- **Widget rows (b7).** Rows beyond one page left a widget blank, because functions were posted to the frame. The frame's state was always "ready". Rows now cross as plain data, with more and sort asked of the host.

**After the owner's first look (2026-11-24), and what was done.**
- **Creating a form trigger crashed** ("Cannot read properties of undefined (reading 'length')"). The Triggers menu built a webhook body relabelled as a form. One `freshStart(type)` now serves both ways in (c1).
- **A connection test showed a 404 as "Reached"** in a success tone. Only a 2xx or 3xx answer is reached now. 401, 403 and 407 say the credentials were refused, and 404 says nothing is at that address. An optional **Test path** was added, and Fernhill's two connections use `/ping` (c2).
- **Typing in Page details sent the focus to the Markdown editor** after each key. The code editor's `apply` focused itself every time; it now does only when no other field holds the focus (c3).
- **Type size by screen: the owner's request.** Body text is 16px up to 1920 px, 18px from 2560 and 20px from 3840, and headings scale by the same ratio. One `--vx-type-scale` in `packages/ui/src/type-scale.css` is loaded by the console and the served runtime alike, so the canvas matches the published app (c4).
- **The docs side menu should animate like the other drawers** (c5). After a second look, the owner said the entry was abrupt and the page jumped to its new width. Beside the page, the panel's column now eases with the page through the inspector's `Docking`. Over the work, it slides over a scrim (d2).
- **Text that no longer fit at the larger type.**
  - "Search or jump to…" wrapped; the top bar is now one line at every width (d1).
  - `Tag` never wraps (d1).
  - Below 1280 the top bar's status words shrink to a mark and a count (w3).
  - Flow graph labels and chart text follow the scale (w3).
- **The widget event question.** A frame can send a declared event without a click. The owner chose to confirm writes: an action that changes anything, run by a tenant widget, is run only after a confirmation the page draws (e1). The gate is decided by the widget's `x/` type inside the action runner, not by each caller. Decision 0005 carries the amendment.

**Found by the final walks and fixed.**
- **Labels and text.** "(optional) optional" was doubled on 18 labels. Backticks showed raw, now held by an `enforce.test.ts` rule.
- **Lists.** The Tables list's columns overlapped at 768. The Triggers, Runs, Events and Approvals empty states now match the other lists.
- **Layout.** The Definition buttons wrapped to three lines, "+ Subject" was misaligned, and a new script's editor was below the fold at 1440x640.
- **Take-over.** A deploy that undoes a take-over now says so (w1).
- **Widgets in the builder and the inspector.**
  - Two identical "Source" groups in the inspector.
  - Event labels shown as raw event names.
  - A removal refusal that repeated a page.
  - A half-made action step that blocked saving with a raw JSON path.
  - The builder asked for a draft that wasn't there, and logged the 404 as an error.
- **Widgets in their frames.**
  - The frame's text used the browser's serif font.
  - The gauge read the wrong column names; it is now v1.0.2.
  - Frames were named by their type instead of their title.
  - A late frame was counted as failed.
  - The gauge overflowed a small cell (w2, g1).
- **The top bar's names.** They are whole at 1280, 1024 and 768 (w3).

**Not fixed, and why.**
- **Workbench headers.** The headers of Triggers and Runs (the workbench family) differ from `ListScreen`'s by a folded description and 8 px of padding. Changing them restyles the whole family, so it is left for the owner to decide.
- **Diagram and chart text.** A flow graph fitted into a narrow frame draws its text at about 11 px at 1440. A chart spec that sets its own font size keeps it.
- **The default data of Clinic load.** In the inspector, its clinics input follows one page filter, while Visits follows all six.
- **Converting comments.** `volvel convert` drops the comments above a definition it converts, and says how many.
- **`volvel dev <app>` doesn't serve widgets.** A repository with both needs `--widgets`.
- **Phone width at the larger type.** The breadcrumb ("Connecti…") and the rail label "Operator ac…" are shortened with an ellipsis. On the tenant page, Rename and Turn off code wrap under the title at 390 (`p34-h1.md`).

The full suites are recorded under the Polish gate, Guards.

## Polish gate

1. **Rules.**
   - States, including a frame's loading, failed and slow states (POLISH-001, 012).
   - Siblings, such as take-over for tables as for scripts, flows and apps (POLISH-002).
   - Lifecycle of the widget kind: create, deploy, place, update and remove (POLISH-003).
   - Widths and type scale (POLISH-004).
   - Keyboard and focus in the help drawer and the confirmation (POLISH-008).
   - Shared pieces (POLISH-013), and nothing trimmed (POLISH-015).
2. **Siblings.**
   - One ownership vocabulary, "Files" and "Code", in `apps/console/src/kit/ownership.ts`, used by tables, scripts, flows and apps.
   - One action runner gates tenant widgets for apps and pages (`packages/screens/src/actions.tsx`). Dashboards offer no write steps.
   - One type scale for the console and the served runtime (`packages/ui/src/type-scale.css`).
   - One `Docking` for the inspector and the help panel (`apps/console/src/kit/layout.tsx`).
   - One `DataTable` empty state for the workbench lists.
3. **Lifecycle.**
   - **A widget:** `volvel widget new`, preview with `volvel dev`, deploy, place from Add to page, set in the inspector, publish, "Update to vN" on purpose, and removal refused while in use.
   - **A table's ownership:** Files to console edit to pull-first refusal, then pull or `--force`. Code to take-over, pull, and refused as defined twice. Code to take-over, then a deploy before any pull takes it back, and the deploy says so.
   - **A connection test:** test path, reached, refused, not found.
4. **States.**
   - **A frame:** loading, still loading, did not load (60 s hard limit after mount, 10 s after its page loads), failed, empty, no address.
   - **A connection test:** reached, refused, not found, failing.
   - **The take-over notices:** before a take-over, while taking over, and refused in production.
   - **The confirmation:** waiting, cancelled, run, and a second event dropped while one is open.
5. **Walk** (`docs/documentation/walks/p34-w1.md`, `p34-w2.md`, `p34-w3.md`; lane walks in each `fixed/p34-*.md`).
   - **Where:** throwaway Fernhill instances, plus higher-ed-devices for the code take-over.
   - **Widths and looks:** 1440x900, 1440x640, 768 and 390, plus 1920, 2560 and 3840 for the type scale, in light and dark.
   - **How:** keyboard (Tab, Esc, F1, Ctrl+K, `/`), reload, Back, shared links, and Fast 3G throttling once per area.
   - **What it covered:** 51 screens were swept for wrapped, clipped and spilled text.
   - **What it found:** the faults under Findings, fixed except those listed there.
   - **Not walked:**
     - the app builder canvas by keyboard beyond load;
     - a real phone; focus in dialogs was checked with desktop emulation only;
     - the frame when the instance has a separate apps address (served and unit-tested, not walked).
6. **Guards.**
   - **Rules in `enforce.test.ts`:**
     - every step kind is classified as a write or not (`packages/widget-sdk/src/action.test.ts`);
     - backticks only through TermText and CodeText;
     - the type scale in tokens and both stylesheets;
     - the top bar never wraps;
     - the help panel's overlay.
   - **Parity:** `define*` against the kind schemas (`packages/worker/src/define-parity.*`).
   - **The browser suite:** `e2e/widget-frame.spec.ts` covers isolation, navigation leaks, a write event without a click confirmed first, and focus inside the confirmation at 390, 768 and 1440.
   - **The full suites:** run once on the final code (2026-11-25).
     - **`pnpm test`:** 5345 passed, 4 skipped. Two tests left behind by the phase's own changes failed: the exact-path lookup count and the frame's ready timer. Both were updated (`7630a0ce`, `f64c696d`).
     - **`pnpm e2e`:** 255 passed, 13 failed and 1 was skipped; 17 did not run after earlier failures in their groups. The failures went to three lanes (`docs/documentation/fixed/p34-h1.md`, `p34-h2.md`, `p34-h3.md`):
       - **4 screenshot comparisons:** 104 baselines were retaken at the larger type, after every old-and-new pair was looked at.
       - **4 layout measures:** real overlaps at the larger type, fixed in `DrawerTabs`, `DataTable`, `Grid` and `FilterChips`, without loosening a measure.
       - **5 tests** that pinned what the phase changed on purpose.
       - **One test that depended on order:** the frame's light-and-dark test assumed the operator's theme followed the system, while other specs set it. It now resets it (`4b568a7f`).
     - **The rerun:** the nine spec files that failed passed together, 84 passed and 1 skipped, then widget-frame again beside the specs that set the theme, 32 passed.
7. **Left out.** Nothing of the owner's decisions or exit criterion was trimmed. The workbench header difference is raised with the owner.
